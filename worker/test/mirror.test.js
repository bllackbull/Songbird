import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import request from "supertest";
import { createWorkerServer, processMirrorJob } from "../index.js";

function startCaptureServer({ bytes, failPut = false }) {
  let uploaded = null;
  let callback = null;
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/bytes") {
      res.writeHead(200, { "Content-Type": "image/jpeg" });
      return res.end(bytes);
    }
    if (req.method === "PUT" && req.url === "/upload") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        uploaded = Buffer.concat(chunks);
        if (failPut) {
          res.writeHead(500);
          return res.end("nope");
        }
        res.writeHead(200);
        return res.end("ok");
      });
      return;
    }
    if (req.method === "POST" && req.url === "/callback") {
      let body = "";
      req.on("data", (c) => (body += String(c || "")));
      req.on("end", () => {
        try {
          callback = JSON.parse(body || "{}");
        } catch {
          callback = {};
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        port: server.address().port,
        getUploaded: () => uploaded,
        getCallback: () => callback,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

describe("mirror-media endpoint", () => {
  it("rejects unauthorized requests when webhookSecret is configured", async () => {
    const server = createWorkerServer({ webhookSecret: "s3cr3t" });
    const res = await request(server)
      .post("/mirror-media")
      .send({ jobId: "j1", storageKey: "uploads/messages/a.bin" });
    expect(res.status).toBe(401);
  });

  it("rejects jobs missing jobId or a byte source", async () => {
    const server = createWorkerServer({ webhookSecret: "" });
    const res = await request(server)
      .post("/mirror-media")
      .send({ jobId: null });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("required");
  });

  it("accepts a valid job with 202 and queues it", async () => {
    const mockMirror = vi.fn().mockResolvedValue(true);
    const server = createWorkerServer({
      webhookSecret: "valid-secret",
      processMirrorJob: mockMirror,
    });
    const res = await request(server)
      .post("/mirror-media")
      .set("x-songbird-webhook-secret", "valid-secret")
      .send({
        jobId: "job-1",
        storageKey: "uploads/messages/a.jpg",
        downloadUrl: "http://127.0.0.1:9/bytes",
        mimeType: "image/jpeg",
      });
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBe("job-1");
  });

  it("pulls bytes, uploads, and reports ready via callback", async () => {
    const bytes = Buffer.from("mirror-me-bytes");
    const cap = await startCaptureServer({ bytes });
    try {
      await processMirrorJob({
        jobId: "job-2",
        downloadUrl: `http://127.0.0.1:${cap.port}/bytes`,
        storageKey: "uploads/messages/a.jpg",
        storedName: "a.jpg",
        mimeType: "image/jpeg",
        maxBytes: 1024 * 1024,
        probeVideo: false,
        uploadUrl: `http://127.0.0.1:${cap.port}/upload`,
        callbackUrl: `http://127.0.0.1:${cap.port}/callback`,
        webhookSecret: "",
      });
      expect(cap.getUploaded()?.equals(bytes)).toBe(true);
      const cb = cap.getCallback();
      expect(cb?.jobId).toBe("job-2");
      expect(cb?.status).toBe("ready");
      expect(cb?.storageKey).toBe("uploads/messages/a.jpg");
      expect(cb?.sizeBytes).toBe(bytes.length);
    } finally {
      await cap.close();
    }
  });

  it("reports failed via callback when the upload fails", async () => {
    const bytes = Buffer.from("mirror-me-bytes");
    const cap = await startCaptureServer({ bytes, failPut: true });
    try {
      await processMirrorJob({
        jobId: "job-3",
        downloadUrl: `http://127.0.0.1:${cap.port}/bytes`,
        storageKey: "uploads/messages/a.jpg",
        storedName: "a.jpg",
        mimeType: "image/jpeg",
        maxBytes: 1024 * 1024,
        probeVideo: false,
        uploadUrl: `http://127.0.0.1:${cap.port}/upload`,
        callbackUrl: `http://127.0.0.1:${cap.port}/callback`,
        webhookSecret: "",
      });
      const cb = cap.getCallback();
      expect(cb?.jobId).toBe("job-3");
      expect(cb?.status).toBe("failed");
    } finally {
      await cap.close();
    }
  });

  it("rejects oversized payloads without uploading", async () => {
    const bytes = Buffer.from("too-big");
    const cap = await startCaptureServer({ bytes });
    try {
      await processMirrorJob({
        jobId: "job-4",
        downloadUrl: `http://127.0.0.1:${cap.port}/bytes`,
        storageKey: "uploads/messages/a.jpg",
        storedName: "a.jpg",
        mimeType: "image/jpeg",
        maxBytes: 2,
        probeVideo: false,
        uploadUrl: `http://127.0.0.1:${cap.port}/upload`,
        callbackUrl: `http://127.0.0.1:${cap.port}/callback`,
        webhookSecret: "",
      });
      expect(cap.getUploaded()).toBeNull();
      expect(cap.getCallback()?.status).toBe("failed");
    } finally {
      await cap.close();
    }
  });
});

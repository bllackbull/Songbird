import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createWorkerServer, isLoopbackUrl } from "../index.js";

describe("Media Worker HTTP Server", () => {
  it("GET /health returns 200 OK with worker status and queue metrics", async () => {
    const server = createWorkerServer();
    const res = await request(server).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("songbird-media-worker");
    expect(res.body.queue).toBeDefined();
    expect(typeof res.body.queue.concurrency).toBe("number");
  });

  it("POST /transcode rejects unauthorized requests when webhookSecret is configured", async () => {
    const server = createWorkerServer({
      webhookSecret: "secret-key-12345",
    });

    const res = await request(server)
      .post("/transcode")
      .send({ fileId: 1, storageKey: "uploads/clip.mp4" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("POST /transcode rejects invalid request with missing fileId or storageKey", async () => {
    const server = createWorkerServer({ webhookSecret: "" });

    const res = await request(server).post("/transcode").send({ fileId: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("required");
  });

  it("POST /transcode accepts valid job with 202 and queues it", async () => {
    const mockProcessJob = vi.fn().mockResolvedValue(true);
    const server = createWorkerServer({
      webhookSecret: "valid-secret",
      processTranscodeJob: mockProcessJob,
    });

    const res = await request(server)
      .post("/transcode")
      .set("x-songbird-webhook-secret", "valid-secret")
      .send({
        fileId: "file-99",
        storageKey: "uploads/video.mp4",
        storedName: "video.mp4",
        mimeType: "video/mp4",
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.fileId).toBe("file-99");
  });

  it("handles 404 for unknown endpoints", async () => {
    const server = createWorkerServer({ webhookSecret: "" });
    const res = await request(server).get("/unknown-endpoint");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });

  describe("isLoopbackUrl", () => {
    it("identifies 127.0.0.1, localhost, and 0.0.0.0 as loopback", () => {
      expect(isLoopbackUrl("http://127.0.0.1:5174/api/uploads/webhook/processed")).toBe(true);
      expect(isLoopbackUrl("http://localhost:5174/api/uploads/webhook/processed")).toBe(true);
      expect(isLoopbackUrl("http://0.0.0.0:8080/api/uploads/webhook/processed")).toBe(true);
    });

    it("identifies public/remote domains as non-loopback", () => {
      expect(isLoopbackUrl("https://songbird-web.onrender.com/api/uploads/webhook/processed")).toBe(false);
      expect(isLoopbackUrl("https://api.example.com/webhook")).toBe(false);
      expect(isLoopbackUrl(null)).toBe(false);
      expect(isLoopbackUrl("not-a-valid-url")).toBe(false);
    });
  });
});

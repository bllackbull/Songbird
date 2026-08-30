import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createWorkerServer } from "../index.js";

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
        fileId: "msg-file-123",
        storageKey: "uploads/video.mp4",
        storedName: "video.mp4",
        mimeType: "video/mp4",
      });

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.fileId).toBe("msg-file-123");
  });

  it("returns 404 for unknown endpoints", async () => {
    const server = createWorkerServer();
    const res = await request(server).get("/non-existent-endpoint");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });
});

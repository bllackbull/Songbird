import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import {
  createWorkerServer,
  isLoopbackUrl,
  hasEncryptedMagic,
  encryptThumbnail,
} from "../index.js";
import { isEncryptedFileBuffer } from "../encryption.js";

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

  describe("hasEncryptedMagic", () => {
    let tmpDir;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-magic-test-"));
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("detects SBENC1-prefixed ciphertext regardless of the flag", () => {
      const p = path.join(tmpDir, "enc.mov");
      fs.writeFileSync(
        p,
        Buffer.concat([Buffer.from("SBENC1\0", "utf8"), Buffer.alloc(64, 1)]),
      );
      expect(hasEncryptedMagic(p)).toBe(true);
    });

    it("returns false for plain video bytes and missing files", () => {
      const plain = path.join(tmpDir, "plain.mov");
      fs.writeFileSync(
        plain,
        Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
      );
      expect(hasEncryptedMagic(plain)).toBe(false);
      expect(hasEncryptedMagic(path.join(tmpDir, "nope.mov"))).toBe(false);
      expect(hasEncryptedMagic(null)).toBe(false);
    });
  });

  describe("encryptThumbnail", () => {
    let tmpDir;
    const originalKey = process.env.STORAGE_ENCRYPTION_KEY;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-thumbenc-test-"));
      process.env.STORAGE_ENCRYPTION_KEY = "thumb-test-key";
    });
    afterEach(() => {
      if (originalKey === undefined) delete process.env.STORAGE_ENCRYPTION_KEY;
      else process.env.STORAGE_ENCRYPTION_KEY = originalKey;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("encrypts the thumbnail in place when the video is encrypted", () => {
      const p = path.join(tmpDir, "t.jpg");
      fs.writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
      expect(encryptThumbnail(p, true)).toBe(true);
      expect(isEncryptedFileBuffer(fs.readFileSync(p))).toBe(true);
    });

    it("leaves the thumbnail untouched when the video is plaintext", () => {
      const p = path.join(tmpDir, "t.jpg");
      const plain = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      fs.writeFileSync(p, plain);
      expect(encryptThumbnail(p, false)).toBe(false);
      expect(fs.readFileSync(p).equals(plain)).toBe(true);
    });

    it("is a no-op without a key or a file", () => {
      delete process.env.STORAGE_ENCRYPTION_KEY;
      const p = path.join(tmpDir, "t.jpg");
      const plain = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      fs.writeFileSync(p, plain);
      expect(encryptThumbnail(p, true)).toBe(false);
      expect(fs.readFileSync(p).equals(plain)).toBe(true);
      expect(encryptThumbnail(path.join(tmpDir, "nope.jpg"), true)).toBe(
        false,
      );
    });
  });
});

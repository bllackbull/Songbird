import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";
import { createMirrorJobRegistry } from "../../lib/remoteMirrorJobs.js";

let tmpDir;
let registry;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-mirror-"));
  registry = createMirrorJobRegistry({ ttlMs: 60_000 });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function setupMirrorApp({ webhookSecret = null, attachImpl = null } = {}) {
  const sessionStore = makeSessionStore();
  const userStore = makeUserStore();
  const attachMirroredMedia = attachImpl || vi.fn(async () => 1);
  const { app } = makeApp({
    sessionStore,
    userStore,
    deps: {
      fs,
      webhookSecret,
      mirrorJobRegistry: registry,
      remoteChannelManager: { attachMirroredMedia },
    },
  });
  return { app, attachMirroredMedia };
}

describe("remote mirror blob + webhook", () => {
  test("blob serves registered bytes with the job secret", async () => {
    const filePath = path.join(tmpDir, "a.bin");
    fs.writeFileSync(filePath, "mirror-bytes");
    const entry = registry.create({ filePath, mimeType: "image/jpeg" });
    const { app } = setupMirrorApp();
    const res = await request(app)
      .get(`/api/remote-channel/blob/${entry.jobId}`)
      .set("x-songbird-mirror-secret", entry.secret);
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe("mirror-bytes");
  });

  test("blob rejects wrong secret and unknown jobs", async () => {
    const filePath = path.join(tmpDir, "a.bin");
    fs.writeFileSync(filePath, "mirror-bytes");
    const entry = registry.create({ filePath });
    const { app } = setupMirrorApp();
    const bad = await request(app)
      .get(`/api/remote-channel/blob/${entry.jobId}`)
      .set("x-songbird-mirror-secret", "wrong");
    expect(bad.status).toBe(401);
    const missing = await request(app)
      .get("/api/remote-channel/blob/does-not-exist")
      .set("x-songbird-mirror-secret", "x");
    expect(missing.status).toBe(404);
  });

  test("webhook attaches the finished file and settles once", async () => {
    const filePath = path.join(tmpDir, "a.bin");
    fs.writeFileSync(filePath, "mirror-bytes");
    const entry = registry.create({
      filePath,
      storedName: "a.jpg",
      mimeType: "image/jpeg",
      kind: "image",
      originalName: "photo.jpg",
      messageId: 42,
      chatId: "c1",
      authorId: "u1",
      authorUsername: "owner",
    });
    const { app, attachMirroredMedia } = setupMirrorApp();
    const res = await request(app)
      .post("/api/remote-channel/webhook/mirror-done")
      .send({
        jobId: entry.jobId,
        status: "ready",
        storageKey: "uploads/messages/a.jpg",
        storageDriver: "remote",
        sizeBytes: 12,
        widthPx: 100,
        heightPx: 100,
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, attached: true });
    expect(attachMirroredMedia).toHaveBeenCalledTimes(1);
    const call = attachMirroredMedia.mock.calls[0][0];
    expect(call.messageId).toBe(42);
    expect(call.file.storageKey).toBe("uploads/messages/a.jpg");
    expect(call.file.sizeBytes).toBe(12);
    expect(call.file.widthPx).toBe(100);
    // Temp bytes cleaned, second delivery deduped.
    expect(fs.existsSync(filePath)).toBe(false);
    const again = await request(app)
      .post("/api/remote-channel/webhook/mirror-done")
      .send({
        jobId: entry.jobId,
        status: "ready",
        storageKey: "uploads/messages/a.jpg",
      });
    expect(again.body).toEqual({ ok: true, deduped: true });
    expect(attachMirroredMedia).toHaveBeenCalledTimes(1);
  });

  test("webhook rejects a bad shared secret", async () => {
    const { app } = setupMirrorApp({ webhookSecret: "shh" });
    const res = await request(app)
      .post("/api/remote-channel/webhook/mirror-done")
      .set("x-songbird-webhook-secret", "wrong")
      .send({ jobId: "x", status: "ready" });
    expect(res.status).toBe(401);
  });

  test("failed worker status skips attach but still settles", async () => {
    const filePath = path.join(tmpDir, "a.bin");
    fs.writeFileSync(filePath, "mirror-bytes");
    const entry = registry.create({ filePath, messageId: 7 });
    const { app, attachMirroredMedia } = setupMirrorApp();
    const res = await request(app)
      .post("/api/remote-channel/webhook/mirror-done")
      .send({
        jobId: entry.jobId,
        status: "failed",
        error: "boom",
      });
    expect(res.body).toEqual({ ok: true, attached: false });
    expect(attachMirroredMedia).not.toHaveBeenCalled();
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import realFs from "node:fs";
import realPath from "node:path";
import os from "node:os";
import { makeApp } from "../helpers/makeApp.js";
import { createStorageEncryption } from "../../lib/storageEncryption.js";
import { resolveThumbUrl, isAppEncryptedType } from "../../lib/thumbUrl.js";

const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const originalKey = process.env.STORAGE_ENCRYPTION_KEY;

describe("resolveThumbUrl", () => {
  test("routes remote thumbs through the gated app endpoint", async () => {
    const getDownloadUrl = vi.fn(async (k) => `https://cdn.example.com/${k}`);
    for (const enc of ["local", "aes-256-gcm", "app"]) {
      const url = await resolveThumbUrl({
        storageProvider: { getDownloadUrl },
        file: { id: 7, storage_driver: "s3", encryption_type: enc },
        thumbKey: "thumbs/t.jpg",
      });
      expect(url).toBe("/api/uploads/thumbs/7");
    }
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  test("routes plaintext remote thumbs through the gated app endpoint too", async () => {
    const getDownloadUrl = vi.fn(async (k) => `https://cdn.example.com/${k}`);
    const url = await resolveThumbUrl({
      storageProvider: { getDownloadUrl },
      file: { id: 7, storage_driver: "s3", encryption_type: "remote" },
      thumbKey: "thumbs/t.jpg",
    });
    expect(url).toBe("/api/uploads/thumbs/7");
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  test("returns null for local driver and missing keys", async () => {
    const getDownloadUrl = vi.fn();
    expect(
      await resolveThumbUrl({
        storageProvider: { getDownloadUrl },
        file: { id: 7, storage_driver: "local", encryption_type: "local" },
        thumbKey: "t-thumb.jpg",
      }),
    ).toBeNull();
    expect(
      await resolveThumbUrl({
        storageProvider: { getDownloadUrl },
        file: { id: 7, storage_driver: "s3" },
        thumbKey: null,
      }),
    ).toBeNull();
    expect(getDownloadUrl).not.toHaveBeenCalled();
  });

  test("isAppEncryptedType classifies flags", () => {
    expect(isAppEncryptedType("local")).toBe(true);
    expect(isAppEncryptedType("AES-256-GCM")).toBe(true);
    expect(isAppEncryptedType("remote")).toBe(false);
    expect(isAppEncryptedType("none")).toBe(false);
    expect(isAppEncryptedType(null)).toBe(false);
  });
});

describe("GET /api/uploads/thumbs/:fileId", () => {
  let tmpDir;
  let originalFetch;

  beforeEach(() => {
    tmpDir = realFs.mkdtempSync(realPath.join(os.tmpdir(), "sb-thumb-test-"));
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.STORAGE_ENCRYPTION_KEY;
    else process.env.STORAGE_ENCRYPTION_KEY = originalKey;
    realFs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function appWithFile(fileRecord, { withKey = true } = {}) {
    if (withKey) process.env.STORAGE_ENCRYPTION_KEY = "thumb-route-key";
    else delete process.env.STORAGE_ENCRYPTION_KEY;
    const storageEncryption = createStorageEncryption({
      fsImpl: realFs,
      pathImpl: realPath,
    });
    return makeApp({
      deps: {
        fs: realFs,
        path: realPath,
        uploadRootDir: tmpDir,
        storageEncryption,
        findMessageFileById: (id) =>
          String(id) === String(fileRecord.id) ? fileRecord : null,
        requireSession: async () => ({ id: "user-1" }),
        isMember: () => true,
      },
    });
  }

  test("serves and decrypts an encrypted local thumbnail", async () => {
    process.env.STORAGE_ENCRYPTION_KEY = "thumb-route-key";
    const storageEncryption = createStorageEncryption({
      fsImpl: realFs,
      pathImpl: realPath,
    });
    const plain = Buffer.concat([JPEG_HEAD, Buffer.from("thumb-bytes")]);
    realFs.writeFileSync(
      realPath.join(tmpDir, "clip-thumb.jpg"),
      storageEncryption.encryptBuffer(plain),
    );
    const appObj = appWithFile({
      id: 11,
      storage_driver: "local",
      encryption_type: "local",
      thumb_storage_key: "clip-thumb.jpg",
    });

    const res = await request(appObj.app).get("/api/uploads/thumbs/11");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(Buffer.from(res.body).equals(plain)).toBe(true);
  });

  test("serves a plaintext local thumbnail unchanged", async () => {
    const plain = Buffer.concat([JPEG_HEAD, Buffer.from("plain-thumb")]);
    realFs.writeFileSync(realPath.join(tmpDir, "clip-thumb.jpg"), plain);
    const appObj = appWithFile(
      {
        id: 12,
        storage_driver: "local",
        encryption_type: "none",
        thumb_storage_key: "clip-thumb.jpg",
      },
      { withKey: false },
    );

    const res = await request(appObj.app).get("/api/uploads/thumbs/12");
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).equals(plain)).toBe(true);
  });

  test("fetches and decrypts an encrypted remote thumbnail", async () => {
    process.env.STORAGE_ENCRYPTION_KEY = "thumb-route-key";
    const storageEncryption = createStorageEncryption({
      fsImpl: realFs,
      pathImpl: realPath,
    });
    const plain = Buffer.concat([JPEG_HEAD, Buffer.from("remote-thumb")]);
    const cipher = storageEncryption.encryptBuffer(plain);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => cipher,
    });
    const appObj = appWithFile({
      id: 13,
      storage_driver: "s3",
      encryption_type: "local",
      thumb_storage_key: "thumbs/clip-thumb.jpg",
    });
    appObj.deps.storageProvider = {
      getDownloadUrl: vi.fn(async () => "https://cdn.example.com/thumbs/x"),
    };

    const res = await request(appObj.app).get("/api/uploads/thumbs/13");
    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).equals(plain)).toBe(true);
  });

  test("404s for unknown files and files without thumbnails", async () => {
    const appObj = appWithFile(
      { id: 14, storage_driver: "local", thumb_storage_key: null },
      { withKey: false },
    );
    expect(
      (await request(appObj.app).get("/api/uploads/thumbs/999")).status,
    ).toBe(404);
    expect(
      (await request(appObj.app).get("/api/uploads/thumbs/14")).status,
    ).toBe(404);
  });

  test("rejects anonymous thumbnail requests", async () => {
    const appObj = makeApp({
      deps: {
        isMember: () => true,
        findMessageFileById: () => ({ id: 15, chat_id: "chat-1", thumb_storage_key: "t.jpg" }),
      },
    });
    expect((await request(appObj.app).get("/api/uploads/thumbs/15")).status).toBe(401);
  });

  test("rejects a non-member even when the file exists", async () => {
    const appObj = makeApp({
      deps: {
        requireSession: async () => ({ id: "user-c" }),
        isMember: () => false,
        findMessageFileById: () => ({ id: 16, chat_id: "chat-1", thumb_storage_key: "t.jpg" }),
      },
    });
    expect((await request(appObj.app).get("/api/uploads/thumbs/16")).status).toBe(403);
  });

  test("redirects a member to a short-lived storage URL for plaintext remote thumbs", async () => {
    const getDownloadUrl = vi.fn(async () => "https://signed.example.com/thumb");
    const appObj = makeApp({
      deps: {
        storageProvider: { getDownloadUrl },
        requireSession: async () => ({ id: "user-b" }),
        isMember: () => true,
        findMessageFileById: () => ({
          id: 17,
          chat_id: "chat-1",
          storage_driver: "s3",
          encryption_type: "remote",
          thumb_storage_key: "thumbs/t.jpg",
        }),
      },
    });

    const res = await request(appObj.app).get("/api/uploads/thumbs/17");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://signed.example.com/thumb");
    expect(getDownloadUrl).toHaveBeenCalledWith("thumbs/t.jpg", {
      expiresIn: 300,
      forcePresigned: true,
    });
  });
});

describe("webhook thumbUrl wiring", () => {
  test("emits proxy thumbUrl for app-encrypted remote files", async () => {
    const fileUuid = "20000000-0000-4000-8000-000000000031";
    const messageUuid = "50000000-0000-4000-8000-000000000016";
    const chatUuid = "42000000-0000-4000-8000-000000000053";
    const fileRecord = {
      id: fileUuid,
      message_id: messageUuid,
      storage_driver: "s3",
      storage_key: "uploads/raw.mp4",
      encryption_type: "local",
      processing_status: "pending",
      mime_type: "video/mp4",
    };
    const emitChatEventMock = vi.fn();
    const customApp = makeApp({
      deps: {
        storageProvider: {
          getDownloadUrl: vi.fn(
            async (key) => `https://cdn.example.com/${key}`,
          ),
        },
        webhookSecret: "secret-key-123",
        findMessageFileById: (id) =>
          String(id) === fileUuid ? fileRecord : null,
        listMessageFilesByMessageIds: () => [fileRecord],
        adminGetRow: (sql) => {
          if (sql.includes("chat_messages"))
            return { chat_id: chatUuid, id: messageUuid };
          if (sql.includes("chat_message_files")) return fileRecord;
          return null;
        },
        adminRun: () => {},
        adminSave: () => {},
        emitChatEvent: emitChatEventMock,
      },
    });

    const res = await request(customApp.app)
      .post("/api/uploads/webhook/processed")
      .set("x-songbird-webhook-secret", "secret-key-123")
      .send({
        fileId: fileUuid,
        status: "ready",
        transcodedStorageKey: "transcoded/video31.mp4",
        thumbStorageKey: "thumbs/thumb31.jpg",
      });

    expect(res.status).toBe(200);
    expect(emitChatEventMock).toHaveBeenCalledWith(
      chatUuid,
      expect.objectContaining({
        type: "chat_message_updated",
        files: expect.arrayContaining([
          expect.objectContaining({
            id: fileUuid,
            thumbUrl: `/api/uploads/thumbs/${fileUuid}`,
          }),
        ]),
      }),
    );
  });
});

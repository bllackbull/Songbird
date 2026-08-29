import { describe, test, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { makeApp } from "./helpers/makeApp.js";
import { RemoteStorageProvider } from "../lib/storage/RemoteStorageProvider.js";
import { createStorageEncryption } from "../lib/storageEncryption.js";

describe("Remote Uploads & File Management Routes", () => {
  let appObj;
  let mockRemoteProvider;
  let sessionToken = "test-session-token-remote";
  let userId;

  beforeEach(() => {
    mockRemoteProvider = new RemoteStorageProvider({
      STORAGE_BUCKET: "test-bucket",
      STORAGE_REGION: "us-east-1",
      STORAGE_ACCESS_KEY_ID: "test-key",
      STORAGE_SECRET_ACCESS_KEY: "test-secret",
    });

    // Mock getUploadUrl and getDownloadUrl to avoid real AWS calls in test
    vi.spyOn(mockRemoteProvider, "getUploadUrl").mockImplementation(
      async (info) => {
        const key = info?.key || info?.filename || "test-file.png";
        return {
          type: "remote",
          uploadUrl: `https://test-bucket.s3.amazonaws.com/${key}?presigned=true`,
          storageKey: key,
        };
      },
    );

    vi.spyOn(mockRemoteProvider, "getDownloadUrl").mockImplementation(
      async (key) => {
        return `https://test-bucket.s3.amazonaws.com/${key}?download=true`;
      },
    );

    appObj = makeApp({
      deps: {
        storageProvider: mockRemoteProvider,
        storageProcessingMode: "local",
        webhookSecret: "secret-key-123",
        MESSAGE_FILE_LIMITS: { maxFileSizeBytes: 50 * 1024 * 1024 },
      },
    });

    userId = appObj.userStore.createUser(
      "remoteuser",
      "hash",
      "S3 User",
      null,
      "#10b981",
    );
    appObj.sessionStore.createSession(userId, sessionToken);
  });

  describe("POST /api/uploads/presign", () => {
    test("returns 401 when not authenticated", async () => {
      const res = await request(appObj.app).post("/api/uploads/presign").send({
        filename: "video.mp4",
        contentType: "video/mp4",
        fileSize: 1024,
      });

      expect(res.status).toBe(401);
    });

    test("returns 400 when fileSize exceeds maximum allowed limit", async () => {
      const res = await request(appObj.app)
        .post("/api/uploads/presign")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          filename: "huge.mp4",
          contentType: "video/mp4",
          fileSize: 100 * 1024 * 1024, // 100MB > 50MB limit
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    test("returns 200 with presigned upload details when authenticated and valid", async () => {
      const filesStore = [];
      const createMessageFilesMock = vi.fn((msgId, files) => {
        files.forEach((f, idx) => {
          const fileRecord = {
            id: filesStore.length + 1,
            message_id: msgId,
            ...f,
          };
          filesStore.push(fileRecord);
        });
        return filesStore;
      });

      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          createMessageFiles: createMessageFilesMock,
          findMessageFileById: (id) =>
            filesStore.find((f) => String(f.id) === String(id)) || null,
          adminGetRow: (sql, params) => {
            if (sql.includes("chat_message_files")) {
              return filesStore[filesStore.length - 1] || null;
            }
            return null;
          },
          MESSAGE_FILE_LIMITS: { maxFileSizeBytes: 50 * 1024 * 1024 },
        },
      });
      const uId = customApp.userStore.createUser(
        "testuser",
        "pass",
        "Test",
        null,
        "#fff",
      );
      customApp.sessionStore.createSession(uId, sessionToken);

      const res = await request(customApp.app)
        .post("/api/uploads/presign")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          messageId: "c0c0c0c0-d1d1-4e2e-af3f-060606060606",
          filename: "sample.png",
          contentType: "image/png",
          fileSize: 2048,
          width: 800,
          height: 600,
          clientWebpThumbBase64: "data:image/webp;base64,mock",
          waveform: "[1,2,3]",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.type).toBe("remote");
      expect(res.body.uploadUrl).toContain(
        "https://test-bucket.s3.amazonaws.com/",
      );
      expect(res.body.storageKey).toBeDefined();
      expect(res.body.fileId).toBeDefined();

      expect(createMessageFilesMock).toHaveBeenCalled();
    });

    test("presign returns storageKey and no fileId when messageId is absent (no row inserted)", async () => {
      const createMessageFilesMock = vi.fn(() => []);
      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          storageProcessingMode: "remote",
          createMessageFiles: createMessageFilesMock,
          MESSAGE_FILE_LIMITS: { maxFileSizeBytes: 50 * 1024 * 1024 },
        },
      });
      const uId = customApp.userStore.createUser(
        "rowless",
        "pass",
        "Rowless",
        null,
        "#fff",
      );
      customApp.sessionStore.createSession(uId, sessionToken);

      const res = await request(customApp.app)
        .post("/api/uploads/presign")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          filename: "clip.mp4",
          contentType: "video/mp4",
          fileSize: 1024,
        });

      expect(res.status).toBe(200);
      expect(res.body.type).toBe("remote");
      expect(res.body.storageKey).toMatch(/^uploads\//);
      expect(res.body.uploadUrl).toBeTruthy();
      expect(res.body.fileId).toBeNull();
      expect(createMessageFilesMock).not.toHaveBeenCalled();
    });

    test("presign returns remote upload URL for video when storageProcessingMode is 'local'", async () => {
      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          storageProcessingMode: "local",
          MESSAGE_FILE_LIMITS: { maxFileSizeBytes: 50 * 1024 * 1024 },
        },
      });
      const uId = customApp.userStore.createUser(
        "localmodeuser",
        "pass",
        "LocalModeUser",
        null,
        "#fff",
      );
      customApp.sessionStore.createSession(uId, sessionToken);

      const res = await request(customApp.app)
        .post("/api/uploads/presign")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          filename: "clip_local.mp4",
          contentType: "video/mp4",
          fileSize: 1024,
        });

      expect(res.status).toBe(200);
      expect(res.body.type).toBe("remote");
      expect(res.body.uploadUrl).toContain("https://test-bucket.s3.amazonaws.com/");
      expect(res.body.storageKey).toBeDefined();
    });
  });

  describe("POST /api/uploads/complete", () => {
    test("returns 401 when not authenticated", async () => {
      const res = await request(appObj.app)
        .post("/api/uploads/complete")
        .send({ fileId: 1, storageKey: "uploads/file.png" });

      expect(res.status).toBe(401);
    });

    test("returns 404 when fileId does not exist", async () => {
      const res = await request(appObj.app)
        .post("/api/uploads/complete")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({ fileId: 999, storageKey: "uploads/missing.png" });

      expect(res.status).toBe(404);
    });

    test("updates status to ready in sync mode", async () => {
      let fileStatus = "pending";
      const uuidFileId = "10000000-0000-4000-8000-000000000010";
      const fileRecord = {
        id: uuidFileId,
        message_id: null,
        storage_driver: "s3",
        storage_key: "uploads/file10.mp4",
        processing_status: fileStatus,
      };

      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          storageProcessingMode: "local",
          findMessageFileById: (id) => (String(id) === uuidFileId ? fileRecord : null),
          adminGetRow: (sql) =>
            sql.includes("chat_message_files") ? fileRecord : null,
          adminRun: (sql, params) => {
            if (sql.includes("UPDATE chat_message_files")) {
              fileStatus = params[0];
              fileRecord.processing_status = fileStatus;
            }
          },
          adminSave: () => {},
        },
      });
      const uId = customApp.userStore.createUser(
        "testuser10",
        "pass",
        "Test",
        null,
        "#fff",
      );
      customApp.sessionStore.createSession(uId, sessionToken);

      const res = await request(customApp.app)
        .post("/api/uploads/complete")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({ fileId: uuidFileId, storageKey: "uploads/file10.mp4" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.fileId).toBe(uuidFileId);
      expect(res.body.status).toBe("ready");
    });

    test("keeps status as pending in remote mode", async () => {
      let fileStatus = "pending";
      const uuidFileId = "10000000-0000-4000-8000-000000000011";
      const fileRecord = {
        id: uuidFileId,
        message_id: null,
        storage_driver: "s3",
        storage_key: "uploads/file11.mp4",
        processing_status: fileStatus,
      };

      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          storageProcessingMode: "remote",
          findMessageFileById: (id) => (String(id) === uuidFileId ? fileRecord : null),
          adminGetRow: (sql) =>
            sql.includes("chat_message_files") ? fileRecord : null,
          adminRun: (sql, params) => {
            if (sql.includes("UPDATE chat_message_files")) {
              fileStatus = params[0];
              fileRecord.processing_status = fileStatus;
            }
          },
          adminSave: () => {},
        },
      });
      const uId = customApp.userStore.createUser(
        "testuser11",
        "pass",
        "Test",
        null,
        "#fff",
      );
      customApp.sessionStore.createSession(uId, sessionToken);

      const res = await request(customApp.app)
        .post("/api/uploads/complete")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({ fileId: uuidFileId, storageKey: "uploads/file11.mp4" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.fileId).toBe(uuidFileId);
      expect(res.body.status).toBe("pending");
    });

    test("dispatches HTTP transcode job to mediaWorkerUrl when configured", async () => {
      const uuidFileId = "10000000-0000-4000-8000-000000000012";
      const fileRecord = {
        id: uuidFileId,
        message_id: null,
        storage_driver: "s3",
        storage_key: "uploads/file12.mp4",
        mime_type: "video/mp4",
        stored_name: "file12.mp4",
        processing_status: "pending",
      };

      let dispatchedUrl = null;
      let dispatchedPayload = null;
      const mockFetch = vi.fn(async (url, opts) => {
        dispatchedUrl = url;
        dispatchedPayload = JSON.parse(opts.body);
        return { ok: true, status: 202 };
      });

      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          storageProcessingMode: "remote",
          mediaWorkerUrl: "https://media-worker.onrender.com",
          webhookSecret: "secret-token",
          fetchImpl: mockFetch,
          findMessageFileById: (id) => (String(id) === uuidFileId ? fileRecord : null),
          adminGetRow: (sql) =>
            sql.includes("chat_message_files") ? fileRecord : null,
          adminRun: () => {},
          adminSave: () => {},
        },
      });
      const uId = customApp.userStore.createUser(
        "testuser12",
        "pass",
        "Test",
        null,
        "#fff",
      );
      customApp.sessionStore.createSession(uId, sessionToken);

      const res = await request(customApp.app)
        .post("/api/uploads/complete")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({ fileId: uuidFileId, storageKey: "uploads/file12.mp4" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(dispatchedUrl).toBe("https://media-worker.onrender.com/transcode");
      expect(dispatchedPayload.fileId).toBe(uuidFileId);
      expect(dispatchedPayload.storageKey).toBe("uploads/file12.mp4");
    });
  });

  describe("POST /api/uploads/webhook/processed", () => {
    test("returns 401 when webhook secret is invalid", async () => {
      const res = await request(appObj.app)
        .post("/api/uploads/webhook/processed")
        .set("x-songbird-webhook-secret", "wrong-secret")
        .send({ fileId: 10, status: "ready" });

      expect(res.status).toBe(401);
    });

    test("returns 404 when file is not found", async () => {
      const res = await request(appObj.app)
        .post("/api/uploads/webhook/processed")
        .set("x-songbird-webhook-secret", "secret-key-123")
        .send({ fileId: 999, status: "ready" });

      expect(res.status).toBe(404);
    });

    test("updates file status, metadata and emits chat_message_updated with resolved thumbUrl", async () => {
      const fileUuid = "20000000-0000-4000-8000-000000000021";
      const messageUuid = "50000000-0000-4000-8000-000000000006";
      const chatUuid = "42000000-0000-4000-8000-000000000043";
      const fileRecord = {
        id: fileUuid,
        message_id: messageUuid,
        storage_driver: "s3",
        storage_key: "uploads/raw.mp4",
        processing_status: "pending",
        mime_type: "video/mp4",
      };

      const emitChatEventMock = vi.fn();
      let capturedPayload = null;

      const customApp = makeApp({
        deps: {
          storageProvider: {
            ...mockRemoteProvider,
            getDownloadUrl: vi.fn(async (key) => `https://cdn.example.com/${key}`),
          },
          webhookSecret: "secret-key-123",
          findMessageFileById: (id) => (String(id) === fileUuid ? fileRecord : null),
          listMessageFilesByMessageIds: () => [fileRecord],
          adminGetRow: (sql) => {
            if (sql.includes("chat_messages")) return { chat_id: chatUuid, id: messageUuid };
            if (sql.includes("chat_message_files")) return fileRecord;
            return null;
          },
          adminRun: (sql, params) => {
            capturedPayload = { sql, params };
          },
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
          transcodedStorageKey: "transcoded/video21.mp4",
          thumbStorageKey: "thumbs/thumb21.jpg",
          width: 1280,
          height: 720,
          duration: 15.4,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(emitChatEventMock).toHaveBeenCalledWith(
        chatUuid,
        expect.objectContaining({
          type: "chat_message_updated",
          messageId: messageUuid,
          files: expect.arrayContaining([
            expect.objectContaining({
              id: fileUuid,
              width: 1280,
              height: 720,
              durationSeconds: 15.4,
              thumbUrl: "https://cdn.example.com/thumbs/thumb21.jpg",
              url: "https://cdn.example.com/transcoded/video21.mp4",
            }),
          ]),
        }),
      );
    });

    test("updates file status and emits video:ready SSE event", async () => {
      const fileUuid = "20000000-0000-4000-8000-000000000020";
      const messageUuid = "50000000-0000-4000-8000-000000000005";
      const chatUuid = "42000000-0000-4000-8000-000000000042";
      const fileRecord = {
        id: fileUuid,
        message_id: messageUuid,
        storage_driver: "s3",
        storage_key: "uploads/raw.mp4",
        processing_status: "pending",
      };

      const emitChatEventMock = vi.fn();
      let updatedStatus = "pending";
      let updatedTranscodedKey = null;

      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          webhookSecret: "secret-key-123",
          findMessageFileById: (id) => (String(id) === fileUuid ? fileRecord : null),
          adminGetRow: (sql) => {
            if (sql.includes("chat_messages")) return { chat_id: chatUuid };
            if (sql.includes("chat_message_files")) return fileRecord;
            return null;
          },
          adminRun: (sql, params) => {
            updatedStatus = params[0];
            updatedTranscodedKey = params[1];
          },
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
          transcodedStorageKey: "transcoded/video20.mp4",
          thumbStorageKey: "thumbs/thumb20.jpg",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(updatedStatus).toBe("ready");
      expect(updatedTranscodedKey).toBe("transcoded/video20.mp4");

      expect(emitChatEventMock).toHaveBeenCalledWith(
        chatUuid,
        expect.objectContaining({
          type: "video:ready",
          fileId: fileUuid,
          status: "ready",
          storageKey: "transcoded/video20.mp4",
        }),
      );
    });
  });

  describe("GET /api/uploads/file/:id", () => {
    test("redirects 302 to S3 download URL when encryption_type is none", async () => {
      const fileUuid = "30000000-0000-4000-8000-000000000030";
      const fileRecord = {
        id: fileUuid,
        storage_driver: "s3",
        storage_key: "uploads/public.jpg",
        encryption_type: "none",
        mime_type: "image/jpeg",
      };

      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          findMessageFileById: (id) => (String(id) === fileUuid ? fileRecord : null),
          adminGetRow: () => fileRecord,
        },
      });

      const res = await request(customApp.app).get(`/api/uploads/file/${fileUuid}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(
        "https://test-bucket.s3.amazonaws.com/uploads/public.jpg",
      );
    });

    test("redirects 302 to S3 download URL when encryption_type is provider_sse", async () => {
      const fileUuid = "30000000-0000-4000-8000-000000000031";
      const fileRecord = {
        id: fileUuid,
        storage_driver: "s3",
        storage_key: "uploads/sse.png",
        encryption_type: "provider_sse",
        mime_type: "image/png",
      };

      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          findMessageFileById: (id) => (String(id) === fileUuid ? fileRecord : null),
          adminGetRow: () => fileRecord,
        },
      });

      const res = await request(customApp.app).get(`/api/uploads/file/${fileUuid}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain(
        "https://test-bucket.s3.amazonaws.com/uploads/sse.png",
      );
    });

    test("decrypts and streams content when encryption_type is aes-256-gcm", async () => {
      const enc = createStorageEncryption();
      process.env.STORAGE_ENCRYPTION_KEY = "test-secret-key-32-chars-long!!";

      const plainText = "Hello Decrypted S3 Data!";
      const encryptedBuf = enc.encryptBuffer(Buffer.from(plainText));
      const fileUuid = "30000000-0000-4000-8000-000000000032";

      const fileRecord = {
        id: fileUuid,
        storage_driver: "s3",
        storage_key: "uploads/encrypted.txt",
        encryption_type: "aes-256-gcm",
        mime_type: "text/plain",
      };

      // Mock fetch globally or pass custom fetch implementation in deps
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () =>
          encryptedBuf.buffer.slice(
            encryptedBuf.byteOffset,
            encryptedBuf.byteOffset + encryptedBuf.byteLength,
          ),
      });

      try {
        const customApp = makeApp({
          deps: {
            storageProvider: mockRemoteProvider,
            storageEncryption: enc,
            findMessageFileById: (id) =>
              String(id) === fileUuid ? fileRecord : null,
            adminGetRow: () => fileRecord,
          },
        });

        const res = await request(customApp.app).get(`/api/uploads/file/${fileUuid}`);

        expect(res.status).toBe(200);
        expect(res.text).toBe(plainText);
      } finally {
        global.fetch = originalFetch;
      }
    });

    test("uploadBuffer uploads buffer directly to remote storage provider", async () => {
      vi.spyOn(mockRemoteProvider, "uploadBuffer").mockResolvedValue({
        key: "uploads/test-buffer.txt",
      });

      const res = await mockRemoteProvider.uploadBuffer(
        "uploads/test-buffer.txt",
        Buffer.from("hello world"),
        "text/plain",
      );

      expect(res.key).toBe("uploads/test-buffer.txt");
      expect(mockRemoteProvider.uploadBuffer).toHaveBeenCalledWith(
        "uploads/test-buffer.txt",
        expect.any(Buffer),
        "text/plain",
      );
    });

    test("GET /api/uploads/messages/:storedName redirects 302 to remote storage URL", async () => {
      const storedName = "test-remote-file.png";
      const fileRecord = {
        storage_driver: "s3",
        storage_key: `uploads/${storedName}`,
        stored_name: storedName,
      };

      const customApp = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          adminGetRow: () => fileRecord,
        },
      });

      const { createUploadTools } = await import("../lib/uploads.js");
      const fsMod = await import("node:fs");
      const multerMod = await import("multer");
      const uploadTools = createUploadTools({
        fs: fsMod.default,
        path: await import("node:path"),
        crypto: await import("node:crypto"),
        multer: multerMod.default,
        adminGetRow: () => fileRecord,
        uploadRootDir: "/tmp",
        avatarUploadRootDir: "/tmp",
        fileUploadMaxSize: 100 * 1024 * 1024,
        fileUploadMaxFiles: 10,
        fileUploadMaxTotalSize: 500 * 1024 * 1024,
        storageEncryption: { decryptFileToBuffer: () => null, getDecryptedFileSize: () => 0 },
        storageProvider: mockRemoteProvider,
      });
      uploadTools.registerUploadRoutes(customApp.app, { adminGetRow: () => fileRecord });

      const res = await request(customApp.app).get(`/api/uploads/messages/${storedName}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain("test-bucket.s3.amazonaws.com");
    });
  });
});

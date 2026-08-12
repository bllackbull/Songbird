import { describe, test, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { makeApp } from "./helpers/makeApp.js";
import { LocalStorageProvider } from "../lib/storage/LocalStorageProvider.js";
import { RemoteStorageProvider } from "../lib/storage/RemoteStorageProvider.js";

describe("E2E S3 & Local Upload Lifecycle", () => {
  const sessionToken = "e2e-session-token";
  let userId;

  describe("STORAGE_DRIVER=local full lifecycle", () => {
    let localProvider;
    let filesStore;

    beforeEach(() => {
      localProvider = new LocalStorageProvider({
        uploadUrl: "/api/uploads",
        downloadBaseUrl: "/api/uploads/file",
      });
      filesStore = [];
    });

    test("presign -> complete -> download under local driver", async () => {
      const createMessageFilesMock = vi.fn((msgId, files) => {
        const result = [];
        files.forEach((f) => {
          const rec = {
            id: filesStore.length + 1,
            message_id: msgId,
            storage_driver: f.storageDriver || f.storage_driver || "local",
            ...f,
          };
          filesStore.push(rec);
          result.push(rec);
        });
        return result;
      });

      const appObj = makeApp({
        deps: {
          storageProvider: localProvider,
          storageProcessingMode: "sync",
          createMessageFiles: createMessageFilesMock,
          findMessageFileById: (id) =>
            filesStore.find((f) => f.id === Number(id)) || null,
          adminGetRow: (sql, params) => {
            if (sql.includes("chat_message_files")) {
              const id = params ? params[0] : null;
              if (id)
                return filesStore.find((f) => f.id === Number(id)) || null;
              return filesStore[filesStore.length - 1] || null;
            }
            return null;
          },
          adminRun: (sql, params) => {
            if (
              sql.includes("UPDATE chat_message_files SET processing_status")
            ) {
              const status = params[0];
              const fileId = params[1];
              const file = filesStore.find((f) => f.id === Number(fileId));
              if (file) file.processing_status = status;
            }
          },
          adminSave: () => {},
        },
      });

      userId = appObj.userStore.createUser(
        "localuser",
        "pass",
        "Local User",
        null,
        "#10b981",
      );
      appObj.sessionStore.createSession(userId, sessionToken);

      // 1. Presign call
      const presignRes = await request(appObj.app)
        .post("/api/uploads/presign")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          filename: "test-document.pdf",
          contentType: "application/pdf",
          fileSize: 1024,
          width: null,
          height: null,
          duration: null,
        });

      expect(presignRes.status).toBe(200);
      expect(presignRes.body.success).toBe(true);
      expect(presignRes.body.type).toBe("local");
      expect(presignRes.body.uploadUrl).toBe("/api/uploads");
      expect(presignRes.body.fileId).toBeDefined();
      expect(presignRes.body.storageKey).toBeDefined();

      const fileId = presignRes.body.fileId;
      const storageKey = presignRes.body.storageKey;

      // 2. Complete call
      const completeRes = await request(appObj.app)
        .post("/api/uploads/complete")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({ fileId, storageKey });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.success).toBe(true);
      expect(completeRes.body.status).toBe("ready");

      // 3. Download call
      const downloadRes = await request(appObj.app).get(
        `/api/uploads/file/${fileId}`,
      );

      expect(downloadRes.status).toBe(200);
    });

    test("fallback multipart form upload POST /api/uploads", async () => {
      const createMessageFilesMock = vi.fn((msgId, files) => {
        const result = [];
        files.forEach((f) => {
          const rec = {
            id: filesStore.length + 1,
            message_id: msgId,
            storage_driver: f.storageDriver || f.storage_driver || "local",
            ...f,
          };
          filesStore.push(rec);
          result.push(rec);
        });
        return result;
      });

      const appObj = makeApp({
        deps: {
          storageProvider: localProvider,
          createMessageFiles: createMessageFilesMock,
          findMessageFileById: (id) =>
            filesStore.find((f) => f.id === Number(id)) || null,
          adminGetRow: (sql, params) => {
            if (sql.includes("chat_message_files")) {
              const id = params ? params[0] : null;
              if (id)
                return filesStore.find((f) => f.id === Number(id)) || null;
              return filesStore[filesStore.length - 1] || null;
            }
            return null;
          },
        },
      });

      userId = appObj.userStore.createUser(
        "localuser2",
        "pass",
        "Local User 2",
        null,
        "#10b981",
      );
      appObj.sessionStore.createSession(userId, sessionToken);

      const uploadRes = await request(appObj.app)
        .post("/api/uploads")
        .set("Cookie", [`sid=${sessionToken}`])
        .field("filename", "sample.png")
        .field("contentType", "image/png")
        .field("fileSize", "2048")
        .field("width", "800")
        .field("height", "600");

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.success).toBe(true);
      expect(uploadRes.body.fileId).toBeDefined();
      expect(uploadRes.body.url).toContain(
        `/api/uploads/file/${uploadRes.body.fileId}`,
      );

      // Verify download endpoint
      const downloadRes = await request(appObj.app).get(
        `/api/uploads/file/${uploadRes.body.fileId}`,
      );

      expect(downloadRes.status).toBe(200);
    });
  });

  describe("STORAGE_DRIVER=s3 full lifecycle", () => {
    let mockRemoteProvider;
    let filesStore;

    beforeEach(() => {
      mockRemoteProvider = new RemoteStorageProvider({
        STORAGE_BUCKET: "my-bucket",
        STORAGE_REGION: "us-west-2",
        STORAGE_ACCESS_KEY_ID: "key-123",
        STORAGE_SECRET_ACCESS_KEY: "secret-456",
      });

      vi.spyOn(mockRemoteProvider, "getUploadUrl").mockImplementation(
        async (info) => {
          const key = info?.key || "uploads/test.mp4";
          return {
            type: "remote",
            uploadUrl: `https://my-bucket.s3.us-west-2.amazonaws.com/${key}?upload=true`,
            storageKey: key,
          };
        },
      );

      vi.spyOn(mockRemoteProvider, "getDownloadUrl").mockImplementation(
        async (key) => {
          return `https://my-bucket.s3.us-west-2.amazonaws.com/${key}?download=true`;
        },
      );

      filesStore = [];
    });

    test("presign -> complete -> webhook callback -> download URL resolution", async () => {
      const emitChatEventMock = vi.fn();
      const createMessageFilesMock = vi.fn((msgId, files) => {
        const result = [];
        files.forEach((f) => {
          const rec = {
            id: filesStore.length + 1,
            message_id: msgId,
            storage_driver: f.storageDriver || f.storage_driver || "s3",
            ...f,
          };
          filesStore.push(rec);
          result.push(rec);
        });
        return result;
      });

      const appObj = makeApp({
        deps: {
          storageProvider: mockRemoteProvider,
          storageProcessingMode: "webhook",
          webhookSecret: "super-secret-webhook-key",
          createMessageFiles: createMessageFilesMock,
          findMessageFileById: (id) =>
            filesStore.find((f) => f.id === Number(id)) || null,
          adminGetRow: (sql, params) => {
            if (sql.includes("chat_messages")) return { chat_id: 101 };
            if (sql.includes("chat_message_files")) {
              const id = params ? params[0] : null;
              if (id)
                return filesStore.find((f) => f.id === Number(id)) || null;
              return filesStore[filesStore.length - 1] || null;
            }
            return null;
          },
          adminRun: (sql, params) => {
            const lower = String(sql || "").toLowerCase();
            if (lower.includes("chat_message_files")) {
              const fileId = Number(params[params.length - 1]);
              const file = filesStore.find((f) => f.id === fileId);
              if (file) {
                if (params.includes("ready")) file.processing_status = "ready";
                else if (params.includes("pending")) file.processing_status = "pending";
                const key = params.find((p) => typeof p === "string" && p.startsWith("transcoded/"));
                if (key) file.storage_key = key;
              }
            }
          },
          adminSave: () => {},
          emitChatEvent: emitChatEventMock,
        },
      });

      userId = appObj.userStore.createUser(
        "s3user",
        "pass",
        "S3 User",
        null,
        "#10b981",
      );
      appObj.sessionStore.createSession(userId, sessionToken);

      // 1. Presign
      const presignRes = await request(appObj.app)
        .post("/api/uploads/presign")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          filename: "video.mp4",
          contentType: "video/mp4",
          fileSize: 1048576,
          width: 1920,
          height: 1080,
          duration: 120,
        });

      expect(presignRes.status).toBe(200);
      expect(presignRes.body.success).toBe(true);
      expect(presignRes.body.type).toBe("remote");
      expect(presignRes.body.uploadUrl).toContain(
        "https://my-bucket.s3.us-west-2.amazonaws.com/",
      );
      expect(presignRes.body.fileId).toBeDefined();

      const fileId = presignRes.body.fileId;
      const storageKey = presignRes.body.storageKey;

      // 2. Complete (status should be pending in webhook mode)
      const completeRes = await request(appObj.app)
        .post("/api/uploads/complete")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({ fileId, storageKey });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.success).toBe(true);
      expect(completeRes.body.status).toBe("pending");

      // 3. Webhook callback from media worker
      const webhookRes = await request(appObj.app)
        .post("/api/uploads/webhook/processed")
        .set("x-songbird-webhook-secret", "super-secret-webhook-key")
        .send({
          fileId,
          status: "ready",
          transcodedStorageKey: "transcoded/video_720p.mp4",
          thumbStorageKey: "thumbs/video_thumb.jpg",
        });

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.success).toBe(true);

      const updatedFile = filesStore.find((f) => f.id === fileId);
      expect(updatedFile.processing_status).toBe("ready");
      expect(updatedFile.storage_key).toBe("transcoded/video_720p.mp4");

      // 4. Download URL resolution (302 redirect)
      const downloadRes = await request(appObj.app).get(
        `/api/uploads/file/${fileId}`,
      );

      expect(downloadRes.status).toBe(302);
      expect(downloadRes.headers.location).toBe(
        "https://my-bucket.s3.us-west-2.amazonaws.com/transcoded/video_720p.mp4?download=true",
      );
    });
  });
});

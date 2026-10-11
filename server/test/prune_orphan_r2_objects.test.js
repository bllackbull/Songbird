import { describe, test, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { makeApp } from "./helpers/makeApp.js";
import { RemoteStorageProvider } from "../lib/storage/RemoteStorageProvider.js";
import { createMessageFileJobs } from "../lib/messageFileJobs.js";

describe("Task 5: Server — prune orphan R2 objects", () => {
  let appObj;
  let mockRemoteProvider;
  let deletedKeys;
  let pendingStore;
  let sessionToken = "test-session-token-orphan";
  let userId;
  let chatId = "c0c0c0c0-d1d1-4e2e-af3f-060606060606";

  beforeEach(() => {
    deletedKeys = [];
    pendingStore = [];

    mockRemoteProvider = new RemoteStorageProvider({
      STORAGE_BUCKET: "test-bucket",
      STORAGE_REGION: "us-east-1",
      STORAGE_ACCESS_KEY_ID: "test-key",
      STORAGE_SECRET_ACCESS_KEY: "test-secret",
    });

    vi.spyOn(mockRemoteProvider, "getUploadUrl").mockImplementation(
      async (info) => {
        const key = info?.key || "uploads/test-orphan-file.png";
        return {
          type: "remote",
          uploadUrl: `https://test-bucket.s3.amazonaws.com/${key}?presigned=true`,
          storageKey: key,
        };
      },
    );

    vi.spyOn(mockRemoteProvider, "deleteFile").mockImplementation(
      async (key) => {
        deletedKeys.push(key);
        return true;
      },
    );

    appObj = makeApp({
      deps: {
        storageProvider: mockRemoteProvider,
        isMember: () => true,
        findChatById: () => ({ id: chatId, name: "test-chat", type: "group" }),
        recordPendingPresignedUpload: ({ storageKey, userId }) => {
          const rec = {
            storage_key: storageKey,
            user_id: userId,
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          };
          pendingStore.push(rec);
          return rec;
        },
        removePendingPresignedUploads: (keys) => {
          const keyArr = Array.isArray(keys) ? keys : [keys];
          const keySet = new Set(keyArr.map((k) => (typeof k === "string" ? k : k?.storageKey || k?.storage_key)));
          pendingStore = pendingStore.filter((r) => !keySet.has(r.storage_key));
        },
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

  test("POST /api/uploads/presign without messageId records a pending upload", async () => {
    const res = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        filename: "test-file.png",
        contentType: "image/png",
        fileSize: 1024,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.storageKey).toBeDefined();
    expect(pendingStore.some((r) => r.storage_key === res.body.storageKey)).toBe(true);
  });

  test("POST /api/messages/upload removes pending presigned upload upon message completion", async () => {
    const presignRes = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        filename: "attached-file.png",
        contentType: "image/png",
        fileSize: 2048,
      });

    expect(presignRes.status).toBe(200);
    const key = presignRes.body.storageKey;
    expect(pendingStore.some((r) => r.storage_key === key)).toBe(true);

    const uploadRes = await request(appObj.app)
      .post("/api/messages/upload")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        chatId,
        username: "remoteuser",
        body: "Here is the uploaded document",
        storageKeys: [key],
        fileMeta: JSON.stringify([{ originalName: "attached-file.png", mimeType: "image/png", sizeBytes: 2048 }]),
      });

    if (uploadRes.status !== 200) console.log("UPLOAD RES ERROR:", uploadRes.body);
    expect(uploadRes.status).toBe(200);
    expect(pendingStore.some((r) => r.storage_key === key)).toBe(false);
  });

  test("pruneOrphanRemoteObjects deletes orphan files from storageProvider", async () => {
    const orphanKey = "uploads/orphan-12345.png";
    const claimedKey = "uploads/claimed-67890.png";

    const localPendingRows = [
      { storage_key: orphanKey, created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
      { storage_key: claimedKey, created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    ];

    const deletedPending = [];
    const jobs = createMessageFileJobs({
      adminGetAll: (query) => {
        const sqlStr = String(query && typeof query.toSQL === "function" ? query.toSQL().sql : query);
        if (sqlStr.includes("pending_presigned_uploads")) {
          return localPendingRows;
        }
        if (sqlStr.includes("chat_message_files")) {
          return [{ storage_key: claimedKey }];
        }
        return [];
      },
      adminRun: (query) => {
        const sqlStr = String(query && typeof query.toSQL === "function" ? query.toSQL().sql : query);
        if (sqlStr.includes("pending_presigned_uploads")) {
          deletedPending.push(query);
        }
      },
      adminGetRow: () => null,
      adminSave: () => {},
      listMessageFilesByMessageIds: () => [],
      removeStoredFileNames: () => {},
      uploadRootDir: "/tmp/test",
      fs: {},
      path: { join: (...p) => p.join("/"), basename: (p) => p.split("/").pop() },
      getSetting: () => null,
      storageProvider: mockRemoteProvider,
    });

    const result = await jobs.pruneOrphanRemoteObjects({ maxAgeMs: 60 * 60 * 1000 });

    expect(result.prunedCount).toBe(1);
    expect(result.prunedKeys).toEqual([orphanKey]);
    expect(deletedKeys).toEqual([orphanKey]);
    expect(deletedKeys).not.toContain(claimedKey);
  });
});

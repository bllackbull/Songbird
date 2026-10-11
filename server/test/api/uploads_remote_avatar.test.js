import { describe, test, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

describe("POST /api/uploads/presign with uploadType: 'avatar'", () => {
  let appObj;
  let sessionToken;
  let mockRemoteProvider;
  let mockLocalProvider;
  const userId = "11111111-2222-4333-8444-555555555555";

  beforeEach(() => {
    sessionToken = "test-avatar-session-token";
    mockRemoteProvider = {
      type: "s3",
      getUploadUrl: vi.fn().mockImplementation(async ({ key }) => ({
        uploadUrl: `https://test-bucket.s3.amazonaws.com/${key}?sig=abc`,
        key,
      })),
    };

    mockLocalProvider = {
      type: "local",
      getUploadUrl: vi.fn(),
    };
  });

  function createApp(provider = mockRemoteProvider) {
    const userStore = makeUserStore([
      {
        id: userId,
        username: "alice",
        password_hash: "hash",
        nickname: "Alice",
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const app = makeApp({
      userStore,
      deps: {
        storageProvider: provider,
        AVATAR_FILE_LIMITS: { maxFileSizeBytes: 5 * 1024 * 1024 }, // 5MB
        ALLOWED_AVATAR_MIME_TYPES: new Set([
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/bmp",
        ]),
        createMessageFiles: vi.fn(),
        recordPendingPresignedUpload: vi.fn(),
      },
    });
    app.sessionStore.createSession(userId, sessionToken);
    return app;
  }

  test("returns 401 when not authenticated", async () => {
    appObj = createApp(mockRemoteProvider);
    const res = await request(appObj.app).post("/api/uploads/presign").send({
      uploadType: "avatar",
      filename: "avatar.png",
      contentType: "image/png",
      fileSize: 1024,
    });
    expect(res.status).toBe(401);
  });

  test("generates S3 presigned URL with uploads/avatars/ prefix when S3 configured", async () => {
    appObj = createApp(mockRemoteProvider);
    const res = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        uploadType: "avatar",
        filename: "my-photo.png",
        contentType: "image/png",
        fileSize: 1024 * 50,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.type).toBe("s3");
    expect(res.body.uploadUrl).toContain(
      "test-bucket.s3.amazonaws.com/uploads/avatars/avatar-",
    );
    expect(res.body.storageKey).toMatch(
      /^uploads\/avatars\/avatar-[a-zA-Z0-9_-]+\.png$/,
    );
    expect(res.body.avatarUrl).toMatch(
      /^\/api\/uploads\/avatars\/avatar-[a-zA-Z0-9_-]+\.png$/,
    );

    // Ensure createMessageFiles was NOT called
    expect(appObj.deps.createMessageFiles).not.toHaveBeenCalled();
    expect(appObj.deps.recordPendingPresignedUpload).toHaveBeenCalledWith(
      expect.objectContaining({ storageKey: res.body.storageKey }),
    );
  });

  test("returns type: 'local' when local storage is configured", async () => {
    appObj = createApp(mockLocalProvider);
    const res = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        uploadType: "avatar",
        filename: "photo.jpg",
        contentType: "image/jpeg",
        fileSize: 2048,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.type).toBe("local");
    expect(res.body.uploadUrl).toBeUndefined();
  });

  test("rejects non-image MIME types with 400", async () => {
    appObj = createApp(mockRemoteProvider);
    const res = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        uploadType: "avatar",
        filename: "script.js",
        contentType: "application/javascript",
        fileSize: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(
      /Avatar must be a JPEG, PNG, GIF, WEBP, or BMP image/i,
    );
  });

  test("rejects files exceeding AVATAR_FILE_LIMITS with 400", async () => {
    appObj = createApp(mockRemoteProvider);
    const res = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [`sid=${sessionToken}`])
      .send({
        uploadType: "avatar",
        filename: "huge-avatar.png",
        contentType: "image/png",
        fileSize: 6 * 1024 * 1024, // 6MB > 5MB
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/maximum allowed limit/i);
  });
});

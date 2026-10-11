import { describe, test, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

describe("Dual Avatar Upload (Presigned & Multipart S3)", () => {
  const ALICE_ID = "11111111-2222-4333-8444-555555555555";
  const BOB_ID = "33333333-4444-5555-8666-777777777777";
  const CHAT_ID = "22222222-3333-4444-8555-666666666666";
  const sessionToken = "avatar-dual-session";

  let mockRemoteProvider;
  let updateUserProfileMock;
  let updateGroupChatMock;
  let removeAvatarByUrlMock;
  let storeAvatarFileMock;

  beforeEach(() => {
    mockRemoteProvider = {
      type: "s3",
      uploadBuffer: vi.fn().mockResolvedValue({ key: "uploads/avatars/uploaded.png" }),
      deleteFile: vi.fn().mockResolvedValue(true),
      getDownloadUrl: vi
        .fn()
        .mockResolvedValue("https://s3.example.com/uploads/avatars/uploaded.png"),
    };

    updateUserProfileMock = vi.fn();
    updateGroupChatMock = vi.fn();
    removeAvatarByUrlMock = vi.fn();
    storeAvatarFileMock = vi.fn().mockResolvedValue({
      avatarUrl: "/api/uploads/avatars/avatar-stored-123.png",
      storageDriver: "s3",
      storageKey: "uploads/avatars/avatar-stored-123.png",
    });
  });

  function createTestApp(depsOverrides = {}) {
    let currentAvatar = "/api/uploads/avatars/old-avatar.png";

    const userStore = makeUserStore([
      {
        id: ALICE_ID,
        username: "alice",
        password_hash: "hash",
        nickname: "Alice",
        avatar_url: "/api/uploads/avatars/old-avatar.png",
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
      {
        id: BOB_ID,
        username: "bob",
        password_hash: "hash",
        nickname: "Bob",
        avatar_url: "/api/uploads/avatars/bob-avatar.png",
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);

    const chatRecord = {
      id: CHAT_ID,
      name: "Test Group",
      type: "group",
      group_username: "testgroup",
      group_visibility: "private",
      allow_member_invites: 1,
      group_avatar_url: "/api/uploads/avatars/old-group.png",
    };

    const appObj = makeApp({
      userStore,
      deps: {
        storageProvider: mockRemoteProvider,
        uploadAvatar: {
          single: () => (req, _res, next) => {
            if (req.headers["content-type"]?.includes("multipart")) {
              req.file = {
                originalname: "test.png",
                filename: "avatar-stored-123.png",
                mimetype: "image/png",
                size: 100,
                path: "/tmp/test.png",
              };
              req.body = req.body || {};
              if (!req.body.currentUsername) req.body.currentUsername = "alice";
              if (!req.body.username) req.body.username = "alice";
            }
            next();
          },
        },
        updateUserProfile: (...args) => {
          currentAvatar = args[3];
          updateUserProfileMock(...args);
        },
        updateGroupChat: updateGroupChatMock,
        removeAvatarByUrl: removeAvatarByUrlMock,
        storeAvatarFile: storeAvatarFileMock,
        findChatById: () => chatRecord,
        listChatMembers: () => [{ id: ALICE_ID, role: "owner" }],
        findUserById: (id) => ({
          id,
          username: id === BOB_ID ? "bob" : "alice",
          nickname: id === BOB_ID ? "Bob" : "Alice",
          avatar_url:
            id === BOB_ID
              ? "/api/uploads/avatars/bob-avatar.png"
              : currentAvatar,
          color: "#10b981",
          status: "online",
          role: "user",
        }),
        findUserByUsername: () => ({
          id: ALICE_ID,
          username: "alice",
          nickname: "Alice",
          avatar_url: currentAvatar,
        }),
        ...depsOverrides,
      },
    });

    appObj.sessionStore.createSession(ALICE_ID, sessionToken);
    return appObj;
  }

  describe("POST /api/profile/avatar", () => {
    test("accepts presigned avatarUrl in JSON body and updates profile", async () => {
      const appObj = createTestApp();
      const res = await request(appObj.app)
        .post("/api/profile/avatar")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          currentUsername: "alice",
          avatarUrl: "/api/uploads/avatars/avatar-direct-123.png",
        });

      expect(res.status).toBe(200);
      expect(res.body.avatarUrl).toBe(
        "/api/uploads/avatars/avatar-direct-123.png",
      );
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/old-avatar.png",
      );
      expect(updateUserProfileMock).toHaveBeenCalledWith(
        ALICE_ID,
        "alice",
        "Alice",
        "/api/uploads/avatars/avatar-direct-123.png",
      );
    });

    test("rejects invalid avatarUrl in JSON body", async () => {
      const appObj = createTestApp();
      const res = await request(appObj.app)
        .post("/api/profile/avatar")
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          currentUsername: "alice",
          avatarUrl: "https://malicious.com/avatar.png",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid avatar url/i);
    });

    test("processes multipart upload via storeAvatarFile when file attached", async () => {
      const appObj = createTestApp();
      const res = await request(appObj.app)
        .post("/api/profile/avatar")
        .set("Cookie", [`sid=${sessionToken}`])
        .field("currentUsername", "alice")
        .attach("avatar", Buffer.from("image-bytes"), {
          filename: "test.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(200);
      expect(storeAvatarFileMock).toHaveBeenCalled();
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/old-avatar.png",
      );
    });
  });

  describe("POST /api/chats/group/:chatId/avatar", () => {
    test("accepts presigned avatarUrl in JSON body and updates group avatar", async () => {
      const appObj = createTestApp();
      const res = await request(appObj.app)
        .post(`/api/chats/group/${CHAT_ID}/avatar`)
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          username: "alice",
          avatarUrl: "/api/uploads/avatars/avatar-group-123.png",
        });

      expect(res.status).toBe(200);
      expect(res.body.avatarUrl).toBe(
        "/api/uploads/avatars/avatar-group-123.png",
      );
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/old-group.png",
      );
      expect(updateGroupChatMock).toHaveBeenCalledWith(
        CHAT_ID,
        expect.objectContaining({
          groupAvatarUrl: "/api/uploads/avatars/avatar-group-123.png",
        }),
      );
    });

    test("processes multipart upload for group via storeAvatarFile", async () => {
      const appObj = createTestApp();
      const res = await request(appObj.app)
        .post(`/api/chats/group/${CHAT_ID}/avatar`)
        .set("Cookie", [`sid=${sessionToken}`])
        .field("username", "alice")
        .attach("avatar", Buffer.from("group-image-bytes"), {
          filename: "group.png",
          contentType: "image/png",
        });

      expect(res.status).toBe(200);
      expect(storeAvatarFileMock).toHaveBeenCalled();
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/old-group.png",
      );
    });

    test("POST /api/chats/group/:chatId/delete cleans up group avatar", async () => {
      const appObj = createTestApp({
        bcrypt: { compare: async () => true },
      });
      const res = await request(appObj.app)
        .post(`/api/chats/group/${CHAT_ID}/delete`)
        .set("Cookie", [`sid=${sessionToken}`])
        .send({ username: "alice", password: "password123" });

      expect(res.status).toBe(200);
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/old-group.png",
      );
    });
  });

  describe("Admin Avatar Endpoints", () => {
    function createAdminApp() {
      return createTestApp({
        isUserAdmin: () => true,
        adminRun: vi.fn(),
        adminSave: vi.fn(),
      });
    }

    test("POST /api/admin/users/:id/avatar accepts presigned avatarUrl", async () => {
      const appObj = createAdminApp();
      const res = await request(appObj.app)
        .post(`/api/admin/users/${ALICE_ID}/avatar`)
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          avatarUrl: "/api/uploads/avatars/avatar-admin-user.png",
        });

      expect(res.status).toBe(200);
      expect(res.body.avatarUrl).toBe(
        "/api/uploads/avatars/avatar-admin-user.png",
      );
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/old-avatar.png",
      );
    });

    test("POST /api/admin/chats/:id/avatar accepts presigned avatarUrl", async () => {
      const appObj = createAdminApp();
      const res = await request(appObj.app)
        .post(`/api/admin/chats/${CHAT_ID}/avatar`)
        .set("Cookie", [`sid=${sessionToken}`])
        .send({
          avatarUrl: "/api/uploads/avatars/avatar-admin-chat.png",
        });

      expect(res.status).toBe(200);
      expect(res.body.avatarUrl).toBe(
        "/api/uploads/avatars/avatar-admin-chat.png",
      );
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/old-group.png",
      );
    });

    test("DELETE /api/admin/chats/:id cleans up group avatar", async () => {
      const appObj = createAdminApp();
      const res = await request(appObj.app)
        .delete(`/api/admin/chats/${CHAT_ID}`)
        .set("Cookie", [`sid=${sessionToken}`]);

      expect(res.status).toBe(200);
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/old-group.png",
      );
    });

    test("DELETE /api/admin/users/:id cleans up user avatar", async () => {
      const appObj = createAdminApp();
      const res = await request(appObj.app)
        .delete(`/api/admin/users/${BOB_ID}`)
        .set("Cookie", [`sid=${sessionToken}`]);

      expect(res.status).toBe(200);
      expect(removeAvatarByUrlMock).toHaveBeenCalledWith(
        "/api/uploads/avatars/bob-avatar.png",
      );
    });
  });
});

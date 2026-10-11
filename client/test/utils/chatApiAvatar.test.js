import { describe, test, expect, afterEach, vi } from "vitest";
import {
  presignAvatarUpload,
  uploadAvatarFile,
  uploadAvatar,
  uploadGroupAvatar,
} from "../../src/api/chatApi.js";

describe("Avatar S3 Client Helpers", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("presignAvatarUpload", () => {
    test("calls /api/uploads/presign with uploadType: 'avatar'", async () => {
      const file = new File(["dummy-avatar-bytes"], "my-pic.png", {
        type: "image/png",
      });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          type: "s3",
          uploadUrl: "https://s3.example.com/avatars/avatar-123.png?sig=abc",
          storageKey: "avatars/avatar-123.png",
          avatarUrl: "/api/uploads/avatars/avatar-123.png",
        }),
      });
      globalThis.fetch = fetchMock;

      const res = await presignAvatarUpload(file);

      expect(fetchMock).toHaveBeenCalledWith("/api/uploads/presign", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadType: "avatar",
          filename: "my-pic.png",
          contentType: "image/png",
          fileSize: file.size,
        }),
      });
      expect(res.avatarUrl).toBe("/api/uploads/avatars/avatar-123.png");
      expect(res.type).toBe("s3");
    });
  });

  describe("uploadAvatarFile", () => {
    test("uploads directly to S3 presigned URL when type is s3", async () => {
      const file = new File(["bytes"], "pic.jpg", { type: "image/jpeg" });
      const fetchMock = vi.fn().mockImplementation(async (url) => {
        if (url === "/api/uploads/presign") {
          return {
            ok: true,
            json: async () => ({
              success: true,
              type: "s3",
              uploadUrl: "https://s3.example.com/avatars/avatar-s3.jpg?sig=xyz",
              storageKey: "avatars/avatar-s3.jpg",
              avatarUrl: "/api/uploads/avatars/avatar-s3.jpg",
            }),
          };
        }
        if (url.startsWith("https://s3.example.com/")) {
          return {
            ok: true,
            status: 200,
          };
        }
        return { ok: false, status: 404 };
      });
      globalThis.fetch = fetchMock;

      const result = await uploadAvatarFile(file);

      expect(result.directS3).toBe(true);
      expect(result.avatarUrl).toBe("/api/uploads/avatars/avatar-s3.jpg");
    });

    test("returns directS3: false when presign returns type: local", async () => {
      const file = new File(["bytes"], "pic.jpg", { type: "image/jpeg" });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          type: "local",
        }),
      });
      globalThis.fetch = fetchMock;

      const result = await uploadAvatarFile(file);

      expect(result.directS3).toBe(false);
    });

    test("returns directS3: false when presign request fails", async () => {
      const file = new File(["bytes"], "pic.jpg", { type: "image/jpeg" });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Failed" }),
      });
      globalThis.fetch = fetchMock;

      const result = await uploadAvatarFile(file);

      expect(result.directS3).toBe(false);
    });
  });

  describe("uploadAvatar & uploadGroupAvatar dual payload support", () => {
    test("sends JSON when payload is an object", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      globalThis.fetch = fetchMock;

      await uploadAvatar({
        currentUsername: "alice",
        avatarUrl: "/api/uploads/avatars/avatar-1.png",
      });

      expect(fetchMock).toHaveBeenCalledWith("/api/profile/avatar", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentUsername: "alice",
          avatarUrl: "/api/uploads/avatars/avatar-1.png",
        }),
      });

      await uploadGroupAvatar("c1", {
        username: "alice",
        avatarUrl: "/api/uploads/avatars/avatar-2.png",
      });

      expect(fetchMock).toHaveBeenCalledWith("/api/chats/group/c1/avatar", {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "alice",
          avatarUrl: "/api/uploads/avatars/avatar-2.png",
        }),
      });
    });
  });
});

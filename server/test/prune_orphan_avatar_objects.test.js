import { describe, test, expect, vi, beforeEach } from "vitest";
import { createMessageFileJobs } from "../lib/messageFileJobs.js";

describe("Prune Orphan Avatar Objects in S3", () => {
  let deletedKeys;
  let mockRemoteProvider;

  beforeEach(() => {
    deletedKeys = [];
    mockRemoteProvider = {
      type: "s3",
      deleteFile: vi.fn().mockImplementation(async (key) => {
        deletedKeys.push(key);
        return true;
      }),
      listObjects: vi.fn(),
    };
  });

  describe("pruneOrphanRemoteObjects with avatars in pending_presigned_uploads", () => {
    test("keeps claimed avatars in users/chats and deletes orphan avatars", async () => {
      const orphanAvatarKey = "uploads/avatars/avatar-orphan-123.png";
      const claimedUserAvatarKey = "uploads/avatars/avatar-user-456.png";
      const claimedGroupAvatarKey = "uploads/avatars/avatar-group-789.png";

      const pendingRows = [
        {
          storage_key: orphanAvatarKey,
          created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        },
        {
          storage_key: claimedUserAvatarKey,
          created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        },
        {
          storage_key: claimedGroupAvatarKey,
          created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        },
      ];

      const jobs = createMessageFileJobs({
        adminGetAll: (query) => {
          const sql = String(query?.toSQL ? query.toSQL().sql : query);
          if (sql.includes("pending_presigned_uploads")) {
            return pendingRows;
          }
          if (sql.includes("chat_message_files")) {
            return [];
          }
          if (sql.includes("users")) {
            return [{ avatar_url: `/api/uploads/${claimedUserAvatarKey}` }];
          }
          if (sql.includes("chats")) {
            return [
              { group_avatar_url: `/api/uploads/${claimedGroupAvatarKey}` },
            ];
          }
          return [];
        },
        adminRun: vi.fn(),
        adminGetRow: () => null,
        adminSave: () => {},
        listMessageFilesByMessageIds: () => [],
        removeStoredFileNames: () => {},
        uploadRootDir: "/tmp/test",
        fs: {},
        path: {
          join: (...p) => p.join("/"),
          basename: (p) => p.split("/").pop(),
        },
        getSetting: () => null,
        storageProvider: mockRemoteProvider,
      });

      const result = await jobs.pruneOrphanRemoteObjects({
        maxAgeMs: 3600 * 1000,
      });

      expect(result.prunedCount).toBe(1);
      expect(result.prunedKeys).toEqual([orphanAvatarKey]);
      expect(deletedKeys).toEqual([orphanAvatarKey]);
    });
  });

  describe("pruneOrphanAvatarObjects (S3 bucket sweeper)", () => {
    test("sweeps uploads/avatars/ prefix in S3, deleting unreferenced files older than cutoff", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);

      mockRemoteProvider.listObjects.mockImplementation(async (prefix) => {
        if (String(prefix || "") === "avatars/") return [];
        return [
          {
            key: "uploads/avatars/active-user.png",
            lastModified: twoHoursAgo,
            size: 1000,
          },
          {
            key: "uploads/avatars/active-group.png",
            lastModified: twoHoursAgo,
            size: 2000,
          },
          {
            key: "uploads/avatars/orphan-old.png",
            lastModified: twoHoursAgo,
            size: 3000,
        },
        {
          key: "uploads/avatars/recent-in-flight.png",
          lastModified: fiveMinsAgo,
          size: 4000,
        },
        ];
        });

      const jobs = createMessageFileJobs({
        adminGetAll: (query) => {
          const sql = String(query?.toSQL ? query.toSQL().sql : query);
          if (sql.includes("users")) {
            return [{ avatar_url: "/api/uploads/avatars/active-user.png" }];
          }
          if (sql.includes("chats")) {
            return [
              { group_avatar_url: "/api/uploads/avatars/active-group.png" },
            ];
          }
          return [];
        },
        adminRun: vi.fn(),
        adminGetRow: () => null,
        adminSave: () => {},
        listMessageFilesByMessageIds: () => [],
        removeStoredFileNames: () => {},
        uploadRootDir: "/tmp/test",
        fs: {},
        path: {
          join: (...p) => p.join("/"),
          basename: (p) => p.split("/").pop(),
        },
        getSetting: () => null,
        storageProvider: mockRemoteProvider,
      });

      const result = await jobs.pruneOrphanAvatarObjects({
        maxAgeMs: 3600 * 1000,
      });

      expect(result.prunedCount).toBe(1);
      expect(result.prunedKeys).toEqual(["uploads/avatars/orphan-old.png"]);
      expect(deletedKeys).toEqual(["uploads/avatars/orphan-old.png"]);
    });
  });
});

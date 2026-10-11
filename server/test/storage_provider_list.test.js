import { describe, it, expect, vi } from "vitest";
import { RemoteStorageProvider } from "../lib/storage/RemoteStorageProvider.js";
import { LocalStorageProvider } from "../lib/storage/LocalStorageProvider.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("StorageProvider listObjects", () => {
  describe("RemoteStorageProvider.listObjects", () => {
    it("lists S3 objects with prefix and handles pagination", async () => {
      const mockClient = {
        send: vi
          .fn()
          .mockResolvedValueOnce({
            IsTruncated: true,
            NextContinuationToken: "token-1",
            Contents: [
              {
                Key: "avatars/avatar-1.png",
                LastModified: new Date("2026-09-01"),
                Size: 1000,
              },
              {
                Key: "avatars/avatar-2.png",
                LastModified: new Date("2026-09-02"),
                Size: 2000,
              },
            ],
          })
          .mockResolvedValueOnce({
            IsTruncated: false,
            Contents: [
              {
                Key: "avatars/avatar-3.png",
                LastModified: new Date("2026-09-03"),
                Size: 3000,
              },
            ],
          }),
      };

      const provider = new RemoteStorageProvider({
        bucket: "my-bucket",
        s3Client: mockClient,
      });

      const items = await provider.listObjects("avatars/");

      expect(mockClient.send).toHaveBeenCalledTimes(2);
      expect(items).toEqual([
        {
          key: "avatars/avatar-1.png",
          lastModified: new Date("2026-09-01"),
          size: 1000,
        },
        {
          key: "avatars/avatar-2.png",
          lastModified: new Date("2026-09-02"),
          size: 2000,
        },
        {
          key: "avatars/avatar-3.png",
          lastModified: new Date("2026-09-03"),
          size: 3000,
        },
      ]);
    });
  });

  describe("LocalStorageProvider.listObjects", () => {
    it("lists files in local uploadDir matching prefix", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-local-list-"));
      const avatarDir = path.join(tmpDir, "avatars");
      fs.mkdirSync(avatarDir, { recursive: true });
      fs.writeFileSync(path.join(avatarDir, "avatar-1.png"), "data1");
      fs.writeFileSync(path.join(avatarDir, "avatar-2.png"), "data2");

      const provider = new LocalStorageProvider({ uploadDir: tmpDir });
      const items = await provider.listObjects("avatars");

      expect(items.length).toBe(2);
      expect(items.map((i) => i.key).sort()).toEqual([
        "avatars/avatar-1.png",
        "avatars/avatar-2.png",
      ]);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});

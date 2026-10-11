import { describe, test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "../../lib/storage/LocalStorageProvider.js";
import { RemoteStorageProvider } from "../../lib/storage/RemoteStorageProvider.js";

describe("storage provider checkHealth (admin Services probe)", () => {
  test("local: writable upload dir is healthy", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "songbird-storage-"));
    try {
      const provider = new LocalStorageProvider({ uploadDir: dir });
      await expect(provider.checkHealth()).resolves.toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("local: missing upload dir is unhealthy, never throws", async () => {
    const provider = new LocalStorageProvider({
      uploadDir: path.join(os.tmpdir(), "songbird-does-not-exist-xyz"),
    });
    await expect(provider.checkHealth()).resolves.toBe(false);
  });

  test("remote: answering bucket is healthy even on 404 (authenticated miss)", async () => {
    const provider = new RemoteStorageProvider({
      bucket: "songbird",
      s3Client: {
        // HeadObject 404 → exists() resolves false → bucket still answered.
        send: async () => {
          const err = new Error("Not Found");
          err.name = "NotFound";
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        },
      },
    });
    await expect(provider.checkHealth()).resolves.toBe(true);
  });

  test("remote: present key is healthy", async () => {
    const provider = new RemoteStorageProvider({
      bucket: "songbird",
      s3Client: { send: async () => ({}) },
    });
    await expect(provider.checkHealth()).resolves.toBe(true);
  });

  test("remote: auth/network failure rejects (unreachable)", async () => {
    const provider = new RemoteStorageProvider({
      bucket: "songbird",
      s3Client: {
        send: async () => {
          const err = new Error("Forbidden");
          err.name = "Forbidden";
          err.$metadata = { httpStatusCode: 403 };
          throw err;
        },
      },
    });
    await expect(provider.checkHealth()).rejects.toThrow("Forbidden");
  });
});

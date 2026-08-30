import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStorage, resolveDataDir } from "../storage.js";

describe("worker storage", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-storage-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("resolveDataDir", () => {
    it("resolves custom data dir path correctly", () => {
      const resolved = resolveDataDir(tmpDir);
      expect(resolved).toBe(path.resolve(tmpDir));
    });
  });

  describe("LocalStorageProvider", () => {
    it("handles local file upload, downloadToPath, and deleteFile lifecycle", async () => {
      const storage = createStorage({
        driver: "local",
        dataDir: tmpDir,
      });

      expect(storage.type).toBe("local");

      // 1. Create a source file
      const sourceFile = path.join(tmpDir, "source.txt");
      fs.writeFileSync(sourceFile, "media-payload-12345");

      // 2. Upload file
      const storageKey = "uploads/2026/08/sample.txt";
      await storage.uploadFile(storageKey, sourceFile, "text/plain");

      const uploadedPath = path.join(tmpDir, "uploads", storageKey);
      expect(fs.existsSync(uploadedPath)).toBe(true);
      expect(fs.readFileSync(uploadedPath, "utf8")).toBe("media-payload-12345");

      // 3. Download to path
      const destFile = path.join(tmpDir, "downloaded.txt");
      await storage.downloadToPath(storageKey, destFile);
      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, "utf8")).toBe("media-payload-12345");

      // 4. Delete file
      await storage.deleteFile(storageKey);
      expect(fs.existsSync(uploadedPath)).toBe(false);
    });
  });

  describe("S3StorageProvider initialization", () => {
    it("instantiates remote S3 storage provider when driver is s3", () => {
      const storage = createStorage({
        driver: "s3",
        bucket: "my-test-bucket",
        endpoint: "https://s3.us-west-2.amazonaws.com",
        region: "us-west-2",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      });

      expect(storage.type).toBe("remote");
    });
  });
});

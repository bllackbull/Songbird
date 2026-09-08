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
    it("handles local file upload, downloadToPath, and deleteFile lifecycle in uploads/messages", async () => {
      const storage = createStorage({
        driver: "local",
        dataDir: tmpDir,
      });

      expect(storage.type).toBe("local");
      expect(storage.uploadDir).toBe(path.join(tmpDir, "uploads", "messages"));

      // 1. Create a source file
      const sourceFile = path.join(tmpDir, "source.txt");
      fs.writeFileSync(sourceFile, "media-payload-12345");

      // 2. Upload file
      const storageKey = "sample.txt";
      await storage.uploadFile(storageKey, sourceFile, "text/plain");

      const uploadedPath = path.join(tmpDir, "uploads", "messages", storageKey);
      expect(fs.existsSync(uploadedPath)).toBe(true);
      expect(fs.readFileSync(uploadedPath, "utf8")).toBe("media-payload-12345");

      // 3. Download to path
      const destFile = path.join(tmpDir, "downloaded.txt");
      await storage.downloadToPath(storageKey, destFile);
      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, "utf8")).toBe("media-payload-12345");

      // 4. Exists check
      expect(await storage.exists(storageKey)).toBe(true);

      // 5. Delete file
      await storage.deleteFile(storageKey);
      expect(fs.existsSync(uploadedPath)).toBe(false);
      expect(await storage.exists(storageKey)).toBe(false);
    });

    it("finds files located in uploads/messages when searching locally with plain filename or prefixed key", async () => {
      const storage = createStorage({
        driver: "local",
        dataDir: tmpDir,
      });

      const messagesDir = path.join(tmpDir, "uploads", "messages");
      fs.mkdirSync(messagesDir, { recursive: true });
      const videoFile = path.join(messagesDir, "1757000000000-clip.mp4");
      fs.writeFileSync(videoFile, "video-binary-content");

      // Searching by plain stored filename
      const dest1 = path.join(tmpDir, "out1.mp4");
      await storage.downloadToPath("1757000000000-clip.mp4", dest1);
      expect(fs.readFileSync(dest1, "utf8")).toBe("video-binary-content");

      // Searching by uploads/messages/ prefix
      const dest2 = path.join(tmpDir, "out2.mp4");
      await storage.downloadToPath("uploads/messages/1757000000000-clip.mp4", dest2);
      expect(fs.readFileSync(dest2, "utf8")).toBe("video-binary-content");

      // Searching by messages/ prefix
      const dest3 = path.join(tmpDir, "out3.mp4");
      await storage.downloadToPath("messages/1757000000000-clip.mp4", dest3);
      expect(fs.readFileSync(dest3, "utf8")).toBe("video-binary-content");
    });

    it("reports missing file path pointing to uploads/messages when file does not exist", async () => {
      const storage = createStorage({
        driver: "local",
        dataDir: tmpDir,
      });

      const dest = path.join(tmpDir, "missing.mp4");
      await expect(
        storage.downloadToPath("nonexistent.mp4", dest),
      ).rejects.toThrow(path.join(tmpDir, "uploads", "messages", "nonexistent.mp4"));
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

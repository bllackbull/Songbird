import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import multer from "multer";
import { createUploadTools } from "../lib/uploads.js";

describe("server/lib/uploads.js avatar storage enhancements", () => {
  let tmpDir;
  let avatarUploadRootDir;
  let mockRemoteProvider;
  let mockLocalProvider;
  let mockStorageEncryption;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-avatar-test-"));
    avatarUploadRootDir = path.join(tmpDir, "avatars");
    fs.mkdirSync(avatarUploadRootDir, { recursive: true });

    mockRemoteProvider = {
      type: "s3",
      uploadBuffer: vi.fn().mockResolvedValue({ key: "uploads/avatars/test.png" }),
      deleteFile: vi.fn().mockResolvedValue(true),
      getDownloadUrl: vi
        .fn()
        .mockResolvedValue("https://s3.example.com/uploads/avatars/test.png"),
    };

    mockLocalProvider = {
      type: "local",
      uploadBuffer: vi.fn(),
      deleteFile: vi.fn(),
      getDownloadUrl: vi.fn(),
    };

    mockStorageEncryption = {
      encryptFileInPlace: vi.fn().mockReturnValue(true),
      decryptBuffer: vi.fn((buf) => buf),
      decryptFileToBuffer: vi.fn(() => null),
      getDecryptedFileSize: vi.fn(() => 0),
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  describe("storeAvatarFile", () => {
    test("uploads to S3 and removes local temporary file when storageProvider is S3", async () => {
      const uploadTools = createUploadTools({
        fs,
        path,
        crypto,
        multer,
        adminGetRow: () => null,
        adminRun: () => null,
        adminSave: () => null,
        uploadRootDir: tmpDir,
        avatarUploadRootDir,
        fileUploadMaxSize: 10 * 1024 * 1024,
        fileUploadMaxFiles: 1,
        fileUploadMaxTotalSize: 10 * 1024 * 1024,
        storageEncryption: mockStorageEncryption,
        storageProvider: mockRemoteProvider,
      });

      const filePath = path.join(avatarUploadRootDir, "avatar-123.png");
      fs.writeFileSync(filePath, "sample-avatar-bytes");

      const file = {
        filename: "avatar-123.png",
        path: filePath,
        mimetype: "image/png",
        size: 19,
      };

      const result = await uploadTools.storeAvatarFile(file);

      expect(result.avatarUrl).toBe("/api/uploads/avatars/avatar-123.png");
      expect(result.storageDriver).toBe("s3");
      expect(result.storageKey).toBe("uploads/avatars/avatar-123.png");

      expect(mockRemoteProvider.uploadBuffer).toHaveBeenCalledWith(
        "uploads/avatars/avatar-123.png",
        expect.any(Buffer),
        "image/png",
      );
      // Local file should be removed
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test("encrypts in place and keeps local file when storageProvider is local", async () => {
      const uploadTools = createUploadTools({
        fs,
        path,
        crypto,
        multer,
        adminGetRow: () => null,
        adminRun: () => null,
        adminSave: () => null,
        uploadRootDir: tmpDir,
        avatarUploadRootDir,
        fileUploadMaxSize: 10 * 1024 * 1024,
        fileUploadMaxFiles: 1,
        fileUploadMaxTotalSize: 10 * 1024 * 1024,
        storageEncryption: mockStorageEncryption,
        storageProvider: mockLocalProvider,
      });

      const filePath = path.join(avatarUploadRootDir, "avatar-local.png");
      fs.writeFileSync(filePath, "sample-avatar-bytes");

      const file = {
        filename: "avatar-local.png",
        path: filePath,
        mimetype: "image/png",
        size: 19,
      };

      const result = await uploadTools.storeAvatarFile(file);

      expect(result.avatarUrl).toBe("/api/uploads/avatars/avatar-local.png");
      expect(result.storageDriver).toBe("local");
      expect(mockStorageEncryption.encryptFileInPlace).toHaveBeenCalledWith(
        filePath,
      );
      expect(mockRemoteProvider.uploadBuffer).not.toHaveBeenCalled();
      // Local file should still exist
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("ensureAvatarExists", () => {
    test("preserves avatar URL when file is missing locally but S3 storageProvider is configured", () => {
      const adminRun = vi.fn();
      const adminSave = vi.fn();

      const uploadTools = createUploadTools({
        fs,
        path,
        crypto,
        multer,
        adminGetRow: () => null,
        adminRun,
        adminSave,
        uploadRootDir: tmpDir,
        avatarUploadRootDir,
        fileUploadMaxSize: 10 * 1024 * 1024,
        fileUploadMaxFiles: 1,
        fileUploadMaxTotalSize: 10 * 1024 * 1024,
        storageEncryption: mockStorageEncryption,
        storageProvider: mockRemoteProvider,
      });

      // avatar-missing.png does not exist in avatarUploadRootDir
      const url = uploadTools.ensureAvatarExists(
        "user-1",
        "/api/uploads/avatars/avatar-missing.png",
      );
      expect(url).toBe("/api/uploads/avatars/avatar-missing.png");
      expect(adminRun).not.toHaveBeenCalled();
    });

    test("clears avatar in DB when file is missing locally and storageProvider is local", () => {
      const adminRun = vi.fn();
      const adminSave = vi.fn();

      const uploadTools = createUploadTools({
        fs,
        path,
        crypto,
        multer,
        adminGetRow: () => null,
        adminRun,
        adminSave,
        uploadRootDir: tmpDir,
        avatarUploadRootDir,
        fileUploadMaxSize: 10 * 1024 * 1024,
        fileUploadMaxFiles: 1,
        fileUploadMaxTotalSize: 10 * 1024 * 1024,
        storageEncryption: mockStorageEncryption,
        storageProvider: mockLocalProvider,
      });

      const url = uploadTools.ensureAvatarExists(
        "user-1",
        "/api/uploads/avatars/avatar-missing.png",
      );
      expect(url).toBeNull();
      expect(adminRun).toHaveBeenCalled();
    });
  });

  describe("removeAvatarByUrl", () => {
    test("deletes from both local disk and S3 when storageProvider is S3", () => {
      const uploadTools = createUploadTools({
        fs,
        path,
        crypto,
        multer,
        adminGetRow: () => null,
        adminRun: () => null,
        adminSave: () => null,
        uploadRootDir: tmpDir,
        avatarUploadRootDir,
        fileUploadMaxSize: 10 * 1024 * 1024,
        fileUploadMaxFiles: 1,
        fileUploadMaxTotalSize: 10 * 1024 * 1024,
        storageEncryption: mockStorageEncryption,
        storageProvider: mockRemoteProvider,
      });

      const filePath = path.join(avatarUploadRootDir, "avatar-del.png");
      fs.writeFileSync(filePath, "data");

      uploadTools.removeAvatarByUrl("/api/uploads/avatars/avatar-del.png");

      expect(fs.existsSync(filePath)).toBe(false);
      expect(mockRemoteProvider.deleteFile).toHaveBeenCalledWith(
        "uploads/avatars/avatar-del.png",
      );
    });

    test("deletes from S3 when avatarUrl is a full S3 or CDN URL", () => {
      const uploadTools = createUploadTools({
        fs,
        path,
        crypto,
        multer,
        adminGetRow: () => null,
        adminRun: () => null,
        adminSave: () => null,
        uploadRootDir: tmpDir,
        avatarUploadRootDir,
        fileUploadMaxSize: 10 * 1024 * 1024,
        fileUploadMaxFiles: 1,
        fileUploadMaxTotalSize: 10 * 1024 * 1024,
        storageEncryption: mockStorageEncryption,
        storageProvider: mockRemoteProvider,
      });

      uploadTools.removeAvatarByUrl(
        "https://my-bucket.s3.amazonaws.com/uploads/avatars/avatar-full-url.png?query=1",
      );

      expect(mockRemoteProvider.deleteFile).toHaveBeenCalledWith(
        "uploads/avatars/avatar-full-url.png",
      );
    });
  });
});

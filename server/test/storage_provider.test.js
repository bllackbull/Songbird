import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  StorageProvider,
  LocalStorageProvider,
  RemoteStorageProvider,
  createStorageProvider,
} from "../lib/storage/index.js";

describe("StorageProvider Base Class", () => {
  it("defines interface methods that throw not implemented errors", async () => {
    const provider = new StorageProvider();
    await expect(provider.getUploadUrl("file.txt")).rejects.toThrow();
    await expect(provider.getDownloadUrl("file.txt")).rejects.toThrow();
    await expect(provider.deleteFile("file.txt")).rejects.toThrow();
    await expect(provider.exists("file.txt")).rejects.toThrow();
  });
});

describe("LocalStorageProvider", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns local upload URL object", async () => {
    const provider = new LocalStorageProvider({ uploadDir: tmpDir });
    const res = await provider.getUploadUrl({ filename: "test.txt" });
    expect(res).toEqual({ type: "local", uploadUrl: "/api/uploads" });
  });

  it("returns download URL for fileKey", async () => {
    const provider = new LocalStorageProvider({ uploadDir: tmpDir });
    const url = await provider.getDownloadUrl("abc123_test.txt");
    expect(url).toBe("/api/uploads/file/abc123_test.txt");
  });

  it("checks file existence correctly", async () => {
    const provider = new LocalStorageProvider({ uploadDir: tmpDir });
    const filePath = path.join(tmpDir, "test.txt");

    expect(await provider.exists("test.txt")).toBe(false);

    await fs.promises.writeFile(filePath, "hello world");
    expect(await provider.exists("test.txt")).toBe(true);
  });

  it("deletes file from disk asynchronously", async () => {
    const provider = new LocalStorageProvider({ uploadDir: tmpDir });
    const filePath = path.join(tmpDir, "test.txt");
    await fs.promises.writeFile(filePath, "hello world");

    expect(await provider.exists("test.txt")).toBe(true);
    await provider.deleteFile("test.txt");
    expect(await provider.exists("test.txt")).toBe(false);
  });

  it("handles deleteFile when file does not exist gracefully", async () => {
    const provider = new LocalStorageProvider({ uploadDir: tmpDir });
    await expect(provider.deleteFile("nonexistent.txt")).resolves.not.toThrow();
  });
});

describe("RemoteStorageProvider", () => {
  const s3Config = {
    STORAGE_BUCKET: "my-bucket",
    STORAGE_REGION: "us-east-1",
    STORAGE_ACCESS_KEY_ID: "key-id",
    STORAGE_SECRET_ACCESS_KEY: "secret-key",
    STORAGE_ENDPOINT: "https://s3.example.com",
  };

  it("initializes RemoteStorageProvider instance", () => {
    const provider = new RemoteStorageProvider(s3Config);
    expect(provider).toBeInstanceOf(StorageProvider);
    expect(provider.bucket).toBe("my-bucket");
    expect(provider.region).toBe("us-east-1");
    expect(provider.endpoint).toBe("https://s3.example.com");
  });

  it("generates presigned upload URL using PutObjectCommand", async () => {
    const provider = new RemoteStorageProvider(s3Config);
    const res = await provider.getUploadUrl({
      key: "uploads/file.png",
      contentType: "image/png",
    });
    expect(res.type).toBe("remote");
    expect(res.uploadUrl).toBeTypeOf("string");
    expect(res.uploadUrl).toContain("my-bucket");
  });

  it("generates download URL via presigned GET or publicUrl", async () => {
    const provider = new RemoteStorageProvider(s3Config);
    const url = await provider.getDownloadUrl("uploads/file.png");
    expect(url).toBeTypeOf("string");
    expect(url).toContain("my-bucket");

    const cdnProvider = new RemoteStorageProvider({
      ...s3Config,
      publicUrl: "https://cdn.example.com",
    });
    const cdnUrl = await cdnProvider.getDownloadUrl("uploads/file.png");
    expect(cdnUrl).toBe("https://cdn.example.com/uploads/file.png");
  });

  it("deletes file using DeleteObjectCommand", async () => {
    const provider = new RemoteStorageProvider(s3Config);
    const sendSpy = vi.spyOn(provider.client, "send").mockResolvedValue({});
    await provider.deleteFile("uploads/file.png");
    expect(sendSpy).toHaveBeenCalled();
  });

  it("checks file existence using HeadObjectCommand", async () => {
    const provider = new RemoteStorageProvider(s3Config);

    vi.spyOn(provider.client, "send").mockResolvedValueOnce({});
    expect(await provider.exists("uploads/file.png")).toBe(true);

    const notFoundError = new Error("NotFound");
    notFoundError.name = "NotFound";
    vi.spyOn(provider.client, "send").mockRejectedValueOnce(notFoundError);
    expect(await provider.exists("uploads/file.png")).toBe(false);
  });
});

describe("createStorageProvider", () => {
  it("creates LocalStorageProvider by default or when driver is 'local'", () => {
    const providerDefault = createStorageProvider({});
    expect(providerDefault).toBeInstanceOf(LocalStorageProvider);

    const providerLocal = createStorageProvider({ STORAGE_DRIVER: "local" });
    expect(providerLocal).toBeInstanceOf(LocalStorageProvider);
  });

  it("creates RemoteStorageProvider when STORAGE_DRIVER is 'remote'", () => {
    const providerS3 = createStorageProvider({
      STORAGE_DRIVER: "remote",
      STORAGE_BUCKET: "test-bucket",
    });
    expect(providerS3).toBeInstanceOf(RemoteStorageProvider);
  });

  it("throws error for unknown STORAGE_DRIVER", () => {
    expect(() => createStorageProvider({ STORAGE_DRIVER: "unknown" })).toThrow(
      /Unsupported storage driver/,
    );
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  encryptBuffer,
  isEncryptedFileBuffer,
  decryptFileToTempPath,
} from "../encryption.js";

describe("worker encryption", () => {
  const originalEnvKey = process.env.STORAGE_ENCRYPTION_KEY;
  let tmpDir;

  beforeEach(() => {
    process.env.STORAGE_ENCRYPTION_KEY = "test-secret-key-32-chars-long-abc";
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-enc-test-"));
  });

  afterEach(() => {
    process.env.STORAGE_ENCRYPTION_KEY = originalEnvKey;
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("encrypts and detects magic header in encrypted buffer", () => {
    const rawData = Buffer.from("Hello Songbird secure media content!");
    const encrypted = encryptBuffer(rawData);

    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted.length).toBeGreaterThan(rawData.length);
    expect(isEncryptedFileBuffer(encrypted)).toBe(true);
    expect(isEncryptedFileBuffer(rawData)).toBe(false);
  });

  it("decrypts an encrypted file to a temporary file path with proper cleanup", () => {
    const rawData = Buffer.from("Secret video stream bytes");
    const encrypted = encryptBuffer(rawData);

    const testFilePath = path.join(tmpDir, "video.mp4");
    fs.writeFileSync(testFilePath, encrypted);

    const { path: decryptedPath, cleanup } = decryptFileToTempPath(
      testFilePath,
      "video.mp4",
    );
    expect(fs.existsSync(decryptedPath)).toBe(true);

    const decryptedData = fs.readFileSync(decryptedPath);
    expect(decryptedData.toString("utf8")).toBe("Secret video stream bytes");

    cleanup();
    expect(fs.existsSync(decryptedPath)).toBe(false);
  });

  it("returns original path unchanged when file is not encrypted", () => {
    const plainFilePath = path.join(tmpDir, "plain.txt");
    fs.writeFileSync(plainFilePath, "Plain unencrypted text");

    const { path: resultPath, cleanup } = decryptFileToTempPath(plainFilePath);
    expect(resultPath).toBe(plainFilePath);
    cleanup();
    expect(fs.existsSync(plainFilePath)).toBe(true);
  });
});

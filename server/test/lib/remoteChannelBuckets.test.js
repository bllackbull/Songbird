import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createRemoteChannelManager } from "../../lib/remoteChannels.js";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-bucket-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeManager({ storageProvider } = {}) {
  return createRemoteChannelManager({
    config: {
      enabled: true,
      fileUploadEnabled: true,
      uploadRootDir: tmpDir,
      avatarUploadRootDir: tmpDir,
      messageFileLimits: {
        maxFiles: 10,
        maxFileSizeBytes: 25 * 1024 * 1024,
        maxTotalBytes: 75 * 1024 * 1024,
      },
    },
    fs,
    path,
    crypto,
    storageProvider: storageProvider ?? { type: "local" },
    // Local "encryption": append a marker so tests can prove the bucket
    // receives decrypted bytes (mirrors decryptBuffer-before-upload).
    storageEncryption: {
      encryptFileInPlace: (filePath) => {
        fs.appendFileSync(filePath, "-ENC");
      },
      decryptBuffer: (buf) => {
        const s = Buffer.from(buf);
        const marker = Buffer.from("-ENC");
        return s.subarray(s.length - marker.length).equals(marker)
          ? s.subarray(0, s.length - marker.length)
          : s;
      },
    },
    getUploadKind: () => "image",
    isDangerousUploadFile: () => false,
    hasEnoughFreeDiskSpace: () => true,
    sanitizePositiveInt: (n) => n,
    sanitizeDurationSeconds: (n) => n,
    debugLog: () => {},
  });
}

const photoMessage = (id = 5) => ({
  id,
  media: { photo: { sizes: [{ w: 100, h: 100 }] } },
});

describe("remote channel bucket storage", () => {
  test("mirrored Telegram media is uploaded to the bucket on remote driver", async () => {
    const uploaded = [];
    const manager = makeManager({
      storageProvider: {
        type: "remote",
        uploadBuffer: async (key, buf, mime) => {
          uploaded.push({ key, buf: Buffer.from(buf), mime });
        },
      },
    });
    const fakeClient = {
      downloadMedia: async () => Buffer.from("fake-image-bytes"),
    };

    const result = await manager.downloadTelegramMediaFile(
      fakeClient,
      photoMessage(),
      0,
      { count: 0, totalBytes: 0, names: new Set() },
    );

    expect(result?.file).toBeTruthy();
    // Uploaded under the unified layout with decrypted bytes.
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].key).toBe(`uploads/messages/${result.file.storedName}`);
    expect(uploaded[0].buf.toString()).toBe("fake-image-bytes");
    // DB record points at the bucket, not local disk.
    expect(result.file.storageKey).toBe(uploaded[0].key);
    expect(result.file.storageDriver).toBe("remote");
    // Local temp copy is cleaned up.
    expect(result.filePath).toBeNull();
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });

  test("local driver keeps existing on-disk behavior", async () => {
    const manager = makeManager();
    const fakeClient = {
      downloadMedia: async () => Buffer.from("fake-image-bytes"),
    };
    const result = await manager.downloadTelegramMediaFile(
      fakeClient,
      photoMessage(),
      0,
      { count: 0, totalBytes: 0, names: new Set() },
    );
    expect(result?.file).toBeTruthy();
    expect(result.file.storageKey).toBeNull();
    expect(result.filePath).toContain(tmpDir);
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  test("bucket upload failure falls back to the local file", async () => {
    const manager = makeManager({
      storageProvider: {
        type: "remote",
        uploadBuffer: async () => {
          throw new Error("bucket down");
        },
      },
    });
    const fakeClient = {
      downloadMedia: async () => Buffer.from("fake-image-bytes"),
    };
    const result = await manager.downloadTelegramMediaFile(
      fakeClient,
      photoMessage(),
      0,
      { count: 0, totalBytes: 0, names: new Set() },
    );
    expect(result?.file).toBeTruthy();
    expect(result.file.storageKey).toBeNull();
    expect(result.filePath).toContain(tmpDir);
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  test("source avatars are uploaded to the bucket on remote driver", async () => {
    const uploaded = [];
    const manager = makeManager({
      storageProvider: {
        type: "remote",
        uploadBuffer: async (key, buf, mime) => {
          uploaded.push({ key, buf: Buffer.from(buf), mime });
        },
      },
    });
    const fakeClient = {
      downloadProfilePhoto: async () => Buffer.from("fake-avatar-bytes"),
    };
    const url = await manager.cacheSourceAvatar(fakeClient, { id: 7 }, {});
    expect(url).toMatch(/^\/api\/uploads\/avatars\//);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].key).toBe(`uploads/avatars/${url.split("/").pop()}`);
    expect(uploaded[0].buf.toString()).toBe("fake-avatar-bytes");
    expect(fs.readdirSync(tmpDir)).toHaveLength(0);
  });
});

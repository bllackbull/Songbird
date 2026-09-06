import { afterEach, describe, expect, test } from "vitest";
import {
  createStorageEncryption,
  ensureStorageEncryptionKey,
  markEncryptedFileRecord,
} from "../../lib/storageEncryption.js";

const TEXT_PREFIX = "sb-enc-v1:";
const originalStorageKey = process.env.STORAGE_ENCRYPTION_KEY;

function createEncryption() {
  process.env.STORAGE_ENCRYPTION_KEY = "test-storage-encryption-key";
  return createStorageEncryption();
}

afterEach(() => {
  if (originalStorageKey === undefined) {
    delete process.env.STORAGE_ENCRYPTION_KEY;
  } else {
    process.env.STORAGE_ENCRYPTION_KEY = originalStorageKey;
  }
});

describe("storage text encryption", () => {
  test("encrypts user content that imitates the ciphertext marker", () => {
    const encryption = createEncryption();
    const input = "sb-enc-v1:not-real-ciphertext";

    const encrypted = encryption.encryptText(input);

    expect(encrypted).toMatch(/^sb-enc-v1:/);
    expect(encrypted).not.toBe(input);
    expect(encryption.decryptText(encrypted)).toBe(input);
  });

  test("encrypts user content that imitates a system message", () => {
    const encryption = createEncryption();
    const input = "[[system:joined:alice]]";

    const encrypted = encryption.encryptText(input);

    expect(encrypted).toMatch(/^sb-enc-v1:/);
    expect(encrypted).not.toBe(input);
    expect(encryption.decryptText(encrypted)).toBe(input);
  });

  test("allows only an explicit trusted call to retain a system marker", () => {
    const encryption = createEncryption();
    const systemMessage = "[[system:left:alice]]";

    expect(
      encryption.encryptText(systemMessage, {
        allowPlaintextSystemMessage: true,
      }),
    ).toBe(systemMessage);
  });

  test("rejects ciphertext with a truncated GCM authentication tag", () => {
    const encryption = createEncryption();
    const encrypted = encryption.encryptText("authenticated message");
    const [ivPart, tagPart, cipherPart] = encrypted
      .slice(TEXT_PREFIX.length)
      .split(".");
    const shortenedTag = Buffer.from(tagPart, "base64url")
      .subarray(0, 12)
      .toString("base64url");
    const malformed = `${TEXT_PREFIX}${ivPart}.${shortenedTag}.${cipherPart}`;

    expect(encryption.decryptText(malformed)).toBe(malformed);
  });

  test("decrypts file byte ranges correctly for media streaming", () => {
    const encryption = createEncryption();
    const fullContent = Buffer.from("Hello Songbird encrypted media streaming world!");
    const encryptedBuffer = encryption.encryptBuffer(fullContent);

    // Mock filesystem methods to test in-memory
    const decryptedRange = encryption.decryptBuffer(encryptedBuffer).subarray(6, 14);
    expect(decryptedRange.toString()).toBe("Songbird");
  });

  test("ensureStorageEncryptionKey returns existing env key or generates a new one", () => {
    delete process.env.STORAGE_ENCRYPTION_KEY;
    let writtenContent = "";
    const mockFs = {
      existsSync: () => true,
      readFileSync: () => "EXISTING=1",
      writeFileSync: (p, c) => {
        writtenContent = c;
      },
    };

    const key = ensureStorageEncryptionKey({
      projectRootDir: "/tmp",
      fsImpl: mockFs,
    });

    expect(key).toBeTruthy();
    expect(process.env.STORAGE_ENCRYPTION_KEY).toBe(key);
    expect(writtenContent).toContain(`STORAGE_ENCRYPTION_KEY=${key}`);
  });
});

describe("markEncryptedFileRecord", () => {
  test("marks the record local when the disk sniff reports ciphertext", () => {
    const fileObj = {};
    const marked = markEncryptedFileRecord(
      { isEncryptedFilePath: (p) => p === "/uploads/clip.mov" },
      "/uploads/clip.mov",
      fileObj,
    );

    expect(marked).toBe(true);
    expect(fileObj.encryptionType).toBe("local");
    expect(fileObj.encryption_type).toBe("local");
  });

  test("detects real ciphertext end to end with real fs + key", async () => {
    const { default: fs } = await import("node:fs");
    const { default: os } = await import("node:os");
    const { default: path } = await import("node:path");
    const encryption = createEncryption();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-mark-enc-"));
    try {
      const filePath = path.join(dir, "clip.mov");
      fs.writeFileSync(filePath, encryption.encryptBuffer(Buffer.from("data")));
      const fileObj = {};
      expect(markEncryptedFileRecord(encryption, filePath, fileObj)).toBe(true);
      expect(fileObj.encryption_type).toBe("local");

      const plainPath = path.join(dir, "plain.mov");
      fs.writeFileSync(plainPath, Buffer.from("plain"));
      const plainObj = {};
      expect(markEncryptedFileRecord(encryption, plainPath, plainObj)).toBe(false);
      expect(plainObj.encryption_type).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("leaves the record untouched when the bytes on disk are plaintext", () => {
    const fileObj = { kind: "media" };
    const marked = markEncryptedFileRecord(
      { isEncryptedFilePath: () => false },
      "/uploads/clip.mov",
      fileObj,
    );

    expect(marked).toBe(false);
    expect(fileObj.encryptionType).toBeUndefined();
    expect(fileObj.encryption_type).toBeUndefined();
  });

  test("falls back to key presence when disk sniffing is unavailable", () => {
    const withKey = markEncryptedFileRecord(
      { hasKey: () => true },
      "/uploads/clip.mov",
      {},
    );
    expect(withKey).toBe(true);

    const withoutKey = markEncryptedFileRecord(
      { hasKey: () => false },
      "/uploads/clip.mov",
      {},
    );
    expect(withoutKey).toBe(false);
  });

  test("never throws on missing stubs, paths, or records", () => {
    expect(markEncryptedFileRecord(null, "/x.mov", {})).toBe(false);
    expect(markEncryptedFileRecord({}, "/x.mov", null)).toBe(false);
    expect(
      markEncryptedFileRecord(
        {
          isEncryptedFilePath: () => {
            throw new Error("fs boom");
          },
        },
        "/x.mov",
        {},
      ),
    ).toBe(false);
  });
});

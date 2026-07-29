import { afterEach, describe, expect, test } from "vitest";
import { createStorageEncryption } from "../../lib/storageEncryption.js";

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

  test("decrypts ciphertext with the expected 16-byte GCM authentication tag", () => {
    const encryption = createEncryption();
    const plaintext = "authenticated message";

    expect(encryption.decryptText(encryption.encryptText(plaintext))).toBe(
      plaintext,
    );
  });
});

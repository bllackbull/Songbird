import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeEnvSecret, updateEnvValue } from "./secrets.js";

const TEXT_PREFIX = "sb-enc-v1:";
const FILE_MAGIC = Buffer.from("SBENC1\0", "utf8");
const FILE_HEADER_LENGTH = FILE_MAGIC.length + 12 + 16;
const FILE_IV_OFFSET = FILE_MAGIC.length;
const FILE_TAG_OFFSET = FILE_IV_OFFSET + 12;
const FILE_DATA_OFFSET = FILE_HEADER_LENGTH;
const FILE_TEMP_DIR_NAME = "songbird-secure";

function ensureStorageEncryptionKey({
  projectRootDir,
  fsImpl = fs,
  pathImpl = path,
  cryptoImpl = crypto,
} = {}) {
  const existing = normalizeEnvSecret(process.env.STORAGE_ENCRYPTION_KEY);
  if (existing) return existing;

  const generated = cryptoImpl.randomBytes(32).toString("base64url");
  const envPath = pathImpl.join(String(projectRootDir || ""), ".env");
  try {
    updateEnvValue(envPath, "STORAGE_ENCRYPTION_KEY", generated, { fsImpl });
  } catch (error) {
    console.warn(
      "[storage-encryption] Unable to update .env with generated storage key:",
      String(error?.message || error),
    );
  }

  process.env.STORAGE_ENCRYPTION_KEY = generated;
  return generated;
}

function createStorageEncryption({
  cryptoImpl = crypto,
  fsImpl = fs,
  pathImpl = path,
} = {}) {
  const resolveKey = () => {
    const rawKey = normalizeEnvSecret(process.env.STORAGE_ENCRYPTION_KEY);
    return rawKey
      ? cryptoImpl.createHash("sha256").update(rawKey).digest()
      : null;
  };

  const isEnabled = () => Boolean(resolveKey());

  const isSystemMessageBody = (value = "") =>
    String(value || "").startsWith("[[system:");

  const isEncryptedText = (value = "") =>
    String(value || "").startsWith(TEXT_PREFIX);

  const encryptBuffer = (buffer) => {
    const key = resolveKey();
    if (!key) return Buffer.from(buffer);

    const plaintext = Buffer.isBuffer(buffer)
      ? buffer
      : Buffer.from(buffer || "");
    const iv = cryptoImpl.randomBytes(12);
    const cipher = cryptoImpl.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([FILE_MAGIC, iv, tag, ciphertext]);
  };

  const decryptBuffer = (buffer) => {
    const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
    const key = resolveKey();
    if (!key) return Buffer.from(source);
    if (!isEncryptedFileBuffer(source)) return Buffer.from(source);

    const iv = source.subarray(FILE_IV_OFFSET, FILE_TAG_OFFSET);
    const tag = source.subarray(FILE_TAG_OFFSET, FILE_DATA_OFFSET);
    const ciphertext = source.subarray(FILE_DATA_OFFSET);
    const decipher = cryptoImpl.createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: 16,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  };

  const encryptText = (
    value = "",
    { allowPlaintextSystemMessage = false } = {},
  ) => {
    const input = String(value || "");
    const key = resolveKey();
    if (
      !key ||
      !input ||
      (allowPlaintextSystemMessage && isSystemMessageBody(input))
    ) {
      return input;
    }

    const iv = cryptoImpl.randomBytes(12);
    const cipher = cryptoImpl.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(input, "utf8")),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${TEXT_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
  };

  const decryptText = (value = "") => {
    const input = String(value || "");
    const key = resolveKey();
    if (!key || !isEncryptedText(input)) return input;

    const payload = input.slice(TEXT_PREFIX.length);
    const [ivPart, tagPart, cipherPart] = payload.split(".");
    if (!ivPart || !tagPart || !cipherPart) return input;

    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const ciphertext = Buffer.from(cipherPart, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      return input;
    }

    try {
      const decipher = cryptoImpl.createDecipheriv("aes-256-gcm", key, iv, {
        authTagLength: 16,
      });
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return plaintext.toString("utf8");
    } catch {
      return input;
    }
  };

  const isEncryptedFileBuffer = (buffer) =>
    Buffer.isBuffer(buffer) &&
    buffer.length >= FILE_HEADER_LENGTH &&
    buffer.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);

  const isEncryptedFilePath = (filePath) => {
    try {
      if (!fsImpl.existsSync(filePath)) return false;
      const fd = fsImpl.openSync(filePath, "r");
      const header = Buffer.alloc(FILE_MAGIC.length);
      try {
        fsImpl.readSync(fd, header, 0, FILE_MAGIC.length, 0);
      } finally {
        fsImpl.closeSync(fd);
      }
      return header.equals(FILE_MAGIC);
    } catch {
      return false;
    }
  };

  const encryptFileInPlace = (filePath) => {
    if (!isEnabled() || !filePath || !fsImpl.existsSync(filePath)) return false;
    if (isEncryptedFilePath(filePath)) return false;

    const plaintext = fsImpl.readFileSync(filePath);
    const encrypted = encryptBuffer(plaintext);
    fsImpl.writeFileSync(filePath, encrypted);
    return true;
  };

  const decryptFileToBuffer = (filePath) => {
    if (!filePath || !fsImpl.existsSync(filePath)) return null;
    const source = fsImpl.readFileSync(filePath);
    return decryptBuffer(source);
  };

  const decryptFileToTempPath = (filePath, originalName = "") => {
    if (!filePath || !fsImpl.existsSync(filePath)) {
      return { path: "", cleanup: () => {} };
    }

    const decrypted = decryptFileToBuffer(filePath);
    const tempDir = pathImpl.join(os.tmpdir(), FILE_TEMP_DIR_NAME);
    fsImpl.mkdirSync(tempDir, { recursive: true });

    const ext = pathImpl
      .extname(String(originalName || filePath))
      .toLowerCase();
    const tempPath = pathImpl.join(
      tempDir,
      `${Date.now()}-${cryptoImpl.randomBytes(6).toString("hex")}${ext}`,
    );
    fsImpl.writeFileSync(tempPath, decrypted);

    return {
      path: tempPath,
      cleanup: () => {
        try {
          if (fsImpl.existsSync(tempPath)) {
            fsImpl.unlinkSync(tempPath);
          }
        } catch {
          // best effort cleanup
        }
      },
    };
  };

  const writeEncryptedFile = (filePath, buffer) => {
    const output = isEnabled() ? encryptBuffer(buffer) : Buffer.from(buffer);
    fsImpl.writeFileSync(filePath, output);
  };

  const getDecryptedFileSize = (filePath) => {
    if (!filePath || !fsImpl.existsSync(filePath)) return 0;
    const stat = fsImpl.statSync(filePath);
    if (!isEncryptedFilePath(filePath)) return stat.size;
    return Math.max(0, stat.size - FILE_HEADER_LENGTH);
  };

  const decryptFileRange = (filePath, start = 0, end = null) => {
    if (!filePath || !fsImpl.existsSync(filePath)) return null;
    const decrypted = decryptFileToBuffer(filePath);
    if (!decrypted) return null;

    const totalLen = decrypted.length;
    const reqStart = Math.max(0, Number(start) || 0);
    const reqEnd = end === null || end === undefined ? totalLen - 1 : Math.min(totalLen - 1, Number(end));

    if (reqStart >= totalLen || reqStart > reqEnd) {
      return Buffer.alloc(0);
    }

    return decrypted.subarray(reqStart, reqEnd + 1);
  };

  return {
    decryptBuffer,
    decryptFileToBuffer,
    decryptFileRange,
    decryptFileToTempPath,
    decryptText,
    encryptBuffer,
    encryptFileInPlace,
    encryptText,
    getDecryptedFileSize,
    isEnabled,
    isEncryptedFileBuffer,
    isEncryptedFilePath,
    isEncryptedText,
    isSystemMessageBody,
    writeEncryptedFile,
  };
}

const storageEncryption = createStorageEncryption();

/**
 * Reflect on-disk truth onto a message-file record after an
 * encrypt-in-place attempt. DB inserts default a missing flag to "none",
 * which desyncs the record whenever the bytes on disk actually are
 * ciphertext — the media worker then probes ciphertext and fails with
 * errors like "moov atom not found". Sniffing disk state (rather than
 * assuming the encrypt outcome) keeps the record honest.
 *
 * @param {object|null} storageEncryptionLike - storageEncryption instance (or stub)
 * @param {string} filePath - path of the stored file
 * @param {object|null} fileObj - message-file record about to be inserted
 * @returns {boolean} whether the record was marked as locally encrypted
 */
function markEncryptedFileRecord(storageEncryptionLike, filePath, fileObj) {
  let encrypted = false;
  try {
    if (
      storageEncryptionLike &&
      typeof storageEncryptionLike.isEncryptedFilePath === "function"
    ) {
      encrypted =
        storageEncryptionLike.isEncryptedFilePath(filePath) === true;
    } else if (
      storageEncryptionLike &&
      typeof storageEncryptionLike.hasKey === "function"
    ) {
      encrypted = Boolean(storageEncryptionLike.hasKey());
    } else if (
      storageEncryptionLike &&
      typeof storageEncryptionLike.isEnabled === "function"
    ) {
      encrypted = Boolean(storageEncryptionLike.isEnabled());
    }
  } catch {
    encrypted = false;
  }
  if (encrypted && fileObj && typeof fileObj === "object") {
    fileObj.encryptionType = "local";
    fileObj.encryption_type = "local";
  }
  return encrypted;
}

export {
  createStorageEncryption,
  ensureStorageEncryptionKey,
  markEncryptedFileRecord,
  storageEncryption,
};

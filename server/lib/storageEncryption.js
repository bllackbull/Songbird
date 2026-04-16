import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEXT_PREFIX = "sb-enc-v1:";
const FILE_MAGIC = Buffer.from("SBENC1\0", "utf8");
const FILE_HEADER_LENGTH = FILE_MAGIC.length + 12 + 16;
const FILE_IV_OFFSET = FILE_MAGIC.length;
const FILE_TAG_OFFSET = FILE_IV_OFFSET + 12;
const FILE_DATA_OFFSET = FILE_HEADER_LENGTH;
const FILE_TEMP_DIR_NAME = "songbird-secure";

function normalizeEnvSecret(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function updateEnvValue(targetPath, key, value, { fsImpl = fs } = {}) {
  const safeValue = String(value ?? "");
  let contents = "";
  try {
    contents = fsImpl.existsSync(targetPath)
      ? fsImpl.readFileSync(targetPath, "utf8")
      : "";
  } catch {
    contents = "";
  }

  const lines = contents ? contents.split(/\r?\n/) : [];
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${safeValue}`;
    }
    return line;
  });

  if (!found) {
    updated.push(`${key}=${safeValue}`);
  }

  const next = updated.filter(
    (line, index, arr) => line.length > 0 || index < arr.length - 1,
  );
  fsImpl.writeFileSync(targetPath, `${next.join("\n")}\n`);
}

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
    const decipher = cryptoImpl.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  };

  const encryptText = (value = "") => {
    const input = String(value || "");
    const key = resolveKey();
    if (
      !key ||
      !input ||
      isSystemMessageBody(input) ||
      isEncryptedText(input)
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

    try {
      const decipher = cryptoImpl.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(ivPart, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(cipherPart, "base64url")),
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

  return {
    decryptBuffer,
    decryptFileToBuffer,
    decryptFileToTempPath,
    decryptText,
    encryptBuffer,
    encryptFileInPlace,
    encryptText,
    isEnabled,
    isEncryptedFileBuffer,
    isEncryptedFilePath,
    isEncryptedText,
    isSystemMessageBody,
    writeEncryptedFile,
  };
}

const storageEncryption = createStorageEncryption();

export {
  createStorageEncryption,
  ensureStorageEncryptionKey,
  storageEncryption,
};

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FILE_MAGIC = Buffer.from("SBENC1\0", "utf8");
const FILE_HEADER_LENGTH = FILE_MAGIC.length + 12 + 16;
const FILE_IV_OFFSET = FILE_MAGIC.length;
const FILE_TAG_OFFSET = FILE_IV_OFFSET + 12;
const FILE_DATA_OFFSET = FILE_HEADER_LENGTH;

const resolveKey = () => {
  const rawKey = String(process.env.STORAGE_ENCRYPTION_KEY || "").trim();
  return rawKey ? crypto.createHash("sha256").update(rawKey).digest() : null;
};

export const isEncryptedFileBuffer = (buffer) =>
  Buffer.isBuffer(buffer) &&
  buffer.length >= FILE_HEADER_LENGTH &&
  buffer.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC);

export const decryptFileToTempPath = (filePath, originalName = "") => {
  const key = resolveKey();
  if (!key || !fs.existsSync(filePath)) {
    return { path: filePath, cleanup: () => {} };
  }

  const data = fs.readFileSync(filePath);
  if (!isEncryptedFileBuffer(data)) {
    return { path: filePath, cleanup: () => {} };
  }

  const iv = data.subarray(FILE_IV_OFFSET, FILE_IV_OFFSET + 12);
  const tag = data.subarray(FILE_TAG_OFFSET, FILE_TAG_OFFSET + 16);
  const ciphertext = data.subarray(FILE_DATA_OFFSET);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: 16,
  });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  const tempDir = path.join(os.tmpdir(), "songbird-secure");
  fs.mkdirSync(tempDir, { recursive: true });
  const ext = path.extname(String(originalName || filePath)).toLowerCase();
  const tempPath = path.join(
    tempDir,
    `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`,
  );
  fs.writeFileSync(tempPath, decrypted);
  return {
    path: tempPath,
    cleanup: () => {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
    },
  };
};

export const encryptBuffer = (buffer) => {
  const key = resolveKey();
  if (!key) return buffer;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: 16,
  });
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
};

export const writeEncryptedFile = (filePath, buffer) => {
  fs.writeFileSync(filePath, encryptBuffer(buffer));
};

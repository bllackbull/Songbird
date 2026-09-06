const APP_ENCRYPTED_TYPES = new Set(["local", "aes-256-gcm", "app"]);

/**
 * Whether an encryption_type value means app-layer (SBENC) ciphertext that
 * only STORAGE_ENCRYPTION_KEY can open. "remote"/"none"/"provider_sse" are
 * all plaintext over the wire.
 */
export function isAppEncryptedType(value) {
  return APP_ENCRYPTED_TYPES.has(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

/**
 * Resolve the client-facing thumbnail URL for a message file.
 *
 * - App-encrypted thumbs on remote storage are served through the
 *   server-side proxy (`GET /api/uploads/thumbs/:fileId`), which decrypts
 *   them — a presigned bucket URL would hand out unreadable ciphertext.
 * - Everything else keeps the previous behavior: presigned redirect for
 *   remote plaintext, null for local driver (posters stay client-generated).
 *
 * @param {object} params
 * @param {object} [params.storageProvider]
 * @param {object} [params.file] - message-file row (driver/encryption read here)
 * @param {string} [params.thumbKey] - overrides the row's thumb key (webhook path)
 * @param {string|number} [params.fileId] - overrides the row id (webhook path)
 */
export async function resolveThumbUrl({
  storageProvider,
  file,
  thumbKey,
  fileId,
}) {
  const key =
    thumbKey ?? file?.thumb_storage_key ?? file?.thumbStorageKey ?? null;
  if (!key) return null;
  const driver = file?.storage_driver ?? file?.storageDriver ?? null;
  const enc = file?.encryption_type ?? file?.encryptionType ?? null;
  const id = fileId ?? file?.id ?? null;
  const remote = driver === "remote" || driver === "s3";
  if (
    remote &&
    isAppEncryptedType(enc) &&
    id !== undefined &&
    id !== null &&
    String(id) !== ""
  ) {
    return `/api/uploads/thumbs/${id}`;
  }
  if (
    remote &&
    storageProvider &&
    typeof storageProvider.getDownloadUrl === "function"
  ) {
    try {
      return await storageProvider.getDownloadUrl(key);
    } catch {
      return null;
    }
  }
  return null;
}

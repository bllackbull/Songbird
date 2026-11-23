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
 * - Remote thumbs are served through `GET /api/uploads/thumbs/:fileId` so the
 *   request can be authorized before a short-lived storage URL is handed out.
 *   App-encrypted thumbs are decrypted server-side there; plaintext ones are
 *   redirected straight to storage.
 * - Local driver stays null (posters remain client-generated).
 *
 * @param {object} params
 * @param {object} [params.file] - message-file row (driver/id read here)
 * @param {string} [params.thumbKey] - overrides the row's thumb key (webhook path)
 * @param {string|number} [params.fileId] - overrides the row id (webhook path)
 */
export function resolveThumbUrl({ file, thumbKey, fileId }) {
  const key =
    thumbKey ?? file?.thumb_storage_key ?? file?.thumbStorageKey ?? null;
  if (!key) return null;
  const driver = file?.storage_driver ?? file?.storageDriver ?? null;
  const id = fileId ?? file?.id ?? null;
  const remote = driver === "remote" || driver === "s3";
  if (remote && id !== undefined && id !== null && String(id) !== "") {
    return `/api/uploads/thumbs/${id}`;
  }
  return null;
}

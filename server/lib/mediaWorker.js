/**
 * Dispatches video transcoding jobs to an external media processing worker via HTTP POST.
 *
 * @param {object} params
 * @param {string} params.mediaWorkerUrl - Base URL of the external worker (e.g. http://worker:8080 or https://worker.onrender.com)
 * @param {string} [params.webhookSecret] - Secret token for x-songbird-webhook-secret header
 * @param {string} [params.callbackUrl] - Songbird callback webhook URL (e.g. https://songbird.example.com/api/uploads/webhook/processed)
 * @param {string|number} params.fileId - File record ID in chat_message_files
 * @param {string} params.storageKey - S3/R2 storage key of raw uploaded file
 * @param {string} [params.storedName] - Original stored name of the file
 * @param {string} [params.mimeType] - MIME type of the uploaded file
 * @param {string} [params.encryptionType] - Encryption mode ('remote', 'none', 'aes-256-gcm', 'local')
 * @param {Function} [params.fetchImpl] - Fetch implementation (defaults to globalThis.fetch)
 * @returns {Promise<boolean>} Whether the dispatch request was successfully accepted
 */
export async function dispatchMediaWorkerJob({
  mediaWorkerUrl,
  webhookSecret,
  callbackUrl,
  fileId,
  storageKey,
  storedName,
  mimeType,
  encryptionType = "none",
  fetchImpl = globalThis.fetch,
}) {
  if (!mediaWorkerUrl || !fileId) return false;

  try {
    const endpoint = `${String(mediaWorkerUrl).replace(/\/+$/, "")}/transcode`;
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret
          ? { "x-songbird-webhook-secret": webhookSecret }
          : {}),
      },
      body: JSON.stringify({
        fileId,
        storageKey,
        storedName,
        mimeType,
        encryptionType,
        callbackUrl: callbackUrl || null,
      }),
    });

    return res.ok;
  } catch (err) {
    console.warn(
      `[mediaWorker] Failed to dispatch transcode for file ${fileId}:`,
      err?.message || err,
    );
    return false;
  }
}

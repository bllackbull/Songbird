async function sendTranscodeRequest(workerUrl, payload, webhookSecret, fetchImpl) {
  if (!workerUrl) return false;
  const endpoint = `${String(workerUrl).replace(/\/+$/, "")}/transcode`;
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(webhookSecret ? { "x-songbird-webhook-secret": webhookSecret } : {}),
    },
    body: JSON.stringify(payload),
  });
  return Boolean(res && res.ok);
}

function isLocalWorkerAddress(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "0.0.0.0"
    );
  } catch {
    return url.includes("127.0.0.1") || url.includes("localhost");
  }
}

/**
 * Dispatches video transcoding jobs to an external or local media processing worker via HTTP POST.
 *
 * @param {object} params
 * @param {string} [params.workerUrl] - Base URL of the external worker (e.g. https://worker.onrender.com)
 * @param {string} [params.mediaWorkerUrl] - Deprecated fallback alias for workerUrl
 * @param {string} [params.storageProcessingMode] - Strategy mode: 'auto' (default), 'local', or 'remote'
 * @param {string|number} [params.workerPort] - Port of local worker (default 8080)
 * @param {number} [params.maxRemoteRetries] - Max retries for remote worker in auto mode (default 3)
 * @param {number} [params.retryDelayMs] - Delay between retries in ms (default 0)
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
  workerUrl,
  mediaWorkerUrl,
  storageProcessingMode,
  workerPort,
  maxRemoteRetries = 3,
  retryDelayMs = 0,
  webhookSecret,
  callbackUrl,
  fileId,
  storageKey,
  storedName,
  mimeType,
  encryptionType = "none",
  downloadUrl = null,
  uploadUrl = null,
  thumbUploadUrl = null,
  storageConfig = null,
  fetchImpl = globalThis.fetch,
}) {
  if (!fileId) return false;

  const mode = String(
    storageProcessingMode ||
      process.env.STORAGE_PROCESSING_MODE ||
      "auto",
  ).toLowerCase();

  const effectiveWorkerPort = workerPort || process.env.WORKER_PORT || "8080";
  const localWorkerUrl = `http://127.0.0.1:${effectiveWorkerPort}`;

  const effectiveStorageKey = storageKey || storedName;
  const effectiveStoredName = storedName || storageKey;

  const resolvedCallbackUrl =
    callbackUrl ||
    process.env.WEBHOOK_URL ||
    process.env.WEBHOOK_CALLBACK_URL ||
    process.env.SONGBIRD_WEBHOOK_URL ||
    process.env.SONGBIRD_WEBHOOK_CALLBACK_URL ||
    null;

  const getPayloadForTarget = (targetWorkerUrl) => {
    let effectiveCallback = resolvedCallbackUrl;
    if (!isLocalWorkerAddress(targetWorkerUrl) && isLocalWorkerAddress(effectiveCallback)) {
      effectiveCallback = null;
    }
    return {
      fileId,
      storageKey: effectiveStorageKey,
      storedName: effectiveStoredName,
      mimeType,
      encryptionType,
      callbackUrl: effectiveCallback,
      ...(downloadUrl ? { downloadUrl } : {}),
      ...(uploadUrl ? { uploadUrl } : {}),
      ...(thumbUploadUrl ? { thumbUploadUrl } : {}),
      ...(storageConfig ? { storageConfig } : {}),
    };
  };

  const configuredRemoteUrl =
    workerUrl !== undefined
      ? workerUrl
      : mediaWorkerUrl !== undefined
      ? mediaWorkerUrl
      : process.env.WORKER_URL || process.env.MEDIA_WORKER_URL || null;

  if (mode === "local") {
    // Mode: local -> calls only the local worker
    try {
      return await sendTranscodeRequest(
        localWorkerUrl,
        getPayloadForTarget(localWorkerUrl),
        webhookSecret,
        fetchImpl,
      );
    } catch (err) {
      console.warn(
        `[mediaWorker] Failed to dispatch to local worker (${localWorkerUrl}) for file ${fileId}:`,
        err?.message || err,
      );
      return false;
    }
  }

  if (mode === "remote") {
    // Mode: remote -> calls only the remote worker without any fallback or local workers running
    if (!configuredRemoteUrl) {
      return false;
    }
    try {
      return await sendTranscodeRequest(
        configuredRemoteUrl,
        getPayloadForTarget(configuredRemoteUrl),
        webhookSecret,
        fetchImpl,
      );
    } catch (err) {
      console.warn(
        `[mediaWorker] Failed to dispatch to remote worker (${configuredRemoteUrl}) for file ${fileId}:`,
        err?.message || err,
      );
      return false;
    }
  }

  // Mode: auto (default)
  // If remote worker is configured and not pointing to local host, try remote up to 3 times before falling back to local
  const isRemoteWorkerConfigured =
    Boolean(configuredRemoteUrl) && !isLocalWorkerAddress(configuredRemoteUrl);

  if (isRemoteWorkerConfigured) {
    for (let attempt = 1; attempt <= maxRemoteRetries; attempt += 1) {
      try {
        const ok = await sendTranscodeRequest(
          configuredRemoteUrl,
          getPayloadForTarget(configuredRemoteUrl),
          webhookSecret,
          fetchImpl,
        );
        if (ok) {
          return true;
        }
      } catch (err) {
        console.warn(
          `[mediaWorker] Attempt ${attempt}/${maxRemoteRetries} to remote worker (${configuredRemoteUrl}) failed for file ${fileId}:`,
          err?.message || err,
        );
      }
      if (attempt < maxRemoteRetries && retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    console.warn(
      `[mediaWorker] All ${maxRemoteRetries} attempts to remote worker (${configuredRemoteUrl}) failed for file ${fileId}. Falling back to local worker (${localWorkerUrl}).`,
    );
  }

  // Fallback to local worker
  try {
    return await sendTranscodeRequest(
      localWorkerUrl,
      getPayloadForTarget(localWorkerUrl),
      webhookSecret,
      fetchImpl,
    );
  } catch (err) {
    console.warn(
      `[mediaWorker] Failed to dispatch to local worker (${localWorkerUrl}) for file ${fileId}:`,
      err?.message || err,
    );
    return false;
  }
}

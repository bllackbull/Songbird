/**
 * remoteMirrorDispatch.js
 *
 * Dispatches Remote Channel mirror jobs to the media worker (Option A).
 * Mirrors server/lib/mediaWorker.js conventions: `auto` (default) tries the
 * configured worker, `local` forces loopback, `remote` never falls back.
 *
 * Reachability rule: the worker must be able to pull bytes back from this
 * server. Loopback workers use 127.0.0.1; remote workers need WEBHOOK_URL.
 * When the worker cannot reach us, dispatch declines and the caller runs the
 * inline local path instead.
 */

export function isLoopbackAddress(url) {
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
    return (
      String(url).includes("127.0.0.1") || String(url).includes("localhost")
    );
  }
}

function cleanBaseUrl(url) {
  let clean = String(url || "").trim();
  while (clean.endsWith("/")) clean = clean.slice(0, -1);
  return clean;
}

function resolveWebhookBase(explicit) {
  const raw =
    explicit ||
    process.env.WEBHOOK_URL ||
    process.env.WEBHOOK_CALLBACK_URL ||
    process.env.SONGBIRD_WEBHOOK_URL ||
    process.env.SONGBIRD_WEBHOOK_CALLBACK_URL ||
    null;
  if (!raw) return null;
  // Reduce any absolute URL to its origin — otherwise the worker gets 404s on both endpoints.
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

/**
 * @returns {Promise<{dispatched: boolean, jobId?: string}>}
 */
export async function dispatchMirrorJob({
  workerUrl,
  mediaWorkerUrl,
  storageProcessingMode,
  workerPort,
  serverPort,
  processingTimeoutMs,
  wakeTimeoutMs,
  wakeRetryDelayMs = 2000,
  wakeRequestTimeoutMs = 15000,
  webhookSecret,
  webhookBaseUrl,
  fetchImpl = globalThis.fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  registry,
  storageKey,
  jobMeta = {},
  onFallback,
  log = () => {},
}) {
  if (!storageKey || typeof registry?.create !== "function")
    return { dispatched: false };

  const mode = String(
    storageProcessingMode || process.env.STORAGE_PROCESSING_MODE || "auto",
  ).toLowerCase();

  const effectiveWorkerPort = workerPort || process.env.WORKER_PORT || "8080";
  const localWorkerUrl = `http://127.0.0.1:${effectiveWorkerPort}`;
  const configuredRemoteUrl =
    workerUrl !== undefined
      ? workerUrl
      : mediaWorkerUrl !== undefined
        ? mediaWorkerUrl
        : process.env.WORKER_URL || process.env.MEDIA_WORKER_URL || null;

  let target = null;
  if (mode === "local") {
    target = localWorkerUrl;
  } else if (mode === "remote") {
    if (!configuredRemoteUrl) return { dispatched: false };
    target = cleanBaseUrl(configuredRemoteUrl);
  } else {
    // auto: prefer the configured worker, else loopback.
    target = configuredRemoteUrl
      ? cleanBaseUrl(configuredRemoteUrl)
      : localWorkerUrl;
  }
  if (!target) return { dispatched: false };

  const effectiveServerPort =
    serverPort || process.env.PORT || process.env.SERVER_PORT || "5174";
  const webhookBase = resolveWebhookBase(webhookBaseUrl);
  // The worker pulls bytes and posts the webhook back to us — it must be
  // able to reach this server.
  const serverBase = isLoopbackAddress(target)
    ? `http://127.0.0.1:${effectiveServerPort}`
    : webhookBase;
  if (!serverBase) {
    log("mirror:dispatch-skip", { reason: "worker cannot reach server" });
    return { dispatched: false };
  }

  const entry = registry.create(jobMeta);
  const payload = {
    jobId: entry.jobId,
    downloadUrl: `${cleanBaseUrl(serverBase)}/api/remote-channel/blob/${entry.jobId}`,
    downloadSecret: entry.secret,
    storageKey,
    storedName: entry.storedName,
    mimeType: entry.mimeType,
    widthPx: entry.widthPx,
    heightPx: entry.heightPx,
    durationSeconds: entry.durationSeconds,
    maxBytes: entry.maxBytes,
    probeVideo: String(entry.mimeType || "")
      .toLowerCase()
      .startsWith("video/"),
    callbackUrl: `${cleanBaseUrl(serverBase)}/api/remote-channel/webhook/mirror-done`,
    webhookSecret: webhookSecret || null,
  };

  const postToWorker = () =>
    fetchImpl(`${target}/mirror-media`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret
          ? { "x-songbird-webhook-secret": webhookSecret }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(wakeRequestTimeoutMs),
    });

  if (!isLoopbackAddress(target)) {
    const wakeBudgetMs = Math.max(
      0,
      Number(
        wakeTimeoutMs !== undefined
          ? wakeTimeoutMs
          : processingTimeoutMs !== undefined
            ? processingTimeoutMs
            : process.env.STORAGE_PROCESSING_TIMEOUT_MS || 90000,
      ) || 90000,
    );
    const retryDelayMs = Math.max(0, Number(wakeRetryDelayMs) || 0);
    const startedAt = Date.now();
    let attempt = 0;
    for (;;) {
      attempt += 1;
      try {
        const res = await postToWorker();
        if (res?.ok) break;
        throw new Error(`Worker returned HTTP ${res?.status || "?"}.`);
      } catch (error) {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= wakeBudgetMs) {
          registry.remove(entry.jobId);
          log("mirror:dispatch-failed", {
            error: error?.message || String(error),
            attempts: attempt,
          });
          return { dispatched: false };
        }
        log("mirror:wake-retry", {
          attempt,
          error: error?.message || String(error),
        });
        if (retryDelayMs > 0) {
          await sleepImpl(Math.min(retryDelayMs, wakeBudgetMs - elapsed));
        }
      }
    }
  } else {
    try {
      const res = await postToWorker();
      if (!res?.ok)
        throw new Error(`Worker returned HTTP ${res?.status || "?"}.`);
    } catch (error) {
      registry.remove(entry.jobId);
      log("mirror:dispatch-failed", { error: error?.message || String(error) });
      return { dispatched: false };
    }
  }

  if (mode !== "remote" && typeof onFallback === "function") {
    const timeoutMs = Math.max(
      1000,
      Number(
        processingTimeoutMs !== undefined
          ? processingTimeoutMs
          : process.env.STORAGE_PROCESSING_TIMEOUT_MS || 120000,
      ) || 120000,
    );
    const timer = setTimeout(() => {
      const pending = registry.settle(entry.jobId, "fallback");
      if (!pending) return; // Webhook already won.
      Promise.resolve()
        .then(() => onFallback(pending))
        .catch((error) => {
          log("mirror:fallback-failed", {
            error: error?.message || String(error),
          });
        });
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    entry.fallbackTimer = timer;
  }

  return { dispatched: true, jobId: entry.jobId };
}

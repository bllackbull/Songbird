import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let activeLocalWorkerChild = null;

export async function isLocalWorkerHealthy(
  workerPort = 8080,
  fetchImpl = globalThis.fetch,
  timeoutMs = 800,
) {
  const healthUrl = `http://127.0.0.1:${workerPort}/health`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(healthUrl, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res || !res.ok) return false;
    const body = await res.json().catch(() => ({}));
    return (
      body && (body.status === "ok" || body.service === "songbird-media-worker")
    );
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

export function resolveWorkerScriptPath(customPath = null) {
  if (customPath && fs.existsSync(customPath)) {
    return path.resolve(customPath);
  }

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(currentDir, "../../worker/index.js"),
    path.resolve(process.cwd(), "worker/index.js"),
    path.resolve(process.cwd(), "../worker/index.js"),
    "/app/worker/index.js",
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {}
  }

  return candidatePaths[0];
}

/**
 * Ensures the local media worker is running if STORAGE_PROCESSING_MODE is 'local' or 'auto'.
 * If the worker is not already healthy on the local port, automatically starts it as a child process.
 */
export async function ensureLocalWorkerRunning(options = {}) {
  const storageProcessingMode = String(
    options.storageProcessingMode ||
      process.env.STORAGE_PROCESSING_MODE ||
      "auto",
  ).toLowerCase();

  const startLocalWorker = String(
    options.startLocalWorker || process.env.START_LOCAL_WORKER || "auto",
  ).toLowerCase();

  if (startLocalWorker === "false") {
    return { started: false, reason: "disabled_by_env" };
  }

  if (storageProcessingMode === "remote") {
    return { started: false, reason: "remote_mode" };
  }

  if (storageProcessingMode !== "local" && storageProcessingMode !== "auto") {
    return { started: false, reason: "unsupported_mode" };
  }

  const workerPort = Number(
    options.workerPort || process.env.WORKER_PORT || 8080,
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const spawnImpl = options.spawnImpl || spawn;

  // Check if local worker is already up and healthy
  const alreadyRunning = await isLocalWorkerHealthy(
    workerPort,
    fetchImpl,
    options.checkTimeoutMs || 800,
  );

  if (alreadyRunning) {
    return { started: false, alreadyRunning: true, port: workerPort };
  }

  const workerScriptPath = resolveWorkerScriptPath(options.workerScriptPath);
  if (!fs.existsSync(workerScriptPath)) {
    console.warn(
      `[localWorkerManager] Media worker script not found at ${workerScriptPath}. Auto-start skipped.`,
    );
    return {
      started: false,
      error: "script_not_found",
      path: workerScriptPath,
    };
  }

  const dataDir =
    options.dataDir || process.env.DATA_DIR || path.join(process.cwd(), "data");

  try {
    const child = spawnImpl(process.execPath, [workerScriptPath], {
      env: {
        ...process.env,
        WORKER_PORT: String(workerPort),
        DATA_DIR: dataDir,
      },
      stdio: "ignore",
      detached: false,
    });

    child.on("error", (err) => {
      console.warn(
        `[localWorkerManager] Local worker process error on port ${workerPort}:`,
        err?.message || err,
      );
    });

    activeLocalWorkerChild = child;

    const cleanup = () => {
      try {
        if (activeLocalWorkerChild && !activeLocalWorkerChild.killed) {
          activeLocalWorkerChild.kill("SIGTERM");
        }
      } catch {}
    };

    process.once("exit", cleanup);
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);

    console.log(
      `[localWorkerManager] Auto-started local Songbird Media Worker on port ${workerPort} (PID: ${child.pid}, mode: ${storageProcessingMode})`,
    );

    return {
      started: true,
      pid: child.pid,
      child,
      port: workerPort,
      mode: storageProcessingMode,
    };
  } catch (err) {
    console.error(
      `[localWorkerManager] Failed to auto-start local worker on port ${workerPort}:`,
      err?.message || err,
    );
    return { started: false, error: err?.message || String(err) };
  }
}

export function getActiveLocalWorkerChild() {
  return activeLocalWorkerChild;
}

export function stopLocalWorker() {
  if (activeLocalWorkerChild && !activeLocalWorkerChild.killed) {
    try {
      activeLocalWorkerChild.kill("SIGTERM");
    } catch {}
    activeLocalWorkerChild = null;
  }
}

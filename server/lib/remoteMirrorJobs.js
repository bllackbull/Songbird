import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * remoteMirrorJobs.js
 *
 * In-memory registry for Remote Channel mirror jobs (Option A handoff).
 *
 * The server downloads Telegram bytes itself (the MTProto session never
 * leaves the server) and parks them in a temp dir. The worker pulls the bytes
 * via a secret-gated URL, processes them, and reports back on the webhook.
 * Entries settle exactly once — either the webhook or the local-fallback
 * timer wins, the loser is ignored.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const TEMP_PREFIX = "songbird-mirror-";

function randomHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function createMirrorJobRegistry({
  fsImpl = fs,
  pathImpl = path,
  tmpRoot = null,
  ttlMs = DEFAULT_TTL_MS,
  now = () => Date.now(),
} = {}) {
  const root =
    tmpRoot || fsImpl.mkdtempSync(pathImpl.join(os.tmpdir(), TEMP_PREFIX));
  try {
    fsImpl.mkdirSync(root, { recursive: true });
  } catch {
    // Directory may already exist — reuse it.
  }
  // Drop temp files orphaned by a previous process lifetime.
  try {
    for (const name of fsImpl.readdirSync(root)) {
      if (!name.startsWith(TEMP_PREFIX)) continue;
      const full = pathImpl.join(root, name);
      try {
        const stat = fsImpl.statSync(full);
        if (
          now() - Number(stat?.mtimeMs || 0) > ttlMs &&
          fsImpl.existsSync(full)
        ) {
          fsImpl.unlinkSync(full);
        }
      } catch {
        // Best effort only.
      }
    }
  } catch {
    // Best effort only.
  }

  const jobs = new Map(); // jobId -> entry

  const unlinkQuiet = (filePath) => {
    try {
      if (filePath && fsImpl.existsSync(filePath)) fsImpl.unlinkSync(filePath);
    } catch {
      // Best effort only.
    }
  };

  function tempFilePath(storedName = "mirror.bin") {
    const safe = String(storedName || "mirror.bin").replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    return pathImpl.join(root, `${TEMP_PREFIX}${randomHex(8)}-${safe}`);
  }

  function create(meta = {}) {
    const jobId = randomHex(12);
    const secret = randomHex(32);
    const entry = {
      jobId,
      secret,
      filePath: meta.filePath || null,
      storedName: meta.storedName || null,
      mimeType: meta.mimeType || null,
      kind: meta.kind || null,
      originalName: meta.originalName || null,
      widthPx: meta.widthPx ?? null,
      heightPx: meta.heightPx ?? null,
      durationSeconds: meta.durationSeconds ?? null,
      maxBytes: meta.maxBytes ?? null,
      actualSize: meta.actualSize ?? null,
      descriptor: meta.descriptor || null,
      messageId: meta.messageId ?? null,
      chatId: meta.chatId ?? null,
      authorId: meta.authorId ?? null,
      authorUsername: meta.authorUsername ?? null,
      createdAt: now(),
      settled: false,
      settledBy: null,
      fallbackTimer: null,
    };
    jobs.set(jobId, entry);
    return entry;
  }

  function get(jobId) {
    return jobs.get(String(jobId || "")) || null;
  }

  // Mark settled exactly once. Returns the entry on the winning call and
  // null when already settled or unknown. Does not delete temp bytes —
  // the winner owns cleanup (webhook unlinks after a bucket attach, the
  // inline fallback reuses or keeps the file as the final local copy).
  function settle(jobId, settledBy = "unknown") {
    const entry = get(jobId);
    if (!entry || entry.settled) return null;
    entry.settled = true;
    entry.settledBy = settledBy;
    if (entry.fallbackTimer) {
      clearTimeout(entry.fallbackTimer);
      if (typeof entry.fallbackTimer.unref === "function")
        entry.fallbackTimer.unref();
      entry.fallbackTimer = null;
    }
    jobs.delete(entry.jobId);
    return entry;
  }

  function remove(jobId) {
    const entry = get(jobId);
    if (!entry) return null;
    if (entry.fallbackTimer) {
      clearTimeout(entry.fallbackTimer);
      entry.fallbackTimer = null;
    }
    jobs.delete(entry.jobId);
    return entry;
  }

  function sweep() {
    let removed = 0;
    for (const entry of jobs.values()) {
      if (now() - entry.createdAt <= ttlMs) continue;
      unlinkQuiet(entry.filePath);
      remove(entry.jobId);
      removed += 1;
    }
    return removed;
  }

  return {
    root,
    tempFilePath,
    create,
    get,
    settle,
    remove,
    sweep,
    unlinkQuiet,
  };
}

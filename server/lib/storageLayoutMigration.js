import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Legacy → unified object-storage layout migration.
 *
 * Legacy bucket layout (pre-unification):
 *   avatars/<name>          chat/media avatars at bucket root
 *   uploads/<name>          chat message files at bucket root
 *
 * Unified layout (mirrors local disk data/uploads/messages + data/uploads/avatars):
 *   uploads/avatars/<name>
 *   uploads/messages/<name>
 *
 * Public API URLs (/api/uploads/avatars/*, /api/uploads/messages/*) are
 * unchanged — only S3 storage keys move. DB storage_key columns are
 * rewritten via db.js rewriteStorageKeys() (all SQL lives in db.js).
 */

export const LEGACY_AVATAR_PREFIX = "avatars/";
export const NEW_AVATAR_PREFIX = "uploads/avatars/";
export const LEGACY_UPLOADS_PREFIX = "uploads/";
export const NEW_MESSAGES_PREFIX = "uploads/messages/";

/**
 * Map a legacy storage key to its unified-layout equivalent.
 * Returns null when the key is already unified or not a known legacy key.
 * @param {string} key
 * @returns {string|null}
 */
export function mapLegacyToNewKey(key) {
  const clean = String(key || "").replace(/^\//, "");
  if (!clean) return null;

  if (
    clean.startsWith(NEW_AVATAR_PREFIX) ||
    clean.startsWith(NEW_MESSAGES_PREFIX)
  ) {
    return null;
  }

  if (clean.startsWith(LEGACY_AVATAR_PREFIX)) {
    const rest = clean.slice(LEGACY_AVATAR_PREFIX.length);
    if (!rest || rest.endsWith("/")) return null;
    return `${NEW_AVATAR_PREFIX}${rest}`;
  }

  if (clean.startsWith(LEGACY_UPLOADS_PREFIX)) {
    const rest = clean.slice(LEGACY_UPLOADS_PREFIX.length);
    if (!rest || rest.endsWith("/")) return null;
    // Guard against future nested prefixes we don't own.
    if (rest.startsWith("avatars/") || rest.startsWith("messages/")) {
      return null;
    }
    return `${NEW_MESSAGES_PREFIX}${rest}`;
  }

  return null;
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isLegacyKey(key) {
  return mapLegacyToNewKey(key) !== null;
}

async function safeList(provider, prefix) {
  if (!provider || typeof provider.listObjects !== "function") return [];
  try {
    return (await provider.listObjects(prefix)) || [];
  } catch (_) {
    return [];
  }
}

/**
 * Detect legacy-layout objects without moving anything.
 * @param {object} storageProvider
 * @returns {Promise<{hasLegacy:boolean, legacyAvatarKeys:string[], legacyMessageKeys:string[]}>}
 */
export async function detectLegacyLayout(storageProvider) {
  const [avatarObjects, uploadObjects] = await Promise.all([
    safeList(storageProvider, LEGACY_AVATAR_PREFIX),
    safeList(storageProvider, LEGACY_UPLOADS_PREFIX),
  ]);

  const seen = new Set();
  const legacyAvatarKeys = [];
  const legacyMessageKeys = [];

  for (const obj of [...avatarObjects, ...uploadObjects]) {
    const key = obj?.key;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const next = mapLegacyToNewKey(key);
    if (!next) continue;
    if (next.startsWith(NEW_AVATAR_PREFIX)) {
      legacyAvatarKeys.push(key);
    } else {
      legacyMessageKeys.push(key);
    }
  }

  return {
    hasLegacy: legacyAvatarKeys.length > 0 || legacyMessageKeys.length > 0,
    legacyAvatarKeys,
    legacyMessageKeys,
  };
}

async function copyWithFallback(provider, srcKey, destKey) {
  if (provider && typeof provider.copyFile === "function") {
    return provider.copyFile(srcKey, destKey);
  }
  // Fallback for providers without copyFile: download to temp + re-upload.
  if (
    provider &&
    typeof provider.downloadToPath === "function" &&
    typeof provider.uploadFile === "function"
  ) {
    const tmpPath = path.join(
      fs.realpathSync(os.tmpdir()),
      `sb-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    try {
      await provider.downloadToPath(srcKey, tmpPath);
      return await provider.uploadFile(destKey, tmpPath);
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }
  throw new Error(
    "Storage provider supports neither copyFile nor downloadToPath/uploadFile.",
  );
}

/**
 * Migrate legacy-layout objects to the unified layout:
 * copy → verify → rewrite DB keys → delete legacy objects.
 *
 * Never throws for per-object failures; they are collected in the summary.
 * @param {object} options
 * @param {object} options.storageProvider
 * @param {function} [options.rewriteStorageKeys] injected db.js rewriteStorageKeys
 * @param {function} [options.adminSave]
 * @param {object} [options.logger] defaults to console
 * @param {boolean} [options.dryRun] list what would move without moving
 * @param {function} [options.onProgress]
 * @returns {Promise<object>} summary
 */
export async function migrateLegacyStorageLayout({
  storageProvider,
  rewriteStorageKeys,
  adminSave,
  logger = console,
  dryRun = false,
  onProgress,
} = {}) {
  const emptySummary = {
    hasLegacy: false,
    moved: [],
    copySkipped: [],
    failed: [],
    dbUpdated: 0,
    deletedLegacy: [],
    deleteFailed: [],
    dryRun: Boolean(dryRun),
  };

  if (
    !storageProvider ||
    (storageProvider.type !== "remote" && storageProvider.type !== "s3")
  ) {
    return { ...emptySummary, skipped: "local-driver" };
  }
  if (typeof storageProvider.listObjects !== "function") {
    return { ...emptySummary, skipped: "listObjects-unavailable" };
  }

  const { hasLegacy, legacyAvatarKeys, legacyMessageKeys } =
    await detectLegacyLayout(storageProvider);

  if (!hasLegacy) {
    return emptySummary;
  }

  const pairs = [...legacyAvatarKeys, ...legacyMessageKeys].map((from) => ({
    from,
    to: mapLegacyToNewKey(from),
  }));

  if (dryRun) {
    return { ...emptySummary, hasLegacy: true, pending: pairs };
  }

  const moved = [];
  const copySkipped = [];
  const failed = [];
  const canCheckExists = typeof storageProvider.deleteFile === "function";

  for (const { from, to } of pairs) {
    try {
      if (typeof storageProvider.exists === "function") {
        const destExists = await storageProvider.exists(to).catch(() => false);
        if (destExists) {
          moved.push({ from, to });
          copySkipped.push({ from, to });
          onProgress?.({ phase: "copy-skipped", from, to });
          continue;
        }
      }
      await copyWithFallback(storageProvider, from, to);
      if (typeof storageProvider.exists === "function") {
        const verified = await storageProvider.exists(to).catch(() => false);
        if (!verified) {
          throw new Error(`Copy verification failed for ${to}.`);
        }
      }
      moved.push({ from, to });
      onProgress?.({ phase: "copied", from, to });
    } catch (err) {
      logger?.warn?.(
        `[storage-migrate] Failed to copy ${from} → ${to}: ${err?.message || err}`,
      );
      failed.push({ from, to, error: err?.message || String(err) });
    }
  }

  let dbUpdated = 0;
  if (moved.length && typeof rewriteStorageKeys === "function") {
    try {
      const raw = rewriteStorageKeys(moved);
      dbUpdated = raw && typeof raw.then === "function" ? await raw : raw;
      if (typeof adminSave === "function") adminSave();
    } catch (err) {
      logger?.warn?.(
        `[storage-migrate] DB key rewrite failed: ${err?.message || err}`,
      );
      return {
        ...emptySummary,
        hasLegacy: true,
        moved,
        copySkipped,
        failed,
        dbUpdated: 0,
        dbError: err?.message || String(err),
      };
    }
  }

  const deletedLegacy = [];
  const deleteFailed = [];
  if (moved.length && canCheckExists) {
    for (const { from, to } of moved) {
      try {
        await storageProvider.deleteFile(from);
        deletedLegacy.push(from);
        onProgress?.({ phase: "deleted-legacy", from, to });
      } catch (err) {
        logger?.warn?.(
          `[storage-migrate] Failed to delete legacy key ${from}: ${err?.message || err}`,
        );
        deleteFailed.push({ key: from, error: err?.message || String(err) });
      }
    }
  }

  return {
    hasLegacy: true,
    moved,
    copySkipped,
    failed,
    dbUpdated: Number(dbUpdated) || 0,
    deletedLegacy,
    deleteFailed,
    dryRun: false,
  };
}

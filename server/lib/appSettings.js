/**
 * appSettings.js
 *
 * Runtime application settings stored in the `app_settings` database table.
 *
 * Precedence (highest → lowest):
 *   1. Env var explicitly set in the environment / .env file
 *   2. Value saved in the `app_settings` DB table (via admin panel)
 *   3. Hard-coded defaultVal in SETTING_DEFS
 *
 * This means:
 *  - If you set a value in the admin panel and the env var is absent → DB wins.
 *  - If you later set the env var → env wins, DB value is ignored until cleared.
 *  - Editing .env always takes effect on the next restart, regardless of DB.
 */

import { readEnvBool, readEnvInt } from "../settings/env.js";

// ─── Setting types ────────────────────────────────────────────────────────────

const TYPE_BOOL = "bool";
const TYPE_INT = "int";
const TYPE_STRING = "string";

// ─── Setting registry ─────────────────────────────────────────────────────────
//
// Each entry:
//   key         – DB / API key (matches env var name by convention)
//   type        – bool | int | string
//   secret      – if true, value is never included in the public /api/app/info payload
//   adminOnly   – if true, only returned to admin API, not public info endpoint
//   label       – human-readable label for the admin panel
//   description – short description for the admin panel tooltip
//   group       – logical grouping in the admin panel
//   envKey      – env var name(s) to use as the fallback default (array = aliases)
//   defaultVal  – hard-coded fallback if env var is also absent
//   min / max   – only for TYPE_INT, applied during validation
//   restart     – if true, hint to the admin panel that a server restart is needed

export const SETTING_DEFS = [
  // ── Diagnostics ────────────────────────────────────────────────────────────────
  {
    key: "APP_DEBUG",
    type: TYPE_BOOL,
    label: "Debug logging",
    description: "Log detailed request/response info to the service logs.",
    group: "diagnostics",
    envKey: "APP_DEBUG",
    defaultVal: false,
  },

  // ── Registration ─────────────────────────────────────────────────────────────
  {
    key: "SIGN_UP",
    type: TYPE_BOOL,
    label: "Sign-up (Public Server)",
    description: "Let new users create accounts via the registration form.",
    group: "registration",
    envKey: ["SIGN_UP", "ACCOUNT_CREATION"],
    defaultVal: true,
  },

  // ── File uploads ─────────────────────────────────────────────────────────────
  {
    key: "FILE_UPLOAD",
    type: TYPE_BOOL,
    label: "File uploads",
    description: "Allow users to upload files in messages.",
    group: "uploads",
    envKey: "FILE_UPLOAD",
    defaultVal: true,
  },
  {
    key: "FILE_UPLOAD_MAX_SIZE_MB",
    type: TYPE_INT,
    label: "Max file size",
    description: "Maximum size for a single uploaded file. (MB)",
    group: "uploads",
    envKey: "FILE_UPLOAD_MAX_SIZE_MB",
    defaultVal: 25,
    min: 1,
    max: 2048,
    restart: true, // baked into a multer() instance at startup
  },
  {
    key: "FILE_UPLOAD_MAX_TOTAL_SIZE_MB",
    type: TYPE_INT,
    label: "Max total upload size per message",
    description: "Maximum combined size of all files attached to one message. (MB)",
    group: "uploads",
    envKey: "FILE_UPLOAD_MAX_TOTAL_SIZE_MB",
    defaultVal: 75,
    min: 1,
    max: 8192,
    restart: true,      // enforced against a value captured at startup
    nginxReload: true,  // nginx client_max_body_size must also be updated
  },
  {
    key: "FILE_UPLOAD_MAX_FILES",
    type: TYPE_INT,
    label: "Max files per message",
    description:
      "Maximum number of files that can be attached to a single message.",
    group: "uploads",
    envKey: "FILE_UPLOAD_MAX_FILES",
    defaultVal: 10,
    min: 1,
    max: 50,
    restart: true, // baked into a multer() instance at startup
  },
  {
    key: "FILE_UPLOAD_TRANSCODE_VIDEOS",
    type: TYPE_BOOL,
    label: "Transcode videos",
    description:
      "Convert uploaded videos to a universally compatible format (H.264/AAC MP4). Requires ffmpeg.",
    group: "uploads",
    envKey: "FILE_UPLOAD_TRANSCODE_VIDEOS",
    defaultVal: true,
  },

  // ── Message retention ─────────────────────────────────────────────────────────
  {
    key: "MESSAGE_FILE_RETENTION",
    type: TYPE_INT,
    label: "Message file retention",
    description:
      "Automatically delete uploaded message files after certain days.",
    group: "retention",
    envKey: "MESSAGE_FILE_RETENTION",
    defaultVal: 7,
    min: 1,
    max: 3650,
    nullable: true, // 0 means disabled
  },
  {
    key: "MESSAGE_TEXT_RETENTION",
    type: TYPE_INT,
    label: "Message text retention",
    description:
      "Automatically delete message text after certain days.",
    group: "retention",
    envKey: "MESSAGE_TEXT_RETENTION",
    defaultVal: 0,
    min: 1,
    max: 3650,
    nullable: true, // 0 means disabled
  },

  // ── Message limits ────────────────────────────────────────────────────────────
  {
    key: "MESSAGE_MAX_CHARS",
    type: TYPE_INT,
    label: "Max message length",
    description: "Maximum number of characters allowed in a single message.",
    group: "limits",
    envKey: ["MESSAGE_MAX_CHARS", "MESSAGE_MAX"],
    defaultVal: 4000,
    min: 1,
    max: 20000,
    restart: true,
  },
  {
    key: "USERNAME_MAX_CHARS",
    type: TYPE_INT,
    label: "Max username length",
    description: "Maximum number of characters in a username.",
    group: "limits",
    envKey: ["USERNAME_MAX_CHARS", "USERNAME_MAX"],
    defaultVal: 16,
    min: 3,
    max: 32,
    restart: true,
  },
  {
    key: "NICKNAME_MAX_CHARS",
    type: TYPE_INT,
    label: "Max nickname length",
    description: "Maximum number of characters in a nickname.",
    group: "limits",
    envKey: ["NICKNAME_MAX_CHARS", "NICKNAME_MAX"],
    defaultVal: 24,
    min: 3,
    max: 64,
    restart: true,
  },

  // ── Remote Channel ────────────────────────────────────────────────────────────
  {
    key: "REMOTE_CHANNEL",
    type: TYPE_BOOL,
    label: "Remote Channel",
    description: "Enable the remote channel mirroring feature.",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL",
    defaultVal: false,
    restart: true,
  },
  {
    key: "REMOTE_CHANNEL_UI",
    type: TYPE_BOOL,
    label: "Remote Channel UI",
    description: "Allow channel owners to configure Remote Channel in the UI.",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_UI",
    defaultVal: true,
  },
  {
    key: "REMOTE_CHANNEL_MEDIA_STREAM",
    type: TYPE_BOOL,
    label: "Media stream option",
    description:
      "Allow channel owners to enable 'media stream' feature in the UI to mirror files.",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_MEDIA_STREAM",
    defaultVal: true,
  },
  {
    key: "REMOTE_CHANNEL_POLL_INTERVAL_MS",
    type: TYPE_INT,
    label: "Source poll interval",
    description: "Milliseconds between source message polls. (ms)",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_POLL_INTERVAL_MS",
    defaultVal: 5000,
    min: 1000,
    max: 60000,
    restart: true,
  },
  {
    key: "REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT",
    type: TYPE_INT,
    label: "Telegram poll message limit",
    description: "Maximum messages to fetch per Telegram poll.",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT",
    defaultVal: 50,
    min: 1,
    max: 100,
    restart: true,
  },
  {
    key: "REMOTE_CHANNEL_QUEUE_INTERVAL_MS",
    type: TYPE_INT,
    label: "Queue processing interval",
    description: "Milliseconds between queue processing ticks. (ms)",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_QUEUE_INTERVAL_MS",
    defaultVal: 1000,
    min: 100,
    max: 30000,
    restart: true,
  },
  {
    key: "REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS",
    type: TYPE_INT,
    label: "Queue max retry attempts",
    description: "Maximum number of times a failed queue item is retried.",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS",
    defaultVal: 10,
    min: 1,
    max: 100,
    restart: true,
  },
  {
    key: "REMOTE_CHANNEL_QUEUE_BATCH_SIZE",
    type: TYPE_INT,
    label: "Queue batch size",
    description: "Number of queue items processed per batch.",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_QUEUE_BATCH_SIZE",
    defaultVal: 10,
    min: 1,
    max: 50,
    restart: true,
  },
  {
    key: "REMOTE_CHANNEL_QUEUE_CONCURRENCY",
    type: TYPE_INT,
    label: "Queue concurrency",
    description: "Number of queue items processed concurrently.",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_QUEUE_CONCURRENCY",
    defaultVal: 3,
    min: 1,
    max: 50,
    restart: true,
  },
  {
    key: "REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS",
    type: TYPE_INT,
    label: "Queue stale lock timeout",
    description: "Milliseconds before a stuck queue lock is released. (ms)",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS",
    defaultVal: 300000,
    min: 10000,
    max: 3600000,
    restart: true,
  },
  {
    key: "REMOTE_CHANNEL_TELEGRAM_PROXY_URL",
    type: TYPE_STRING,
    label: "Telegram proxy",
    description:
      "Proxy URL for the Telegram MTProto connection (http/https/socks4/socks5/mtproxy).",
    group: "remote_channel",
    envKey: ["REMOTE_CHANNEL_TELEGRAM_PROXY_URL", "REMOTE_CHANNEL_PROXY_URL"],
    defaultVal: "",
    restart: true, // baked into the TelegramClient connection at startup
    nullable: true,
  },
  {
    key: "REMOTE_CHANNEL_SONGBIRD_PROXY_URL",
    type: TYPE_STRING,
    label: "Songbird proxy",
    description:
      "Proxy URL for outbound server-to-server requests to remote Songbird instances.",
    group: "remote_channel",
    envKey: "REMOTE_CHANNEL_SONGBIRD_PROXY_URL",
    defaultVal: "",
    nullable: true, // applied per-request; no restart needed
  },

  // ── Client tuning ──────────────────────────────────────────────────────────────
  {
    key: "CHAT_MESSAGE_FETCH_LIMIT",
    type: TYPE_INT,
    label: "Message fetch limit",
    description: "Maximum number of messages the client fetches from the server per request.",
    group: "client",
    envKey: "CHAT_MESSAGE_FETCH_LIMIT",
    defaultVal: 60,
    min: 1,
    max: 500,
  },
  {
    key: "CHAT_MESSAGE_PAGE_SIZE",
    type: TYPE_INT,
    label: "Message page size",
    description: "Number of messages loaded per page when scrolling up in a chat.",
    group: "client",
    envKey: "CHAT_MESSAGE_PAGE_SIZE",
    defaultVal: 60,
    min: 10,
    max: 500,
  },
  {
    key: "CHAT_CACHE_TTL",
    type: TYPE_INT,
    label: "Client cache lifetime",
    description: "Hours to keep chat data cached on the client before it's considered stale.",
    group: "client",
    envKey: "CHAT_CACHE_TTL",
    defaultVal: 24,
    min: 1,
    max: 720,
  },

  // ── Push notifications ────────────────────────────────────────────────────────
  {
    key: "PUSH_PROXY_URL",
    type: TYPE_STRING,
    label: "Push notification proxy",
    description:
      "Set a proxy URL for outbound push notification requests.",
    group: "push",
    envKey: "PUSH_PROXY_URL",
    defaultVal: "",
    restart: true,
    nullable: true, // empty string means disabled
  },
];

// Build a lookup map for fast access
const DEFS_BY_KEY = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d]));

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Populated by loadSettings() on startup and kept in sync after each set().

const _cache = {};

// ─── Check whether an env var is explicitly present ──────────────────────────
// Returns true if at least one of the def's envKey names exists in process.env
// with a non-empty value. This is how we distinguish "env explicitly set" from
// "env absent, falling back to hardcoded default".

function isEnvExplicitlySet(def) {
  const keys = Array.isArray(def.envKey)
    ? def.envKey
    : def.envKey
      ? [def.envKey]
      : [];
  return keys.some((k) => {
    const v = process.env[k];
    return v !== undefined && v !== null && v !== "";
  });
}

// ─── Resolve the env-var value for a definition ───────────────────────────────

function resolveEnvDefault(def) {
  const keys = Array.isArray(def.envKey)
    ? def.envKey
    : def.envKey
      ? [def.envKey]
      : [];

  if (def.type === TYPE_BOOL) {
    return readEnvBool(keys.length ? keys : ["__NOSUCHVAR__"], def.defaultVal);
  }
  if (def.type === TYPE_INT) {
    return readEnvInt(keys.length ? keys : ["__NOSUCHVAR__"], def.defaultVal, {
      min: def.min,
      max: def.max,
    });
  }
  // TYPE_STRING
  for (const k of keys) {
    const raw = process.env[k];
    if (raw !== undefined && raw !== null && raw !== "")
      return String(raw).trim();
  }
  return def.defaultVal;
}

// ─── Type coercion from raw DB string ─────────────────────────────────────────

function coerce(def, raw) {
  if (raw === null || raw === undefined) return resolveEnvDefault(def);
  const s = String(raw).trim();
  if (s === "") return resolveEnvDefault(def);

  if (def.type === TYPE_BOOL) {
    return ["1", "true", "yes", "y", "on"].includes(s.toLowerCase());
  }
  if (def.type === TYPE_INT) {
    const n = Math.trunc(Number(s));
    if (!Number.isFinite(n)) return resolveEnvDefault(def);
    if (def.min !== undefined && n < def.min) return def.min;
    if (def.max !== undefined && n > def.max) return def.max;
    return n;
  }
  return s;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a raw string value against a definition.
 * Returns { valid: true, value } or { valid: false, error }.
 */
export function validateSetting(key, raw) {
  const def = DEFS_BY_KEY[key];
  if (!def) return { valid: false, error: `Unknown setting: ${key}` };

  const s = String(raw ?? "").trim();

  if (def.type === TYPE_BOOL) {
    const ok = [
      "1",
      "true",
      "yes",
      "y",
      "on",
      "0",
      "false",
      "no",
      "n",
      "off",
    ].includes(s.toLowerCase());
    if (!ok)
      return { valid: false, error: `Expected a boolean value (true/false).` };
    return { valid: true, value: s };
  }

  if (def.type === TYPE_INT) {
    const n = Math.trunc(Number(s));
    if (!Number.isFinite(n))
      return { valid: false, error: `Expected an integer.` };
    // nullable ints allow 0 (disabled), otherwise enforce min >= 1
    const effectiveMin = def.nullable ? 0 : (def.min ?? 0);
    if (effectiveMin !== undefined && n < effectiveMin)
      return { valid: false, error: `Minimum value is ${effectiveMin}.` };
    if (def.max !== undefined && n > def.max)
      return { valid: false, error: `Maximum value is ${def.max}.` };
    return { valid: true, value: String(n) };
  }

  // TYPE_STRING
  if (def.nullable && s === "") return { valid: true, value: "" };
  if (s.length > 2000)
    return { valid: false, error: `Value is too long (max 2000 characters).` };
  return { valid: true, value: s };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Bootstrap the in-memory cache from the database.
 * Call this once after the DB is open (before the server starts serving).
 *
 * @param {Function} dbGetAll  – the `getAll` function from db.js (passed in to
 *                               avoid a circular import)
 */
export function loadSettings(dbGetAll) {
  const rows = dbGetAll("SELECT key, value FROM app_settings");
  for (const row of rows) {
    const def = DEFS_BY_KEY[String(row.key || "")];
    if (!def) continue;
    // Env var explicitly set → it always wins; skip the DB value.
    if (isEnvExplicitlySet(def)) continue;
    _cache[def.key] = coerce(def, row.value);
  }
  // For any key not yet cached, seed from env / hardcoded default.
  for (const def of SETTING_DEFS) {
    if (!(def.key in _cache)) {
      _cache[def.key] = resolveEnvDefault(def);
    }
  }
}

/**
 * Get a single typed setting value.
 * @param {string} key
 */
export function getSetting(key) {
  const def = DEFS_BY_KEY[key];
  if (!def) return undefined;
  // Env var explicitly present → always wins over DB.
  if (isEnvExplicitlySet(def)) return resolveEnvDefault(def);
  if (key in _cache) return _cache[key];
  return resolveEnvDefault(def);
}

/**
 * Persist a setting to the DB and update the in-memory cache.
 * Returns { ok: true } or { ok: false, error }.
 *
 * @param {string}   key
 * @param {string}   rawValue  – the raw string value (will be validated + coerced)
 * @param {Function} dbRun     – the `run` function from db.js
 * @param {Function} dbSave    – the `saveDatabase` function from db.js (adminSave)
 */
export function setSetting(key, rawValue, dbRun, dbSave) {
  const validation = validateSetting(key, rawValue);
  if (!validation.valid) return { ok: false, error: validation.error };

  dbRun(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, validation.value],
  );
  dbSave();

  const def = DEFS_BY_KEY[key];
  _cache[key] = coerce(def, validation.value);

  return { ok: true, value: _cache[key] };
}

/**
 * Persist multiple settings in one call.
 * Returns { ok: true, saved: [...keys] } or { ok: false, errors: { key: msg } }.
 *
 * @param {Object}   updates   – { key: rawValue, ... }
 * @param {Function} dbRun
 * @param {Function} dbSave
 */
export function setSettings(updates, dbRun, dbSave) {
  const errors = {};
  const saved = [];

  for (const [key, rawValue] of Object.entries(updates)) {
    const validation = validateSetting(key, rawValue);
    if (!validation.valid) {
      errors[key] = validation.error;
      continue;
    }
    dbRun(
      "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, validation.value],
    );
    const def = DEFS_BY_KEY[key];
    _cache[key] = coerce(def, validation.value);
    saved.push(key);
  }

  if (saved.length > 0) dbSave();

  if (Object.keys(errors).length > 0) return { ok: false, errors, saved };
  return { ok: true, saved };
}

/**
 * Returns the full settings snapshot for the admin panel.
 * Each entry includes: key, value, type, label, description, group,
 * defaultVal (env-resolved), restart, min, max.
 */
export function getAllSettings() {
  return SETTING_DEFS.map((def) => {
    const envLocked = isEnvExplicitlySet(def);
    const value = envLocked
      ? resolveEnvDefault(def)
      : (_cache[def.key] ?? resolveEnvDefault(def));
    return {
      key:         def.key,
      value,
      type:        def.type,
      label:       def.label,
      description: def.description,
      group:       def.group,
      defaultVal:  resolveEnvDefault(def),
      restart:     def.restart ?? false,
      nginxReload: def.nginxReload ?? false,
      nullable:    def.nullable ?? false,
      // envLocked: true means this key is set in .env and the DB value is ignored.
      // The admin panel should show the control as read-only.
      envLocked,
      ...(def.type === TYPE_INT ? { min: def.min, max: def.max } : {}),
    };
  });
}

/**
 * Reset a setting to its env/default value by removing it from the DB.
 * Returns { ok: true } or { ok: false, error }.
 */
export function resetSetting(key, dbRun, dbSave) {
  const def = DEFS_BY_KEY[key];
  if (!def) return { ok: false, error: `Unknown setting: ${key}` };

  dbRun("DELETE FROM app_settings WHERE key = ?", [key]);
  dbSave();
  _cache[key] = resolveEnvDefault(def);
  return { ok: true, value: _cache[key] };
}

export { DEFS_BY_KEY };

/**
 * remoteChannelSecrets.js
 *
 * Telegram credentials for the Remote Channel feature live OUTSIDE the
 * settings registry (`appSettings.js`) — they never appear in the Settings
 * tab and are only managed through the guided setup in Services (or .env).
 *
 * Precedence (highest → lowest):
 *   1. Env var explicitly set in the environment / .env file
 *   2. Value saved in the `app_settings` DB table by the setup flow
 *   3. Empty (unconfigured)
 *
 * Storage reuses the `app_settings` table via the generic db.js helpers, but
 * `loadSettings()` ignores unknown keys, so these rows stay invisible to the
 * settings system.
 */

export const TELEGRAM_API_ID_KEY = "REMOTE_CHANNEL_TELEGRAM_API_ID";
export const TELEGRAM_API_HASH_KEY = "REMOTE_CHANNEL_TELEGRAM_API_HASH";
export const TELEGRAM_SESSION_STRING_KEY =
  "REMOTE_CHANNEL_TELEGRAM_SESSION_STRING";

function readEnv(key) {
  const raw = process.env[key];
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

export function isEnvSecretSet(key) {
  return readEnv(key) !== "";
}

async function resolveMaybePromise(value) {
  return value && typeof value.then === "function" ? await value : value;
}

async function readStored(dbGetSetting, key) {
  if (typeof dbGetSetting !== "function") return "";
  const raw = await resolveMaybePromise(dbGetSetting(key));
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

/**
 * Resolve the effective Telegram credentials. Env vars win when set.
 * Returns { apiId, apiHash, sessionString, managedByEnv } — never logs values.
 */
export async function resolveTelegramSecrets({ dbGetSetting } = {}) {
  const apiIdEnv = readEnv(TELEGRAM_API_ID_KEY);
  const apiHashEnv = readEnv(TELEGRAM_API_HASH_KEY);
  const sessionEnv = readEnv(TELEGRAM_SESSION_STRING_KEY);
  const managedByEnv = {
    apiId: apiIdEnv !== "",
    apiHash: apiHashEnv !== "",
    sessionString: sessionEnv !== "",
  };
  const [apiIdStored, apiHashStored, sessionStored] = await Promise.all([
    managedByEnv.apiId ? "" : readStored(dbGetSetting, TELEGRAM_API_ID_KEY),
    managedByEnv.apiHash ? "" : readStored(dbGetSetting, TELEGRAM_API_HASH_KEY),
    managedByEnv.sessionString
      ? ""
      : readStored(dbGetSetting, TELEGRAM_SESSION_STRING_KEY),
  ]);
  return {
    apiId: Number(apiIdEnv || apiIdStored || 0) || 0,
    apiHash: apiHashEnv || apiHashStored,
    sessionString: sessionEnv || sessionStored,
    managedByEnv,
  };
}

/**
 * Persist credentials (DB only — env vars always win at read time).
 * Pass only the keys to write; omits the rest.
 * Returns true on success, false when persistence is unavailable — callers
 * must surface that instead of pretending the save worked.
 */
export async function saveTelegramSecrets(
  { dbSetSetting, dbSave } = {},
  { apiId, apiHash, sessionString } = {},
) {
  if (typeof dbSetSetting !== "function") return false;
  if (apiId !== undefined)
    await resolveMaybePromise(dbSetSetting(TELEGRAM_API_ID_KEY, String(apiId)));
  if (apiHash !== undefined)
    await resolveMaybePromise(dbSetSetting(TELEGRAM_API_HASH_KEY, apiHash));
  if (sessionString !== undefined)
    await resolveMaybePromise(
      dbSetSetting(TELEGRAM_SESSION_STRING_KEY, sessionString),
    );
  if (typeof dbSave === "function") await resolveMaybePromise(dbSave());
  return true;
}

/** Clear the stored session (disconnect). Env-provided sessions are untouched. */
export async function clearTelegramSession({ dbDeleteSetting, dbSave } = {}) {
  if (typeof dbDeleteSetting !== "function") return false;
  await resolveMaybePromise(dbDeleteSetting(TELEGRAM_SESSION_STRING_KEY));
  if (typeof dbSave === "function") await resolveMaybePromise(dbSave());
  return true;
}

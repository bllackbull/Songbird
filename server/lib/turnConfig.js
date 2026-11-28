/**
 * Runtime TURN configuration. Stored as unregistered keys in `app_settings`
 * via the generic db.js helpers, so the settings registry and Settings tab
 * never see them. Env vars always win (like remoteChannelSecrets.js).
 */
import { parseTurnEndpoint } from "./turnHealth.js";

const KEY_MAP = {
  stunUrl: "TURN_STUN_URL",
  turnUrl: "TURN_URL",
  username: "TURN_USERNAME",
  credential: "TURN_CREDENTIAL",
  tokenId: "TURN_TOKEN_ID",
  apiToken: "TURN_API_TOKEN",
};

export const TURN_KEYS = Object.values(KEY_MAP);
export const DEFAULT_STUN_URL = "stun:stun.l.google.com:19302";

function readEnv(key, env) {
  const raw = env?.[key];
  return raw === undefined || raw === null ? "" : String(raw).trim();
}

function resolveMaybePromise(value) {
  return value && typeof value.then === "function"
    ? value
    : Promise.resolve(value);
}

export async function resolveTurnConfig({
  dbGetSetting,
  env = process.env,
} = {}) {
  const config = {};
  const managedByEnv = {};
  for (const [field, key] of Object.entries(KEY_MAP)) {
    const fromEnv = readEnv(key, env);
    managedByEnv[field] = fromEnv !== "";
    const stored = fromEnv
      ? fromEnv
      : typeof dbGetSetting === "function"
        ? await resolveMaybePromise(dbGetSetting(key))
        : null;
    config[field] =
      stored === undefined || stored === null ? "" : String(stored).trim();
  }
  if (!config.stunUrl) config.stunUrl = DEFAULT_STUN_URL;
  return { ...config, managedByEnv };
}

export async function saveTurnConfig(
  { dbSetSetting, dbSave, dbDeleteSetting, env = process.env } = {},
  patch = {},
) {
  let changed = false;
  for (const [field, key] of Object.entries(KEY_MAP)) {
    if (!(field in patch) || readEnv(key, env) !== "") continue;
    const raw = patch[field];
    const value = raw === undefined || raw === null ? "" : String(raw).trim();
    if (value === "") {
      if (typeof dbDeleteSetting !== "function") return false;
      await resolveMaybePromise(dbDeleteSetting(key));
    } else {
      if (typeof dbSetSetting !== "function") return false;
      await resolveMaybePromise(dbSetSetting(key, value));
    }
    changed = true;
  }
  if (changed && typeof dbSave === "function")
    await resolveMaybePromise(dbSave());
  return true;
}

export function getTurnMode(config = {}) {
  if (config.tokenId && config.apiToken) return "cloudflare";
  if (config.turnUrl) return "self-hosted";
  return "stun-only";
}

export function validateTurnPatch(patch = {}, current = {}) {
  const effective = (field) => {
    const value = patch[field] === undefined ? current[field] : patch[field];
    return value === undefined || value === null ? "" : String(value).trim();
  };
  for (const [field, value] of Object.entries(patch)) {
    if (
      Object.prototype.hasOwnProperty.call(KEY_MAP, field) &&
      (value === undefined || value === null || String(value).trim() === "")
    ) {
      return {
        valid: false,
        error:
          "Blank values are not accepted. Use Clear to remove saved TURN settings.",
      };
    }
  }

  const [tokenId, apiToken] = [effective("tokenId"), effective("apiToken")];
  if ((tokenId || apiToken) && !(tokenId && apiToken)) {
    return {
      valid: false,
      error: "Both Cloudflare key ID and API token are required.",
    };
  }

  const [turnUrl, username, credential] = [
    effective("turnUrl"),
    effective("username"),
    effective("credential"),
  ];
  if (turnUrl || username || credential) {
    if (!(turnUrl && username && credential)) {
      return {
        valid: false,
        error: "TURN URL, username, and credential are required together.",
      };
    }
    if (!/^turns?:/i.test(turnUrl) || !parseTurnEndpoint(turnUrl)) {
      return {
        valid: false,
        error: "TURN URL must use the turn: or turns: scheme.",
      };
    }
  }

  const stunUrl = effective("stunUrl");
  if (stunUrl && !/^stuns?:/i.test(stunUrl)) {
    return {
      valid: false,
      error: "STUN URL must use the stun: or stuns: scheme.",
    };
  }
  return { valid: true };
}

export function toHealthEnv(config = {}) {
  return {
    TURN_TOKEN_ID: config.tokenId || "",
    TURN_API_TOKEN: config.apiToken || "",
    TURN_URL: config.turnUrl || "",
  };
}

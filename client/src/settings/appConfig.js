import { useEffect, useState } from "react";

const readEnvNumber = (key, fallback, options = {}) => {
  const keys = Array.isArray(key) ? key : [key];
  const raw = keys
    .map((name) => import.meta.env[name])
    .find((value) => value !== undefined && value !== null && value !== "");
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = options.integer ? Math.trunc(parsed) : parsed;
  if (options.min !== undefined && integer < options.min) return fallback;
  if (options.max !== undefined && integer > options.max) return fallback;
  return integer;
};

const readEnvBool = (key, fallback) => {
  const keys = Array.isArray(key) ? key : [key];
  const raw = keys
    .map((name) => import.meta.env[name])
    .find((value) => value !== undefined && value !== null && value !== "");
  if (raw === undefined || raw === null || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

export const APP_CONFIG = {
  // debugEnabled and accountCreationEnabled below are build-time defaults;
  // accountCreationEnabled is overridden live by App.jsx via setAppConfig()
  // once /api/app/info resolves (see setNameLimits.js pattern for why plain
  // mutation isn't enough for values rendered directly in JSX).
  debugEnabled: readEnvBool("APP_DEBUG", false),
  accountCreationEnabled: readEnvBool(["SIGN_UP", "ACCOUNT_CREATION"], true),
  messageMaxChars: readEnvNumber(["MESSAGE_MAX_CHARS", "MESSAGE_MAX"], 4000, {
    integer: true,
    min: 1,
    max: 20000,
  }),
};

// ─── Reactive live override for messageMaxChars ──────────────────────────────
//
// APP_CONFIG.messageMaxChars starts from the build-time env default so there's
// no flash of the wrong limit before the live value loads. App.jsx calls
// setMessageMaxChars() once it fetches /api/app/info, so admin-panel changes
// apply without a client rebuild.
//
// A plain mutation wouldn't trigger a React re-render for components already
// mounted that render this value in JSX (e.g. `maxLength={messageMaxChars}`),
// so we keep a tiny pub-sub store: setMessageMaxChars() notifies subscribers,
// and useMessageMaxChars() is the hook components use to read the value
// reactively. Code that only needs the value at call time (e.g. inside a
// submit handler) can keep reading APP_CONFIG.messageMaxChars directly.

const listeners = new Set();

export function setMessageMaxChars(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return;
  const truncated = Math.trunc(next);
  if (truncated === APP_CONFIG.messageMaxChars) return;
  APP_CONFIG.messageMaxChars = truncated;
  listeners.forEach((listener) => listener());
}

export function useMessageMaxChars() {
  const [value, setValue] = useState(APP_CONFIG.messageMaxChars);

  useEffect(() => {
    const onChange = () => setValue(APP_CONFIG.messageMaxChars);
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  return value;
}

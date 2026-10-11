import { useEffect, useState } from "react";

const readEnvNumber = (key, fallback, options = {}) => {
  const keys = Array.isArray(key) ? key : [key];
  const raw =
    typeof import.meta !== "undefined" && import.meta.env
      ? keys
          .map((name) => import.meta.env[name])
          .find((value) => value !== undefined && value !== null && value !== "")
      : undefined;
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = options.integer ? Math.trunc(parsed) : parsed;
  if (options.min !== undefined && integer < options.min) return fallback;
  if (options.max !== undefined && integer > options.max) return fallback;
  return integer;
};

// These start from the build-time env default so there's no flash of the
// wrong limit before the live value loads. App.jsx calls setNameLimits()
// once it fetches /api/app/info, so admin-panel changes apply without a
// client rebuild.
//
// Plain `let` exports would update in memory but wouldn't trigger a React
// re-render for components already mounted (ES module live bindings aren't
// reactive to React). So we keep a tiny pub-sub store: setNameLimits()
// notifies subscribers, and useNameLimits() is the hook components use to
// read the current value reactively. The plain NICKNAME_MAX/USERNAME_MAX
// exports remain for non-component code (e.g. validation inside handlers)
// that only needs the value at call time, not a reactive render.

const listeners = new Set();

export let NICKNAME_MAX = readEnvNumber(["NICKNAME_MAX_CHARS", "NICKNAME_MAX"], 24, {
  integer: true,
  min: 3,
  max: 64,
});
export let USERNAME_MAX = readEnvNumber(["USERNAME_MAX_CHARS", "USERNAME_MAX"], 16, {
  integer: true,
  min: 3,
  max: 32,
});

export function setNameLimits({ nicknameMax, usernameMax } = {}) {
  let changed = false;
  if (Number.isFinite(nicknameMax) && nicknameMax > 0 && nicknameMax !== NICKNAME_MAX) {
    NICKNAME_MAX = Math.trunc(nicknameMax);
    changed = true;
  }
  if (Number.isFinite(usernameMax) && usernameMax > 0 && usernameMax !== USERNAME_MAX) {
    USERNAME_MAX = Math.trunc(usernameMax);
    changed = true;
  }
  if (changed) {
    listeners.forEach((listener) => listener());
  }
}

/**
 * Reactive hook for components that render NICKNAME_MAX / USERNAME_MAX in
 * JSX (e.g. `{value.length}/{USERNAME_MAX}` or `maxLength={USERNAME_MAX}`).
 * Re-renders the component whenever setNameLimits() is called.
 */
export function useNameLimits() {
  const [limits, setLimits] = useState(() => ({
    nicknameMax: NICKNAME_MAX,
    usernameMax: USERNAME_MAX,
  }));

  useEffect(() => {
    const onChange = () => {
      setLimits({ nicknameMax: NICKNAME_MAX, usernameMax: USERNAME_MAX });
    };
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  return limits;
}

// Username must contain only lowercase letters, numbers, dots, and underscores,
export const USERNAME_REGEX = /^(?=.*[a-z0-9])[a-z0-9._]+$/;

// HTML input pattern attribute derived from the same rule (case-insensitive for
// browser-native validation, server enforces lowercase).
export const USERNAME_INPUT_PATTERN = "(?=.*[a-zA-Z0-9])[a-zA-Z0-9._]+";

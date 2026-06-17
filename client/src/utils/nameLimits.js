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

export const NICKNAME_MAX = readEnvNumber(["NICKNAME_MAX_CHARS", "NICKNAME_MAX"], 24, {
  integer: true,
  min: 3,
  max: 64,
});
export const USERNAME_MAX = readEnvNumber(["USERNAME_MAX_CHARS", "USERNAME_MAX"], 16, {
  integer: true,
  min: 3,
  max: 32,
});

// Username must contain only lowercase letters, numbers, dots, and underscores,
export const USERNAME_REGEX = /^(?=.*[a-z0-9])[a-z0-9._]+$/;

// HTML input pattern attribute derived from the same rule (case-insensitive for
// browser-native validation, server enforces lowercase).
export const USERNAME_INPUT_PATTERN = "(?=.*[a-zA-Z0-9])[a-zA-Z0-9._]+";

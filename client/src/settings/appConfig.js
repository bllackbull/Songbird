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
  const raw = import.meta.env[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

export const APP_CONFIG = {
  debugEnabled: readEnvBool("APP_DEBUG", false),
  accountCreationEnabled: readEnvBool("ACCOUNT_CREATION", true),
  messageMaxChars: readEnvNumber(["MESSAGE_MAX_CHARS", "MESSAGE_MAX"], 4000, {
    integer: true,
    min: 1,
    max: 20000,
  }),
};

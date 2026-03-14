function readEnvInt(keys, fallback, options = {}) {
  const names = Array.isArray(keys) ? keys : [keys];

  const raw = names
    .map((name) => process.env[name])
    .find((value) => value !== undefined && value !== null && value !== "");

  if (raw === undefined || raw === null || raw === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;

  const value = Math.trunc(parsed);

  if (options.min !== undefined && value < options.min) return fallback;
  if (options.max !== undefined && value > options.max) return fallback;

  return value;
}

function readEnvBool(keys, fallback) {
  const names = Array.isArray(keys) ? keys : [keys];

  const raw = names
    .map((name) => process.env[name])
    .find((value) => value !== undefined && value !== null && value !== "");

  if (raw === undefined || raw === null || raw === "") return fallback;

  const normalized = String(raw).trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;

  return fallback;
}

export { readEnvBool, readEnvInt };

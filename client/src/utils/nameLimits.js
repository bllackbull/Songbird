const readEnvNumber = (key, fallback, options = {}) => {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env[key]
      : undefined;
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = options.integer ? Math.trunc(parsed) : parsed;
  if (options.min !== undefined && integer < options.min) return fallback;
  if (options.max !== undefined && integer > options.max) return fallback;
  return integer;
};

export const NICKNAME_MAX = readEnvNumber("NICKNAME_MAX", 24, {
  integer: true,
  min: 3,
  max: 64,
});
export const USERNAME_MAX = readEnvNumber("USERNAME_MAX", 16, {
  integer: true,
  min: 3,
  max: 32,
});

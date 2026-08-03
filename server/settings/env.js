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

function readDbConfig() {
  const dbClient = (process.env.DB_CLIENT || "sqlite3").toLowerCase();
  return {
    client: ["postgres", "postgresql", "pg"].includes(dbClient) ? "postgres" : "sqlite3",
    postgres: {
      host: process.env.POSTGRES_HOST || "127.0.0.1",
      port: readEnvInt("POSTGRES_PORT", 5432, { min: 1, max: 65535 }),
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
      database: process.env.POSTGRES_DB || "songbird",
      url: process.env.POSTGRES_URL || null,
      ssl: readEnvBool("POSTGRES_SSL", false),
    },
  };
}

export { readEnvBool, readEnvInt, readDbConfig };

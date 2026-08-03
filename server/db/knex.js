import knex from "knex";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.resolve(serverDir, "..", "data"));
const dbPath = path.join(dataDir, "songbird.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export function createKnexInstance() {
  const dbClient = (process.env.DB_CLIENT || "sqlite3").toLowerCase();

  if (dbClient === "postgres" || dbClient === "postgresql" || dbClient === "pg") {
    const connection = process.env.POSTGRES_URL || {
      host: process.env.POSTGRES_HOST || "127.0.0.1",
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
      database: process.env.POSTGRES_DB || "songbird",
      ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false,
    };

    return knex({
      client: "pg",
      connection,
      pool: {
        min: Number(process.env.DB_POOL_MIN || 2),
        max: Number(process.env.DB_POOL_MAX || 10),
      },
      useNullAsDefault: true,
    });
  }

  // Default: SQLite3
  return knex({
    client: "sqlite3",
    connection: {
      filename: dbPath,
    },
    useNullAsDefault: true,
  });
}

export const dbKnex = createKnexInstance();

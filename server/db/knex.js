import knex from "knex";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

// node-pg returns BIGINT (int8) columns as strings by default, but "0" is
// truthy in JS, which breaks flag checks (e.g. users.banned, users.verified)
// and diverges from better-sqlite3, which returns numbers. Parse int8 as a
// Number so both drivers behave the same. All bigint values in this schema
// (flags, counts) are well within Number-safe range.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) =>
  value === null ? null : Number.parseInt(value, 10),
);

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..", "..");
const serverRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env"), quiet: true });
dotenv.config({ path: path.join(serverRootDir, ".env"), quiet: true });

const dataDir = path.resolve(
  process.env.DATA_DIR || path.resolve(projectRootDir, "data"),
);
const dbPath = path.join(dataDir, "songbird.db");

export function createKnexInstance() {
  const dbClient = (process.env.DB_CLIENT || "sqlite3").toLowerCase();

  if (
    dbClient === "postgres" ||
    dbClient === "postgresql" ||
    dbClient === "pg"
  ) {
    const connection = process.env.POSTGRES_URL || {
      host: process.env.POSTGRES_HOST || "127.0.0.1",
      port: Number(process.env.POSTGRES_PORT || 5432),
      user: process.env.POSTGRES_USER || "postgres",
      password: process.env.POSTGRES_PASSWORD || "postgres",
      database: process.env.POSTGRES_DB || "songbird",
      ssl:
        process.env.POSTGRES_SSL === "true"
          ? { rejectUnauthorized: false }
          : false,
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

  // Default: better-sqlite3
  return knex({
    client: "better-sqlite3",
    connection: {
      filename: dbPath,
    },
    useNullAsDefault: true,
  });
}

export const dbKnex = createKnexInstance();

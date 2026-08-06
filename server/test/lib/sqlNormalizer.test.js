import { describe, expect, test } from "vitest";
import { normalizeSqlForPostgres } from "../../lib/sqlNormalizer.js";

describe("normalizeSqlForPostgres", () => {
  test("replaces ? placeholders with $1, $2, $3", () => {
    const { sql, params } = normalizeSqlForPostgres(
      "SELECT * FROM users WHERE username = ? AND status = ?",
      ["alice", "active"]
    );
    expect(sql).toBe("SELECT * FROM users WHERE username = $1 AND status = $2");
    expect(params).toEqual(["alice", "active"]);
  });

  test("replaces INSERT OR IGNORE INTO with ON CONFLICT DO NOTHING", () => {
    const { sql } = normalizeSqlForPostgres(
      "INSERT OR IGNORE INTO users (username) VALUES (?)"
    );
    expect(sql).toContain("INSERT INTO users (username) VALUES ($1) ON CONFLICT DO NOTHING");
  });

  test("replaces datetime('now') with CURRENT_TIMESTAMP", () => {
    const { sql } = normalizeSqlForPostgres(
      "UPDATE users SET updated_at = datetime('now') WHERE id = ?"
    );
    expect(sql).toContain("CURRENT_TIMESTAMP");
  });

  test("replaces sqlite_master table checks with information_schema.tables", () => {
    const { sql } = normalizeSqlForPostgres(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    );
    expect(sql).toContain("information_schema.tables");
  });

  test("replaces AUTOINCREMENT with SERIAL PRIMARY KEY", () => {
    const { sql } = normalizeSqlForPostgres(
      "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT)"
    );
    expect(sql).toContain("SERIAL PRIMARY KEY");
  });

  test("replaces PRAGMA table_info with information_schema.columns query", () => {
    const { sql } = normalizeSqlForPostgres("PRAGMA table_info('users')");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("users");
  });

  test("replaces PRAGMA user_version with meta table query", () => {
    const { sql } = normalizeSqlForPostgres("PRAGMA user_version");
    expect(sql).toContain("SELECT value AS user_version FROM meta WHERE key = 'user_version'");
  });
});

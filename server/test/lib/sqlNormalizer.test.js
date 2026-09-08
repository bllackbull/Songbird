import { describe, expect, test } from "vitest";
import { normalizeSqlForPostgres } from "../../lib/sqlNormalizer.js";

describe("normalizeSqlForPostgres", () => {
  test("preserves ? placeholders for knex raw binding substitution", () => {
    const { sql, params } = normalizeSqlForPostgres(
      "SELECT * FROM users WHERE username = ? AND status = ?",
      ["alice", "active"]
    );
    expect(sql).toBe("SELECT * FROM users WHERE username = ? AND status = ?");
    expect(params).toEqual(["alice", "active"]);
  });

  test("replaces INSERT OR IGNORE INTO with ON CONFLICT DO NOTHING", () => {
    const { sql } = normalizeSqlForPostgres(
      "INSERT OR IGNORE INTO users (username) VALUES (?)"
    );
    expect(sql).toContain("INSERT INTO users (username) VALUES (?) ON CONFLICT DO NOTHING");
  });

  test("replaces datetime('now') with CURRENT_TIMESTAMP::text", () => {
    const { sql } = normalizeSqlForPostgres(
      "UPDATE users SET updated_at = datetime('now') WHERE id = ?"
    );
    expect(sql).toContain("CURRENT_TIMESTAMP::text");
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

  test("replaces datetime('now', '-7 days') with text-cast INTERVAL subtraction", () => {
    const { sql } = normalizeSqlForPostgres(
      "SELECT COUNT(*) FILTER (WHERE created_at >= datetime('now', '-7 days')) AS newUsers7d FROM users"
    );
    expect(sql).toContain("(CURRENT_TIMESTAMP - INTERVAL '7 days')::text");
    expect(sql).not.toContain("datetime");
  });

  test("replaces datetime('now', '-1 day') with text-cast INTERVAL subtraction", () => {
    const { sql } = normalizeSqlForPostgres(
      "SELECT COUNT(*) FILTER (WHERE created_at >= datetime('now', '-1 day')) AS messagesLast24h FROM chat_messages"
    );
    expect(sql).toContain("(CURRENT_TIMESTAMP - INTERVAL '1 day')::text");
    expect(sql).not.toContain("datetime");
  });
});

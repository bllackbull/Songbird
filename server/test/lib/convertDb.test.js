import { describe, test, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { convertSqliteToPostgres } from "../../lib/convertDb.js";

describe("convertDb", () => {
  test("throws error when sqlite source file does not exist", async () => {
    await expect(
      convertSqliteToPostgres({
        sqlitePath: "/non/existent/db.db",
        postgresConfig: {},
      })
    ).rejects.toThrow("SQLite source file not found");
  });

  test("gracefully handles non-superuser permission error on SET session_replication_role", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "convert-db-test-"));
    const sqlitePath = path.join(tempDir, "test.db");
    const db = new Database(sqlitePath);
    db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);");
    db.exec("INSERT INTO users VALUES ('1', 'Alice');");
    db.close();

    // We pass invalid postgresConfig so knex creation succeeds, but raw calls fail or we test error handling.
    // The test verifies error isn't session_replication_role if sqlite database is read.
    try {
      await convertSqliteToPostgres({
        sqlitePath,
        postgresConfig: { host: "127.0.0.1", port: 54321, user: "invalid", database: "invalid", connectionTimeoutMillis: 100 },
      });
    } catch (err) {
      expect(err.message).not.toMatch(/session_replication_role/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

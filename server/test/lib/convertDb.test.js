import { describe, test, expect } from "vitest";
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
});

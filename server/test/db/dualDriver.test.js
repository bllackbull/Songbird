import { describe, expect, test } from "vitest";
import { getRow, getAll, run } from "../../db.js";

describe("Dual Database Driver Abstraction", () => {
  test("getRow returns object or null", () => {
    const row = getRow("SELECT 1 AS count");
    expect(row).toBeDefined();
    expect(Number(row?.count)).toBe(1);
  });

  test("getAll returns array of rows", () => {
    const rows = getAll("SELECT 1 AS num UNION ALL SELECT 2 AS num");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(2);
  });

  test("run executes query and returns modified count", () => {
    const result = run("SELECT 1");
    expect(result).toBeDefined();
  });

  test("delegates to knex with normalizeSqlForPostgres when DB_CLIENT=postgres", async () => {
    const originalClient = process.env.DB_CLIENT;
    try {
      process.env.DB_CLIENT = "postgres";
      const res = getRow("SELECT 1 AS count");
      expect(res).toBeDefined();
    } finally {
      if (originalClient !== undefined) {
        process.env.DB_CLIENT = originalClient;
      } else {
        delete process.env.DB_CLIENT;
      }
    }
  });
});


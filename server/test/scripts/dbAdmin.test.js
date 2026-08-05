import { describe, expect, test, afterEach } from "vitest";
import { openDatabase } from "../../scripts/_db-admin.js";

describe("openDatabase Admin Utility", () => {
  let activeDb = null;

  afterEach(() => {
    if (activeDb) {
      try {
        activeDb.close();
      } catch {}
      activeDb = null;
    }
  });

  test("opens SQLite database by default and provides db API", async () => {
    activeDb = await openDatabase();
    expect(activeDb).toBeDefined();
    expect(typeof activeDb.getRow).toBe("function");
    expect(typeof activeDb.getAll).toBe("function");
    expect(typeof activeDb.run).toBe("function");
    expect(typeof activeDb.save).toBe("function");
    expect(typeof activeDb.close).toBe("function");

    const row = activeDb.getRow("SELECT 1 AS count");
    expect(row).toBeDefined();
    expect(Number(row?.count)).toBe(1);
  });

  test("supports DB_CLIENT=postgres mode", async () => {
    const originalClient = process.env.DB_CLIENT;
    try {
      process.env.DB_CLIENT = "postgres";
      activeDb = await openDatabase();
      expect(activeDb).toBeDefined();
      expect(typeof activeDb.getRow).toBe("function");

      const row = activeDb.getRow("SELECT 1 AS count");
      expect(row).toBeDefined();
    } finally {
      if (originalClient !== undefined) {
        process.env.DB_CLIENT = originalClient;
      } else {
        delete process.env.DB_CLIENT;
      }
    }
  });
});

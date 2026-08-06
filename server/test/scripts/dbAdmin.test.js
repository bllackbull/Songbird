import { describe, expect, test, afterEach, vi } from "vitest";
import { openDatabase } from "../../scripts/_db-admin.js";
import * as knexModule from "../../db/knex.js";

describe("openDatabase Admin Utility", () => {
  let activeDb = null;

  afterEach(() => {
    vi.restoreAllMocks();
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

  test("opens in-memory database when inMemory: true", async () => {
    activeDb = await openDatabase({ inMemory: true });
    expect(activeDb).toBeDefined();
    expect(typeof activeDb.getRow).toBe("function");
    expect(activeDb.getSchemaVersion()).toBeGreaterThan(0);

    const row = activeDb.getRow("SELECT 1 AS count");
    expect(Number(row?.count)).toBe(1);
  });

  test("opens unmigrated in-memory database when skipMigrations: true", async () => {
    activeDb = await openDatabase({ inMemory: true, skipMigrations: true });
    expect(activeDb).toBeDefined();
    expect(activeDb.getSchemaVersion()).toBe(0);
  });

  test("supports DB_CLIENT=postgres mode", async () => {
    const mockKnex = {
      raw: vi.fn(async (sql, params) => {
        if (typeof sql === "string" && sql.includes("user_version")) {
          return { rows: [{ user_version: 0 }] };
        }
        if (typeof sql === "string" && sql.includes("SELECT 1 AS count")) {
          return { rows: [{ count: 1 }] };
        }
        return { rows: [], rowCount: 0 };
      }),
      destroy: vi.fn(async () => {}),
      exec: vi.fn(async () => {}),
      client: { config: { client: "pg" } },
    };

    vi.spyOn(knexModule, "createKnexInstance").mockReturnValue(mockKnex);

    const originalClient = process.env.DB_CLIENT;
    try {
      process.env.DB_CLIENT = "postgres";
      activeDb = await openDatabase();
      expect(activeDb).toBeDefined();
      expect(typeof activeDb.getRow).toBe("function");

      const row = await activeDb.getRow("SELECT 1 AS count");
      expect(row).toBeDefined();
      expect(Number(row?.count)).toBe(1);
    } finally {
      if (originalClient !== undefined) {
        process.env.DB_CLIENT = originalClient;
      } else {
        delete process.env.DB_CLIENT;
      }
    }
  });
});

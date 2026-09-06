import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { openDatabase } from "../../scripts/_db-admin.js";
import * as knexModule from "../../db/knex.js";

describe("openDatabase Admin Utility", () => {
  let activeDb = null;
  let originalDbClient;

  beforeEach(() => {
    originalDbClient = process.env.DB_CLIENT;
    delete process.env.DB_CLIENT;
  });

  afterEach(async () => {
    if (activeDb) {
      try {
        await activeDb.close();
      } catch {}
      activeDb = null;
    }
    vi.restoreAllMocks();
    if (originalDbClient !== undefined) process.env.DB_CLIENT = originalDbClient;
    else delete process.env.DB_CLIENT;
  });

  test("opens SQLite database by default and provides db API", async () => {
    activeDb = await openDatabase();
    expect(activeDb).toBeDefined();
    expect(typeof activeDb.getRow).toBe("function");
    expect(typeof activeDb.getAll).toBe("function");
    expect(typeof activeDb.run).toBe("function");
    expect(typeof activeDb.save).toBe("function");
    expect(typeof activeDb.close).toBe("function");
    const row = await activeDb.getRow("SELECT 1 AS count");
    expect(Number(row?.count)).toBe(1);
  });

  test("opens in-memory database when inMemory: true", async () => {
    activeDb = await openDatabase({ inMemory: true });
    expect(await activeDb.getSchemaVersion()).toBeGreaterThan(0);
    const row = await activeDb.getRow("SELECT 1 AS count");
    expect(Number(row?.count)).toBe(1);
  });

  test("opens unmigrated in-memory database when skipMigrations: true", async () => {
    activeDb = await openDatabase({ inMemory: true, skipMigrations: true });
    expect(await activeDb.getSchemaVersion()).toBe(0);
  });

  test("creates SQLite DATA_DIR when openDatabase runs instead of on import", () => {
    const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "songbird-data-"));
    const dataDir = path.join(tempDataDir, "data");
    const dbAdminUrl = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../scripts/_db-admin.js")).href;
    const script = `
      import fs from "node:fs";
      import path from "node:path";
      const dataDir = process.env.DATA_DIR;
      const { openDatabase } = await import(${JSON.stringify(dbAdminUrl)});
      const createdOnImport = fs.existsSync(dataDir);
      const sqliteExistsOnImport = fs.existsSync(path.join(dataDir, "songbird.db"));
      const db = await openDatabase({ skipMigrations: true });
      const createdOnOpen = fs.existsSync(dataDir);
      const sqliteExistsOnOpen = fs.existsSync(path.join(dataDir, "songbird.db"));
      await db.close();
      process.stdout.write(JSON.stringify({ createdOnImport, sqliteExistsOnImport, createdOnOpen, sqliteExistsOnOpen }));
    `;
    try {
      const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
        encoding: "utf8", env: { ...process.env, DATA_DIR: dataDir, DB_CLIENT: "sqlite3" },
      }));
      expect(result).toEqual({ createdOnImport: false, sqliteExistsOnImport: false, createdOnOpen: true, sqliteExistsOnOpen: true });
    } finally {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }
  });

  test("uses the PostgreSQL knex client for SELECT 1 without creating songbird.db", async () => {
    const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "songbird-postgres-"));
    const sqliteDbPath = path.join(tempDataDir, "songbird.db");
    const mockKnex = {
      raw: vi.fn(async (sql) => {
        if (typeof sql === "string" && sql.includes("user_version")) return { rows: [{ user_version: 0 }] };
        if (typeof sql === "string" && sql.includes("SELECT 1 AS count")) return { rows: [{ count: 1 }] };
        return { rows: [], rowCount: 0 };
      }),
      destroy: vi.fn(async () => {}),
      exec: vi.fn(async () => {}),
      client: { config: { client: "pg" } },
    };
    const createKnexInstance = vi.spyOn(knexModule, "createKnexInstance").mockReturnValue(mockKnex);
    try {
      process.env.DB_CLIENT = "postgres";
      activeDb = await openDatabase({ dbPath: sqliteDbPath, skipMigrations: true });
      const row = await activeDb.getRow("SELECT 1 AS count");
      expect(Number(row?.count)).toBe(1);
      expect(createKnexInstance).toHaveBeenCalledTimes(1);
      expect(mockKnex.raw).toHaveBeenCalledWith("SELECT 1 AS count", []);
      expect(fs.existsSync(sqliteDbPath)).toBe(false);
    } finally {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }
  });

  test("opens PostgreSQL mode without creating its default SQLite database path", () => {
    const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "songbird-postgres-data-"));
    const dataDir = path.join(tempDataDir, "data");
    const mockKnexPath = path.join(tempDataDir, "mock-knex.mjs");
    const loaderPath = path.join(tempDataDir, "mock-knex-loader.mjs");
    const dbAdminUrl = pathToFileURL(path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../scripts/_db-admin.js")).href;
    const script = `
      import fs from "node:fs";
      import path from "node:path";
      const dataDir = process.env.DATA_DIR;
      const { openDatabase } = await import(${JSON.stringify(dbAdminUrl)});
      const db = await openDatabase({ skipMigrations: true });
      const result = { createdDataDir: fs.existsSync(dataDir), createdSqliteFile: fs.existsSync(path.join(dataDir, "songbird.db")) };
      await db.close();
      process.stdout.write(JSON.stringify(result));
    `;
    fs.writeFileSync(mockKnexPath, `export function createKnexInstance() { return { raw: async () => ({ rows: [] }), destroy: async () => {}, client: { config: { client: "pg" } } }; } export const dbKnex = createKnexInstance();`);
    fs.writeFileSync(loaderPath, `const mockKnexUrl = ${JSON.stringify(pathToFileURL(mockKnexPath).href)}; export async function resolve(specifier, context, nextResolve) { const result = await nextResolve(specifier, context); if (result.url.endsWith("/server/db/knex.js")) return { url: mockKnexUrl, shortCircuit: true }; return result; }`);
    try {
      const result = JSON.parse(execFileSync(process.execPath, ["--experimental-loader", loaderPath, "--input-type=module", "--eval", script], { encoding: "utf8", env: { ...process.env, DATA_DIR: dataDir, DB_CLIENT: "postgres" } }));
      expect(result).toEqual({ createdDataDir: true, createdSqliteFile: false });
    } finally {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }
  });

  test("unwraps PostgreSQL result wrappers returned in an array", async () => {
    const mockKnex = {
      raw: vi.fn(async (sql) => {
        if (typeof sql === "string" && sql.includes("user_version")) return [{ rows: [{ user_version: 0 }] }];
        if (typeof sql === "string" && sql.includes("SELECT 1 AS count")) return [{ rows: [{ count: 1 }] }];
        return [{ rows: [] }];
      }),
      destroy: vi.fn(async () => {}),
      exec: vi.fn(async () => {}),
      client: { config: { client: "pg" } },
    };
    vi.spyOn(knexModule, "createKnexInstance").mockReturnValue(mockKnex);
    process.env.DB_CLIENT = "postgres";
    activeDb = await openDatabase({ skipMigrations: true });
    await expect(activeDb.getAll("SELECT 1 AS count")).resolves.toEqual([{ count: 1 }]);
  });

  test("exposes a connection-bound transaction helper in PostgreSQL mode", async () => {
    const transaction = vi.fn(async (callback) => callback({
      raw: vi.fn(async () => ({ rowCount: 1, rows: [] })),
    }));
    const mockKnex = {
      raw: vi.fn(async () => ({ rows: [] })),
      transaction,
      destroy: vi.fn(async () => {}),
      client: { config: { client: "pg" } },
    };
    vi.spyOn(knexModule, "createKnexInstance").mockReturnValue(mockKnex);
    process.env.DB_CLIENT = "postgres";
    activeDb = await openDatabase({ skipMigrations: true });
    expect(typeof activeDb.transaction).toBe("function");
    await activeDb.transaction(async (trx) => {
      await trx.raw("UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?", [1]);
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

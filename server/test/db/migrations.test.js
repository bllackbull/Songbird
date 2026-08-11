import { describe, expect, test, afterEach } from "vitest";
import { createRawTestDb, createTestDb, migrations } from "./testDbHelper.js";

describe("Database Migrations Integration", () => {
  let activeDb = null;

  afterEach(() => {
    if (activeDb) {
      try {
        activeDb.close();
      } catch {}
      activeDb = null;
    }
  });

  test("applies all 36 migrations sequentially from version 0 to 36", async () => {
    activeDb = await createRawTestDb();
    expect(activeDb.getSchemaVersion()).toBe(0);

    const sortedMigrations = [...migrations].sort(
      (a, b) => a.version - b.version,
    );
    expect(sortedMigrations.length).toBe(36);

    let expectedVersion = 0;
    for (const migration of sortedMigrations) {
      await migration.up(activeDb.migrationContext);
      activeDb.setSchemaVersion(migration.version);
      expectedVersion = migration.version;
      expect(activeDb.getSchemaVersion()).toBe(expectedVersion);
    }

    expect(activeDb.getSchemaVersion()).toBe(36);
  });

  test("migration idempotency: running migrations twice on the same DB instance does not fail", async () => {
    activeDb = await createTestDb();
    const initialVersion = activeDb.getSchemaVersion();
    expect(initialVersion).toBe(36);

    const sortedMigrations = [...migrations].sort(
      (a, b) => a.version - b.version,
    );

    // Run all migration up functions a second time
    for (const migration of sortedMigrations) {
      await migration.up(activeDb.migrationContext);
    }

    expect(activeDb.getSchemaVersion()).toBe(36);
  });
});

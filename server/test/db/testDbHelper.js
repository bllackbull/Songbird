import { openDatabase } from "../../scripts/_db-admin.js";
import { migrations } from "../../migrations/index.js";

export async function createTestDb(options = {}) {
  return openDatabase({
    inMemory: true,
    skipMigrations: false,
    ...options,
  });
}

export async function createRawTestDb(options = {}) {
  return openDatabase({
    inMemory: true,
    skipMigrations: true,
    ...options,
  });
}

export { migrations };

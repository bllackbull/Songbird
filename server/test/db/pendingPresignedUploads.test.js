import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./testDbHelper.js";

describe("pending_presigned_uploads DB table and functions", () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    if (db) db.close();
  });

  test("migration 38 creates pending_presigned_uploads table", () => {
    const tableCheck = db.getRow(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='pending_presigned_uploads'",
    );
    expect(tableCheck).toBeDefined();
    expect(tableCheck.name).toBe("pending_presigned_uploads");
  });

  test("inserts row into pending_presigned_uploads", () => {
    const key = `uploads/${Date.now()}_test.png`;
    const nowIso = new Date().toISOString();
    db.run(
      "INSERT INTO pending_presigned_uploads (storage_key, user_id, created_at) VALUES (?, ?, ?)",
      [key, "user-123", nowIso],
    );

    const pending = db.getAll("SELECT * FROM pending_presigned_uploads WHERE storage_key = ?", [key]);
    expect(pending).toHaveLength(1);
    expect(pending[0].storage_key).toBe(key);
  });

  test("deletes recorded keys when claimed or pruned", () => {
    const key1 = `uploads/${Date.now()}_test1.png`;
    const key2 = `uploads/${Date.now()}_test2.png`;
    const nowIso = new Date().toISOString();

    db.run(
      "INSERT INTO pending_presigned_uploads (storage_key, user_id, created_at) VALUES (?, ?, ?)",
      [key1, "user-123", nowIso],
    );
    db.run(
      "INSERT INTO pending_presigned_uploads (storage_key, user_id, created_at) VALUES (?, ?, ?)",
      [key2, "user-123", nowIso],
    );

    db.run("DELETE FROM pending_presigned_uploads WHERE storage_key = ?", [key1]);

    const remaining = db.getAll("SELECT storage_key FROM pending_presigned_uploads");
    const keys = remaining.map((r) => r.storage_key);
    expect(keys).not.toContain(key1);
    expect(keys).toContain(key2);
  });

  test("supports created_at cutoff filtering for orphan pruning", () => {
    const oldKey = `uploads/old_test.png`;
    const newKey = `uploads/new_test.png`;
    const oldIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const newIso = new Date().toISOString();

    db.run(
      "INSERT INTO pending_presigned_uploads (storage_key, user_id, created_at) VALUES (?, ?, ?)",
      [oldKey, "user-123", oldIso],
    );
    db.run(
      "INSERT INTO pending_presigned_uploads (storage_key, user_id, created_at) VALUES (?, ?, ?)",
      [newKey, "user-123", newIso],
    );

    const cutoffIso = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const expired = db.getAll(
      "SELECT storage_key FROM pending_presigned_uploads WHERE created_at <= ?",
      [cutoffIso],
    );

    const expiredKeys = expired.map((r) => r.storage_key);
    expect(expiredKeys).toContain(oldKey);
    expect(expiredKeys).not.toContain(newKey);
  });
});

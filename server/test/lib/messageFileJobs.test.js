/**
 * Tests for retention logic in createMessageFileJobs.
 *
 * Retention settings (MESSAGE_FILE_RETENTION, MESSAGE_TEXT_RETENTION) are
 * pure server-side — they drive background cleanup jobs and the expires_at
 * timestamp stamped onto new messages. The client has no awareness of them.
 *
 * Key invariants tested here:
 * 1. computeExpiryIso returns null when retention is disabled (0).
 * 2. computeExpiryIso returns a valid ISO date offset by the correct number of
 *    days when retention is enabled.
 * 3. cleanupExpiredMessageFiles is a no-op when retention is disabled.
 * 4. The retention value is read live via getSetting() — changing it after
 *    the jobs object is created takes effect immediately (no restart needed).
 */
import { describe, test, expect, vi } from "vitest";
import { createMessageFileJobs } from "../../lib/messageFileJobs.js";

// ─── Minimal stub factory ─────────────────────────────────────────────────────

function makeJobs(retentionDays) {
  // Allow retentionDays to be mutated after construction so we can verify the
  // live-read behaviour without recreating the jobs object.
  const state = { retentionDays };

  return createMessageFileJobs({
    getSetting: (key) =>
      key === "MESSAGE_FILE_RETENTION" ? state.retentionDays : null,
    adminGetAll: () => [],
    adminGetRow: () => null,
    adminRun: () => {},
    adminSave: () => {},
    listMessageFilesByMessageIds: () => [],
    removeStoredFileNames: () => {},
    uploadRootDir: "/tmp/test",
    fs: { existsSync: () => true, rmSync: () => {}, mkdirSync: () => {} },
    path: { join: (...p) => p.join("/"), basename: (p) => p.split("/").pop() },
    state, // expose for mutation in tests
  });
}

// ─── computeExpiryIso ─────────────────────────────────────────────────────────

describe("computeExpiryIso — retention disabled (0)", () => {
  test("returns null when retention days is 0", () => {
    const { computeExpiryIso } = makeJobs(0);
    expect(computeExpiryIso(new Date())).toBeNull();
  });

  test("returns null when retention days is negative", () => {
    const { computeExpiryIso } = makeJobs(-5);
    expect(computeExpiryIso(new Date())).toBeNull();
  });
});

describe("computeExpiryIso — retention enabled", () => {
  test("returns an ISO string offset by the correct number of days", () => {
    const { computeExpiryIso } = makeJobs(7);
    const base = new Date("2024-01-01T00:00:00.000Z");
    const result = computeExpiryIso(base);
    expect(result).toBe("2024-01-08T00:00:00.000Z");
  });

  test("uses the days argument when explicitly provided", () => {
    const { computeExpiryIso } = makeJobs(7);
    const base = new Date("2024-03-01T00:00:00.000Z");
    // Override to 30 days — should ignore the 7 from getSetting.
    const result = computeExpiryIso(base, 30);
    expect(result).toBe("2024-03-31T00:00:00.000Z");
  });

  test("returns null when the explicit days argument is 0", () => {
    const { computeExpiryIso } = makeJobs(7);
    expect(computeExpiryIso(new Date(), 0)).toBeNull();
  });

  test("accepts an ISO string as the base date", () => {
    const { computeExpiryIso } = makeJobs(1);
    const result = computeExpiryIso("2024-06-15T12:00:00.000Z");
    expect(result).toBe("2024-06-16T12:00:00.000Z");
  });
});

// ─── Live setting read ────────────────────────────────────────────────────────

describe("computeExpiryIso — reads getSetting live (no restart required)", () => {
  test("reflects a retention change made after the jobs object was created", () => {
    const { computeExpiryIso, ...rest } = makeJobs(0);
    // Retention is off at creation time → null.
    expect(computeExpiryIso(new Date("2024-01-01T00:00:00.000Z"))).toBeNull();

    // Mutate the setting — simulates an admin-panel save.
    // We need to find the state object; it was passed as an extra dep we can
    // reach through the closure via the getSetting stub in makeJobs.
    // Re-create with the same state object to simulate in-place mutation.
    // (In production, getSetting() reads _cache which is updated by setSetting.)
    // We test this by creating a jobs instance whose getSetting reads a mutable cell.
    let days = 0;
    const { computeExpiryIso: live } = createMessageFileJobs({
      getSetting: () => days,
      adminGetAll: () => [],
      adminGetRow: () => null,
      adminRun: () => {},
      adminSave: () => {},
      listMessageFilesByMessageIds: () => [],
      removeStoredFileNames: () => {},
      uploadRootDir: "/tmp",
      fs: { existsSync: () => true },
      path: { join: (...p) => p.join("/"), basename: (p) => p },
    });

    // Initially disabled.
    expect(live(new Date("2024-01-01T00:00:00.000Z"))).toBeNull();

    // Admin enables retention to 14 days.
    days = 14;
    expect(live(new Date("2024-01-01T00:00:00.000Z"))).toBe(
      "2024-01-15T00:00:00.000Z",
    );

    // Admin disables retention again.
    days = 0;
    expect(live(new Date("2024-01-01T00:00:00.000Z"))).toBeNull();
  });
});

// ─── cleanupExpiredMessageFiles ───────────────────────────────────────────────

describe("cleanupExpiredMessageFiles — retention disabled", () => {
  test("returns zero counts without touching the DB when retention is 0", () => {
    let queryCalled = false;
    const jobs = createMessageFileJobs({
      getSetting: () => 0,
      adminGetAll: () => {
        queryCalled = true;
        return [];
      },
      adminGetRow: () => null,
      adminRun: () => {},
      adminSave: () => {},
      listMessageFilesByMessageIds: () => [],
      removeStoredFileNames: () => {},
      uploadRootDir: "/tmp",
      fs: { existsSync: () => true },
      path: { join: (...p) => p.join("/"), basename: (p) => p },
    });

    const result = jobs.cleanupExpiredMessageFiles();
    expect(result).toEqual({ removedMessages: 0, removedFiles: 0 });
    expect(queryCalled).toBe(false);
  });
});

// ─── backfillMessageFileExpiry ────────────────────────────────────────────────

describe("backfillMessageFileExpiry — retention disabled", () => {
  test("returns 0 without running any SQL when retention is 0", () => {
    let queryCalled = false;
    const jobs = createMessageFileJobs({
      getSetting: () => 0,
      adminGetAll: () => [],
      adminGetRow: () => {
        queryCalled = true;
        return { n: 0 };
      },
      adminRun: () => {},
      adminSave: () => {},
      listMessageFilesByMessageIds: () => [],
      removeStoredFileNames: () => {},
      uploadRootDir: "/tmp",
      fs: { existsSync: () => true },
      path: { join: (...p) => p.join("/"), basename: (p) => p },
    });

    const result = jobs.backfillMessageFileExpiry();
    expect(result).toBe(0);
    expect(queryCalled).toBe(false);
  });
});

// ─── cleanupMissingMessageFiles ───────────────────────────────────────────────

describe("cleanupMissingMessageFiles — remote storage must not be pruned", () => {
  const MESSAGE_ID = "d0d0d0d0-e1e1-4f2f-b040-171717171717";

  function makeJobsWithRows({ rows, adminRunSpy }) {
    return createMessageFileJobs({
      getSetting: () => 0,
      adminGetAll: (query) => {
        // Simulates the "all files for candidate messages" lookup.
        if (String(query?.toString?.() || "").includes("chat_message_files")) {
          return rows;
        }
        return [];
      },
      adminGetRow: () => null,
      adminRun: adminRunSpy,
      adminSave: () => {},
      listMessageFilesByMessageIds: () => rows,
      removeStoredFileNames: () => {},
      uploadRootDir: "/tmp/upload-root",
      fs: { existsSync: () => false },
      path: { join: (...p) => p.join("/"), basename: (p) => p },
    });
  }

  test("does not delete a remote-storage message when its local file is absent", () => {
    const adminRunSpy = vi.fn();
    const rows = [
      {
        id: 1,
        message_id: MESSAGE_ID,
        stored_name: "photo.png",
        storage_driver: "remote",
        storage_key: "uploads/photo.png",
      },
    ];

    const jobs = makeJobsWithRows({ rows, adminRunSpy });
    const result = jobs.cleanupMissingMessageFiles([MESSAGE_ID]);

    expect(result.changed).toBe(false);
    expect(adminRunSpy).not.toHaveBeenCalledWith(expect.stringContaining("DELETE"));
    expect(adminRunSpy).not.toHaveBeenCalled();
  });

  test("still deletes a local-storage message whose file is absent from disk", () => {
    const adminRunSpy = vi.fn();
    const rows = [
      {
        id: 2,
        message_id: MESSAGE_ID,
        stored_name: "doc.pdf",
        storage_driver: "local",
        storage_key: null,
      },
    ];

    const jobs = makeJobsWithRows({ rows, adminRunSpy });
    const result = jobs.cleanupMissingMessageFiles([MESSAGE_ID]);

    expect(result.changed).toBe(true);
    expect(adminRunSpy).toHaveBeenCalledWith("BEGIN");
  });
});

/**
 * Regression tests for nullable-int settings coerce + round-trip behaviour.
 *
 * Bug: coerce() applies the min-value clamp unconditionally, so saving "0"
 * (the disabled sentinel for a nullable int) snaps back to def.min (e.g. 1)
 * instead of being stored as 0.  The toggle therefore re-enables itself after
 * every save.
 *
 * Affected settings: MESSAGE_FILE_RETENTION, MESSAGE_TEXT_RETENTION (and any
 * future nullable int where min >= 1).
 */
import { describe, test, expect, beforeEach } from "vitest";
import {
  validateSetting,
  setSetting,
  getSetting,
  getAllSettings,
  loadSettings,
  resetSetting,
} from "../../lib/appSettings.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Minimal in-memory DB stubs — enough to exercise setSetting / resetSetting
// without a real SQLite instance.
function makeDbStubs() {
  const rows = new Map(); // key → raw string value
  return {
    dbRun: (sql, params) => {
      if (/INSERT INTO app_settings/i.test(sql)) {
        rows.set(params[0], params[1]);
      } else if (/DELETE FROM app_settings/i.test(sql)) {
        rows.delete(params[0]);
      }
    },
    dbSave: () => {},
    // Seed loadSettings with whatever is currently in rows.
    dbGetAll: () => [...rows.entries()].map(([key, value]) => ({ key, value })),
    rows,
  };
}

// Re-seed the module-level _cache by calling loadSettings with the stub.
// We need a fresh state before each test.
beforeEach(() => {
  const { dbGetAll } = makeDbStubs();
  loadSettings(dbGetAll); // resets _cache to env/default values
});

// ─── validateSetting — nullable int accepts 0 ─────────────────────────────────

describe("validateSetting — nullable int boundary at 0", () => {
  test("MESSAGE_FILE_RETENTION: accepts '0' (disabled)", () => {
    const r = validateSetting("MESSAGE_FILE_RETENTION", "0");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("0");
  });

  test("MESSAGE_TEXT_RETENTION: accepts '0' (disabled)", () => {
    const r = validateSetting("MESSAGE_TEXT_RETENTION", "0");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("0");
  });

  test("MESSAGE_FILE_RETENTION: rejects negative values", () => {
    const r = validateSetting("MESSAGE_FILE_RETENTION", "-1");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/minimum/i);
  });

  test("MESSAGE_FILE_RETENTION: accepts a positive value", () => {
    const r = validateSetting("MESSAGE_FILE_RETENTION", "14");
    expect(r.valid).toBe(true);
    expect(r.value).toBe("14");
  });
});

// ─── setSetting — nullable int stored and retrieved as 0 ─────────────────────
//
// This is the core regression test.  Before the fix, setSetting("…", "0")
// would coerce 0 → def.min (1), so getSetting returned 1 instead of 0.

describe("setSetting — nullable int coercion keeps 0 as 0", () => {
  test("MESSAGE_FILE_RETENTION: setSetting('0') → getSetting returns 0", () => {
    const { dbRun, dbSave } = makeDbStubs();
    const result = setSetting("MESSAGE_FILE_RETENTION", "0", dbRun, dbSave);
    expect(result.ok).toBe(true);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(0);
  });

  test("MESSAGE_TEXT_RETENTION: setSetting('0') → getSetting returns 0", () => {
    const { dbRun, dbSave } = makeDbStubs();
    const result = setSetting("MESSAGE_TEXT_RETENTION", "0", dbRun, dbSave);
    expect(result.ok).toBe(true);
    expect(getSetting("MESSAGE_TEXT_RETENTION")).toBe(0);
  });

  test("MESSAGE_FILE_RETENTION: setSetting('30') → getSetting returns 30", () => {
    const { dbRun, dbSave } = makeDbStubs();
    setSetting("MESSAGE_FILE_RETENTION", "30", dbRun, dbSave);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(30);
  });
});

// ─── getAllSettings — value field reflects 0 correctly ────────────────────────
//
// The SettingsTab uses getAllSettings() (returned from PUT /api/admin/settings)
// to update its local `settings` array.  If value comes back as 1 instead of 0
// the toggle snaps back on.

describe("getAllSettings — nullable int value is 0 after saving 0", () => {
  test("MESSAGE_FILE_RETENTION: value is 0 after setSetting('0')", () => {
    const { dbRun, dbSave } = makeDbStubs();
    setSetting("MESSAGE_FILE_RETENTION", "0", dbRun, dbSave);
    const all = getAllSettings();
    const def = all.find((d) => d.key === "MESSAGE_FILE_RETENTION");
    expect(def).toBeDefined();
    expect(def.value).toBe(0);
  });

  test("MESSAGE_TEXT_RETENTION: value is 0 after setSetting('0')", () => {
    const { dbRun, dbSave } = makeDbStubs();
    setSetting("MESSAGE_TEXT_RETENTION", "0", dbRun, dbSave);
    const all = getAllSettings();
    const def = all.find((d) => d.key === "MESSAGE_TEXT_RETENTION");
    expect(def).toBeDefined();
    expect(def.value).toBe(0);
  });

  test("MESSAGE_FILE_RETENTION: value round-trips through enable → disable", () => {
    const { dbRun, dbSave } = makeDbStubs();
    // Enable with 14 days
    setSetting("MESSAGE_FILE_RETENTION", "14", dbRun, dbSave);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(14);
    // Disable (set to 0)
    setSetting("MESSAGE_FILE_RETENTION", "0", dbRun, dbSave);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(0);
    const all = getAllSettings();
    const def = all.find((d) => d.key === "MESSAGE_FILE_RETENTION");
    expect(def.value).toBe(0);
  });
});

// ─── Non-nullable int settings are unaffected ─────────────────────────────────
//
// Ensure the fix doesn't accidentally allow 0 for settings like
// FILE_UPLOAD_MAX_SIZE_MB (min=1, NOT nullable) which must still reject 0.

describe("non-nullable int settings still reject 0", () => {
  test("FILE_UPLOAD_MAX_SIZE_MB: validateSetting rejects '0'", () => {
    const r = validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "0");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/minimum/i);
  });

  test("FILE_UPLOAD_MAX_FILES: validateSetting rejects '0'", () => {
    const r = validateSetting("FILE_UPLOAD_MAX_FILES", "0");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/minimum/i);
  });

  test("CHAT_MESSAGE_FETCH_LIMIT: validateSetting rejects '0'", () => {
    const r = validateSetting("CHAT_MESSAGE_FETCH_LIMIT", "0");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/minimum/i);
  });

  test("MESSAGE_MAX_CHARS: validateSetting rejects '0'", () => {
    const r = validateSetting("MESSAGE_MAX_CHARS", "0");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/minimum/i);
  });
});

// ─── resetSetting restores the correct default ───────────────────────────────

describe("resetSetting — restores nullable int defaults", () => {
  test("MESSAGE_FILE_RETENTION resets to defaultVal (7)", () => {
    const { dbRun, dbSave } = makeDbStubs();
    setSetting("MESSAGE_FILE_RETENTION", "0", dbRun, dbSave);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(0);
    resetSetting("MESSAGE_FILE_RETENTION", dbRun, dbSave);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(7);
  });

  test("MESSAGE_TEXT_RETENTION resets to defaultVal (0)", () => {
    const { dbRun, dbSave } = makeDbStubs();
    setSetting("MESSAGE_TEXT_RETENTION", "30", dbRun, dbSave);
    expect(getSetting("MESSAGE_TEXT_RETENTION")).toBe(30);
    resetSetting("MESSAGE_TEXT_RETENTION", dbRun, dbSave);
    expect(getSetting("MESSAGE_TEXT_RETENTION")).toBe(0);
  });
});

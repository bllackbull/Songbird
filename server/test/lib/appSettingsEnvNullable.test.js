/**
 * Regression tests for nullable-int env-var resolution.
 *
 * Bug: resolveEnvDefault() passes def.min/max to readEnvInt() unconditionally.
 * For nullable int settings (e.g. MESSAGE_FILE_RETENTION, min=1), setting the
 * env var to "0" causes readEnvInt to treat 0 as out-of-range and silently
 * fall back to defaultVal (7), so retention can never be disabled via .env.
 *
 * The same min-clamp bug existed in coerce() and was already fixed — this
 * file covers the parallel path in resolveEnvDefault() / getSetting().
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  getSetting,
  getAllSettings,
  loadSettings,
} from "../../lib/appSettings.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let savedEnv;
beforeEach(() => {
  savedEnv = { ...process.env };
  // Always start from a clean cache state (no DB overrides).
  loadSettings(() => []);
});
afterEach(() => {
  process.env = savedEnv;
});

// ─── Core regression: nullable int = 0 in env is respected ───────────────────

describe("getSetting — nullable int with env var = 0", () => {
  test("MESSAGE_FILE_RETENTION=0 in env → getSetting returns 0, not default (7)", () => {
    process.env.MESSAGE_FILE_RETENTION = "0";
    loadSettings(() => []); // re-seed cache with env in effect
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(0);
  });

  test("MESSAGE_TEXT_RETENTION=0 in env → getSetting returns 0, not default (0) — no regression", () => {
    // defaultVal is already 0, so this also exercises the no-regression path
    process.env.MESSAGE_TEXT_RETENTION = "0";
    loadSettings(() => []);
    expect(getSetting("MESSAGE_TEXT_RETENTION")).toBe(0);
  });

  test("MESSAGE_FILE_RETENTION=14 in env → getSetting returns 14", () => {
    process.env.MESSAGE_FILE_RETENTION = "14";
    loadSettings(() => []);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(14);
  });

  test("MESSAGE_FILE_RETENTION unset → getSetting returns defaultVal (7)", () => {
    delete process.env.MESSAGE_FILE_RETENTION;
    loadSettings(() => []);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(7);
  });
});

// ─── getAllSettings reflects the correct value ────────────────────────────────

describe("getAllSettings — nullable int env var = 0 reflected in value field", () => {
  test("value is 0 when MESSAGE_FILE_RETENTION=0 in env", () => {
    process.env.MESSAGE_FILE_RETENTION = "0";
    loadSettings(() => []);
    const all = getAllSettings();
    const def = all.find((d) => d.key === "MESSAGE_FILE_RETENTION");
    expect(def).toBeDefined();
    expect(def.value).toBe(0);
    expect(def.envLocked).toBe(true);
  });

  test("value is 14 when MESSAGE_FILE_RETENTION=14 in env", () => {
    process.env.MESSAGE_FILE_RETENTION = "14";
    loadSettings(() => []);
    const all = getAllSettings();
    const def = all.find((d) => d.key === "MESSAGE_FILE_RETENTION");
    expect(def.value).toBe(14);
  });
});

// ─── Env var takes priority over DB value ─────────────────────────────────────

describe("getSetting — env var overrides DB for nullable int", () => {
  test("MESSAGE_FILE_RETENTION=0 in env wins over DB value of 30", () => {
    process.env.MESSAGE_FILE_RETENTION = "0";
    // Simulate a DB row saying 30
    loadSettings(() => [{ key: "MESSAGE_FILE_RETENTION", value: "30" }]);
    // isEnvExplicitlySet → true → env wins
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(0);
  });

  test("MESSAGE_FILE_RETENTION=5 in env wins over DB value of 30", () => {
    process.env.MESSAGE_FILE_RETENTION = "5";
    loadSettings(() => [{ key: "MESSAGE_FILE_RETENTION", value: "30" }]);
    expect(getSetting("MESSAGE_FILE_RETENTION")).toBe(5);
  });
});

// ─── Non-nullable int env vars still respect min/max ─────────────────────────

describe("getSetting — non-nullable int env vars still reject out-of-range 0", () => {
  test("FILE_UPLOAD_MAX_SIZE_MB=0 falls back to defaultVal (25)", () => {
    process.env.FILE_UPLOAD_MAX_SIZE_MB = "0";
    loadSettings(() => []);
    // min=1, not nullable → 0 is out-of-range → should fall back to 25
    expect(getSetting("FILE_UPLOAD_MAX_SIZE_MB")).toBe(25);
  });

  test("FILE_UPLOAD_MAX_FILES=0 falls back to defaultVal (10)", () => {
    process.env.FILE_UPLOAD_MAX_FILES = "0";
    loadSettings(() => []);
    expect(getSetting("FILE_UPLOAD_MAX_FILES")).toBe(10);
  });

  test("MESSAGE_MAX_CHARS=0 falls back to defaultVal (4000)", () => {
    process.env.MESSAGE_MAX_CHARS = "0";
    loadSettings(() => []);
    expect(getSetting("MESSAGE_MAX_CHARS")).toBe(4000);
  });

  test("CHAT_MESSAGE_FETCH_LIMIT=0 falls back to defaultVal (60)", () => {
    process.env.CHAT_MESSAGE_FETCH_LIMIT = "0";
    loadSettings(() => []);
    expect(getSetting("CHAT_MESSAGE_FETCH_LIMIT")).toBe(60);
  });
});

// ─── Bool settings unaffected ─────────────────────────────────────────────────

describe("getSetting — bool env vars correctly handle false-like values", () => {
  test("FILE_UPLOAD=0 in env → getSetting returns false", () => {
    process.env.FILE_UPLOAD = "0";
    loadSettings(() => []);
    expect(getSetting("FILE_UPLOAD")).toBe(false);
  });

  test("FILE_UPLOAD=false in env → getSetting returns false", () => {
    process.env.FILE_UPLOAD = "false";
    loadSettings(() => []);
    expect(getSetting("FILE_UPLOAD")).toBe(false);
  });

  test("SIGN_UP=0 in env → getSetting returns false", () => {
    process.env.SIGN_UP = "0";
    loadSettings(() => []);
    expect(getSetting("SIGN_UP")).toBe(false);
  });
});

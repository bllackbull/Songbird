/**
 * Tests for setChatPageConfig — the function App.jsx calls after fetching
 * /api/app/info to apply live server settings over the build-time env defaults.
 *
 * Every setting that the admin panel can change and that has a client-side
 * effect must be covered here to prevent regressions where a new setting is
 * added to the server but forgotten in setChatPageConfig / App.jsx.
 */
import { describe, test, expect, beforeEach } from "vitest";
import {
  CHAT_PAGE_CONFIG,
  setChatPageConfig,
} from "../../src/settings/chatPageConfig.js";

const MB = 1024 * 1024;

// Capture the build-time defaults once so we can restore them between tests.
const ORIGINAL = { ...CHAT_PAGE_CONFIG };

beforeEach(() => {
  // Restore every key to its original build-time value before each test so
  // tests are fully isolated regardless of execution order.
  Object.assign(CHAT_PAGE_CONFIG, ORIGINAL);
});

// ─── File uploads ─────────────────────────────────────────────────────────────

describe("setChatPageConfig — fileUploadEnabled", () => {
  test("applies false from server response", () => {
    setChatPageConfig({ fileUploadEnabled: false });
    expect(CHAT_PAGE_CONFIG.fileUploadEnabled).toBe(false);
  });

  test("applies true from server response", () => {
    // First disable it, then re-enable via a fresh server response.
    CHAT_PAGE_CONFIG.fileUploadEnabled = false;
    setChatPageConfig({ fileUploadEnabled: true });
    expect(CHAT_PAGE_CONFIG.fileUploadEnabled).toBe(true);
  });

  test("ignores non-boolean values", () => {
    const before = CHAT_PAGE_CONFIG.fileUploadEnabled;
    setChatPageConfig({ fileUploadEnabled: "false" });
    expect(CHAT_PAGE_CONFIG.fileUploadEnabled).toBe(before);
  });
});

describe("setChatPageConfig — fileUploadMaxFiles", () => {
  test("applies a custom value from server response", () => {
    setChatPageConfig({ fileUploadMaxFiles: 3 });
    expect(CHAT_PAGE_CONFIG.maxFilesPerMessage).toBe(3);
  });

  test("truncates to integer", () => {
    setChatPageConfig({ fileUploadMaxFiles: 7.9 });
    expect(CHAT_PAGE_CONFIG.maxFilesPerMessage).toBe(7);
  });

  test("ignores zero or negative values", () => {
    const before = CHAT_PAGE_CONFIG.maxFilesPerMessage;
    setChatPageConfig({ fileUploadMaxFiles: 0 });
    expect(CHAT_PAGE_CONFIG.maxFilesPerMessage).toBe(before);
    setChatPageConfig({ fileUploadMaxFiles: -1 });
    expect(CHAT_PAGE_CONFIG.maxFilesPerMessage).toBe(before);
  });
});

describe("setChatPageConfig — fileUploadMaxSizeMb", () => {
  test("converts MB to bytes", () => {
    setChatPageConfig({ fileUploadMaxSizeMb: 50 });
    expect(CHAT_PAGE_CONFIG.maxFileSizeBytes).toBe(50 * MB);
  });

  test("truncates fractional MB before converting", () => {
    setChatPageConfig({ fileUploadMaxSizeMb: 10.7 });
    expect(CHAT_PAGE_CONFIG.maxFileSizeBytes).toBe(10 * MB);
  });

  test("ignores zero or negative values", () => {
    const before = CHAT_PAGE_CONFIG.maxFileSizeBytes;
    setChatPageConfig({ fileUploadMaxSizeMb: 0 });
    expect(CHAT_PAGE_CONFIG.maxFileSizeBytes).toBe(before);
  });
});

describe("setChatPageConfig — fileUploadMaxTotalSizeMb", () => {
  test("converts MB to bytes", () => {
    setChatPageConfig({ fileUploadMaxTotalSizeMb: 200 });
    expect(CHAT_PAGE_CONFIG.maxTotalUploadBytes).toBe(200 * MB);
  });

  test("truncates fractional MB before converting", () => {
    setChatPageConfig({ fileUploadMaxTotalSizeMb: 99.5 });
    expect(CHAT_PAGE_CONFIG.maxTotalUploadBytes).toBe(99 * MB);
  });

  test("ignores zero or negative values", () => {
    const before = CHAT_PAGE_CONFIG.maxTotalUploadBytes;
    setChatPageConfig({ fileUploadMaxTotalSizeMb: 0 });
    expect(CHAT_PAGE_CONFIG.maxTotalUploadBytes).toBe(before);
  });
});

// ─── Client behaviour ────────────────────────────────────────────────────────

describe("setChatPageConfig — messageFetchLimit", () => {
  test("applies a custom value", () => {
    setChatPageConfig({ messageFetchLimit: 30 });
    expect(CHAT_PAGE_CONFIG.messageFetchLimit).toBe(30);
  });

  test("truncates to integer", () => {
    setChatPageConfig({ messageFetchLimit: 45.8 });
    expect(CHAT_PAGE_CONFIG.messageFetchLimit).toBe(45);
  });

  test("ignores zero or negative values", () => {
    const before = CHAT_PAGE_CONFIG.messageFetchLimit;
    setChatPageConfig({ messageFetchLimit: 0 });
    expect(CHAT_PAGE_CONFIG.messageFetchLimit).toBe(before);
  });
});

describe("setChatPageConfig — messagePageSize", () => {
  test("applies a custom value", () => {
    setChatPageConfig({ messagePageSize: 20 });
    expect(CHAT_PAGE_CONFIG.messagePageSize).toBe(20);
  });

  test("truncates to integer", () => {
    setChatPageConfig({ messagePageSize: 25.6 });
    expect(CHAT_PAGE_CONFIG.messagePageSize).toBe(25);
  });

  test("ignores zero or negative values", () => {
    const before = CHAT_PAGE_CONFIG.messagePageSize;
    setChatPageConfig({ messagePageSize: 0 });
    expect(CHAT_PAGE_CONFIG.messagePageSize).toBe(before);
  });
});

describe("setChatPageConfig — cacheTtlHours", () => {
  test("converts hours to milliseconds", () => {
    setChatPageConfig({ cacheTtlHours: 48 });
    expect(CHAT_PAGE_CONFIG.cacheTtlMs).toBe(48 * 60 * 60 * 1000);
  });

  test("truncates fractional hours before converting", () => {
    setChatPageConfig({ cacheTtlHours: 12.9 });
    expect(CHAT_PAGE_CONFIG.cacheTtlMs).toBe(12 * 60 * 60 * 1000);
  });

  test("ignores zero or negative values", () => {
    const before = CHAT_PAGE_CONFIG.cacheTtlMs;
    setChatPageConfig({ cacheTtlHours: 0 });
    expect(CHAT_PAGE_CONFIG.cacheTtlMs).toBe(before);
  });
});

// ─── No-op on missing / undefined fields ─────────────────────────────────────

describe("setChatPageConfig — partial payloads leave untouched fields unchanged", () => {
  test("only updating fileUploadEnabled does not change other fields", () => {
    const beforeFetch = CHAT_PAGE_CONFIG.messageFetchLimit;
    const beforeFiles = CHAT_PAGE_CONFIG.maxFilesPerMessage;
    setChatPageConfig({ fileUploadEnabled: false });
    expect(CHAT_PAGE_CONFIG.messageFetchLimit).toBe(beforeFetch);
    expect(CHAT_PAGE_CONFIG.maxFilesPerMessage).toBe(beforeFiles);
  });

  test("calling with empty object leaves everything unchanged", () => {
    const snapshot = { ...CHAT_PAGE_CONFIG };
    setChatPageConfig({});
    expect(CHAT_PAGE_CONFIG).toEqual(snapshot);
  });

  test("calling with no argument leaves everything unchanged", () => {
    const snapshot = { ...CHAT_PAGE_CONFIG };
    setChatPageConfig();
    expect(CHAT_PAGE_CONFIG).toEqual(snapshot);
  });
});

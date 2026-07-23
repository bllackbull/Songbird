import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { validateSetting } from "../../lib/appSettings.js";

let originalEnv;
beforeEach(() => {
  originalEnv = { ...process.env };
});
afterEach(() => {
  process.env = originalEnv;
});

describe("validateSetting — unknown key", () => {
  test("returns invalid for an unrecognised key", () => {
    const result = validateSetting("NO_SUCH_KEY", "true");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unknown setting/i);
  });
});

describe("validateSetting — bool settings", () => {
  const truthy = ["1", "true", "True", "TRUE", "yes", "Yes", "on", "On"];
  const falsy = ["0", "false", "False", "no", "No", "off", "Off"];

  for (const val of truthy) {
    test(`accepts truthy value "${val}" for SIGN_UP`, () => {
      const result = validateSetting("SIGN_UP", val);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(val);
    });
  }

  for (const val of falsy) {
    test(`accepts falsy value "${val}" for SIGN_UP`, () => {
      const result = validateSetting("SIGN_UP", val);
      expect(result.valid).toBe(true);
    });
  }

  test("rejects a non-boolean value", () => {
    const result = validateSetting("SIGN_UP", "maybe");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/boolean/i);
  });
});

describe("validateSetting — int settings", () => {
  test("accepts a valid integer within range", () => {
    const result = validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "50");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("50");
  });

  test("rejects a non-numeric value", () => {
    const result = validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "big");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/integer/i);
  });

  test("rejects a value below min", () => {
    // FILE_UPLOAD_MAX_SIZE_MB min = 1
    const result = validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "0");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/minimum/i);
  });

  test("rejects a value above max", () => {
    // FILE_UPLOAD_MAX_SIZE_MB max = 2048
    const result = validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "9999");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/maximum/i);
  });

  test("accepts a value exactly at the min boundary", () => {
    const result = validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "1");
    expect(result.valid).toBe(true);
  });

  test("accepts a value exactly at the max boundary", () => {
    const result = validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "2048");
    expect(result.valid).toBe(true);
  });

  test("truncates float to integer", () => {
    const result = validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "10.9");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("10");
  });
});

describe("validateSetting — nullable int settings", () => {
  test("accepts 0 for a nullable int (disabled state)", () => {
    // MESSAGE_FILE_RETENTION is nullable
    const result = validateSetting("MESSAGE_FILE_RETENTION", "0");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("0");
  });

  test("accepts a positive value for a nullable int", () => {
    const result = validateSetting("MESSAGE_FILE_RETENTION", "30");
    expect(result.valid).toBe(true);
  });
});

describe("validateSetting — string settings", () => {
  test("accepts any non-empty string", () => {
    const result = validateSetting(
      "PUSH_PROXY_URL",
      "http://proxy.example.com",
    );
    expect(result.valid).toBe(true);
    expect(result.value).toBe("http://proxy.example.com");
  });

  test("accepts empty string for a nullable string setting", () => {
    // PUSH_PROXY_URL is nullable
    const result = validateSetting("PUSH_PROXY_URL", "");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("");
  });

  test("rejects a string longer than 2000 characters", () => {
    const result = validateSetting("PUSH_PROXY_URL", "x".repeat(2001));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too long/i);
  });

  test("accepts a string of exactly 2000 characters", () => {
    const result = validateSetting("PUSH_PROXY_URL", "x".repeat(2000));
    expect(result.valid).toBe(true);
  });
});

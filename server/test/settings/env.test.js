import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { readEnvBool, readEnvInt, parseEnv } from "../../settings/env.js";

// Save and restore process.env around each test.
let originalEnv;
beforeEach(() => {
  originalEnv = { ...process.env };
});
afterEach(() => {
  process.env = originalEnv;
});

describe("readEnvInt", () => {
  test("returns the parsed integer when the env var is set", () => {
    process.env.TEST_PORT = "8080";
    expect(readEnvInt("TEST_PORT", 3000)).toBe(8080);
  });

  test("returns the fallback when the env var is missing", () => {
    delete process.env.TEST_PORT;
    expect(readEnvInt("TEST_PORT", 3000)).toBe(3000);
  });

  test("returns the fallback when the env var is an empty string", () => {
    process.env.TEST_PORT = "";
    expect(readEnvInt("TEST_PORT", 3000)).toBe(3000);
  });

  test("returns the fallback for non-numeric values", () => {
    process.env.TEST_PORT = "abc";
    expect(readEnvInt("TEST_PORT", 3000)).toBe(3000);
  });

  test("truncates floating-point values", () => {
    process.env.TEST_INT = "9.9";
    expect(readEnvInt("TEST_INT", 0)).toBe(9);
  });

  test("respects min option — falls back when value is below min", () => {
    process.env.TEST_INT = "5";
    expect(readEnvInt("TEST_INT", 10, { min: 10 })).toBe(10);
  });

  test("respects max option — falls back when value exceeds max", () => {
    process.env.TEST_INT = "500";
    expect(readEnvInt("TEST_INT", 100, { max: 100 })).toBe(100);
  });

  test("accepts value exactly at min boundary", () => {
    process.env.TEST_INT = "10";
    expect(readEnvInt("TEST_INT", 0, { min: 10 })).toBe(10);
  });

  test("accepts value exactly at max boundary", () => {
    process.env.TEST_INT = "100";
    expect(readEnvInt("TEST_INT", 0, { max: 100 })).toBe(100);
  });

  test("picks the first defined key from an array of keys", () => {
    delete process.env.KEY_A;
    process.env.KEY_B = "42";
    expect(readEnvInt(["KEY_A", "KEY_B"], 0)).toBe(42);
  });

  test("skips undefined keys in the array and uses the first defined one", () => {
    process.env.KEY_A = "7";
    process.env.KEY_B = "99";
    expect(readEnvInt(["KEY_A", "KEY_B"], 0)).toBe(7);
  });
});

describe("readEnvBool", () => {
  const truthy = [
    "1",
    "true",
    "True",
    "TRUE",
    "yes",
    "Yes",
    "YES",
    "y",
    "Y",
    "on",
    "On",
    "ON",
  ];
  const falsy = [
    "0",
    "false",
    "False",
    "FALSE",
    "no",
    "No",
    "NO",
    "n",
    "N",
    "off",
    "Off",
    "OFF",
  ];

  for (const val of truthy) {
    test(`returns true for "${val}"`, () => {
      process.env.TEST_FLAG = val;
      expect(readEnvBool("TEST_FLAG", false)).toBe(true);
    });
  }

  for (const val of falsy) {
    test(`returns false for "${val}"`, () => {
      process.env.TEST_FLAG = val;
      expect(readEnvBool("TEST_FLAG", true)).toBe(false);
    });
  }

  test("returns the fallback when the env var is missing", () => {
    delete process.env.TEST_FLAG;
    expect(readEnvBool("TEST_FLAG", true)).toBe(true);
    expect(readEnvBool("TEST_FLAG", false)).toBe(false);
  });

  test("returns the fallback for unrecognized values", () => {
    process.env.TEST_FLAG = "maybe";
    expect(readEnvBool("TEST_FLAG", true)).toBe(true);
  });

  test("returns the fallback for an empty string", () => {
    process.env.TEST_FLAG = "";
    expect(readEnvBool("TEST_FLAG", true)).toBe(true);
  });

  test("picks the first defined key from an array of keys", () => {
    delete process.env.FLAG_A;
    process.env.FLAG_B = "true";
    expect(readEnvBool(["FLAG_A", "FLAG_B"], false)).toBe(true);
  });
});

describe("parseEnv", () => {
  test("parses WS_HEARTBEAT_INTERVAL_MS and WS_HEARTBEAT_TIMEOUT_MS with defaults", () => {
    delete process.env.WS_HEARTBEAT_INTERVAL_MS;
    delete process.env.WS_HEARTBEAT_TIMEOUT_MS;
    const env = parseEnv();
    expect(env.wsHeartbeatIntervalMs).toBe(30000);
    expect(env.wsHeartbeatTimeoutMs).toBe(10000);
  });

  test("parses custom WS_HEARTBEAT_INTERVAL_MS and WS_HEARTBEAT_TIMEOUT_MS values", () => {
    process.env.WS_HEARTBEAT_INTERVAL_MS = "15000";
    process.env.WS_HEARTBEAT_TIMEOUT_MS = "5000";
    const env = parseEnv();
    expect(env.wsHeartbeatIntervalMs).toBe(15000);
    expect(env.wsHeartbeatTimeoutMs).toBe(5000);
  });
});

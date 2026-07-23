import { describe, bench } from "vitest";
import { validateSetting } from "../../lib/appSettings.js";
import {
  normalizeHexColor,
  parseListValue,
  normalizeGroupUsername,
} from "../../lib/dbToolHelpers.js";
import { readEnvBool, readEnvInt } from "../../settings/env.js";

// ─── validateSetting ──────────────────────────────────────────────────────────
// Called on every settings read/write in the admin panel.

describe("validateSetting", () => {
  bench("bool — valid truthy value", () => {
    validateSetting("SIGN_UP", "true");
  });

  bench("bool — invalid value", () => {
    validateSetting("SIGN_UP", "maybe");
  });

  bench("int — valid in-range value", () => {
    validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "50");
  });

  bench("int — value below min (rejection path)", () => {
    validateSetting("FILE_UPLOAD_MAX_SIZE_MB", "0");
  });

  bench("string — valid URL", () => {
    validateSetting("PUSH_PROXY_URL", "http://proxy.example.com:8080");
  });

  bench("unknown key (early-exit path)", () => {
    validateSetting("NO_SUCH_KEY", "value");
  });
});

// ─── normalizeHexColor ────────────────────────────────────────────────────────
// Called when saving user/group colors.

describe("normalizeHexColor", () => {
  bench("valid 6-char hex with #", () => {
    normalizeHexColor("#10b981");
  });

  bench("valid 6-char hex without #", () => {
    normalizeHexColor("10b981");
  });

  bench("3-char shorthand expansion", () => {
    normalizeHexColor("#f0a");
  });

  bench("invalid input (null path)", () => {
    normalizeHexColor("not-a-color");
  });
});

// ─── parseListValue ───────────────────────────────────────────────────────────
// Used when parsing CLI member lists.

describe("parseListValue", () => {
  bench("comma-separated list", () => {
    parseListValue("alice,bob,carol,dave");
  });

  bench("space-separated list", () => {
    parseListValue("alice bob carol dave");
  });

  bench("empty string", () => {
    parseListValue("");
  });
});

// ─── normalizeGroupUsername ───────────────────────────────────────────────────

describe("normalizeGroupUsername", () => {
  bench("plain username", () => {
    normalizeGroupUsername("MyGroup");
  });

  bench("@ prefixed", () => {
    normalizeGroupUsername("@my_group");
  });
});

// ─── readEnvInt / readEnvBool ─────────────────────────────────────────────────
// Called at startup for every env var, and during hot reload.

describe("readEnvInt", () => {
  bench("env var present and valid", () => {
    process.env._BENCH_INT = "8080";
    readEnvInt("_BENCH_INT", 3000);
  });

  bench("env var absent (fallback path)", () => {
    delete process.env._BENCH_INT;
    readEnvInt("_BENCH_INT", 3000);
  });

  bench("array of keys, first defined", () => {
    process.env._BENCH_B = "42";
    readEnvInt(["_BENCH_A", "_BENCH_B"], 0);
  });
});

describe("readEnvBool", () => {
  bench("truthy value", () => {
    process.env._BENCH_BOOL = "true";
    readEnvBool("_BENCH_BOOL", false);
  });

  bench("falsy value", () => {
    process.env._BENCH_BOOL = "false";
    readEnvBool("_BENCH_BOOL", true);
  });

  bench("env var absent (fallback path)", () => {
    delete process.env._BENCH_BOOL;
    readEnvBool("_BENCH_BOOL", false);
  });
});

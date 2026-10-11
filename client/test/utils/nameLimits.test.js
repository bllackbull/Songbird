import { describe, test, expect, beforeEach } from "vitest";
import { USERNAME_REGEX, setNameLimits } from "../../src/utils/nameLimits.js";

describe("USERNAME_REGEX", () => {
  const valid = [
    "alice",
    "alice.smith",
    "alice_smith",
    "user123",
    "a1b2c3",
    "1user",
    "user.name_123",
  ];

  const invalid = [
    "",
    "...", // no alphanumeric
    "___", // no alphanumeric
    "Alice", // uppercase
    "alice smith", // space
    "alice@smith", // @ symbol
    "alice-smith", // hyphen
  ];

  for (const name of valid) {
    test(`matches valid username "${name}"`, () => {
      expect(USERNAME_REGEX.test(name)).toBe(true);
    });
  }

  for (const name of invalid) {
    test(`rejects invalid username "${name}"`, () => {
      expect(USERNAME_REGEX.test(name)).toBe(false);
    });
  }
});

describe("setNameLimits", () => {
  // Capture original values so we can restore them after each test
  let originalNickname;
  let originalUsername;

  beforeEach(async () => {
    // Re-import to get current live binding values
    const mod = await import("../../src/utils/nameLimits.js");
    originalNickname = mod.NICKNAME_MAX;
    originalUsername = mod.USERNAME_MAX;
  });

  test("updates NICKNAME_MAX when a valid value is provided", async () => {
    setNameLimits({ nicknameMax: 30 });
    const mod = await import("../../src/utils/nameLimits.js");
    expect(mod.NICKNAME_MAX).toBe(30);
    // Restore
    setNameLimits({ nicknameMax: originalNickname });
  });

  test("updates USERNAME_MAX when a valid value is provided", async () => {
    setNameLimits({ usernameMax: 20 });
    const mod = await import("../../src/utils/nameLimits.js");
    expect(mod.USERNAME_MAX).toBe(20);
    // Restore
    setNameLimits({ usernameMax: originalUsername });
  });

  test("ignores non-finite values", async () => {
    const mod = await import("../../src/utils/nameLimits.js");
    const before = mod.NICKNAME_MAX;
    setNameLimits({ nicknameMax: NaN });
    expect(mod.NICKNAME_MAX).toBe(before);
  });

  test("ignores zero or negative values", async () => {
    const mod = await import("../../src/utils/nameLimits.js");
    const before = mod.USERNAME_MAX;
    setNameLimits({ usernameMax: 0 });
    setNameLimits({ usernameMax: -5 });
    expect(mod.USERNAME_MAX).toBe(before);
  });

  test("truncates fractional values", async () => {
    setNameLimits({ nicknameMax: 28.9 });
    const mod = await import("../../src/utils/nameLimits.js");
    expect(mod.NICKNAME_MAX).toBe(28);
    setNameLimits({ nicknameMax: originalNickname });
  });
});

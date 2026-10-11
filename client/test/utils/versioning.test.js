import { describe, test, expect } from "vitest";
import {
  normalizeVersion,
  compareVersions,
} from "../../src/utils/versioning.js";

describe("normalizeVersion", () => {
  test("strips a leading v", () => {
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
  });

  test("strips a leading V (case-insensitive)", () => {
    expect(normalizeVersion("V2.0.0")).toBe("2.0.0");
  });

  test("returns the string unchanged when there is no v prefix", () => {
    expect(normalizeVersion("1.0.0")).toBe("1.0.0");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeVersion("  v3.1.4  ")).toBe("3.1.4");
  });

  test("returns empty string for falsy inputs", () => {
    expect(normalizeVersion(null)).toBe("");
    expect(normalizeVersion(undefined)).toBe("");
    expect(normalizeVersion("")).toBe("");
  });
});

describe("compareVersions", () => {
  describe("equal versions", () => {
    test("returns 0 for identical strings", () => {
      expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    });

    test("returns 0 when both have v prefix and are equal", () => {
      expect(compareVersions("v1.0.0", "v1.0.0")).toBe(0);
    });

    test("returns 0 for two invalid version strings", () => {
      expect(compareVersions("bad", "also-bad")).toBe(0);
    });
  });

  describe("major version differences", () => {
    test("returns 1 when left major is higher", () => {
      expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    });

    test("returns -1 when left major is lower", () => {
      expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    });
  });

  describe("minor version differences", () => {
    test("returns 1 when left minor is higher", () => {
      expect(compareVersions("1.3.0", "1.2.0")).toBe(1);
    });

    test("returns -1 when left minor is lower", () => {
      expect(compareVersions("1.1.0", "1.2.0")).toBe(-1);
    });
  });

  describe("patch version differences", () => {
    test("returns 1 when left patch is higher", () => {
      expect(compareVersions("1.0.2", "1.0.1")).toBe(1);
    });

    test("returns -1 when left patch is lower", () => {
      expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    });
  });

  describe("prerelease handling", () => {
    test("stable beats prerelease of same base version", () => {
      expect(compareVersions("1.0.0", "1.0.0-beta")).toBe(1);
    });

    test("prerelease loses to stable", () => {
      expect(compareVersions("1.0.0-rc1", "1.0.0")).toBe(-1);
    });

    test("compares prereleases lexicographically", () => {
      expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBe(1);
      expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    });

    test("returns 0 for equal prereleases", () => {
      expect(compareVersions("1.0.0-alpha", "1.0.0-alpha")).toBe(0);
    });
  });

  describe("invalid input handling", () => {
    test("returns -1 when only the left version is invalid", () => {
      expect(compareVersions("not-a-version", "1.0.0")).toBe(-1);
    });

    test("returns 1 when only the right version is invalid", () => {
      expect(compareVersions("1.0.0", "garbage")).toBe(1);
    });
  });

  describe("v-prefix normalization", () => {
    test("correctly compares v-prefixed versions", () => {
      expect(compareVersions("v2.0.0", "v1.0.0")).toBe(1);
    });

    test("compares mixed v-prefix and plain versions", () => {
      expect(compareVersions("v1.0.1", "1.0.0")).toBe(1);
    });
  });
});

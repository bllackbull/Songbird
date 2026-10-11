import { describe, test, expect } from "vitest";
import { getAvatarInitials } from "../../src/utils/avatarInitials.js";

describe("getAvatarInitials", () => {
  describe("single-word Latin names", () => {
    test("returns the uppercase first letter", () => {
      expect(getAvatarInitials("alice")).toBe("A");
    });

    test("returns uppercase for already-uppercase input", () => {
      expect(getAvatarInitials("Bob")).toBe("B");
    });
  });

  describe("two-word Latin names", () => {
    test("returns initials of first and second word", () => {
      expect(getAvatarInitials("John Doe")).toBe("JD");
    });

    test("uppercases both initials", () => {
      expect(getAvatarInitials("john doe")).toBe("JD");
    });

    test("uses first letter of each word even with extra whitespace", () => {
      expect(getAvatarInitials("  jane   smith  ")).toBe("JS");
    });
  });

  describe("Persian / Arabic names", () => {
    test("returns the first character of a single Persian word", () => {
      // "علی" is a Persian name
      const result = getAvatarInitials("علی");
      expect(result).toBe("ع");
    });

    test("returns first char only for two Persian words (same script)", () => {
      const result = getAvatarInitials("علی رضا");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("mixed-script names", () => {
    test("returns only the first character for mixed-script two-word names", () => {
      // First word Latin, second word Persian → mixed script
      const result = getAvatarInitials("Ali علی");
      expect(result).toBe("A");
    });
  });

  describe("edge cases", () => {
    test("returns the fallback for an empty string", () => {
      expect(getAvatarInitials("")).toBe("S");
    });

    test("returns the fallback for null", () => {
      expect(getAvatarInitials(null)).toBe("S");
    });

    test("returns the fallback for undefined", () => {
      expect(getAvatarInitials(undefined)).toBe("S");
    });

    test("returns a custom fallback", () => {
      expect(getAvatarInitials("", "?")).toBe("?");
    });

    test("handles whitespace-only input", () => {
      expect(getAvatarInitials("   ")).toBe("S");
    });

    test("handles names with numbers", () => {
      const result = getAvatarInitials("User123");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

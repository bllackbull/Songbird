import { describe, test, expect } from "vitest";
import { generateUuid, isValidUuid } from "../../lib/uuidUtils.js";

describe("uuidUtils", () => {
  describe("generateUuid", () => {
    test("returns a valid UUID string matching v4 pattern", () => {
      const uuid = generateUuid();
      expect(typeof uuid).toBe("string");
      expect(isValidUuid(uuid)).toBe(true);
      expect(uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    test("generates unique UUIDs across multiple calls", () => {
      const count = 100;
      const set = new Set(Array.from({ length: count }, () => generateUuid()));
      expect(set.size).toBe(count);
    });
  });

  describe("isValidUuid", () => {
    test("returns true for valid UUID v4 strings in various casings", () => {
      expect(isValidUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
      expect(isValidUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
      expect(isValidUuid("123e4567-E89b-12D3-a456-426614174000")).toBe(true);
      expect(isValidUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
      expect(isValidUuid("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(true);
    });

    test("returns true for valid UUID with surrounding whitespace", () => {
      expect(isValidUuid("  123e4567-e89b-12d3-a456-426614174000  ")).toBe(true);
      expect(isValidUuid("\t123e4567-e89b-12d3-a456-426614174000\n")).toBe(true);
    });

    test("returns false for non-string or empty inputs", () => {
      expect(isValidUuid("")).toBe(false);
      expect(isValidUuid("   ")).toBe(false);
      expect(isValidUuid(null)).toBe(false);
      expect(isValidUuid(undefined)).toBe(false);
      expect(isValidUuid(12345)).toBe(false);
      expect(isValidUuid({})).toBe(false);
      expect(isValidUuid([])).toBe(false);
      expect(isValidUuid(true)).toBe(false);
    });

    test("returns false for invalid or malformed strings", () => {
      expect(isValidUuid("invalid-uuid-string")).toBe(false);
      expect(isValidUuid("12345")).toBe(false);
      // Missing hyphens
      expect(isValidUuid("123e4567e89b12d3a456426614174000")).toBe(false);
      // Extra characters / wrong segment lengths
      expect(isValidUuid("123e4567-e89b-12d3-a456-4266141740000")).toBe(false);
      expect(isValidUuid("123e45670-e89b-12d3-a456-426614174000")).toBe(false);
      // Non-hex characters
      expect(isValidUuid("123e4567-e89b-12d3-a456-42661417400g")).toBe(false);
      expect(isValidUuid("g23e4567-e89b-12d3-a456-426614174000")).toBe(false);
      // Extra hyphens
      expect(isValidUuid("123e4567--e89b-12d3-a456-426614174000")).toBe(false);
      // Prefix/suffix attached
      expect(isValidUuid("id:123e4567-e89b-12d3-a456-426614174000")).toBe(false);
      expect(isValidUuid("123e4567-e89b-12d3-a456-426614174000-extra")).toBe(false);
    });
  });
});

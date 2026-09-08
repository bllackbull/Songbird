import { describe, test, expect } from "vitest";
import { normalizeUuid, isValidUuid } from "../../src/utils/uuidUtils.js";

describe("normalizeUuid", () => {
  test("returns canonical lowercase form for a valid UUID", () => {
    expect(normalizeUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("lowercases uppercase UUIDs", () => {
    expect(normalizeUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("handles mixed-case UUIDs", () => {
    expect(normalizeUuid("550e8400-E29B-41d4-A716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("trims leading and trailing whitespace", () => {
    expect(normalizeUuid("  550e8400-e29b-41d4-a716-446655440000  ")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("trims tabs and newlines", () => {
    expect(normalizeUuid("\t550e8400-e29b-41d4-a716-446655440000\n")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  test("returns null for null input", () => {
    expect(normalizeUuid(null)).toBeNull();
  });

  test("returns null for undefined input", () => {
    expect(normalizeUuid(undefined)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(normalizeUuid("")).toBeNull();
  });

  test("returns null for whitespace-only string", () => {
    expect(normalizeUuid("   ")).toBeNull();
  });

  test("returns null for non-string values", () => {
    expect(normalizeUuid(12345)).toBeNull();
    expect(normalizeUuid({})).toBeNull();
    expect(normalizeUuid([])).toBeNull();
    expect(normalizeUuid(true)).toBeNull();
  });

  test("returns null for UUID without hyphens", () => {
    expect(normalizeUuid("550e8400e29b41d4a716446655440000")).toBeNull();
  });

  test("returns null for a string with wrong segment lengths", () => {
    expect(normalizeUuid("550e840-0e29b-41d4-a716-446655440000")).toBeNull();
  });

  test("returns null for a string with non-hex characters", () => {
    expect(normalizeUuid("550e8400-e29b-41d4-a716-44665544000g")).toBeNull();
  });

  test("returns null for a string that is too short", () => {
    expect(normalizeUuid("550e8400-e29b-41d4-a716")).toBeNull();
  });

  test("returns null for a string that is too long", () => {
    expect(
      normalizeUuid("550e8400-e29b-41d4-a716-446655440000-extra"),
    ).toBeNull();
  });
});

describe("isValidUuid", () => {
  test("returns true for a valid lowercase UUID", () => {
    expect(isValidUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  test("returns true for a valid uppercase UUID", () => {
    expect(isValidUuid("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  test("returns true for a UUID with leading/trailing whitespace", () => {
    expect(isValidUuid("  550e8400-e29b-41d4-a716-446655440000  ")).toBe(true);
  });

  test("returns false for null", () => {
    expect(isValidUuid(null)).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isValidUuid("")).toBe(false);
  });

  test("returns false for a non-UUID string", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
  });

  test("returns false for a numeric value", () => {
    expect(isValidUuid(42)).toBe(false);
  });

  test("returns false for UUID without hyphens", () => {
    expect(isValidUuid("550e8400e29b41d4a716446655440000")).toBe(false);
  });
});

import { describe, test, expect } from "vitest";
import { generateUuid, isValidUuid } from "../../lib/uuidUtils.js";

describe("uuidUtils", () => {
  test("generateUuid returns a valid UUID v4 format string", () => {
    const uuid = generateUuid();
    expect(typeof uuid).toBe("string");
    expect(isValidUuid(uuid)).toBe(true);
  });

  test("isValidUuid correctly identifies valid and invalid UUIDs", () => {
    expect(isValidUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(isValidUuid("invalid-uuid-string")).toBe(false);
    expect(isValidUuid("12345")).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
  });
});

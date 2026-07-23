import { describe, test, expect } from "vitest";
import { hasPersian } from "../../src/utils/fontUtils.js";

describe("hasPersian", () => {
  test("returns true for a Persian string", () => {
    expect(hasPersian("سلام")).toBe(true);
  });

  test("returns true for a string containing at least one Persian character", () => {
    expect(hasPersian("Hello علی")).toBe(true);
  });

  test("returns true for Arabic characters (same Unicode block)", () => {
    expect(hasPersian("مرحبا")).toBe(true);
  });

  test("returns false for a Latin-only string", () => {
    expect(hasPersian("Hello World")).toBe(false);
  });

  test("returns false for a numeric string", () => {
    expect(hasPersian("12345")).toBe(false);
  });

  test("returns false for an empty string", () => {
    expect(hasPersian("")).toBe(false);
  });

  test("returns false for null", () => {
    expect(hasPersian(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(hasPersian(undefined)).toBe(false);
  });

  test("returns false for punctuation and symbols", () => {
    expect(hasPersian("!@#$%^&*()")).toBe(false);
  });
});

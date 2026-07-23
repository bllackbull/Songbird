import { describe, test, expect } from "vitest";
import {
  getAvatarTextColor,
  getAvatarStyle,
  getRandomAvatarColor,
  USER_COLORS,
} from "../../src/utils/avatarColor.js";

describe("getAvatarTextColor", () => {
  test("returns dark text for a bright color (luminance > 0.56)", () => {
    // white (#ffffff) has luminance = 1
    expect(getAvatarTextColor("#ffffff")).toBe("#0f172a");
  });

  test("returns light text for a dark color (luminance <= 0.56)", () => {
    // black (#000000) has luminance = 0
    expect(getAvatarTextColor("#000000")).toBe("#ffffff");
  });

  test("returns light text for a medium-dark green", () => {
    expect(getAvatarTextColor("#10b981")).toBe("#ffffff");
  });

  test("returns white for an invalid color", () => {
    expect(getAvatarTextColor("")).toBe("#ffffff");
    expect(getAvatarTextColor(null)).toBe("#ffffff");
    expect(getAvatarTextColor("notacolor")).toBe("#ffffff");
  });

  test("handles hex without # prefix as valid (implementation strips # then reads 6 chars)", () => {
    // 'ffffff' → after strip becomes 'ffffff', length 6, parses as valid white → dark text
    expect(getAvatarTextColor("ffffff")).toBe("#0f172a");
  });
});

describe("getAvatarStyle", () => {
  test("returns backgroundColor and color properties", () => {
    const style = getAvatarStyle("#10b981");
    expect(style).toHaveProperty("backgroundColor", "#10b981");
    expect(style).toHaveProperty("color");
  });

  test("uses the fallback color when backgroundColor is falsy", () => {
    const style = getAvatarStyle(null, "#ef4444");
    expect(style.backgroundColor).toBe("#ef4444");
  });

  test("defaults to #10b981 fallback when no fallback is given", () => {
    const style = getAvatarStyle(undefined);
    expect(style.backgroundColor).toBe("#10b981");
  });

  test("uses provided backgroundColor over fallback", () => {
    const style = getAvatarStyle("#8b5cf6", "#10b981");
    expect(style.backgroundColor).toBe("#8b5cf6");
  });
});

describe("getRandomAvatarColor", () => {
  test("returns a value from the USER_COLORS palette", () => {
    for (let i = 0; i < 20; i++) {
      expect(USER_COLORS).toContain(getRandomAvatarColor());
    }
  });
});

describe("USER_COLORS", () => {
  test("is a non-empty array", () => {
    expect(Array.isArray(USER_COLORS)).toBe(true);
    expect(USER_COLORS.length).toBeGreaterThan(0);
  });

  test("contains only valid hex color strings", () => {
    for (const color of USER_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

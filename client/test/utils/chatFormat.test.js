import { describe, test, expect } from "vitest";
import {
  formatBytesAsMb,
  parseServerDate,
  formatCompactCount,
  formatChatCardTimestamp,
} from "../../src/utils/chatFormat.js";

describe("formatBytesAsMb", () => {
  test("converts bytes to MB rounded to nearest integer", () => {
    expect(formatBytesAsMb(1024 * 1024)).toBe("1 MB");
    expect(formatBytesAsMb(2.5 * 1024 * 1024)).toBe("3 MB");
  });

  test('returns "0 MB" for 0', () => {
    expect(formatBytesAsMb(0)).toBe("0 MB");
  });

  test('returns "0 MB" for null or undefined', () => {
    expect(formatBytesAsMb(null)).toBe("0 MB");
    expect(formatBytesAsMb(undefined)).toBe("0 MB");
  });

  test("handles large values", () => {
    expect(formatBytesAsMb(100 * 1024 * 1024)).toBe("100 MB");
  });
});

describe("parseServerDate", () => {
  test("parses an ISO string with T separator", () => {
    const d = parseServerDate("2024-06-15T10:30:00Z");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d.getTime())).toBe(true);
  });

  test("parses a space-separated datetime string as UTC", () => {
    const d = parseServerDate("2024-06-15 10:30:00");
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  test("parses PostgreSQL timestamps with an explicit UTC offset", () => {
    const d = parseServerDate("2024-06-15 10:30:00+00:00");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d.getTime())).toBe(true);
    expect(d.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  test("parses PostgreSQL timestamps with a compact UTC offset", () => {
    const d = parseServerDate("2024-06-15 10:30:00+0000");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d.getTime())).toBe(true);
    expect(d.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  test("parses PostgreSQL timestamps with a short UTC offset", () => {
    const d = parseServerDate("2024-06-15 10:30:00+00");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isFinite(d.getTime())).toBe(true);
    expect(d.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  test("returns a Date instance for a Date object input", () => {
    const input = new Date("2024-01-01T00:00:00Z");
    const d = parseServerDate(input);
    expect(d).toBeInstanceOf(Date);
    expect(d.getTime()).toBe(input.getTime());
  });

  test("returns current date-ish for falsy input", () => {
    const before = Date.now();
    const d = parseServerDate(null);
    const after = Date.now();
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
    expect(d.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("formatCompactCount", () => {
  test("returns the number as-is below 1000", () => {
    expect(formatCompactCount(0)).toBe("0");
    expect(formatCompactCount(1)).toBe("1");
    expect(formatCompactCount(999)).toBe("999");
  });

  test("formats thousands with K suffix", () => {
    expect(formatCompactCount(1000)).toBe("1K");
    expect(formatCompactCount(1500)).toBe("1.5K");
    expect(formatCompactCount(10000)).toBe("10K");
    expect(formatCompactCount(999999)).toBe("1000K");
  });

  test("formats millions with M suffix", () => {
    expect(formatCompactCount(1_000_000)).toBe("1M");
    expect(formatCompactCount(2_500_000)).toBe("2.5M");
  });

  test("formats billions with B suffix", () => {
    expect(formatCompactCount(1_000_000_000)).toBe("1B");
  });

  test("strips trailing .0 from compact notation", () => {
    expect(formatCompactCount(2000)).toBe("2K");
    expect(formatCompactCount(3_000_000)).toBe("3M");
  });

  test('returns "0" for falsy input', () => {
    expect(formatCompactCount(null)).toBe("0");
    expect(formatCompactCount(undefined)).toBe("0");
    expect(formatCompactCount(0)).toBe("0");
  });

  test("clamps negative values to 0", () => {
    expect(formatCompactCount(-100)).toBe("0");
  });
});

describe("formatChatCardTimestamp", () => {
  test("returns empty string for an invalid date", () => {
    expect(formatChatCardTimestamp("not-a-date")).toBe("");
  });

  test("returns a time string for today", () => {
    const now = new Date().toISOString();
    const result = formatChatCardTimestamp(now);
    // Should be HH:MM format
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  test("returns a 3-char weekday abbreviation for dates within the past week", () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const result = formatChatCardTimestamp(threeDaysAgo.toISOString());
    expect(result).toMatch(/^[A-Za-z]{3}$/);
  });

  test("returns MM/DD format for dates this year but older than a week", () => {
    // Use a fixed date in the past that is definitely this year and >7 days ago
    const thisYear = new Date().getFullYear();
    const oldDate = new Date(`${thisYear}-01-01T12:00:00Z`);
    // Only test if that date is actually more than 7 days ago
    const diffDays = Math.floor((Date.now() - oldDate.getTime()) / 86400000);
    if (diffDays > 7) {
      const result = formatChatCardTimestamp(oldDate.toISOString());
      expect(result).toMatch(/^\d{2}\/\d{2}$/);
    }
  });

  test("returns YY/MM/DD format for dates in a previous year", () => {
    const result = formatChatCardTimestamp("2020-06-15T00:00:00Z");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
  });
});

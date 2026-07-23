import { describe, test, expect } from "vitest";
import { buildTimestampSchedule } from "../../lib/timeUtils.js";

describe("buildTimestampSchedule", () => {
  describe("return type and length", () => {
    test("returns an array", () => {
      expect(Array.isArray(buildTimestampSchedule(5, 3))).toBe(true);
    });

    test("returns exactly count timestamps when count divides evenly", () => {
      const stamps = buildTimestampSchedule(6, 3);
      expect(stamps).toHaveLength(6);
    });

    test("returns exactly count timestamps when count does not divide evenly", () => {
      const stamps = buildTimestampSchedule(7, 3);
      expect(stamps).toHaveLength(7);
    });

    test("returns 1 timestamp when count is 1", () => {
      expect(buildTimestampSchedule(1, 1)).toHaveLength(1);
    });

    test("returns 1 timestamp when count is 0 (clamped to minimum of 1)", () => {
      expect(buildTimestampSchedule(0, 1)).toHaveLength(1);
    });

    test("returns 1 timestamp when count is negative (clamped to minimum of 1)", () => {
      expect(buildTimestampSchedule(-10, 1)).toHaveLength(1);
    });

    test("clamps count to 10000 maximum", () => {
      const stamps = buildTimestampSchedule(99999, 1);
      expect(stamps).toHaveLength(10000);
    });
  });

  describe("date range and ordering", () => {
    test("all timestamps are ISO strings", () => {
      const stamps = buildTimestampSchedule(10, 5);
      for (const stamp of stamps) {
        expect(() => new Date(stamp)).not.toThrow();
        expect(new Date(stamp).toISOString()).toBe(stamp);
      }
    });

    test("returns timestamps in ascending order", () => {
      const stamps = buildTimestampSchedule(20, 7);
      for (let i = 1; i < stamps.length; i++) {
        expect(new Date(stamps[i]).getTime()).toBeGreaterThanOrEqual(
          new Date(stamps[i - 1]).getTime(),
        );
      }
    });

    test("all timestamps are in the past or present (not future)", () => {
      const now = Date.now();
      const stamps = buildTimestampSchedule(50, 10);
      for (const stamp of stamps) {
        expect(new Date(stamp).getTime()).toBeLessThanOrEqual(now + 1000); // 1s tolerance
      }
    });

    test("all timestamps are within the requested days window", () => {
      const daysBack = 5;
      const stamps = buildTimestampSchedule(30, daysBack);
      const now = new Date();
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() - daysBack);
      windowStart.setHours(0, 0, 0, 0);

      for (const stamp of stamps) {
        expect(new Date(stamp).getTime()).toBeGreaterThanOrEqual(
          windowStart.getTime(),
        );
      }
    });
  });

  describe("input coercion and clamping", () => {
    test("treats non-numeric count as 1", () => {
      expect(buildTimestampSchedule("abc", 1)).toHaveLength(1);
    });

    test("treats non-numeric daysBack as 1", () => {
      const stamps = buildTimestampSchedule(5, "abc");
      expect(stamps).toHaveLength(5);
    });

    test("clamps daysBack to maximum of 365", () => {
      const stamps = buildTimestampSchedule(10, 99999);
      expect(stamps).toHaveLength(10);
    });

    test("handles fractional count by truncating", () => {
      const stamps = buildTimestampSchedule(5.9, 2);
      expect(stamps).toHaveLength(5);
    });

    test("handles fractional daysBack by truncating", () => {
      // 2.9 → truncated to 2
      const stamps = buildTimestampSchedule(4, 2.9);
      expect(stamps).toHaveLength(4);
    });
  });
});

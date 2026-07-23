import { describe, test, expect } from "vitest";
import {
  normalizeHexColor,
  normalizeChatType,
  normalizeVisibility,
  parseListValue,
  normalizeGroupUsername,
  resolveUserRow,
  resolveChatRow,
} from "../../lib/dbToolHelpers.js";

describe("normalizeHexColor", () => {
  test("returns null for empty string", () => {
    expect(normalizeHexColor("")).toBeNull();
  });

  test("returns null for null", () => {
    expect(normalizeHexColor(null)).toBeNull();
  });

  test("accepts a valid 6-char hex with # prefix", () => {
    expect(normalizeHexColor("#10b981")).toBe("#10b981");
  });

  test("accepts a valid 6-char hex without # prefix", () => {
    expect(normalizeHexColor("10b981")).toBe("#10b981");
  });

  test("lowercases hex characters", () => {
    expect(normalizeHexColor("#FF0000")).toBe("#ff0000");
  });

  test("expands a valid 3-char shorthand to 6 chars", () => {
    expect(normalizeHexColor("#f0a")).toBe("#ff00aa");
    expect(normalizeHexColor("abc")).toBe("#aabbcc");
  });

  test("returns null for invalid hex string", () => {
    expect(normalizeHexColor("#gggggg")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull(); // 5 chars
    expect(normalizeHexColor("not-a-color")).toBeNull();
  });
});

describe("normalizeChatType", () => {
  test('returns "channel" for "channel"', () => {
    expect(normalizeChatType("channel")).toBe("channel");
  });

  test('returns "channel" for "CHANNEL" (case-insensitive)', () => {
    expect(normalizeChatType("CHANNEL")).toBe("channel");
  });

  test('returns "group" for "group"', () => {
    expect(normalizeChatType("group")).toBe("group");
  });

  test('returns "group" for anything that is not "channel"', () => {
    expect(normalizeChatType("dm")).toBe("group");
    expect(normalizeChatType("")).toBe("group");
    expect(normalizeChatType(null)).toBe("group");
  });
});

describe("normalizeVisibility", () => {
  test('returns "private" for "private"', () => {
    expect(normalizeVisibility("private")).toBe("private");
  });

  test('returns "private" for "PRIVATE" (case-insensitive)', () => {
    expect(normalizeVisibility("PRIVATE")).toBe("private");
  });

  test('returns "public" for "public"', () => {
    expect(normalizeVisibility("public")).toBe("public");
  });

  test('returns "public" for anything that is not "private"', () => {
    expect(normalizeVisibility("")).toBe("public");
    expect(normalizeVisibility(null)).toBe("public");
    expect(normalizeVisibility("unknown")).toBe("public");
  });
});

describe("parseListValue", () => {
  test("splits a comma-separated string", () => {
    expect(parseListValue("alice,bob,carol")).toEqual([
      "alice",
      "bob",
      "carol",
    ]);
  });

  test("splits a space-separated string", () => {
    expect(parseListValue("alice bob carol")).toEqual([
      "alice",
      "bob",
      "carol",
    ]);
  });

  test("handles mixed comma and space delimiters", () => {
    expect(parseListValue("alice, bob , carol")).toEqual([
      "alice",
      "bob",
      "carol",
    ]);
  });

  test("filters out empty entries", () => {
    expect(parseListValue("alice,,bob")).toEqual(["alice", "bob"]);
  });

  test("returns empty array for empty string", () => {
    expect(parseListValue("")).toEqual([]);
  });

  test("returns empty array for null", () => {
    expect(parseListValue(null)).toEqual([]);
  });
});

describe("normalizeGroupUsername", () => {
  test("lowercases the value", () => {
    expect(normalizeGroupUsername("MyGroup")).toBe("mygroup");
  });

  test("strips a leading @ symbol", () => {
    expect(normalizeGroupUsername("@mygroup")).toBe("mygroup");
  });

  test("strips multiple leading @ symbols", () => {
    expect(normalizeGroupUsername("@@mygroup")).toBe("mygroup");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeGroupUsername("  mygroup  ")).toBe("mygroup");
  });

  test("returns empty string for empty input", () => {
    expect(normalizeGroupUsername("")).toBe("");
    expect(normalizeGroupUsername(null)).toBe("");
  });
});

describe("resolveUserRow", () => {
  const makeDb = (result) => ({ getRow: () => result });

  test("returns null for empty selector", () => {
    expect(resolveUserRow(makeDb(null), "")).toBeNull();
  });

  test("returns null for null selector", () => {
    expect(resolveUserRow(makeDb(null), null)).toBeNull();
  });

  test("queries by id when selector is a positive integer string", () => {
    const db = { getRow: (sql, params) => ({ id: params[0] }) };
    const result = resolveUserRow(db, "42");
    expect(result).toEqual({ id: 42 });
  });

  test("queries by username when selector is a string", () => {
    const db = { getRow: (sql, params) => ({ username: params[0] }) };
    const result = resolveUserRow(db, "alice");
    expect(result).toEqual({ username: "alice" });
  });

  test("returns null when db returns no row", () => {
    expect(resolveUserRow(makeDb(null), "nobody")).toBeNull();
    expect(resolveUserRow(makeDb(undefined), "nobody")).toBeNull();
  });
});

describe("resolveChatRow", () => {
  const makeDb = (result) => ({ getRow: () => result });

  test("returns null for empty selector", () => {
    expect(resolveChatRow(makeDb(null), "")).toBeNull();
  });

  test("returns null for null selector", () => {
    expect(resolveChatRow(makeDb(null), null)).toBeNull();
  });

  test("queries by id when selector is a positive integer string", () => {
    const db = { getRow: (sql, params) => ({ id: params[0] }) };
    const result = resolveChatRow(db, "7");
    expect(result).toEqual({ id: 7 });
  });

  test("queries by username when selector is a string", () => {
    const db = { getRow: (sql, params) => ({ group_username: params[0] }) };
    const result = resolveChatRow(db, "my_group");
    expect(result.group_username).toBe("my_group");
  });

  test("returns null when db returns no row", () => {
    expect(resolveChatRow(makeDb(null), "nosuchchat")).toBeNull();
  });
});

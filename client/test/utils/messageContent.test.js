import { describe, test, expect } from "vitest";
import {
  extractMessageBodyText,
  getMessageFiles,
  hasMessageText,
  FILE_SUMMARY_PATTERN,
} from "../../src/utils/messageContent.js";

describe("FILE_SUMMARY_PATTERN", () => {
  const matchingStrings = [
    "Sent a media file",
    "Sent a file",
    "Sent a photo",
    "Sent a video",
    "Sent a document",
    "Sent a voice message",
    "Sent 3 files",
    "Sent 2 photos",
    "Sent 5 videos",
    "Sent 10 documents",
    "Sent 4 media files",
    "Sent 1 voice messages",
  ];

  const nonMatchingStrings = [
    "Hello world",
    "Sent a message",
    "Sent files",
    "",
  ];

  for (const s of matchingStrings) {
    test(`matches "${s}"`, () => {
      expect(FILE_SUMMARY_PATTERN.test(s)).toBe(true);
    });
  }

  for (const s of nonMatchingStrings) {
    test(`does not match "${s}"`, () => {
      expect(FILE_SUMMARY_PATTERN.test(s)).toBe(false);
    });
  }
});

describe("extractMessageBodyText", () => {
  test("returns a string as-is", () => {
    expect(extractMessageBodyText("hello")).toBe("hello");
  });

  test('returns empty string for "[object Object]"', () => {
    expect(extractMessageBodyText("[object Object]")).toBe("");
  });

  test("extracts .text from an object", () => {
    expect(extractMessageBodyText({ text: "hi there" })).toBe("hi there");
  });

  test("falls back to .body when .text is absent", () => {
    expect(extractMessageBodyText({ body: "body text" })).toBe("body text");
  });

  test("returns empty string for an object without text or body", () => {
    expect(extractMessageBodyText({ foo: "bar" })).toBe("");
  });

  test("returns empty string for null", () => {
    expect(extractMessageBodyText(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(extractMessageBodyText(undefined)).toBe("");
  });

  test("coerces numbers to string", () => {
    expect(extractMessageBodyText(42)).toBe("42");
  });
});

describe("getMessageFiles", () => {
  test("returns the files array when present", () => {
    const files = [{ id: 1 }, { id: 2 }];
    expect(getMessageFiles({ files })).toEqual(files);
  });

  test("returns empty array when files is absent", () => {
    expect(getMessageFiles({ body: "hi" })).toEqual([]);
  });

  test("returns empty array for null message", () => {
    expect(getMessageFiles(null)).toEqual([]);
  });

  test("returns empty array when files is not an array", () => {
    expect(getMessageFiles({ files: "not-an-array" })).toEqual([]);
  });
});

describe("hasMessageText", () => {
  test("returns true for a plain text message with no files", () => {
    expect(hasMessageText({ body: "Hello!" })).toBe(true);
  });

  test("returns false for an empty body", () => {
    expect(hasMessageText({ body: "" })).toBe(false);
  });

  test("returns false for a whitespace-only body", () => {
    expect(hasMessageText({ body: "   " })).toBe(false);
  });

  test("returns false when body is a file summary with files present", () => {
    expect(hasMessageText({ body: "Sent a photo", files: [{ id: 1 }] })).toBe(
      false,
    );
  });

  test("returns true when body is a file summary but no files are attached", () => {
    // Edge case: summary text without accompanying files counts as real text
    expect(hasMessageText({ body: "Sent a photo", files: [] })).toBe(true);
  });

  test("returns true for a real text body even when files are attached", () => {
    expect(hasMessageText({ body: "Check this out", files: [{ id: 1 }] })).toBe(
      true,
    );
  });

  test("returns false for a null message", () => {
    expect(hasMessageText(null)).toBe(false);
  });
});

import { describe, test, expect } from "vitest";
import {
  extractMessageBodyText,
  hasMessageText,
  getMessageFiles,
  FILE_SUMMARY_PATTERN,
} from "../../src/utils/messageContent.js";

// ─── FILE_SUMMARY_PATTERN ─────────────────────────────────────────────────────

describe("FILE_SUMMARY_PATTERN", () => {
  const matches = [
    "Sent a media file",
    "Sent a file",
    "Sent a photo",
    "Sent a video",
    "Sent a document",
    "Sent a voice message",
    "Sent 1 files",
    "Sent 3 photos",
    "Sent 5 videos",
    "Sent 2 documents",
    "Sent 10 media files",
    "Sent 4 voice messages",
    // case-insensitive
    "sent a photo",
    "SENT A VIDEO",
  ];

  test.each(matches)("matches generated summary: %s", (text) => {
    expect(FILE_SUMMARY_PATTERN.test(text)).toBe(true);
  });

  const nonMatches = [
    "",
    "Hello",
    "Sent a photo of my cat",
    "I sent a photo",
    "Sent photos",
    // "Sent 0 photos" intentionally excluded — \d+ matches "0" so it
    // technically matches, but the server never generates such strings.
  ];

  test.each(nonMatches)("does not match regular text: %s", (text) => {
    expect(FILE_SUMMARY_PATTERN.test(text)).toBe(false);
  });
});

// ─── extractMessageBodyText ───────────────────────────────────────────────────

describe("extractMessageBodyText", () => {
  test("returns string value directly", () => {
    expect(extractMessageBodyText("Hello")).toBe("Hello");
  });

  test("returns empty string for the literal '[object Object]'", () => {
    expect(extractMessageBodyText("[object Object]")).toBe("");
  });

  test("extracts .text from object value", () => {
    expect(extractMessageBodyText({ text: "Hi" })).toBe("Hi");
  });

  test("extracts .body from object value when .text is absent", () => {
    expect(extractMessageBodyText({ body: "Hey" })).toBe("Hey");
  });

  test("returns empty string for null", () => {
    expect(extractMessageBodyText(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(extractMessageBodyText(undefined)).toBe("");
  });

  test("coerces non-string, non-object primitives to string", () => {
    expect(extractMessageBodyText(42)).toBe("42");
  });
});

// ─── getMessageFiles ──────────────────────────────────────────────────────────

describe("getMessageFiles", () => {
  test("returns the files array from a message", () => {
    const files = [{ id: 1 }, { id: 2 }];
    expect(getMessageFiles({ files })).toEqual(files);
  });

  test("returns empty array when files is absent", () => {
    expect(getMessageFiles({ body: "text" })).toEqual([]);
  });

  test("returns empty array for null message", () => {
    expect(getMessageFiles(null)).toEqual([]);
  });

  test("returns empty array when files is not an array", () => {
    expect(getMessageFiles({ files: "oops" })).toEqual([]);
  });
});

// ─── hasMessageText ───────────────────────────────────────────────────────────

describe("hasMessageText", () => {
  test("returns true for a plain text message with no files", () => {
    expect(hasMessageText({ body: "Hello world", files: [] })).toBe(true);
  });

  test("returns false for an empty body", () => {
    expect(hasMessageText({ body: "", files: [] })).toBe(false);
  });

  test("returns false for a whitespace-only body", () => {
    expect(hasMessageText({ body: "   ", files: [] })).toBe(false);
  });

  test("returns false when body is a generated file summary with files", () => {
    expect(
      hasMessageText({
        body: "Sent a photo",
        files: [{ mimeType: "image/jpeg" }],
      }),
    ).toBe(false);
  });

  test("returns true when body is real text even though files exist", () => {
    expect(
      hasMessageText({
        body: "Look at this!",
        files: [{ mimeType: "image/jpeg" }],
      }),
    ).toBe(true);
  });

  test("returns true for a generated summary body with NO files (edge case: body only)", () => {
    // No files — pattern still matches but files array is empty,
    // so hasMessageText sees no files → returns true (body is the only content)
    expect(hasMessageText({ body: "Sent a photo", files: [] })).toBe(true);
  });
});

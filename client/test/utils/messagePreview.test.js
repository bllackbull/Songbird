import { describe, test, expect } from "vitest";
import {
  truncateText,
  summarizeFiles,
  resolveReplyPreview,
} from "../../src/utils/messagePreview.js";

// Helpers for building file stubs
const image = (n = 1) =>
  Array.from({ length: n }, () => ({ mimeType: "image/jpeg" }));
const video = (n = 1) =>
  Array.from({ length: n }, () => ({ mimeType: "video/mp4" }));
const audio = (n = 1) =>
  Array.from({ length: n }, () => ({ mimeType: "audio/ogg" }));
const doc = (n = 1) =>
  Array.from({ length: n }, () => ({ mimeType: "application/pdf" }));

describe("truncateText", () => {
  test("returns the string unchanged when within limit", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  test("returns the string unchanged when exactly at limit", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  test('truncates and appends "..." when over limit', () => {
    expect(truncateText("hello world", 5)).toBe("hello...");
  });

  test('trims trailing whitespace before appending "..."', () => {
    expect(truncateText("hello   world", 6)).toBe("hello...");
  });

  test("handles null/undefined as empty string", () => {
    expect(truncateText(null, 5)).toBe("");
    expect(truncateText(undefined, 5)).toBe("");
  });
});

describe("summarizeFiles", () => {
  test("returns empty string for no files", () => {
    expect(summarizeFiles([])).toBe("");
    expect(summarizeFiles()).toBe("");
  });

  test('returns "Sent a photo" for a single image', () => {
    expect(summarizeFiles(image(1))).toBe("Sent a photo");
  });

  test('returns "Sent a video" for a single video', () => {
    expect(summarizeFiles(video(1))).toBe("Sent a video");
  });

  test('returns "Sent a voice message" for a single audio file', () => {
    expect(summarizeFiles(audio(1))).toBe("Sent a voice message");
  });

  test('returns "Sent a document" for a single generic file', () => {
    expect(summarizeFiles(doc(1))).toBe("Sent a document");
  });

  test("returns plural photos for multiple images", () => {
    expect(summarizeFiles(image(3))).toBe("Sent 3 photos");
  });

  test("returns plural videos for multiple videos", () => {
    expect(summarizeFiles(video(2))).toBe("Sent 2 videos");
  });

  test("returns plural voice messages for multiple audio files", () => {
    expect(summarizeFiles(audio(4))).toBe("Sent 4 voice messages");
  });

  test("returns plural documents for multiple docs", () => {
    expect(summarizeFiles(doc(2))).toBe("Sent 2 documents");
  });

  test("returns media files summary for mixed image+video", () => {
    expect(summarizeFiles([...image(1), ...video(1)])).toBe(
      "Sent 2 media files",
    );
  });

  test("treats document uploadMode as document regardless of mime type", () => {
    expect(summarizeFiles(image(1), "document")).toBe("Sent a document");
  });

  test("mixed audio with other types falls back to photo summary", () => {
    // 1 audio + 1 image: image path is checked first (imageCount > 0, no video/doc)
    const result = summarizeFiles([...audio(1), ...image(1)]);
    expect(result).toBe("Sent 1 photo");
  });
});

describe("resolveReplyPreview", () => {
  test("returns empty text and null icon for null message", () => {
    expect(resolveReplyPreview(null)).toEqual({ text: "", icon: null });
  });

  test("returns the message body as text when no files", () => {
    const result = resolveReplyPreview({ body: "Hello there", files: [] });
    expect(result.text).toBe("Hello there");
    expect(result.icon).toBeNull();
  });

  test("uses file summary when body is a generic file placeholder", () => {
    const result = resolveReplyPreview({
      body: "Sent a file",
      files: image(1),
    });
    expect(result.text).toBe("Sent a photo");
    expect(result.icon).toBe("image");
  });

  test("preserves real body text over file summary", () => {
    const result = resolveReplyPreview({
      body: "Check out this pic",
      files: image(1),
    });
    expect(result.text).toBe("Check out this pic");
  });

  test('returns "Sent a video" icon for a single video file', () => {
    const result = resolveReplyPreview({
      body: "Sent a file",
      files: video(1),
    });
    expect(result.icon).toBe("video");
  });

  test("returns voice icon for audio file", () => {
    const result = resolveReplyPreview({
      body: "Sent a voice message",
      files: audio(1),
    });
    expect(result.icon).toBe("voice");
  });

  test('falls back to "Message" when body is empty and no files', () => {
    const result = resolveReplyPreview({ body: "", files: [] });
    expect(result.text).toBe("Message");
  });

  test("uses _files fallback when files is not an array", () => {
    const result = resolveReplyPreview({
      body: "Sent a file",
      _files: image(1),
    });
    expect(result.icon).toBe("image");
  });
});

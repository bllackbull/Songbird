import { describe, test, expect } from "vitest";
import {
  summarizeFiles,
  resolveReplyPreview,
  truncateText,
} from "../../src/utils/messagePreview.js";

// ─── truncateText ─────────────────────────────────────────────────────────────

describe("truncateText", () => {
  test("returns the string unchanged when under the limit", () => {
    expect(truncateText("Hello", 10)).toBe("Hello");
  });

  test("returns the string unchanged when exactly at the limit", () => {
    expect(truncateText("Hello", 5)).toBe("Hello");
  });

  test("truncates and appends ellipsis when over the limit", () => {
    expect(truncateText("Hello world", 5)).toBe("Hello...");
  });

  test("handles empty string", () => {
    expect(truncateText("", 10)).toBe("");
  });

  test("handles null/undefined gracefully", () => {
    expect(truncateText(null, 10)).toBe("");
    expect(truncateText(undefined, 10)).toBe("");
  });
});

// ─── summarizeFiles ───────────────────────────────────────────────────────────

describe("summarizeFiles", () => {
  // ── single file ────────────────────────────────────────────────────────────

  test("single image → 'Sent a photo'", () => {
    expect(summarizeFiles([{ mimeType: "image/jpeg" }])).toBe("Sent a photo");
  });

  test("single video → 'Sent a video'", () => {
    expect(summarizeFiles([{ mimeType: "video/mp4" }])).toBe("Sent a video");
  });

  test("single audio → 'Sent a voice message'", () => {
    expect(summarizeFiles([{ mimeType: "audio/webm" }])).toBe(
      "Sent a voice message",
    );
  });

  test("single document (no mime) → 'Sent a document'", () => {
    expect(summarizeFiles([{ mimeType: "application/pdf" }])).toBe(
      "Sent a document",
    );
  });

  test("single file with document upload mode → 'Sent a document'", () => {
    expect(summarizeFiles([{ mimeType: "image/jpeg" }], "document")).toBe(
      "Sent a document",
    );
  });

  // ── multiple files — pure type groups ──────────────────────────────────────

  test("two images → 'Sent 2 photos'", () => {
    expect(
      summarizeFiles([{ mimeType: "image/png" }, { mimeType: "image/jpeg" }]),
    ).toBe("Sent 2 photos");
  });

  test("three videos → 'Sent 3 videos'", () => {
    expect(
      summarizeFiles([
        { mimeType: "video/mp4" },
        { mimeType: "video/webm" },
        { mimeType: "video/mp4" },
      ]),
    ).toBe("Sent 3 videos");
  });

  test("two audio files → 'Sent 2 voice messages'", () => {
    expect(
      summarizeFiles([{ mimeType: "audio/ogg" }, { mimeType: "audio/webm" }]),
    ).toBe("Sent 2 voice messages");
  });

  test("two documents → 'Sent 2 documents'", () => {
    expect(
      summarizeFiles([
        { mimeType: "application/pdf" },
        { mimeType: "application/zip" },
      ]),
    ).toBe("Sent 2 documents");
  });

  // ── mixed media (image + video) ─────────────────────────────────────────────

  test("one image + one video → 'Sent 2 media files'", () => {
    expect(
      summarizeFiles([{ mimeType: "image/png" }, { mimeType: "video/mp4" }]),
    ).toBe("Sent 2 media files");
  });

  test("two images + one video → 'Sent 3 media files'", () => {
    expect(
      summarizeFiles([
        { mimeType: "image/png" },
        { mimeType: "image/jpg" },
        { mimeType: "video/mp4" },
      ]),
    ).toBe("Sent 3 media files");
  });

  // ── mixed with documents / audio → falls back to document label ────────────

  test("image + document → 'Sent 2 documents'", () => {
    expect(
      summarizeFiles([
        { mimeType: "image/png" },
        { mimeType: "application/pdf" },
      ]),
    ).toBe("Sent 2 documents");
  });

  test("image + audio (mixed audio) → audio counted separately, non-audio shown", () => {
    // One image + one audio: audio is handled as voice message separately.
    // The code splits audio out, leaving 1 image → "Sent 1 photo".
    expect(
      summarizeFiles([{ mimeType: "image/png" }, { mimeType: "audio/webm" }]),
    ).toBe("Sent 1 photo");
  });

  // ── empty / edge cases ──────────────────────────────────────────────────────

  test("empty array → empty string", () => {
    expect(summarizeFiles([])).toBe("");
  });

  test("undefined input → empty string", () => {
    expect(summarizeFiles()).toBe("");
  });
});

// ─── resolveReplyPreview ──────────────────────────────────────────────────────

describe("resolveReplyPreview", () => {
  test("returns empty text for null message", () => {
    expect(resolveReplyPreview(null)).toEqual({ text: "", icon: null });
  });

  test("returns plain body text for a text-only message", () => {
    const result = resolveReplyPreview({ body: "Hello there", files: [] });
    expect(result.text).toBe("Hello there");
    expect(result.icon).toBeNull();
  });

  // ── single file messages ────────────────────────────────────────────────────

  test("single image file → photo preview + image icon", () => {
    const result = resolveReplyPreview({
      body: "Sent a photo",
      files: [{ mimeType: "image/jpeg" }],
    });
    expect(result.text).toBe("Sent a photo");
    expect(result.icon).toBe("image");
  });

  test("single video file → video preview + video icon", () => {
    const result = resolveReplyPreview({
      body: "Sent a video",
      files: [{ mimeType: "video/mp4" }],
    });
    expect(result.text).toBe("Sent a video");
    expect(result.icon).toBe("video");
  });

  test("single audio file → voice message preview + voice icon", () => {
    const result = resolveReplyPreview({
      body: "Sent a voice message",
      files: [{ mimeType: "audio/webm" }],
    });
    expect(result.text).toBe("Sent a voice message");
    expect(result.icon).toBe("voice");
  });

  test("single document → document preview + document icon", () => {
    const result = resolveReplyPreview({
      body: "Sent a document",
      files: [{ mimeType: "application/pdf" }],
    });
    expect(result.text).toBe("Sent a document");
    expect(result.icon).toBe("document");
  });

  // ── multiple file messages ──────────────────────────────────────────────────

  test("two photos → 'Sent 2 photos' + image icon", () => {
    const result = resolveReplyPreview({
      body: "Sent 2 photos",
      files: [{ mimeType: "image/png" }, { mimeType: "image/jpeg" }],
    });
    expect(result.text).toBe("Sent 2 photos");
    expect(result.icon).toBe("image");
  });

  test("mixed image + video → 'Sent 2 media files' + image icon", () => {
    const result = resolveReplyPreview({
      body: "Sent 2 media files",
      files: [{ mimeType: "image/png" }, { mimeType: "video/mp4" }],
    });
    expect(result.text).toBe("Sent 2 media files");
    expect(result.icon).toBe("image");
  });

  // ── uses _files (pending uploads) when files is absent ─────────────────────

  test("falls back to _files array when files is not present", () => {
    const result = resolveReplyPreview({
      body: "Sent a photo",
      _files: [{ mimeType: "image/png" }],
    });
    expect(result.text).toBe("Sent a photo");
    expect(result.icon).toBe("image");
  });

  // ── prefers body text when it is not a generic summary ─────────────────────

  test("returns real body text even when files are present", () => {
    const result = resolveReplyPreview({
      body: "Check out this photo!",
      files: [{ mimeType: "image/jpeg" }],
    });
    expect(result.text).toBe("Check out this photo!");
  });

  // ── generic body + no files ─────────────────────────────────────────────────

  test("'Sent a media file' body with no matching files → preserves body", () => {
    const result = resolveReplyPreview({
      body: "Sent a media file",
      files: [],
    });
    // No files to derive from — body is returned as-is
    expect(result.text).toBe("Sent a media file");
  });
});

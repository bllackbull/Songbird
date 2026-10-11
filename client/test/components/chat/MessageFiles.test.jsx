import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageFiles } from "../../../src/components/chat/media/MessageFiles.jsx";

// ─── Minimal prop factory ─────────────────────────────────────────────────────

// MessageFiles needs several cache-related props to avoid crashes.
// These stubs satisfy every required callback without doing real work.
const BASE_PROPS = {
  isDesktop: true,
  loadedMediaThumbs: new Set(),
  setLoadedMediaThumbs: vi.fn(),
  mediaAspectByKey: {},
  setMediaAspectByKey: vi.fn(),
  videoPosterByUrl: {},
  setVideoPosterByUrl: vi.fn(),
  videoPosterCacheKey: "test-poster-cache",
  mediaThumbCacheKey: "test-thumb-cache",
  mediaCacheVersion: 1,
  openFocusMedia: vi.fn(),
  onMessageMediaLoaded: vi.fn(),
  handleVideoThumbLoadedMetadata: vi.fn(),
  // Default render type resolution — tests override this where needed
  getFileRenderType: (file) => {
    const mime = String(file?.mimeType || "").toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "document";
  },
};

// Minimal 1×1 transparent GIF — guaranteed to load without 404
const VALID_IMG =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

function makeFile(overrides = {}) {
  return {
    id: "file-1",
    name: "test-file.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024 * 50,
    url: "/api/uploads/messages/test-file.pdf",
    ...overrides,
  };
}

// ─── Empty / null ─────────────────────────────────────────────────────────────

describe("MessageFiles — empty state", () => {
  test("renders nothing when files array is empty", async () => {
    render(<MessageFiles {...BASE_PROPS} files={[]} />);
    // null is returned — nothing in the DOM
    await expect.element(page.getByRole("link")).not.toBeInTheDocument();
    await expect.element(page.getByRole("button")).not.toBeInTheDocument();
  });
});

// ─── Document chip ────────────────────────────────────────────────────────────

describe("MessageFiles — document chip", () => {
  test("renders a download link for a document with a URL", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[
          makeFile({
            name: "report.pdf",
            url: "/api/uploads/messages/report.pdf",
          }),
        ]}
      />,
    );
    const link = page.getByRole("link");
    await expect.element(link).toBeInTheDocument();
    await expect
      .element(link)
      .toHaveAttribute("href", "/api/uploads/messages/report.pdf");
    await expect.element(link).toHaveAttribute("download");
  });

  test("shows the base filename on the chip", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        // Use a short enough name that it won't be truncated (≤14 chars)
        files={[makeFile({ name: "report.pdf" })]}
      />,
    );
    await expect.element(page.getByText("report")).toBeInTheDocument();
  });

  test("shows the file extension separately", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[makeFile({ name: "notes.docx" })]}
      />,
    );
    await expect.element(page.getByText(".docx")).toBeInTheDocument();
  });

  test("shows the human-readable file size", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[makeFile({ sizeBytes: 1024 * 512 })]}
      />,
    );
    await expect.element(page.getByText("512 KB")).toBeInTheDocument();
  });

  test("shows MB for larger files", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[makeFile({ sizeBytes: 1024 * 1024 * 2.5 })]}
      />,
    );
    await expect.element(page.getByText("2.50 MB")).toBeInTheDocument();
  });

  test("renders a non-link div when url is absent (pending upload)", async () => {
    render(<MessageFiles {...BASE_PROPS} files={[makeFile({ url: null })]} />);
    // No link — just a static chip
    await expect.element(page.getByRole("link")).not.toBeInTheDocument();
    await expect.element(page.getByText("test-file")).toBeInTheDocument();
  });

  test("truncates very long base filenames", async () => {
    const longName = "a".repeat(30) + ".pdf";
    render(
      <MessageFiles {...BASE_PROPS} files={[makeFile({ name: longName })]} />,
    );
    // Extension should still show
    await expect.element(page.getByText(".pdf")).toBeInTheDocument();
    // Truncated base (first 14 chars + '...')
    await expect
      .element(page.getByText("aaaaaaaaaaaaaa..."))
      .toBeInTheDocument();
  });

  test("renders multiple document chips", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[
          makeFile({ id: "f1", name: "doc1.pdf" }),
          makeFile({
            id: "f2",
            name: "doc2.txt",
            url: "/api/uploads/messages/doc2.txt",
          }),
        ]}
      />,
    );
    await expect.element(page.getByText("doc1")).toBeInTheDocument();
    await expect.element(page.getByText("doc2")).toBeInTheDocument();
  });
});

// ─── Image rendering ──────────────────────────────────────────────────────────

describe("MessageFiles — image", () => {
  test("renders an image button that calls openFocusMedia on click", async () => {
    const openFocusMedia = vi.fn();
    render(
      <MessageFiles
        {...BASE_PROPS}
        openFocusMedia={openFocusMedia}
        loadedMediaThumbs={new Set(["thumb-file-1"])}
        files={[
          makeFile({
            id: "file-1",
            name: "photo.jpg",
            mimeType: "image/jpeg",
            url: VALID_IMG,
          }),
        ]}
      />,
    );
    const btn = page.getByRole("button");
    await expect.element(btn).toBeInTheDocument();
    await btn.click();
    expect(openFocusMedia).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image", url: VALID_IMG }),
    );
  });

  test("renders an img element with the correct src", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        loadedMediaThumbs={new Set(["thumb-file-1"])}
        files={[
          makeFile({
            id: "file-1",
            name: "photo.jpg",
            mimeType: "image/jpeg",
            url: VALID_IMG,
          }),
        ]}
      />,
    );
    const img = page.getByRole("img");
    await expect.element(img).toBeInTheDocument();
    await expect.element(img).toHaveAttribute("src", VALID_IMG);
  });
});

// ─── Video rendering ──────────────────────────────────────────────────────────

describe("MessageFiles — video", () => {
  test("renders a video button with an accessible name containing the filename", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        loadedMediaThumbs={new Set(["thumb-file-1"])}
        files={[
          makeFile({
            id: "file-1",
            name: "clip.mp4",
            mimeType: "video/mp4",
            url: "/api/uploads/messages/clip.mp4",
          }),
        ]}
      />,
    );
    const btn = page.getByRole("button", { name: /open video/i });
    await expect.element(btn).toBeInTheDocument();
  });

  test("calls openFocusMedia with type=video on click", async () => {
    const openFocusMedia = vi.fn();
    render(
      <MessageFiles
        {...BASE_PROPS}
        openFocusMedia={openFocusMedia}
        loadedMediaThumbs={new Set(["thumb-file-1"])}
        files={[
          makeFile({
            id: "file-1",
            name: "clip.mp4",
            mimeType: "video/mp4",
            url: "/api/uploads/messages/clip.mp4",
          }),
        ]}
      />,
    );
    await page.getByRole("button", { name: /open video/i }).click();
    expect(openFocusMedia).toHaveBeenCalledWith(
      expect.objectContaining({ type: "video" }),
    );
  });

  test("renders a processing placeholder for a video still being transcoded", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[
          makeFile({
            id: "file-1",
            name: "big.mp4",
            mimeType: "video/mp4",
            url: "/api/uploads/messages/big.mp4",
            processing: true,
          }),
        ]}
      />,
    );
    // Processing videos show no clickable button — just a placeholder div
    await expect
      .element(page.getByRole("button", { name: /open video/i }))
      .not.toBeInTheDocument();
  });
});

// ─── Voice message chip ───────────────────────────────────────────────────────

describe("MessageFiles — voice message", () => {
  test("renders a play/pause button for a voice message", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[
          makeFile({
            id: "voice-1",
            name: "voice.webm",
            mimeType: "audio/webm",
            url: null, // no server URL — play will be disabled
            durationSeconds: 12,
          }),
        ]}
      />,
    );
    await expect
      .element(page.getByRole("button", { name: /play voice message/i }))
      .toBeInTheDocument();
  });

  test("play button is disabled when there is no server URL (pending)", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[
          makeFile({
            id: "voice-1",
            name: "voice.webm",
            mimeType: "audio/webm",
            url: null,
            durationSeconds: 5,
          }),
        ]}
      />,
    );
    const btn = page.getByRole("button", { name: /play voice message/i });
    await expect.element(btn).toBeDisabled();
  });

  test("shows 'Processing...' when there is no server URL", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[
          makeFile({
            id: "voice-1",
            mimeType: "audio/webm",
            url: null,
            durationSeconds: 8,
          }),
        ]}
      />,
    );
    await expect.element(page.getByText("Processing...")).toBeInTheDocument();
  });

  test("shows formatted duration when a server URL is present", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[
          makeFile({
            id: "voice-1",
            mimeType: "audio/webm",
            url: "/api/uploads/messages/voice.webm",
            durationSeconds: 75, // 1:15
          }),
        ]}
      />,
    );
    await expect.element(page.getByText("1:15")).toBeInTheDocument();
  });

  test("shows 0:00 when durationSeconds is zero", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        files={[
          makeFile({
            id: "voice-1",
            mimeType: "audio/webm",
            url: "/api/uploads/messages/voice.webm",
            durationSeconds: 0,
          }),
        ]}
      />,
    );
    await expect.element(page.getByText("0:00")).toBeInTheDocument();
  });
});

// ─── Mixed file types ─────────────────────────────────────────────────────────

describe("MessageFiles — mixed types in one message", () => {
  test("renders both an image button and a document link", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        loadedMediaThumbs={new Set(["thumb-file-img"])}
        files={[
          makeFile({
            id: "file-img",
            name: "photo.jpg",
            mimeType: "image/jpeg",
            url: VALID_IMG,
          }),
          makeFile({
            id: "file-doc",
            name: "notes.pdf",
            mimeType: "application/pdf",
            url: "/api/uploads/messages/notes.pdf",
          }),
        ]}
      />,
    );
    await expect.element(page.getByRole("button")).toBeInTheDocument();
    await expect.element(page.getByRole("link")).toBeInTheDocument();
  });
});

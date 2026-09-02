import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageFiles } from "../../../src/components/chat/media/MessageFiles.jsx";
import { OfflineHistoryBanner } from "../../../src/components/chat/messages/MessageList.jsx";

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
  getFileRenderType: (file) => {
    const mime = String(file?.mimeType || "").toLowerCase();
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    return "document";
  },
};

describe("OfflineMediaPlaceholder & History Banner", () => {
  test("renders offline media placeholder card when uncached image fails to load while offline with correct dimensions", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        isOffline={true}
        files={[
          {
            id: "file-uncached-1",
            name: "uncached-image.jpg",
            mimeType: "image/jpeg",
            url: "/api/uploads/messages/non-existent-uncached.jpg",
            width: 800,
            height: 600,
          },
        ]}
      />,
    );

    const placeholder = page.getByTestId("offline-media-placeholder");
    await expect.element(placeholder).toBeInTheDocument();
    await expect
      .element(
        page.getByText(
          "Media unavailable offline — tap to retry when online",
        ),
      )
      .toBeInTheDocument();

    const placeholderEl = placeholder.element();
    const frame = placeholderEl.querySelector("div");
    expect(frame).not.toBeNull();
    // 800 / 600 = 1.3333...
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(800 / 600, 2);
  });

  test("renders offline media placeholder card for uncached video with correct dimensions", async () => {
    render(
      <MessageFiles
        {...BASE_PROPS}
        isOffline={true}
        files={[
          {
            id: "file-uncached-vid-1",
            name: "uncached-video.mp4",
            mimeType: "video/mp4",
            url: "/api/uploads/messages/non-existent-uncached.mp4",
            width: 1920,
            height: 1080,
          },
        ]}
      />,
    );

    const placeholder = page.getByTestId("offline-media-placeholder");
    await expect.element(placeholder).toBeInTheDocument();
    await expect
      .element(
        page.getByText(
          "Media unavailable offline — tap to retry when online",
        ),
      )
      .toBeInTheDocument();

    const placeholderEl = placeholder.element();
    const frame = placeholderEl.querySelector("div");
    expect(frame).not.toBeNull();
    // 1920 / 1080 = 1.7777...
    expect(parseFloat(frame.style.aspectRatio)).toBeCloseTo(1920 / 1080, 2);
  });

  test("renders top of cached history banner matching the date chip design language when offline and no older messages exist", async () => {
    render(
      <OfflineHistoryBanner
        isOffline={true}
        hasOlderMessages={false}
        loadingOlderMessages={false}
      />,
    );

    const bannerText = page.getByText(
      "Reached top of cached history — connect to load older messages",
    );
    await expect.element(bannerText).toBeInTheDocument();

    const banner = page.getByTestId("offline-history-banner");
    await expect.element(banner).toBeInTheDocument();
    const chip = banner.element().querySelector("div");
    expect(chip).not.toBeNull();
    expect(chip.className).toContain("rounded-full");
    expect(chip.className).toContain("border-emerald-200/60");
    expect(chip.className).toContain("text-emerald-700");
    expect(chip.className).toContain("dark:text-emerald-200");
    expect(chip.className).toContain("dark:border-emerald-500/30");
    expect(chip.className).toContain("dark:bg-slate-950");
  });

  test("does not render top of cached history banner when online", async () => {
    render(
      <OfflineHistoryBanner
        isOffline={false}
        hasOlderMessages={false}
        loadingOlderMessages={false}
      />,
    );

    await expect
      .element(
        page.getByText(
          "Reached top of cached history — connect to load older messages",
        ),
      )
      .not.toBeInTheDocument();
  });
});

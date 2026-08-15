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
  test("renders offline media placeholder card when uncached media fails to load while offline", async () => {
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
          },
        ]}
      />,
    );

    const img = page.getByRole("img");
    await expect.element(img).toBeInTheDocument();

    const imgEl = img.element();
    imgEl.dispatchEvent(new Event("error"));

    await expect
      .element(
        page.getByText(
          "Media unavailable offline — tap to retry when online",
        ),
      )
      .toBeInTheDocument();
  });

  test("renders top of cached history banner when offline and no older messages exist", async () => {
    render(
      <OfflineHistoryBanner
        isOffline={true}
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
      .toBeInTheDocument();
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

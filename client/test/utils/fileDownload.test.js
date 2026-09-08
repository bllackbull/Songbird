import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getMessageFileDownloadUrl,
  getMessageFileDownloadName,
  downloadMessageFile,
} from "../../src/utils/fileDownload.js";

const APP_ORIGIN = "https://app.example.test";
const BUCKET_URL = "https://bucket.example.test/files/photo.png";

const createFakeDocument = () => {
  const anchors = [];
  const document = {
    body: {
      appendChild: vi.fn(),
    },
    createElement: vi.fn(() => {
      const anchor = {
        href: "",
        download: "",
        rel: "",
        target: "",
        click: vi.fn(),
        remove: vi.fn(),
      };
      anchors.push(anchor);
      return anchor;
    }),
  };
  return { document, anchors };
};

const stubBrowserGlobals = (document) => {
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", {
    location: { href: `${APP_ORIGIN}/`, origin: APP_ORIGIN },
    setTimeout: globalThis.setTimeout,
  });
};

const stubBlobFetch = (ok = true) => {
  const fetchMock = vi.fn(async () =>
    ok
      ? {
          ok: true,
          blob: async () => new Blob(["media-bytes"], { type: "image/png" }),
        }
      : { ok: false, status: 404 },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe("fileDownload", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:local-photo");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.unstubAllGlobals();
  });

  describe("getMessageFileDownloadUrl", () => {
    test("appends download=1 to a plain URL", () => {
      expect(
        getMessageFileDownloadUrl({ url: "/api/uploads/messages/abc" }),
      ).toBe("/api/uploads/messages/abc?download=1");
    });

    test("appends download=1 with & when the URL already has a query string", () => {
      expect(
        getMessageFileDownloadUrl({ downloadUrl: "/a?x=1", url: "/b" }),
      ).toBe("/a?x=1&download=1");
    });
  });

  describe("getMessageFileDownloadName", () => {
    test("falls back to media when no name is present", () => {
      expect(getMessageFileDownloadName({})).toBe("media");
    });
  });

  describe("downloadMessageFile", () => {
    test("downloads cross-origin media via a blob object URL instead of the bare bucket link", async () => {
      const { document, anchors } = createFakeDocument();
      stubBrowserGlobals(document);
      const fetchMock = stubBlobFetch();

      const result = await downloadMessageFile({
        url: BUCKET_URL,
        name: "photo.png",
      });

      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `${BUCKET_URL}?download=1`,
        expect.anything(),
      );
      expect(anchors).toHaveLength(1);
      expect(anchors[0].href).toBe("blob:local-photo");
      expect(anchors[0].download).toBe("photo.png");
      expect(anchors[0].click).toHaveBeenCalledTimes(1);
    });

    test("keeps a direct anchor download for same-origin URLs", async () => {
      const { document, anchors } = createFakeDocument();
      stubBrowserGlobals(document);
      const fetchMock = stubBlobFetch();

      const result = await downloadMessageFile({
        url: "/api/uploads/messages/abc.png",
        name: "photo.png",
      });

      expect(result).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(anchors).toHaveLength(1);
      expect(anchors[0].href).toBe("/api/uploads/messages/abc.png?download=1");
      expect(anchors[0].download).toBe("photo.png");
    });

    test("falls back to a direct link when the cross-origin fetch fails", async () => {
      const { document, anchors } = createFakeDocument();
      stubBrowserGlobals(document);
      const fetchMock = vi.fn(async () => {
        throw new Error("network down");
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await downloadMessageFile({
        url: BUCKET_URL,
        name: "photo.png",
      });

      expect(result).toBe(true);
      expect(anchors[0].href).toBe(`${BUCKET_URL}?download=1`);
      expect(anchors[0].download).toBe("photo.png");
    });
  });
});

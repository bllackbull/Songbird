import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { getChatPreview, uploadFile, claimAdminPrivileges } from "../../src/api/chatApi.js";
import * as mediaPreprocess from "../../src/utils/mediaPreprocess.js";

const originalFetch = globalThis.fetch;

describe("chatApi.uploadFile", () => {
  beforeEach(() => {
    vi.spyOn(
      mediaPreprocess,
      "extractMediaPreprocessMetadata",
    ).mockResolvedValue({
      width: 100,
      height: 200,
      duration: 30,
      clientWebpThumbBase64: "data:image/webp;base64,mockthumb",
      waveform: [0.1, 0.5, 0.9],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("performs S3 presigned upload when endpoint returns type === 's3'", async () => {
    const file = new File(["test content"], "photo.png", { type: "image/png" });

    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/uploads/presign") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            type: "s3",
            uploadUrl:
              "https://my-bucket.s3.amazonaws.com/uploads/photo.png?sig=123",
            fileId: 42,
            storageKey: "uploads/photo.png",
            blurhash: "mockblurhash",
          }),
        };
      }
      if (
        url === "https://my-bucket.s3.amazonaws.com/uploads/photo.png?sig=123"
      ) {
        expect(options.method).toBe("PUT");
        expect(options.headers["Content-Type"]).toBe("image/png");
        expect(options.body).toBe(file);
        return { ok: true };
      }
      if (url === "/api/uploads/complete") {
        expect(options.method).toBe("POST");
        const body = JSON.parse(options.body);
        expect(body).toEqual({ fileId: 42, storageKey: "uploads/photo.png" });
        return {
          ok: true,
          json: async () => ({ success: true, fileId: 42, status: "ready" }),
        };
      }
      return { ok: false, status: 404 };
    });

    globalThis.fetch = fetchMock;

    const result = await uploadFile(file);

    expect(result).toEqual({
      fileId: 42,
      url: "/api/uploads/file/42",
      filename: "photo.png",
      mimeType: "image/png",
      fileSize: file.size,
      waveform: [0.1, 0.5, 0.9],
      blurhash: "mockblurhash",
    });
  });

  test("falls back to POST /api/uploads when presign returns type === 'local'", async () => {
    const file = new File(["test content"], "doc.pdf", {
      type: "application/pdf",
    });

    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/uploads/presign") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            type: "local",
            uploadUrl: "/api/uploads",
          }),
        };
      }
      if (url === "/api/uploads") {
        expect(options.method).toBe("POST");
        expect(options.body).toBeInstanceOf(FormData);
        return {
          ok: true,
          json: async () => ({
            fileId: 99,
            url: "/api/uploads/file/99",
            filename: "doc.pdf",
            mimeType: "application/pdf",
            fileSize: file.size,
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    globalThis.fetch = fetchMock;

    const result = await uploadFile(file);

    expect(result).toEqual({
      fileId: 99,
      url: "/api/uploads/file/99",
      filename: "doc.pdf",
      mimeType: "application/pdf",
      fileSize: file.size,
    });
  });

  test("falls back to POST /api/uploads when presign fails", async () => {
    const file = new File(["audio data"], "voice.webm", { type: "audio/webm" });

    const fetchMock = vi.fn(async (url, _options = {}) => {
      if (url === "/api/uploads/presign") {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Server error" }),
        };
      }
      if (url === "/api/uploads") {
        return {
          ok: true,
          json: async () => ({
            fileId: 105,
            url: "/api/uploads/file/105",
            filename: "voice.webm",
            mimeType: "audio/webm",
            fileSize: file.size,
            waveform: [0.1, 0.5, 0.9],
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    globalThis.fetch = fetchMock;

    const result = await uploadFile(file);

    expect(result.fileId).toBe(105);
    expect(result.url).toBe("/api/uploads/file/105");
  });
});

describe("chatApi.getChatPreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("adds allowMissing for background preview lookups", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    await getChatPreview({
      chatId: 19,
      username: "blackbull",
      allowMissing: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chats/19/preview?username=blackbull&allowMissing=1",
      { credentials: "include" },
    );
  });

  test("does not add allowMissing for interactive previews", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    await getChatPreview({ chatId: 19, username: "blackbull" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chats/19/preview?username=blackbull",
      { credentials: "include" },
    );
  });
});

describe("chatApi.claimAdminPrivileges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("posts token to /api/admin/claim", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, role: "owner" }),
    });
    globalThis.fetch = fetchMock;

    const result = await claimAdminPrivileges("secret-token");

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/claim", {
      credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "secret-token" }),
    });
    expect(result).toEqual({ ok: true, role: "owner" });
  });
});

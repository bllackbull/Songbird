import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getChatPreview,
  uploadFile,
  claimAdminPrivileges,
  presignUploadFile,
  uploadFileToPresignedUrl,
  prepareFilesForMessage,
} from "../../src/api/chatApi.js";
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
    const fileUuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/uploads/presign") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            type: "s3",
            uploadUrl:
              "https://my-bucket.s3.amazonaws.com/uploads/photo.png?sig=123",
            fileId: fileUuid,
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
        expect(body).toEqual({ fileId: fileUuid, storageKey: "uploads/photo.png" });
        return {
          ok: true,
          json: async () => ({ success: true, fileId: fileUuid, status: "ready" }),
        };
      }
      return { ok: false, status: 404 };
    });

    globalThis.fetch = fetchMock;

    const result = await uploadFile(file);

    expect(result).toEqual({
      fileId: fileUuid,
      url: `/api/uploads/file/${fileUuid}`,
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

describe("chatApi.presignUploadFile", () => {
  beforeEach(() => {
    vi.spyOn(mediaPreprocess, "extractMediaPreprocessMetadata").mockResolvedValue({
      width: 640,
      height: 480,
      duration: 12,
      clientWebpThumbBase64: "data:image/webp;base64,thumb",
      waveform: [0.2, 0.4, 0.6],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("requests presigned upload with file details and extracted metadata", async () => {
    const file = new File(["test data"], "avatar.png", { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        type: "remote",
        uploadUrl: "https://r2.cloud.com/upload/avatar.png?token=xyz",
        storageKey: "uploads/avatar.png",
      }),
    });
    globalThis.fetch = fetchMock;

    const result = await presignUploadFile(file);

    expect(fetchMock).toHaveBeenCalledWith("/api/uploads/presign", {
      credentials: "include",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "avatar.png",
        contentType: "image/png",
        fileSize: file.size,
        width: 640,
        height: 480,
        duration: 12,
        clientWebpThumbBase64: "data:image/webp;base64,thumb",
        blurhash: null,
        waveform: [0.2, 0.4, 0.6],
      }),
    });
    expect(result.storageKey).toBe("uploads/avatar.png");
    expect(result.uploadUrl).toBe("https://r2.cloud.com/upload/avatar.png?token=xyz");
  });

  test("throws error when presign request responds with non-ok status", async () => {
    const file = new File(["test"], "file.txt", { type: "text/plain" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "File size exceeds limit." }),
    });
    globalThis.fetch = fetchMock;

    await expect(presignUploadFile(file)).rejects.toThrow("File size exceeds limit.");
  });
});

describe("chatApi.uploadFileToPresignedUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("uploads file using PUT request to presigned URL", async () => {
    const file = new File(["binary content"], "file.bin", { type: "application/octet-stream" });
    const uploadUrl = "https://s3.amazonaws.com/bucket/file.bin?sig=abc";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = fetchMock;

    const result = await uploadFileToPresignedUrl(uploadUrl, file);

    expect(fetchMock).toHaveBeenCalledWith(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    expect(result.ok).toBe(true);
  });

  test("throws error when PUT request fails", async () => {
    const file = new File(["data"], "test.jpg", { type: "image/jpeg" });
    const uploadUrl = "https://s3.amazonaws.com/bucket/test.jpg?sig=bad";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    globalThis.fetch = fetchMock;

    await expect(uploadFileToPresignedUrl(uploadUrl, file)).rejects.toThrow("S3 upload failed with status 403");
  });
});

describe("chatApi.prepareFilesForMessage", () => {
  beforeEach(() => {
    vi.spyOn(mediaPreprocess, "extractMediaPreprocessMetadata").mockResolvedValue({
      width: 800,
      height: 600,
      duration: 0,
      clientWebpThumbBase64: null,
      waveform: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  test("prepares remote presigned files and local fallback files for message upload", async () => {
    const file1 = new File(["image data"], "pic.jpg", { type: "image/jpeg" });
    const file2 = new File(["pdf data"], "doc.pdf", { type: "application/pdf" });

    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === "/api/uploads/presign") {
        const body = JSON.parse(options.body);
        if (body.filename === "pic.jpg") {
          return {
            ok: true,
            json: async () => ({
              success: true,
              type: "s3",
              uploadUrl: "https://s3.amazonaws.com/bucket/pic.jpg?sig=1",
              storageKey: "uploads/pic.jpg",
              fileId: "uuid-pic-123",
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            type: "local",
            uploadUrl: "/api/uploads",
          }),
        };
      }
      if (url === "https://s3.amazonaws.com/bucket/pic.jpg?sig=1") {
        return { ok: true, status: 200 };
      }
      return { ok: false, status: 404 };
    });

    globalThis.fetch = fetchMock;

    const result = await prepareFilesForMessage([file1, file2]);

    expect(result.presignedFiles.length).toBe(1);
    expect(result.presignedFiles[0].storageKey).toBe("uploads/pic.jpg");
    expect(result.presignedFiles[0].originalName).toBe("pic.jpg");

    expect(result.localFiles.length).toBe(1);
    expect(result.localFiles[0]).toBe(file2);

    expect(result.fileMeta.length).toBe(2);
    expect(result.fileMeta[0].originalName).toBe("pic.jpg");
    expect(result.fileMeta[1].originalName).toBe("doc.pdf");
  });
});

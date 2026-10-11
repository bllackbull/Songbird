import { describe, test, expect, vi } from "vitest";
import { dispatchMediaWorkerJob } from "../../lib/mediaWorker.js";

describe("dispatchMediaWorkerJob", () => {
  test("returns false when fileId is missing", async () => {
    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "http://localhost:8080",
      fileId: null,
      storageKey: "uploads/clip.mp4",
    });
    expect(res).toBe(false);
  });

  test("dispatches POST request with correct payload and headers in remote mode", async () => {
    let capturedUrl = "";
    let capturedOptions = {};

    const mockFetch = vi.fn(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return { ok: true, status: 202 };
    });

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "http://media-worker.internal:8080/",
      storageProcessingMode: "remote",
      webhookSecret: "super-secret-token",
      callbackUrl: "https://songbird.app/api/uploads/webhook/processed",
      fileId: 42,
      storageKey: "uploads/test.mp4",
      storedName: "test.mp4",
      mimeType: "video/mp4",
      encryptionType: "remote",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(true);
    expect(capturedUrl).toBe("http://media-worker.internal:8080/transcode");
    expect(capturedOptions.method).toBe("POST");
    expect(capturedOptions.headers["x-songbird-webhook-secret"]).toBe(
      "super-secret-token",
    );
    expect(capturedOptions.headers["Content-Type"]).toBe("application/json");

    const parsedBody = JSON.parse(capturedOptions.body);
    expect(parsedBody).toEqual({
      fileId: 42,
      storageKey: "uploads/test.mp4",
      storedName: "test.mp4",
      mimeType: "video/mp4",
      encryptionType: "remote",
      callbackUrl: "https://songbird.app/api/uploads/webhook/processed",
    });
  });

  test("dispatches POST request with workerUrl parameter", async () => {
    let capturedUrl = "";
    const mockFetch = vi.fn(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 202 };
    });

    const res = await dispatchMediaWorkerJob({
      workerUrl: "https://custom-worker.example.com",
      storageProcessingMode: "remote",
      fileId: 100,
      storageKey: "uploads/custom.mp4",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(true);
    expect(capturedUrl).toBe("https://custom-worker.example.com/transcode");
  });

  test("in remote mode, replaces loopback callbackUrl with null when no public callback URL is set", async () => {
    let capturedOptions = {};

    const mockFetch = vi.fn(async (url, options) => {
      capturedOptions = options;
      return { ok: true, status: 202 };
    });

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "https://worker.onrender.com",
      storageProcessingMode: "remote",
      callbackUrl: "http://127.0.0.1:5174/api/uploads/webhook/processed",
      fileId: 88,
      storageKey: "uploads/loopback.mp4",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(true);
    const parsedBody = JSON.parse(capturedOptions.body);
    expect(parsedBody.callbackUrl).toBeNull();
  });

  test("in remote mode, returns false when mediaWorkerUrl is missing and does not call local worker", async () => {
    const mockFetch = vi.fn();
    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: null,
      storageProcessingMode: "remote",
      fileId: 123,
      storageKey: "uploads/clip.mp4",
      fetchImpl: mockFetch,
    });
    expect(res).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("in remote mode, returns false on failure without falling back to local worker", async () => {
    const mockFetch = vi.fn(async () => ({ ok: false, status: 500 }));

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "https://remote-worker.example.com",
      storageProcessingMode: "remote",
      fileId: 99,
      storageKey: "uploads/fail.mp4",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://remote-worker.example.com/transcode");
  });

  test("in local mode, calls only the local worker and ignores remote mediaWorkerUrl", async () => {
    const calls = [];
    const mockFetch = vi.fn(async (url) => {
      calls.push(url);
      return { ok: true, status: 200 };
    });

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "https://remote-worker.example.com",
      storageProcessingMode: "local",
      workerPort: 9090,
      fileId: 55,
      storageKey: "uploads/local.mp4",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(true);
    expect(calls).toEqual(["http://127.0.0.1:9090/transcode"]);
  });

  test("in auto mode with remote URL, calls remote worker on first attempt if successful", async () => {
    const calls = [];
    const mockFetch = vi.fn(async (url) => {
      calls.push(url);
      return { ok: true, status: 202 };
    });

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "https://remote-worker.example.com",
      storageProcessingMode: "auto",
      workerPort: 8080,
      fileId: 101,
      storageKey: "uploads/remote-success.mp4",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(true);
    expect(calls).toEqual(["https://remote-worker.example.com/transcode"]);
  });

  test("in auto mode with remote URL, retries for storageProcessingTimeoutMs before falling back to local worker", async () => {
    const calls = [];
    const mockFetch = vi.fn(async (url) => {
      calls.push(url);
      if (url.includes("remote-worker")) {
        return { ok: false, status: 503 };
      }
      return { ok: true, status: 200 };
    });

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "https://remote-worker.example.com",
      storageProcessingMode: "auto",
      storageProcessingTimeoutMs: 60,
      retryDelayMs: 20,
      workerPort: 8080,
      fileId: 102,
      storageKey: "uploads/retry-fallback.mp4",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]).toBe("https://remote-worker.example.com/transcode");
    expect(calls[calls.length - 1]).toBe("http://127.0.0.1:8080/transcode");
  });

  test("in auto mode with no remote URL, calls local worker directly", async () => {
    const calls = [];
    const mockFetch = vi.fn(async (url) => {
      calls.push(url);
      return { ok: true, status: 200 };
    });

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: null,
      storageProcessingMode: "auto",
      workerPort: 8080,
      fileId: 99,
      storageKey: "uploads/local-direct.mp4",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(true);
    expect(calls).toEqual(["http://127.0.0.1:8080/transcode"]);
  });

  test("does not dispatch any worker request when transcodeEnabled is false", async () => {
    const mockFetch = vi.fn();

    const res = await dispatchMediaWorkerJob({
      workerUrl: "http://localhost:8080",
      fileId: 100,
      storageKey: "uploads/video.mp4",
      transcodeEnabled: false,
      fetchImpl: mockFetch,
    });

    expect(res).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("does not dispatch any worker request when FILE_UPLOAD_TRANSCODE_VIDEOS env is false", async () => {
    const originalEnv = process.env.FILE_UPLOAD_TRANSCODE_VIDEOS;
    process.env.FILE_UPLOAD_TRANSCODE_VIDEOS = "false";
    try {
      const mockFetch = vi.fn();

      const res = await dispatchMediaWorkerJob({
        workerUrl: "http://localhost:8080",
        fileId: 101,
        storageKey: "uploads/video.mp4",
        fetchImpl: mockFetch,
      });

      expect(res).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      if (originalEnv !== undefined) {
        process.env.FILE_UPLOAD_TRANSCODE_VIDEOS = originalEnv;
      } else {
        delete process.env.FILE_UPLOAD_TRANSCODE_VIDEOS;
      }
    }
  });
});

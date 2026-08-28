import { describe, test, expect, vi } from "vitest";
import { dispatchMediaWorkerJob } from "../../lib/mediaWorker.js";

describe("dispatchMediaWorkerJob", () => {
  test("returns false when mediaWorkerUrl is missing", async () => {
    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: null,
      fileId: 123,
      storageKey: "uploads/clip.mp4",
    });
    expect(res).toBe(false);
  });

  test("returns false when fileId is missing", async () => {
    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "http://localhost:8080",
      fileId: null,
      storageKey: "uploads/clip.mp4",
    });
    expect(res).toBe(false);
  });

  test("dispatches POST request with correct payload and headers", async () => {
    let capturedUrl = "";
    let capturedOptions = {};

    const mockFetch = vi.fn(async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return { ok: true, status: 202 };
    });

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "http://media-worker.internal:8080/",
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

  test("handles fetch network failure gracefully and returns false", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("Connection refused");
    });

    const res = await dispatchMediaWorkerJob({
      mediaWorkerUrl: "http://media-worker.internal:8080",
      fileId: 99,
      storageKey: "uploads/fail.mp4",
      fetchImpl: mockFetch,
    });

    expect(res).toBe(false);
  });
});

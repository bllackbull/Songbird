import { describe, it, expect, vi, beforeEach } from "vitest";
import { createVideoTranscodeManager } from "../lib/videoTranscode.js";
import { LocalStorageProvider } from "../lib/storage/LocalStorageProvider.js";
import { createStorageEncryption } from "../lib/storageEncryption.js";

describe("Video Transcode Manager - Unified Worker Dispatch & Processing Checks", () => {
  let mockStorageProvider;
  let dbRows;
  let adminRunEvents;
  let emittedEvents;
  let storageEncryption;
  let mockFetch;

  beforeEach(async () => {
    mockStorageProvider = new LocalStorageProvider({ uploadDir: "/tmp/transcode-test" });
    dbRows = new Map();
    adminRunEvents = [];
    emittedEvents = [];
    storageEncryption = createStorageEncryption();
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ success: true, message: "Transcode job accepted" }),
    });
  });

  it("evaluates isVideoFileProcessing correctly for remote and local storage rows", async () => {
    const manager = createVideoTranscodeManager({
      transcodeVideosToH264: true,
      storageEncryption,
      storageProvider: mockStorageProvider,
    });

    // 1. Ready status on remote storage must NOT be processing, even if stored_name has no -h264-
    expect(
      manager.isVideoFileProcessing({
        mime_type: "video/mp4",
        stored_name: "original_raw_video.mp4",
        storage_driver: "remote",
        storage_key: "uploads/123-h264-abc.mp4",
        processing_status: "ready",
      }),
    ).toBe(false);

    // 2. Transcoded storage key must NOT be processing
    expect(
      manager.isVideoFileProcessing({
        mime_type: "video/mp4",
        stored_name: "original_raw_video.mp4",
        storage_driver: "remote",
        storage_key: "uploads/video-h264-abc.mp4",
      }),
    ).toBe(false);

    // 3. Transcoded stored_name must NOT be processing
    expect(
      manager.isVideoFileProcessing({
        mime_type: "video/mp4",
        stored_name: "video-h264-abc.mp4",
        storage_driver: "local",
      }),
    ).toBe(false);

    // 4. Non-video file must NOT be processing
    expect(
      manager.isVideoFileProcessing({
        mime_type: "image/png",
        stored_name: "image.png",
      }),
    ).toBe(false);

    // 5. Raw video file with pending or no status IS processing
    expect(
      manager.isVideoFileProcessing({
        mime_type: "video/mp4",
        stored_name: "raw.mp4",
        storage_driver: "remote",
        storage_key: "uploads/123-foo.mp4",
        processing_status: "pending",
      }),
    ).toBe(true);
  });

  it("dispatches HTTP transcode job to mediaWorkerUrl upon enqueueVideoTranscodeJob", async () => {
    dbRows.set("job_2", {
      id: "job_2",
      mime_type: "video/mp4",
      stored_name: "remote_sample.mp4",
      storage_key: "uploads/remote_sample.mp4",
      encryption_type: "none",
      processing_status: "pending",
    });

    const manager = createVideoTranscodeManager({
      transcodeVideosToH264: true,
      storageEncryption,
      storageProvider: mockStorageProvider,
      mediaWorkerUrl: "http://127.0.0.1:8080",
      adminGetRow: (query) => {
        return dbRows.get("job_2") || null;
      },
      fetchImpl: mockFetch,
    });

    const res = await manager.enqueueVideoTranscodeJob({
      fileId: "job_2",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8080/transcode");
    const payload = JSON.parse(opts.body);
    expect(payload.fileId).toBe("job_2");
    expect(payload.storageKey).toBe("uploads/remote_sample.mp4");
    expect(payload.storedName).toBe("remote_sample.mp4");
    expect(payload.mimeType).toBe("video/mp4");
    expect(payload.encryptionType).toBe("none");
    expect(res).toBe(true);
  });

  it("does not dispatch transcode job when storageProcessingMode is 'remote' and mediaWorkerUrl is omitted", async () => {
    dbRows.set("uuid-remote-video-2", {
      id: "uuid-remote-video-2",
      mime_type: "video/mp4",
      stored_name: "uuid-remote-video-2.mp4",
      storage_key: "uploads/uuid-remote-video-2.mp4",
      encryption_type: "none",
      processing_status: "pending",
    });

    const manager = createVideoTranscodeManager({
      transcodeVideosToH264: true,
      storageEncryption,
      storageProvider: mockStorageProvider,
      storageProcessingMode: "remote",
      mediaWorkerUrl: null,
      adminGetRow: () => {
        return dbRows.get("uuid-remote-video-2") || null;
      },
      fetchImpl: mockFetch,
    });

    const res = await manager.enqueueVideoTranscodeJob({
      fileId: "uuid-remote-video-2",
      storageProcessingMode: "remote",
    });

    expect(res).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("dispatches to local worker URL when storageProcessingMode is 'local' and mediaWorkerUrl is omitted", async () => {
    dbRows.set("uuid-local-video-3", {
      id: "uuid-local-video-3",
      mime_type: "video/mp4",
      stored_name: "uuid-local-video-3.mp4",
      storage_key: "uploads/uuid-local-video-3.mp4",
      encryption_type: "none",
      processing_status: "pending",
    });

    const manager = createVideoTranscodeManager({
      transcodeVideosToH264: true,
      storageEncryption,
      storageProvider: mockStorageProvider,
      storageProcessingMode: "local",
      mediaWorkerUrl: null,
      adminGetRow: () => {
        return dbRows.get("uuid-local-video-3") || null;
      },
      fetchImpl: mockFetch,
    });

    const res = await manager.enqueueVideoTranscodeJob({
      fileId: "uuid-local-video-3",
      storageProcessingMode: "local",
    });

    expect(res).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("127.0.0.1");
    expect(url).toContain("/transcode");
  });

  it("in auto mode with remote worker URL, retries 3 times on remote failure then falls back to local worker", async () => {
    dbRows.set("uuid-auto-video-4", {
      id: "uuid-auto-video-4",
      mime_type: "video/mp4",
      stored_name: "uuid-auto-video-4.mp4",
      storage_key: "uploads/uuid-auto-video-4.mp4",
      encryption_type: "none",
      processing_status: "pending",
    });

    const calls = [];
    const customFetch = vi.fn(async (url) => {
      calls.push(url);
      if (url.includes("remote-service.net")) {
        return { ok: false, status: 502 };
      }
      return { ok: true, status: 200 };
    });

    const manager = createVideoTranscodeManager({
      transcodeVideosToH264: true,
      storageEncryption,
      storageProvider: mockStorageProvider,
      storageProcessingMode: "auto",
      mediaWorkerUrl: "https://remote-service.net",
      adminGetRow: () => {
        return dbRows.get("uuid-auto-video-4") || null;
      },
      fetchImpl: customFetch,
    });

    const res = await manager.enqueueVideoTranscodeJob({
      fileId: "uuid-auto-video-4",
      storageProcessingMode: "auto",
      storageProcessingTimeoutMs: 50,
      retryDelayMs: 15,
    });

    expect(res).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]).toBe("https://remote-service.net/transcode");
    expect(calls[calls.length - 1]).toBe("http://127.0.0.1:8080/transcode");
  });
});

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
        storage_driver: "s3",
        storage_key: "uploads/123-h264-abc.mp4",
      }),
    ).toBe(false);

    // 3. Pending status on remote storage IS processing
    expect(
      manager.isVideoFileProcessing({
        mime_type: "video/mp4",
        stored_name: "original_raw_video.mp4",
        storage_driver: "remote",
        storage_key: "uploads/123.mp4",
        processing_status: "pending",
      }),
    ).toBe(true);

    // 4. Non-video is NOT processing
    expect(
      manager.isVideoFileProcessing({
        mime_type: "image/png",
        stored_name: "photo.png",
      }),
    ).toBe(false);
  });

  it("dispatches HTTP transcode job to mediaWorkerUrl upon enqueueVideoTranscodeJob", async () => {
    const fileRecord = {
      id: "file-uuid-123",
      message_id: "msg-uuid-456",
      stored_name: "video123.mp4",
      storage_key: "messages/video123.mp4",
      storage_driver: "remote",
      mime_type: "video/mp4",
      processing_status: "pending",
    };
    dbRows.set("file-uuid-123", fileRecord);

    const manager = createVideoTranscodeManager({
      adminRun: (sql) => {
        adminRunEvents.push(sql);
      },
      adminGetRow: () => fileRecord,
      adminSave: () => {},
      listMessageFilesByMessageIds: () => [fileRecord],
      emitChatEvent: (chatId, evt) => {
        emittedEvents.push({ chatId, evt });
      },
      debugLog: () => {},
      uploadRootDir: "/tmp/transcode-test",
      transcodeVideosToH264: true,
      storageEncryption,
      storageProvider: mockStorageProvider,
      mediaWorkerUrl: "http://127.0.0.1:8080",
      webhookSecret: "test-secret-123",
      fetchImpl: mockFetch,
    });

    const jobHandled = await manager.enqueueVideoTranscodeJob({
      fileId: "file-uuid-123",
      storedName: "video123.mp4",
      storageKey: "messages/video123.mp4",
      storageDriver: "remote",
      chatId: "chat-uuid-789",
      messageId: "msg-uuid-456",
    });

    expect(jobHandled).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8080/transcode");
    expect(options.method).toBe("POST");
    expect(options.headers["x-songbird-webhook-secret"]).toBe("test-secret-123");

    const parsedBody = JSON.parse(options.body);
    expect(parsedBody.fileId).toBe("file-uuid-123");
    expect(parsedBody.storageKey).toBe("messages/video123.mp4");
    expect(parsedBody.storedName).toBe("video123.mp4");
  });
});

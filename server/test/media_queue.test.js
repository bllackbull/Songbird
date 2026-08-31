import { describe, it, expect, vi } from "vitest";
import { createMediaQueueManager } from "../lib/mediaQueue.js";

const FILE_ID_1 = "10000000-0000-4000-8000-000000000010";
const FILE_ID_2 = "10000000-0000-4000-8000-000000000011";
const FILE_ID_3 = "10000000-0000-4000-8000-000000000012";

describe("MediaQueueManager (BullMQ / In-Process Fallback)", () => {
  it("executes fallback processing if status is pending when timer triggers", async () => {
    let runCalled = false;
    let eventEmitted = false;

    const manager = createMediaQueueManager({
      s3ProcessingMode: "auto",
      s3ProcessingTimeoutMs: 50,
      adminGetRow: () => ({ id: FILE_ID_1, processing_status: "pending" }),
      adminRun: (sql, params) => {
        if (sql.includes("processing_status") && (params?.includes("ready") || sql.includes("ready"))) {
          runCalled = true;
        }
      },
      emitChatEvent: (eventName, payload) => {
        if (payload?.type === "video:ready") {
          eventEmitted = true;
        }
      },
    });

    manager.scheduleFallbackCheck({
      fileId: FILE_ID_1,
      storageKey: "uploads/file.mp4",
    });

    // Wait for the short timeout to fire
    await new Promise((res) => setTimeout(res, 100));

    expect(runCalled).toBe(true);
    expect(eventEmitted).toBe(true);

    await manager.close();
  });

  it("skips fallback processing if status is already ready", async () => {
    let runCalled = false;

    const manager = createMediaQueueManager({
      s3ProcessingMode: "auto",
      s3ProcessingTimeoutMs: 50,
      adminGetRow: () => ({ id: FILE_ID_2, processing_status: "ready" }),
      adminRun: () => {
        runCalled = true;
      },
    });

    manager.scheduleFallbackCheck({
      fileId: FILE_ID_2,
      storageKey: "uploads/file.mp4",
    });

    await new Promise((res) => setTimeout(res, 100));

    expect(runCalled).toBe(false);

    await manager.close();
  });

  it("allows cancelling fallback check when webhook arrives", async () => {
    let runCalled = false;

    const manager = createMediaQueueManager({
      s3ProcessingMode: "auto",
      s3ProcessingTimeoutMs: 100,
      adminGetRow: () => ({ id: FILE_ID_3, processing_status: "pending" }),
      adminRun: () => {
        runCalled = true;
      },
    });

    manager.scheduleFallbackCheck({
      fileId: FILE_ID_3,
      storageKey: "uploads/file.mp4",
    });
    manager.cancelFallbackCheck(FILE_ID_3);

    await new Promise((res) => setTimeout(res, 150));

    expect(runCalled).toBe(false);

    await manager.close();
  });

  it("marks file as ready and skips calling enqueueVideoTranscodeJob when transcodeVideosToH264 is false", async () => {
    let runCalled = false;
    let eventEmitted = false;
    const enqueueJobMock = vi.fn();

    const manager = createMediaQueueManager({
      s3ProcessingMode: "auto",
      s3ProcessingTimeoutMs: 50,
      transcodeVideosToH264: false,
      enqueueVideoTranscodeJob: enqueueJobMock,
      adminGetRow: () => ({ id: FILE_ID_1, mime_type: "video/mp4", processing_status: "pending" }),
      adminRun: (sql, params) => {
        if (sql.includes("processing_status") && (params?.includes("ready") || sql.includes("ready"))) {
          runCalled = true;
        }
      },
      emitChatEvent: (eventName, payload) => {
        if (payload?.type === "video:ready") {
          eventEmitted = true;
        }
      },
    });

    manager.scheduleFallbackCheck({
      fileId: FILE_ID_1,
      storageKey: "uploads/file.mp4",
    });

    await new Promise((res) => setTimeout(res, 100));

    expect(enqueueJobMock).not.toHaveBeenCalled();
    expect(runCalled).toBe(true);
    expect(eventEmitted).toBe(true);

    await manager.close();
  });

  it("respects process.env.STORAGE_PROCESSING_TIMEOUT_MS when s3ProcessingTimeoutMs is omitted", async () => {
    const originalEnv = process.env.STORAGE_PROCESSING_TIMEOUT_MS;
    process.env.STORAGE_PROCESSING_TIMEOUT_MS = "60";

    try {
      let runCalled = false;
      const manager = createMediaQueueManager({
        s3ProcessingMode: "auto",
        adminGetRow: () => ({ id: FILE_ID_1, processing_status: "pending" }),
        adminRun: (sql, params) => {
          if (sql.includes("processing_status") && (params?.includes("ready") || sql.includes("ready"))) {
            runCalled = true;
          }
        },
      });

      manager.scheduleFallbackCheck({
        fileId: FILE_ID_1,
        storageKey: "uploads/file.mp4",
      });

      // Before timeout (30ms), should not have run
      await new Promise((res) => setTimeout(res, 20));
      expect(runCalled).toBe(false);

      // After timeout (60ms), should run
      await new Promise((res) => setTimeout(res, 80));
      expect(runCalled).toBe(true);

      await manager.close();
    } finally {
      if (originalEnv !== undefined) {
        process.env.STORAGE_PROCESSING_TIMEOUT_MS = originalEnv;
      } else {
        delete process.env.STORAGE_PROCESSING_TIMEOUT_MS;
      }
    }
  });
});

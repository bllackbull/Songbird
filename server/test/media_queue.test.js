import { describe, it, expect, vi } from "vitest";
import { createMediaQueueManager } from "../lib/mediaQueue.js";

describe("MediaQueueManager (BullMQ / In-Process Fallback)", () => {
  it("executes fallback processing if status is pending when timer triggers", async () => {
    let runCalled = false;
    let eventEmitted = false;

    const manager = createMediaQueueManager({
      s3ProcessingMode: "auto",
      s3ProcessingTimeoutMs: 50,
      adminGetRow: () => ({ id: 10, processing_status: "pending" }),
      adminRun: (sql, params) => {
        if (sql.includes("processing_status = 'ready'")) {
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
      fileId: 10,
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
      adminGetRow: () => ({ id: 11, processing_status: "ready" }),
      adminRun: () => {
        runCalled = true;
      },
    });

    manager.scheduleFallbackCheck({
      fileId: 11,
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
      adminGetRow: () => ({ id: 12, processing_status: "pending" }),
      adminRun: () => {
        runCalled = true;
      },
    });

    manager.scheduleFallbackCheck({
      fileId: 12,
      storageKey: "uploads/file.mp4",
    });
    manager.cancelFallbackCheck(12);

    await new Promise((res) => setTimeout(res, 150));

    expect(runCalled).toBe(false);

    await manager.close();
  });
});

import { describe, test, expect, vi } from "vitest";

import { createRemoteChannelManager } from "../../lib/remoteChannels.js";

function makeManager(config = {}, deps = {}) {
  return createRemoteChannelManager({
    config: {
      enabled: true,
      pollIntervalMs: 50,
      queueIntervalMs: 50,
      queueBatchSize: 5,
      queueConcurrency: 1,
      ...config,
    },
    debugLog: () => {},
    listEnabledRemoteChannelSources: async () => [],
    claimNextRemoteChannelQueueItem: async () => null,
    releaseStaleRemoteChannelQueueItems: async () => 0,
    ...deps,
  });
}

describe("remote channel tick mode", () => {
  test("tick mode exposes tickMode and skips background loops on start", async () => {
    const manager = makeManager({ tickMode: true });
    expect(manager.isTickMode()).toBe(true);
    manager.start();
    const health = await manager.getHealth();
    expect(health.tickMode).toBe(true);
    expect(health.pollLoopRunning).toBe(false);
    expect(health.queueLoopRunning).toBe(false);
    manager.stop();
  });

  test("continuous mode is the default", async () => {
    const manager = makeManager({});
    expect(manager.isTickMode()).toBe(false);
    manager.stop();
  });

  test("tickOnce polls songbird sources, drains queue, and disconnects", async () => {
    const pollSongbird = vi.fn(async () => []);
    const manager = makeManager(
      { tickMode: true },
      {
        listEnabledRemoteChannelSources: pollSongbird,
      },
    );
    manager.start();
    const summary = await manager.tickOnce({ drainBatches: 1 });
    expect(pollSongbird).toHaveBeenCalled();
    expect(summary.songbird).toBe("polled");
    expect(summary.telegram).toBe("not-configured");
    expect(summary.queueBatches).toBe(1);
    manager.stop();
  });

  test("tickOnce throws when the feature is disabled", async () => {
    const manager = createRemoteChannelManager({
      config: { enabled: false, tickMode: true },
      debugLog: () => {},
    });
    await expect(manager.tickOnce()).rejects.toThrow("disabled");
  });

  test("tickOnce rejects overlapping ticks while one is already running", async () => {
    let releaseGate;
    const gate = new Promise((resolve) => {
      releaseGate = resolve;
    });
    let claimCalls = 0;
    const manager = makeManager(
      { tickMode: true },
      {
        claimNextRemoteChannelQueueItem: async () => {
          claimCalls += 1;
          if (claimCalls === 1) await gate;
          return null;
        },
      },
    );
    manager.start();
    const first = manager.tickOnce({});
    // Let the first tick reach the queue claim before starting the second.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(manager.tickOnce({})).rejects.toThrow("already in progress");
    releaseGate();
    const summary = await first;
    expect(summary.queueBatches).toBeGreaterThanOrEqual(1);
    manager.stop();
  });

  test("tickOnce drains the full queue until empty, not just two batches", async () => {
    let remaining = 12;
    const manager = makeManager(
      { tickMode: true, queueBatchSize: 5 },
      {
        claimNextRemoteChannelQueueItem: async () => {
          if (remaining <= 0) return null;
          remaining -= 1;
          return { id: 100 - remaining, source_id: 1, chat_id: "c1", attempts: 0, payload_json: "{}" };
        },
        getRemoteChannelSourceById: async () => null,
        markRemoteChannelQueueItemSkipped: async () => 0,
      },
    );
    manager.start();
    const summary = await manager.tickOnce({ drainBatches: 10 });
    manager.stop();
    expect(remaining).toBe(0);
    expect(summary.processed).toBe(12);
    expect(summary.queueBatches).toBeGreaterThan(2);
  });
});

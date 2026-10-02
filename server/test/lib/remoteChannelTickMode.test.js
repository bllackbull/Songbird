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
});

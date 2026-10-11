import { describe, test, expect, vi, afterEach } from "vitest";
import { createRemoteChannelManager } from "../../lib/remoteChannels.js";

describe("remote channel async database dependencies", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("awaits Promise-returning metadata error writes before rejecting sync", async () => {
    const events = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("remote unavailable");
      }),
    );

    const manager = createRemoteChannelManager({
      config: { enabled: true, fileUploadEnabled: false },
      getRemoteChannelSourceById: async () => ({
        id: 5,
        provider: "songbird",
        enabled: 1,
        source_url: "https://remote.example",
        source_username: "remote",
      }),
      updateRemoteChannelSourceError: async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        events.push("source-error");
      },
    });

    await expect(manager.syncSourceMetadata(5)).rejects.toThrow(
      "Songbird metadata sync failed",
    );
    expect(events).toEqual(["source-error"]);
  });
});

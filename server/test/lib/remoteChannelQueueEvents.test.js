import { describe, test, expect, vi } from "vitest";
import { createRemoteChannelManager } from "../../lib/remoteChannels.js";

const AUTHOR_ID = "11111111-1111-4111-8111-111111111111";

function makeManager({ emitChatEvent, claimImpl }) {
  return createRemoteChannelManager({
    config: {
      enabled: true,
      fileUploadEnabled: false,
      queueIntervalMs: 60000,
      pollIntervalMs: 60000,
    },
    debugLog: () => {},
    emitChatEvent,
    listEnabledRemoteChannelSources: async () => [],
    setRemoteChannelProviderState: async () => {},
    getRemoteChannelProviderState: async () => null,
    releaseStaleRemoteChannelQueueItems: async () => {},
    claimNextRemoteChannelQueueItem: claimImpl,
    markRemoteChannelQueueItemDone: async () => {},
    markRemoteChannelQueueItemRetry: async () => {},
    markRemoteChannelQueueItemSkipped: async () => {},
    updateRemoteChannelSourceError: async () => {},
    getRemoteChannelSourceById: async () => ({
      id: 5,
      provider: "songbird",
      enabled: 1,
      source_version: 1,
      chat_id: "c1",
      source_avatar_url: null,
    }),
    findChatById: async () => ({
      id: "c1",
      type: "channel",
      created_by_user_id: AUTHOR_ID,
    }),
    findUserById: async () => ({ id: AUTHOR_ID, username: "owner" }),
    createOrReuseMessage: async () => ({ id: 99 }),
    findMessageIdByClientRequestId: async () => null,
    setMessageForwardOrigin: async () => {},
    listChatMembers: async () => [],
    listMutedUserIdsForChat: async () => [],
    isUserConnected: () => false,
    sendPushNotificationToUsers: async () => {},
    computeExpiryIso: () => null,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const songbirdItem = {
  id: 1,
  source_id: 5,
  source_version: 1,
  chat_id: "c1",
  provider: "songbird",
  telegram_message_id: 11,
  payload_json: JSON.stringify({ message: { id: 11, body: "hello" } }),
};

describe("queue change events", () => {
  test("processing a batch emits remote_channel_queue for touched channels", async () => {
    const emitChatEvent = vi.fn();
    let calls = 0;
    const manager = makeManager({
      emitChatEvent,
      claimImpl: async () => {
        calls += 1;
        return calls === 1 ? songbirdItem : null;
      },
    });
    manager.start();
    try {
      await sleep(250);
    } finally {
      manager.stop();
    }
    const queueEvents = emitChatEvent.mock.calls.filter(
      ([, payload]) => payload?.type === "remote_channel_queue",
    );
    expect(queueEvents).toHaveLength(1);
    expect(queueEvents[0][0]).toBe("c1");
    expect(queueEvents[0][1]).toMatchObject({ chatId: "c1", sourceId: 5 });
  });

  test("idle ticks emit nothing", async () => {
    const emitChatEvent = vi.fn();
    const manager = makeManager({ emitChatEvent, claimImpl: async () => null });
    manager.start();
    try {
      await sleep(250);
    } finally {
      manager.stop();
    }
    expect(emitChatEvent).not.toHaveBeenCalled();
  });
});

import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const ALICE = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "alice",
  password_hash: bcrypt.hashSync("secret123", 4),
  nickname: "Alice",
  avatar_url: null,
  color: "#10b981",
  status: "online",
  role: "user",
  banned: false,
};

const CHANNEL_ID = "22222222-2222-4222-8222-222222222222";

async function loginCookie(app) {
  const res = await request(app)
    .post("/api/login")
    .send({ username: "alice", password: "secret123" });
  return res.headers["set-cookie"];
}

function baseDeps(overrides = {}) {
  return {
    REMOTE_CHANNELS: {
      enabled: true,
      telegramConfigured: true,
      proxyConfigured: false,
    },
    findChatByGroupUsername: () => null,
    createChat: () => CHANNEL_ID,
    findChatById: (id) =>
      id === CHANNEL_ID
        ? {
            id: CHANNEL_ID,
            type: "channel",
            name: "Mirror",
            group_username: "mirrorchan",
            group_visibility: "public",
          }
        : null,
    addChatMember: () => {},
    listChatMembers: () => [{ id: ALICE.id, username: "alice", role: "owner" }],
    isMember: () => true,
    getChatMemberRole: () => "owner",
    ...overrides,
  };
}

describe("remote channel upsert await regression (Postgres Promise mode)", () => {
  test("POST /api/chats/group passes the resolved source id to syncSourceMetadata", async () => {
    const userStore = makeUserStore([ALICE]);
    // Mimics the real Postgres driver where db helpers return Promises.
    const upsertRemoteChannelSource = vi.fn(async () => ({
      id: 7,
      chat_id: CHANNEL_ID,
      provider: "telegram",
      enabled: 1,
    }));
    const syncSourceMetadata = vi.fn(async (sourceId) => {
      // Mimics db.js getRemoteChannelSourceById: Number(undefined) -> NaN
      // which Postgres rejects with:
      // invalid input syntax for type integer: "NaN"
      const id = Number(sourceId);
      if (!Number.isFinite(id)) {
        throw new Error(
          'select "id" from "remote_channel_sources" where "id" = $1 limit $2 - invalid input syntax for type integer: "NaN"',
        );
      }
      return { id };
    });

    const { app } = makeApp({
      userStore,
      deps: baseDeps({
        upsertRemoteChannelSource,
        remoteChannelManager: { syncSourceMetadata },
        deleteChatById: vi.fn(),
      }),
    });

    const res = await request(app)
      .post("/api/chats/group")
      .set("Cookie", await loginCookie(app))
      .send({
        type: "channel",
        creator: "alice",
        nickname: "Mirror",
        username: "mirrorchan",
        visibility: "public",
        remoteChannel: {
          enabled: true,
          provider: "telegram",
          source: "@telegram",
          syncMetadata: true,
        },
      });

    expect(res.status).toBe(200);
    expect(syncSourceMetadata).toHaveBeenCalledTimes(1);
    expect(syncSourceMetadata).toHaveBeenCalledWith(7);
  });

  test("PUT /api/chats/:chatId/remote-channel resolves the promised source before responding", async () => {
    const userStore = makeUserStore([ALICE]);
    const upsertRemoteChannelSource = vi.fn(async () => ({
      id: 9,
      chat_id: CHANNEL_ID,
      provider: "telegram",
      enabled: 1,
      paused: 0,
      source_raw: "@telegram",
      source_chat_id: "",
      source_username: "telegram",
      source_url: "",
      source_title: "",
      source_avatar_url: "",
      last_remote_message_id: null,
      sync_metadata: 0,
      stream_media: 0,
      last_error: "",
      last_seen_at: null,
      updated_at: null,
    }));
    const syncSourceMetadata = vi.fn(async () => ({}));

    const { app } = makeApp({
      userStore,
      deps: baseDeps({
        upsertRemoteChannelSource,
        getRemoteChannelSourceByChatId: () => null,
        getRemoteChannelQueueSummary: () => null,
        remoteChannelManager: { syncSourceMetadata },
      }),
    });

    const res = await request(app)
      .put(`/api/chats/${CHANNEL_ID}/remote-channel`)
      .set("Cookie", await loginCookie(app))
      .send({
        username: "alice",
        enabled: true,
        provider: "telegram",
        source: "@telegram",
        syncMetadata: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.source).toMatchObject({ id: 9 });
    // syncMetadata is false here so no background sync is expected,
    // but the response must contain the resolved source, not null.
    expect(res.body.source).not.toBeNull();
  });
});

import { describe, test, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

const CHAT_ID = "33333333-3333-4333-8333-333333333333";

function setupApp({ uiEnabled }) {
  const sessionStore = makeSessionStore();
  const userStore = makeUserStore([
    {
      id: "u-owner",
      username: "owner",
      nickname: "Owner",
      role: "user",
      status: "online",
    },
  ]);
  sessionStore.createSession("u-owner", "sid-owner");
  const { app } = makeApp({
    sessionStore,
    userStore,
    settings: { REMOTE_CHANNEL_UI: uiEnabled },
    deps: {
      REMOTE_CHANNELS: {
        enabled: true,
        telegramConfigured: true,
        proxyConfigured: false,
      },
      findChatById: () => ({
        id: CHAT_ID,
        type: "channel",
        group_visibility: "public",
      }),
      findUserByUsername: (name) =>
        name === "owner" ? { id: "u-owner", username: "owner" } : null,
      isMember: () => true,
      getChatMemberRole: () => "owner",
      getRemoteChannelSourceByChatId: () => ({ id: 7, enabled: 1 }),
      getRemoteChannelQueueSummary: () => ({}),
      upsertRemoteChannelSource: async () => ({ id: 7 }),
      updateRemoteChannelSourcePaused: async () => {},
      remoteChannelManager: {},
    },
  });
  return app;
}

describe("REMOTE_CHANNEL_UI=false restricts user routes to admins", () => {
  test("PUT remote-channel returns 403 when UI is disabled", async () => {
    const app = setupApp({ uiEnabled: false });
    const res = await request(app)
      .put(`/api/chats/${CHAT_ID}/remote-channel`)
      .set("Cookie", "sid=sid-owner")
      .send({
        username: "owner",
        enabled: true,
        provider: "telegram",
        source: "@validchannel",
      });
    expect(res.status).toBe(403);
  });

  test("queue actions return 403 when UI is disabled", async () => {
    const app = setupApp({ uiEnabled: false });
    for (const action of ["pause", "resume", "skip", "skip-all", "test"]) {
      const res = await request(app)
        .post(`/api/chats/${CHAT_ID}/remote-channel/${action}`)
        .set("Cookie", "sid=sid-owner")
        .send({ username: "owner" });
      expect(res.status).toBe(403);
    }
  });

  test("GET status returns 403 when UI is disabled", async () => {
    const app = setupApp({ uiEnabled: false });
    const res = await request(app)
      .get(`/api/chats/${CHAT_ID}/remote-channel`)
      .set("Cookie", "sid=sid-owner")
      .query({ username: "owner" });
    expect(res.status).toBe(403);
  });

  test("PUT remote-channel works when UI is enabled", async () => {
    const app = setupApp({ uiEnabled: true });
    const res = await request(app)
      .put(`/api/chats/${CHAT_ID}/remote-channel`)
      .set("Cookie", "sid=sid-owner")
      .send({
        username: "owner",
        enabled: true,
        provider: "telegram",
        source: "@validchannel",
      });
    expect(res.status).toBe(200);
  });

  test("creating a channel with remoteChannel returns 403 when UI is disabled", async () => {
    const alice = {
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
    const { app } = makeApp({
      userStore: makeUserStore([alice]),
      settings: { REMOTE_CHANNEL_UI: false },
      deps: {
        REMOTE_CHANNELS: {
          enabled: true,
          telegramConfigured: true,
          proxyConfigured: false,
        },
        findChatByGroupUsername: () => null,
        createChat: () => CHAT_ID,
        addChatMember: () => {},
      },
    });
    const login = await request(app)
      .post("/api/login")
      .send({ username: "alice", password: "secret123" });
    const res = await request(app)
      .post("/api/chats/group")
      .set("Cookie", login.headers["set-cookie"])
      .send({
        type: "channel",
        creator: "alice",
        nickname: "Mirror",
        username: "mirrorchan",
        visibility: "public",
        remoteChannel: {
          enabled: true,
          provider: "telegram",
          source: "@validchannel",
        },
      });
    expect(res.status).toBe(403);
  });
});

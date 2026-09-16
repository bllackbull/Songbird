import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";
import { createRemoteChannelManager } from "../../lib/remoteChannels.js";

const CHAT_ID = "11111111-1111-4111-8111-111111111111";

function setupProfileApp({ role = "owner" } = {}) {
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
  const listChatMembers = vi.fn(() => []);
  const getChatMemberRole = vi.fn(() => role);
  const { app } = makeApp({
    sessionStore,
    userStore,
    deps: {
      findChatById: () => ({ id: CHAT_ID, type: "channel" }),
      isMember: () => true,
      listChatMembers,
      getChatMemberRole,
      getRemoteChannelSourceByChatId: () => ({
        id: 7,
        enabled: 1,
        paused: 0,
        provider: "telegram",
        source_raw: "@src",
        source_username: "src",
      }),
      getRemoteChannelQueueSummary: () => ({ pending: 2 }),
      REMOTE_CHANNELS: {
        enabled: true,
        telegramConfigured: true,
        proxyConfigured: false,
      },
      isUserAdmin: () => true,
    },
  });
  return { app, listChatMembers, getChatMemberRole };
}

describe("remote channel profile perf", () => {
  test("GET status resolves owner via getChatMemberRole without full member list", async () => {
    const { app, listChatMembers, getChatMemberRole } = setupProfileApp({
      role: "owner",
    });
    const res = await request(app)
      .get(`/api/chats/${CHAT_ID}/remote-channel`)
      .set("Cookie", "sid=sid-owner")
      .query({ username: "owner" });
    expect(res.status).toBe(200);
    expect(getChatMemberRole).toHaveBeenCalledWith(CHAT_ID, "u-owner");
    expect(listChatMembers).not.toHaveBeenCalled();
    expect(res.body.source.queue).toEqual({ pending: 2 });
  });

  test("GET queue sub-endpoint is owner-only and lightweight", async () => {
    const { app, listChatMembers } = setupProfileApp({ role: "member" });
    const res = await request(app)
      .get(`/api/chats/${CHAT_ID}/remote-channel/queue`)
      .set("Cookie", "sid=sid-owner")
      .query({ username: "owner" });
    expect(res.status).toBe(403);
    expect(listChatMembers).not.toHaveBeenCalled();
  });
});

describe("admin services status", () => {
  test("GET /api/admin/services returns worker + remote + storage", async () => {
    const sessionStore = makeSessionStore();
    const userStore = makeUserStore([
      {
        id: "u-admin",
        username: "admin",
        nickname: "Admin",
        role: "admin",
        status: "online",
      },
    ]);
    sessionStore.createSession("u-admin", "sid-admin");
    const { app } = makeApp({
      sessionStore,
      userStore,
      deps: {
        isUserAdmin: () => true,
        storageProvider: { type: "local" },
        workerUrl: null,
        mediaWorkerUrl: null,
        remoteChannelManager: {
          getHealth: () => ({
            enabled: true,
            telegramConfigured: false,
            telegramConnected: false,
          }),
        },
        listEnabledRemoteChannelSources: () => [],
        getRemoteChannelProviderState: () => null,
      },
    });
    const res = await request(app)
      .get("/api/admin/services")
      .set("Cookie", "sid=sid-admin");
    expect(res.status).toBe(200);
    expect(res.body.mediaWorker).toBeDefined();
    expect(res.body.remoteChannel).toBeDefined();
    expect(res.body.storage).toBeDefined();
  });
});

describe("remote manager health", () => {
  test("getHealth reports enabled + telegram flags without network", async () => {
    const manager = createRemoteChannelManager({
      config: {
        enabled: true,
        telegramApiId: 123,
        telegramApiHash: "hash",
        telegramSessionString: "",
      },
    });
    const health = await manager.getHealth();
    expect(health.enabled).toBe(true);
    expect(health.telegramConfigured).toBe(false);
  });
});

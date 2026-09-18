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
  const getRemoteChannelQueueSummary = vi.fn(() => ({ pending: 2 }));
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
      getRemoteChannelQueueSummary,
      REMOTE_CHANNELS: {
        enabled: true,
        telegramConfigured: true,
        proxyConfigured: false,
      },
      isUserAdmin: () => true,
    },
  });
  return { app, listChatMembers, getChatMemberRole, getRemoteChannelQueueSummary };
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

  test("pause notifies open modals via remote_channel_queue", async () => {
    const emitChatEvent = vi.fn();
    const sessionStore = makeSessionStore();
    const userStore = makeUserStore([
      { id: "u-owner", username: "owner", nickname: "Owner", role: "user", status: "online" },
    ]);
    sessionStore.createSession("u-owner", "sid-owner");
    const { app } = makeApp({
      sessionStore,
      userStore,
      deps: {
        findChatById: () => ({ id: CHAT_ID, type: "channel" }),
        findUserByUsername: (name) =>
          name === "owner" ? { id: "u-owner", username: "owner" } : null,
        isMember: () => true,
        getChatMemberRole: () => "owner",
        getRemoteChannelSourceByChatId: () => ({ id: 7, enabled: 1 }),
        updateRemoteChannelSourcePaused: () => {},
        emitChatEvent,
      },
    });
    const res = await request(app)
      .post(`/api/chats/${CHAT_ID}/remote-channel/pause`)
      .set("Cookie", "sid=sid-owner")
      .send({ username: "owner" });
    expect(res.status).toBe(200);
    expect(emitChatEvent).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({ type: "remote_channel_queue", sourceId: 7 }),
    );
  });

  test("repeated status reads collapse into one summary query", async () => {
    const { app, getRemoteChannelQueueSummary } = setupProfileApp({
      role: "owner",
    });
    const get = () =>
      request(app)
        .get(`/api/chats/${CHAT_ID}/remote-channel`)
        .set("Cookie", "sid=sid-owner")
        .query({ username: "owner" });
    const [first, second] = await Promise.all([get(), get()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Single-flight + TTL cache: concurrent and back-to-back reads share one query.
    expect(getRemoteChannelQueueSummary).toHaveBeenCalledTimes(1);
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

  test("GET /api/admin/services reports storage reachability from checkHealth", async () => {
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
    const healthyApp = makeApp({
      sessionStore,
      userStore,
      deps: {
        isUserAdmin: () => true,
        storageProvider: { type: "remote", checkHealth: async () => true },
        workerUrl: null,
        mediaWorkerUrl: null,
        remoteChannelManager: null,
      },
    });
    const ok = await request(healthyApp.app)
      .get("/api/admin/services")
      .set("Cookie", "sid=sid-admin");
    expect(ok.status).toBe(200);
    expect(ok.body.storage).toMatchObject({ driver: "remote", reachable: true });
    expect(typeof ok.body.storage.latencyMs).toBe("number");

    const failingApp = makeApp({
      sessionStore,
      userStore,
      deps: {
        isUserAdmin: () => true,
        storageProvider: {
          type: "remote",
          checkHealth: async () => {
            throw new Error("Forbidden");
          },
        },
        workerUrl: null,
        mediaWorkerUrl: null,
        remoteChannelManager: null,
      },
    });
    const bad = await request(failingApp.app)
      .get("/api/admin/services")
      .set("Cookie", "sid=sid-admin");
    expect(bad.status).toBe(200);
    expect(bad.body.storage).toMatchObject({ driver: "remote", reachable: false });
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

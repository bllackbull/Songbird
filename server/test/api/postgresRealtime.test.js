import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";
import { createPresenceTracker } from "../../lib/presenceTracker.js";

const ALICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHAT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MSG_ID = "mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm";

describe("Postgres Mode Realtime Events Audit & Fix Verification", () => {
  let originalDbClient;

  beforeEach(() => {
    originalDbClient = process.env.DB_CLIENT;
    process.env.DB_CLIENT = "postgres";
  });

  afterEach(() => {
    if (originalDbClient !== undefined) {
      process.env.DB_CLIENT = originalDbClient;
    } else {
      delete process.env.DB_CLIENT;
    }
  });

  test("1. Status & typing indicator emitting SSE event in Postgres mode", async () => {
    const emittedEvents = [];
    const emitChatEvent = vi.fn((chatId, payload) => {
      emittedEvents.push({ chatId, payload });
    });

    const alice = {
      id: ALICE_ID,
      username: "alice",
      role: "user",
      status: "online",
    };
    const chat = { id: CHAT_ID, type: "dm" };

    const { app, sessionStore } = makeApp({
      userStore: makeUserStore([alice]),
      deps: {
        findUserByUsername: (u) =>
          Promise.resolve(u === "alice" ? alice : null),
        isMember: (cId, uId) =>
          Promise.resolve(cId === CHAT_ID && uId === ALICE_ID),
        findChatById: (cId) => Promise.resolve(cId === CHAT_ID ? chat : null),
        emitChatEvent,
      },
    });

    sessionStore.createSession(ALICE_ID, "tok-alice");

    // POST /api/messages/typing
    const res = await request(app)
      .post("/api/messages/typing")
      .set("Cookie", "sid=tok-alice")
      .send({ chatId: CHAT_ID, username: "alice", isTyping: true });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(emitChatEvent).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({
        type: "chat_typing",
        chatId: CHAT_ID,
        username: "alice",
        isTyping: true,
      }),
    );
  });

  test("2. Presence tracker getOnlineCount & broadcastStatus with Promise returning getUserPresence", async () => {
    const emittedSse = [];
    const alice = {
      id: ALICE_ID,
      username: "alice",
      status: "online",
      last_seen: null,
    };
    const chat = { id: CHAT_ID };

    const tracker = createPresenceTracker({
      updateLastSeen: () => Promise.resolve(),
      getUserPresence: (u) => Promise.resolve(u === "alice" ? alice : null),
      listChatsForUser: (uId) => Promise.resolve([chat]),
      listChatMembers: (cId) =>
        Promise.resolve([
          { id: ALICE_ID, username: "alice" },
          { id: BOB_ID, username: "bob" },
        ]),
      emitToUser: (username, payload) => emittedSse.push({ username, payload }),
    });

    await tracker.markConnected("alice", "dummy-res");

    expect(tracker.isConnected("alice")).toBe(true);
    expect(await tracker.getOnlineCount()).toBe(1);

    await tracker.broadcastStatus("alice");

    expect(emittedSse.length).toBeGreaterThan(0);
    const presenceEv = emittedSse.find(
      (e) => e.payload.type === "presence_update",
    );
    expect(presenceEv).toBeDefined();
    expect(presenceEv.payload).toMatchObject({
      type: "presence_update",
      userId: ALICE_ID,
      username: "alice",
      status: "online",
    });
  });

  test("3. Read receipts (POST /api/messages/read) emits chat_read SSE and awaits markMessagesRead in Postgres mode", async () => {
    const emittedEvents = [];
    const emitChatEvent = vi.fn((chatId, payload) => {
      emittedEvents.push({ chatId, payload });
    });

    const alice = { id: ALICE_ID, username: "alice" };
    const markMessagesReadMock = vi.fn(() => Promise.resolve(1));

    const { app, sessionStore } = makeApp({
      userStore: makeUserStore([alice]),
      deps: {
        findUserByUsername: (u) =>
          Promise.resolve(u === "alice" ? alice : null),
        isMember: () => Promise.resolve(true),
        markMessagesRead: markMessagesReadMock,
        emitChatEvent,
      },
    });

    sessionStore.createSession(ALICE_ID, "tok-alice");

    const res = await request(app)
      .post("/api/messages/read")
      .set("Cookie", "sid=tok-alice")
      .send({ chatId: CHAT_ID, username: "alice" });

    expect(res.status).toBe(200);
    expect(markMessagesReadMock).toHaveBeenCalledWith(CHAT_ID, ALICE_ID);
    expect(emitChatEvent).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({
        type: "chat_read",
        chatId: CHAT_ID,
        username: "alice",
      }),
    );
  });

  test("4. Send message POST /api/messages emits chat_message SSE and triggers chat_list_changed or chat update", async () => {
    const emittedEvents = [];
    const emitChatEvent = vi.fn((chatId, payload) => {
      emittedEvents.push({ chatId, payload });
    });

    const alice = { id: ALICE_ID, username: "alice" };
    const chat = { id: CHAT_ID, type: "group", name: "Test Group" };

    const { app, sessionStore } = makeApp({
      userStore: makeUserStore([alice]),
      deps: {
        findUserByUsername: (u) =>
          Promise.resolve(u === "alice" ? alice : null),
        isMember: () => Promise.resolve(true),
        findChatById: () => Promise.resolve(chat),
        createOrReuseMessage: () =>
          Promise.resolve({ id: MSG_ID, deduped: false }),
        listChatMembers: () =>
          Promise.resolve([
            { id: ALICE_ID, username: "alice" },
            { id: BOB_ID, username: "bob" },
          ]),
        listMutedUserIdsForChat: () => Promise.resolve([]),
        emitChatEvent,
      },
    });

    sessionStore.createSession(ALICE_ID, "tok-alice");

    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", "sid=tok-alice")
      .send({ chatId: CHAT_ID, username: "alice", body: "Hello World" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(MSG_ID);
    expect(emitChatEvent).toHaveBeenCalledWith(
      CHAT_ID,
      expect.objectContaining({
        type: "chat_message",
        chatId: CHAT_ID,
        messageId: MSG_ID,
        username: "alice",
        body: "Hello World",
      }),
    );
  });

  test("5. markConnected registers isConnected synchronously even when getUserPresence returns a Promise", () => {
    let resolveUserPresence;
    const userPromise = new Promise((resolve) => {
      resolveUserPresence = resolve;
    });

    const alice = {
      id: ALICE_ID,
      username: "alice",
      status: "online",
      last_seen: null,
    };

    const tracker = createPresenceTracker({
      updateLastSeen: () => Promise.resolve(),
      getUserPresence: () => userPromise,
      listChatsForUser: () => Promise.resolve([]),
      listChatMembers: () => Promise.resolve([]),
      emitToUser: () => {},
    });

    const markPromise = tracker.markConnected("alice", "dummy-socket");
    expect(tracker.isConnected("alice")).toBe(true);

    resolveUserPresence(alice);
    return markPromise;
  });

  test("6. profileService.updateProfile handles Promise returning DB functions in Postgres mode", async () => {
    const { createProfileService } = await import("../../lib/services/profileService.js");
    const alice = { id: ALICE_ID, username: "alice" };
    const chat = { id: CHAT_ID };

    const service = createProfileService({
      findUserById: () => Promise.resolve(alice),
      updateUserProfile: () => Promise.resolve(1),
      listChatsForUser: () => Promise.resolve([chat]),
      listChatMembers: () => Promise.resolve([{ username: "alice" }, { username: "bob" }]),
    });

    const result = await service.updateProfile({ userId: ALICE_ID, updates: { nickname: "Alice New" } });
    expect(result.success).toBe(true);
    expect(result.sseEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetUsername: "alice" }),
        expect.objectContaining({ targetUsername: "bob" }),
      ]),
    );
  });
});

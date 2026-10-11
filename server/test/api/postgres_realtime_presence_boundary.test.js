import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";
import { createPresenceTracker } from "../../lib/presenceTracker.js";
import { createSseHub } from "../../lib/sse.js";
import { EventEmitter } from "node:events";

const ALICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHAT_DM_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CHAT_GROUP_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("Postgres Mode Realtime Presence & User State Layer Boundaries", () => {
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

  describe("Boundary 1: DB Query Promise Resolution -> presenceTracker Broadcasting", () => {
    test("presenceTracker.markConnected resolves Promise-returning DB helpers and broadcasts presence", async () => {
      const emittedEvents = [];
      const alice = {
        id: ALICE_ID,
        username: "alice",
        status: "online",
        last_seen: null,
      };
      const dmChat = { id: CHAT_DM_ID, type: "dm" };

      const tracker = createPresenceTracker({
        updateLastSeen: vi.fn(() => Promise.resolve()),
        getUserPresence: vi.fn((u) =>
          Promise.resolve(u === "alice" ? alice : null),
        ),
        listChatsForUser: vi.fn((uId) =>
          Promise.resolve(uId === ALICE_ID ? [dmChat] : []),
        ),
        listChatMembersForChats: vi.fn((cIds) =>
          Promise.resolve(
            new Map([
              [
                CHAT_DM_ID,
                [
                  { id: ALICE_ID, username: "alice" },
                  { id: BOB_ID, username: "bob" },
                ],
              ],
            ]),
          ),
        ),
        emitToUser: (username, payload) =>
          emittedEvents.push({ username, payload }),
      });

      await tracker.markConnected("alice", "socket-alice-1");

      expect(tracker.isConnected("alice")).toBe(true);
      expect(emittedEvents.length).toBeGreaterThan(0);

      const aliceSelfEv = emittedEvents.find(
        (e) => e.username === "alice" && e.payload.type === "presence_update",
      );
      const bobPeerEv = emittedEvents.find(
        (e) => e.username === "bob" && e.payload.type === "presence_update",
      );

      expect(aliceSelfEv).toBeDefined();
      expect(aliceSelfEv.payload).toMatchObject({
        type: "presence_update",
        userId: ALICE_ID,
        username: "alice",
        status: "online",
      });

      expect(bobPeerEv).toBeDefined();
      expect(bobPeerEv.payload).toMatchObject({
        type: "presence_update",
        userId: ALICE_ID,
        username: "alice",
        status: "online",
      });
    });

    test("presenceTracker.markDisconnected resolves DB Promises and broadcasts status offline", async () => {
      const emittedEvents = [];
      const bob = {
        id: BOB_ID,
        username: "bob",
        status: "online",
        last_seen: null,
      };
      const dmChat = { id: CHAT_DM_ID, type: "dm" };

      const tracker = createPresenceTracker({
        updateLastSeen: vi.fn(() => Promise.resolve()),
        getUserPresence: vi.fn((u) =>
          Promise.resolve(u === "bob" ? bob : null),
        ),
        listChatsForUser: vi.fn((uId) =>
          Promise.resolve(uId === BOB_ID ? [dmChat] : []),
        ),
        listChatMembersForChats: vi.fn(() =>
          Promise.resolve(
            new Map([
              [
                CHAT_DM_ID,
                [
                  { id: ALICE_ID, username: "alice" },
                  { id: BOB_ID, username: "bob" },
                ],
              ],
            ]),
          ),
        ),
        emitToUser: (username, payload) =>
          emittedEvents.push({ username, payload }),
      });

      await tracker.markConnected("bob", "socket-bob-1");
      emittedEvents.length = 0; // Clear initial connection events

      await tracker.markDisconnected("bob", "socket-bob-1");

      expect(tracker.isConnected("bob")).toBe(false);

      const alicePeerEv = emittedEvents.find(
        (e) => e.username === "alice" && e.payload.type === "presence_update",
      );
      expect(alicePeerEv).toBeDefined();
      expect(alicePeerEv.payload).toMatchObject({
        type: "presence_update",
        userId: BOB_ID,
        username: "bob",
        status: "offline",
      });
    });

    test("presenceTracker.getOnlineCount awaits Promise-returning getUserPresence calls in Postgres mode", async () => {
      const alice = { id: ALICE_ID, username: "alice", status: "online" };
      const bob = { id: BOB_ID, username: "bob", status: "invisible" };

      const tracker = createPresenceTracker({
        updateLastSeen: () => Promise.resolve(),
        getUserPresence: (u) =>
          Promise.resolve(u === "alice" ? alice : u === "bob" ? bob : null),
        listChatsForUser: () => Promise.resolve([]),
        listChatMembersForChats: () => Promise.resolve(new Map()),
        emitToUser: () => {},
      });

      await tracker.markConnected("alice", "s1");
      await tracker.markConnected("bob", "s2");

      const onlineCount = await tracker.getOnlineCount();
      expect(onlineCount).toBe(1); // Alice is online, Bob is invisible
    });
  });

  describe("Boundary 2: API Mutations -> presenceTracker & Event Broadcast in Postgres Mode", () => {
    test("PUT /api/status in Postgres mode resolves updateUserStatus Promise and emits presence_update to peers", async () => {
      const emittedSse = [];
      const emitSseEvent = vi.fn((username, payload) => {
        emittedSse.push({ username, payload });
      });

      let aliceStatus = "online";
      const alice = {
        id: ALICE_ID,
        username: "alice",
        role: "user",
        status: aliceStatus,
      };
      const dmChat = { id: CHAT_DM_ID, type: "dm" };

      const updateUserStatusAsync = vi.fn(async (userId, status) => {
        aliceStatus = status;
        alice.status = status;
        return 1;
      });

      const presenceTracker = createPresenceTracker({
        updateLastSeen: () => Promise.resolve(),
        getUserPresence: (u) => Promise.resolve(u === "alice" ? alice : null),
        listChatsForUser: () => Promise.resolve([dmChat]),
        listChatMembersForChats: () =>
          Promise.resolve(
            new Map([
              [
                CHAT_DM_ID,
                [
                  { id: ALICE_ID, username: "alice" },
                  { id: BOB_ID, username: "bob" },
                ],
              ],
            ]),
          ),
        emitToUser: emitSseEvent,
      });

      await presenceTracker.markConnected("alice", "sock-alice");
      emittedSse.length = 0; // Clear connection events

      const { app, sessionStore } = makeApp({
        userStore: makeUserStore([alice]),
        deps: {
          findUserByUsername: (u) =>
            Promise.resolve(u === "alice" ? alice : null),
          updateUserStatus: updateUserStatusAsync,
          broadcastPresence: (username) =>
            presenceTracker.broadcastStatus(username),
          emitSseEvent,
        },
      });

      sessionStore.createSession(ALICE_ID, "tok-alice");

      // Alice updates status to invisible
      const res = await request(app)
        .put("/api/status")
        .set("Cookie", "sid=tok-alice")
        .send({ username: "alice", status: "invisible" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, status: "invisible" });

      expect(updateUserStatusAsync).toHaveBeenCalledWith(ALICE_ID, "invisible");

      const bobEvent = emittedSse.find(
        (e) => e.username === "bob" && e.payload.type === "presence_update",
      );
      expect(bobEvent).toBeDefined();
      expect(bobEvent.payload).toMatchObject({
        type: "presence_update",
        userId: ALICE_ID,
        username: "alice",
        status: "offline", // Invisible connected user effective status is offline
        rawStatus: "invisible",
      });
    });

    test("PUT /api/profile in Postgres mode resolves updateUserProfile Promise and emits profile_updated to peers", async () => {
      const emittedSse = [];
      const emitSseEvent = vi.fn((username, payload) => {
        emittedSse.push({ username, payload });
      });

      const alice = {
        id: ALICE_ID,
        username: "alice",
        nickname: "Alice Original",
        avatar_url: "/avatar-orig.jpg",
        color: "#10b981",
        status: "online",
        role: "user",
      };

      const updatedAlice = {
        ...alice,
        nickname: "Alice Updated",
        avatar_url: "/avatar-new.jpg",
      };

      const updateUserProfileAsync = vi.fn(() => Promise.resolve(1));
      const groupChat = { id: CHAT_GROUP_ID, type: "group" };

      const { app, sessionStore } = makeApp({
        userStore: makeUserStore([alice]),
        deps: {
          findUserByUsername: (u) =>
            Promise.resolve(u === "alice" ? alice : null),
          findUserById: (id) =>
            Promise.resolve(id === ALICE_ID ? updatedAlice : null),
          updateUserProfile: updateUserProfileAsync,
          listChatsForUser: (uId) =>
            Promise.resolve(uId === ALICE_ID ? [groupChat] : []),
          listChatMembers: (cId) =>
            Promise.resolve(
              cId === CHAT_GROUP_ID
                ? [
                    { id: ALICE_ID, username: "alice" },
                    { id: BOB_ID, username: "bob" },
                  ]
                : [],
            ),
          removeAvatarByUrl: () => {},
          ensureAvatarExists: (_id, url) => url || null,
          emitSseEvent: (username, payload) => {
            emitSseEvent(username, payload);
          },
        },
      });

      sessionStore.createSession(ALICE_ID, "tok-alice");

      const res = await request(app)
        .put("/api/profile")
        .set("Cookie", "sid=tok-alice")
        .send({
          currentUsername: "alice",
          username: "alice",
          nickname: "Alice Updated",
          avatarUrl: "/avatar-new.jpg",
        });

      expect(res.status).toBe(200);
      expect(updateUserProfileAsync).toHaveBeenCalledWith(
        ALICE_ID,
        "alice",
        "Alice Updated",
        "/avatar-new.jpg",
      );

      const bobProfileEv = emittedSse.find(
        (e) => e.username === "bob" && e.payload.type === "profile_updated",
      );
      expect(bobProfileEv).toBeDefined();
      expect(bobProfileEv.payload).toMatchObject({
        type: "profile_updated",
        userId: ALICE_ID,
        username: "alice",
        nickname: "Alice Updated",
        avatarUrl: "/avatar-new.jpg",
      });
    });
  });

  describe("Boundary 3: Transport Stream Delivery (/api/events & WebSocket) in Postgres Mode", () => {
    test("/api/events SSE client registers presence and receives presence_update & profile_updated payloads", async () => {
      const alice = {
        id: ALICE_ID,
        username: "alice",
        role: "user",
        status: "online",
      };
      const writtenMessages = [];

      class MockSseResponse extends EventEmitter {
        setHeader() {}
        flushHeaders() {}
        write(msg) {
          writtenMessages.push(msg);
        }
      }

      const mockRes = new MockSseResponse();
      const sseHub = createSseHub({
        listChatMembers: (cId) => Promise.resolve([{ username: "alice" }]),
      });

      const presenceTracker = createPresenceTracker({
        updateLastSeen: () => Promise.resolve(),
        getUserPresence: (u) => Promise.resolve(u === "alice" ? alice : null),
        listChatsForUser: () => Promise.resolve([]),
        listChatMembersForChats: () => Promise.resolve(new Map()),
        emitToUser: (username, payload) =>
          sseHub.emitSseEvent(username, payload),
      });

      sseHub.addSseClient("alice", mockRes);
      await presenceTracker.markConnected("alice", mockRes);

      expect(presenceTracker.isConnected("alice")).toBe(true);
      writtenMessages.length = 0; // Clear connection events

      // Emit presence_update
      sseHub.emitSseEvent("alice", {
        type: "presence_update",
        userId: ALICE_ID,
        username: "alice",
        status: "online",
        rawStatus: "online",
        lastSeen: new Date().toISOString(),
      });

      // Emit profile_updated
      sseHub.emitSseEvent("alice", {
        type: "profile_updated",
        userId: ALICE_ID,
        username: "alice",
        nickname: "Alice New",
        avatarUrl: "/a.png",
        color: "#10b981",
        status: "online",
      });

      expect(writtenMessages.length).toBe(2);
      expect(writtenMessages[0]).toContain('"type":"presence_update"');
      expect(writtenMessages[1]).toContain('"type":"profile_updated"');
      expect(writtenMessages[1]).toContain('"nickname":"Alice New"');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BOB_ID = "22222222-2222-4222-8222-222222222222";
const CHAT_ID = "33333333-3333-4333-8333-333333333333";
const ALICE = {
  id: ALICE_ID,
  username: "alice",
  nickname: "Alice",
  avatar_url: "",
};

describe("/api/calls endpoints", () => {
  let app;
  let sessionStore;
  let emitSseEvent;

  beforeEach(() => {
    emitSseEvent = vi.fn();
    const alice = {
      id: ALICE_ID,
      username: "alice",
      nickname: "Alice",
      avatar_url: "",
    };
    const bob = {
      id: BOB_ID,
      username: "bob",
      nickname: "Bob",
      avatar_url: "",
    };

    const chat = { id: CHAT_ID, type: "dm" };

    const instance = makeApp({
      userStore: makeUserStore([alice, bob]),
      deps: {
        findChatById: vi.fn((id) => (id === CHAT_ID ? chat : null)),
        isMember: vi.fn(
          (cId, uId) => cId === CHAT_ID && (uId === ALICE_ID || uId === BOB_ID),
        ),
        listChatMembers: vi.fn((id) => (id === CHAT_ID ? [alice, bob] : [])),
        emitSseEvent,
      },
    });

    app = instance.app;
    sessionStore = instance.sessionStore;
    sessionStore.createSession(ALICE_ID, "alice-token");
    sessionStore.createSession(BOB_ID, "bob-token");
  });

  describe("GET /api/calls/ice-servers", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await request(app).get("/api/calls/ice-servers");
      expect(res.status).toBe(401);
    });

    it("returns 200 with ICE server list when authenticated", async () => {
      const res = await request(app)
        .get("/api/calls/ice-servers")
        .set("Cookie", "sid=alice-token");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty("urls");
    });
  });

  describe("GET /api/calls/incoming", () => {
    it("returns 401 when not authenticated", async () => {
      const res = await request(app).get("/api/calls/incoming");
      expect(res.status).toBe(401);
    });

    it("returns null call when nothing is ringing", async () => {
      const res = await request(app)
        .get("/api/calls/incoming")
        .set("Cookie", "sid=bob-token");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ call: null });
    });

    it("replays the ringing call to the callee who had the app closed", async () => {
      await request(app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, type: "voice" });

      const res = await request(app)
        .get("/api/calls/incoming")
        .set("Cookie", "sid=bob-token");
      expect(res.status).toBe(200);
      expect(res.body.call).toEqual({
        type: "call:incoming",
        chatId: CHAT_ID,
        callType: "voice",
        caller: {
          id: ALICE_ID,
          username: "alice",
          nickname: "Alice",
          avatarUrl: "",
          color: null,
          verified: false,
          role: "user",
        },
      });
    });

    it("returns null for the caller", async () => {
      await request(app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, type: "voice" });

      const res = await request(app)
        .get("/api/calls/incoming")
        .set("Cookie", "sid=alice-token");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ call: null });
    });

    it("returns null after the call was accepted", async () => {
      await request(app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, type: "voice" });
      await request(app)
        .post("/api/calls/accept")
        .set("Cookie", "sid=bob-token")
        .send({ chatId: CHAT_ID });

      const res = await request(app)
        .get("/api/calls/incoming")
        .set("Cookie", "sid=bob-token");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ call: null });
    });
  });

  describe("POST /api/calls/start", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app)
        .post("/api/calls/start")
        .send({ chatId: CHAT_ID, type: "voice" });
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid UUID", async () => {
      const res = await request(app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: "invalid", type: "voice" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid chat ID");
    });

    it("starts call and emits incoming call event to peer", async () => {
      const res = await request(app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, type: "video" });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.call.chatId).toBe(CHAT_ID);
      expect(res.body.call.type).toBe("video");

      expect(emitSseEvent).toHaveBeenCalledWith(
        "bob",
        expect.objectContaining({
          type: "call:incoming",
          chatId: CHAT_ID,
          callType: "video",
        }),
      );
    });

    it("returns 409 when call already active", async () => {
      await request(app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, type: "voice" });

      const res = await request(app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, type: "voice" });
      expect(res.status).toBe(409);
    });
  });

  describe("feature toggles (CALL / CALL_VIDEO)", () => {
    it("returns 403 for any call start when calls are disabled", async () => {
      const instance = makeApp({
        userStore: makeUserStore([
          { id: ALICE_ID, username: "alice", nickname: "Alice", avatar_url: "" },
          { id: BOB_ID, username: "bob", nickname: "Bob", avatar_url: "" },
        ]),
        deps: {
          findChatById: vi.fn((id) => (id === CHAT_ID ? { id, type: "dm" } : null)),
          isMember: vi.fn((_, uId) => uId === ALICE_ID || uId === BOB_ID),
          listChatMembers: vi.fn(() => [
            { id: ALICE_ID, username: "alice" },
            { id: BOB_ID, username: "bob" },
          ]),
          emitSseEvent,
          getSetting: vi.fn((key) =>
            key === "CALL" || key === "CALL_VIDEO" ? false : true,
          ),
        },
      });
      instance.sessionStore.createSession(ALICE_ID, "alice-token2");

      const res = await request(instance.app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token2")
        .send({ chatId: CHAT_ID, type: "voice" });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Calls are disabled on this server");
    });

    it("allows voice calls but returns 403 for video when video is disabled", async () => {
      const instance = makeApp({
        userStore: makeUserStore([
          { id: ALICE_ID, username: "alice", nickname: "Alice", avatar_url: "" },
          { id: BOB_ID, username: "bob", nickname: "Bob", avatar_url: "" },
        ]),
        deps: {
          findChatById: vi.fn((id) => (id === CHAT_ID ? { id, type: "dm" } : null)),
          isMember: vi.fn((_, uId) => uId === ALICE_ID || uId === BOB_ID),
          listChatMembers: vi.fn(() => [
            { id: ALICE_ID, username: "alice" },
            { id: BOB_ID, username: "bob" },
          ]),
          emitSseEvent,
          getSetting: vi.fn((key) => (key === "CALL_VIDEO" ? false : true)),
        },
      });
      instance.sessionStore.createSession(ALICE_ID, "alice-token3");

      const voice = await request(instance.app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token3")
        .send({ chatId: CHAT_ID, type: "voice" });
      expect(voice.status).toBe(200);
      await request(instance.app)
        .post("/api/calls/end")
        .set("Cookie", "sid=alice-token3")
        .send({ chatId: CHAT_ID });

      const video = await request(instance.app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token3")
        .send({ chatId: CHAT_ID, type: "video" });
      expect(video.status).toBe(403);
      expect(video.body.error).toBe("Video calls are disabled on this server");
    });
  });

  describe("Call signaling lifecycle (accept, reject, end, relay)", () => {
    beforeEach(async () => {
      await request(app)
        .post("/api/calls/start")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, type: "voice" });
    });

    it("POST /api/calls/accept connects call and notifies caller", async () => {
      const res = await request(app)
        .post("/api/calls/accept")
        .set("Cookie", "sid=bob-token")
        .send({ chatId: CHAT_ID });
      expect(res.status).toBe(200);
      expect(emitSseEvent).toHaveBeenCalledWith("alice", {
        type: "call:accepted",
        chatId: CHAT_ID,
      });
    });

    it("POST /api/calls/reject declines call and notifies caller", async () => {
      const res = await request(app)
        .post("/api/calls/reject")
        .set("Cookie", "sid=bob-token")
        .send({ chatId: CHAT_ID });
      expect(res.status).toBe(200);
      expect(emitSseEvent).toHaveBeenCalledWith("alice", {
        type: "call:rejected",
        chatId: CHAT_ID,
      });
    });

    it("POST /api/calls/end terminates call", async () => {
      const res = await request(app)
        .post("/api/calls/end")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID });
      expect(res.status).toBe(200);
      expect(emitSseEvent).toHaveBeenCalledWith("bob", {
        type: "call:ended",
        chatId: CHAT_ID,
      });
    });

    it("POST /api/calls/offer relays sdp to peer", async () => {
      const res = await request(app)
        .post("/api/calls/offer")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, sdp: { type: "offer", sdp: "dummy" } });
      expect(res.status).toBe(200);
      expect(emitSseEvent).toHaveBeenCalledWith("bob", {
        type: "call:offer",
        chatId: CHAT_ID,
        sdp: { type: "offer", sdp: "dummy" },
      });
    });

    it("POST /api/calls/ice-candidate relays candidate to peer", async () => {
      const res = await request(app)
        .post("/api/calls/ice-candidate")
        .set("Cookie", "sid=bob-token")
        .send({ chatId: CHAT_ID, candidate: { candidate: "cand-1" } });
      expect(res.status).toBe(200);
      expect(emitSseEvent).toHaveBeenCalledWith("alice", {
        type: "call:ice-candidate",
        chatId: CHAT_ID,
        candidate: { candidate: "cand-1" },
      });
    });

    it("POST /api/calls/camera-state relays camera flag to peer", async () => {
      const res = await request(app)
        .post("/api/calls/camera-state")
        .set("Cookie", "sid=bob-token")
        .send({ chatId: CHAT_ID, cameraOff: true });
      expect(res.status).toBe(200);
      expect(emitSseEvent).toHaveBeenCalledWith("alice", {
        type: "call:camera-state",
        chatId: CHAT_ID,
        cameraOff: true,
      });
    });

    it("POST /api/calls/screen-share-state relays sharing flag to peer", async () => {
      const res = await request(app)
        .post("/api/calls/screen-share-state")
        .set("Cookie", "sid=alice-token")
        .send({ chatId: CHAT_ID, sharing: true });
      expect(res.status).toBe(200);
      expect(emitSseEvent).toHaveBeenCalledWith("bob", {
        type: "call:screen-share-state",
        chatId: CHAT_ID,
        sharing: true,
      });
    });

    it("POST /api/calls/screen-share-state treats anything but true as not sharing", async () => {
      const res = await request(app)
        .post("/api/calls/screen-share-state")
        .set("Cookie", "sid=bob-token")
        .send({ chatId: CHAT_ID, sharing: "yes" });
      expect(res.status).toBe(200);
      expect(emitSseEvent).toHaveBeenCalledWith("alice", {
        type: "call:screen-share-state",
        chatId: CHAT_ID,
        sharing: false,
      });
    });
  });

  describe("GET /api/calls/history", () => {
    const CALL_LOG_ID_1 = "44444444-4444-4444-8444-444444444444";
    const CALL_LOG_ID_2 = "55555555-5555-5555-8555-555555555555";

    it("returns 401 when not authenticated", async () => {
      const res = await request(app).get("/api/calls/history");
      expect(res.status).toBe(401);
    });

    it("returns call rows from the db with peer info", async () => {
      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          listCallHistoryForUser: vi.fn(() => [
            {
              id: CALL_LOG_ID_1,
              chat_id: CHAT_ID,
              user_id: BOB_ID,
              body: "[[call:voice:connected:120]]",
              created_at: "2026-01-01T00:00:00.000Z",
              peer_id: BOB_ID,
              peer_username: "bob",
              peer_nickname: "Bob",
              peer_avatar_url: "",
              peer_color: null,
              peer_verified: 0,
              peer_role: "user",
            },
            {
              id: CALL_LOG_ID_2,
              chat_id: CHAT_ID,
              user_id: ALICE_ID,
              body: "[[call:video:outgoing]]",
              created_at: "2026-01-02T00:00:00.000Z",
              peer_id: ALICE_ID,
              peer_username: "alice",
              peer_nickname: "Alice",
              peer_avatar_url: "",
              peer_color: null,
              peer_verified: 0,
              peer_role: "user",
            },
          ]),
        },
      });
      const testApp = instance.app;
      instance.sessionStore.createSession(ALICE_ID, "alice-token2");

      const res = await request(testApp)
        .get("/api/calls/history")
        .set("Cookie", "sid=alice-token2");
      expect(res.status).toBe(200);
      expect(res.body.calls).toHaveLength(2);
      expect(res.body.calls[0].id).toBe(CALL_LOG_ID_1);
      expect(res.body.calls[0].peer_username).toBe("bob");
      expect(res.body.calls[1].body).toBe("[[call:video:outgoing]]");
    });

    it("surfaces db errors as 500", async () => {
      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          listCallHistoryForUser: vi.fn(() => {
            throw new Error("boom");
          }),
        },
      });
      const testApp = instance.app;
      instance.sessionStore.createSession(ALICE_ID, "alice-token3");

      const res = await request(testApp)
        .get("/api/calls/history")
        .set("Cookie", "sid=alice-token3");
      expect(res.status).toBe(500);
    });

    it("returns call rows when session resolution is asynchronous (Postgres mode)", async () => {
      const listHistory = vi.fn((userId) => {
        if (!userId) return [];
        return [
          {
            id: CALL_LOG_ID_1,
            chat_id: CHAT_ID,
            user_id: BOB_ID,
            body: "[[call:voice:connected:120]]",
            peer_username: "bob",
          },
        ];
      });

      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          requireSession: vi.fn(async (req, res) => {
            const cookies = req.headers?.cookie || "";
            if (cookies.includes("sid=async-token")) return ALICE;
            res.status(401).json({ error: "Not authenticated" });
            return null;
          }),
          listCallHistoryForUser: listHistory,
        },
      });

      const res = await request(instance.app)
        .get("/api/calls/history")
        .set("Cookie", "sid=async-token");

      expect(res.status).toBe(200);
      expect(listHistory).toHaveBeenCalledWith(ALICE_ID);
      expect(res.body.calls).toHaveLength(1);
    });

    it("returns call rows when only getSessionFromRequest is provided and returns a Promise", async () => {
      const listHistory = vi.fn((userId) => {
        if (!userId) return [];
        return [{ id: CALL_LOG_ID_1, chat_id: CHAT_ID, body: "[[call:voice:failed]]" }];
      });

      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          requireSession: undefined,
          getSessionFromRequest: vi.fn(async (req) => {
            const cookies = req.headers?.cookie || "";
            return cookies.includes("sid=async-token") ? ALICE : null;
          }),
          listCallHistoryForUser: listHistory,
        },
      });

      const res = await request(instance.app)
        .get("/api/calls/history")
        .set("Cookie", "sid=async-token");

      expect(res.status).toBe(200);
      expect(listHistory).toHaveBeenCalledWith(ALICE_ID);
      expect(res.body.calls).toHaveLength(1);
    });
  });

  describe("POST /api/calls/history/delete", () => {
    const MSG_ID = "66666666-6666-6666-8666-666666666666";
    const callLog = {
      id: MSG_ID,
      chat_id: CHAT_ID,
      user_id: BOB_ID,
      body: "[[call:voice:failed]]",
    };

    it("returns 401 when not authenticated", async () => {
      const res = await request(app)
        .post("/api/calls/history/delete")
        .send({ messageId: MSG_ID });
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid messageId", async () => {
      const res = await request(app)
        .post("/api/calls/history/delete")
        .set("Cookie", "sid=alice-token")
        .send({ messageId: "not-a-uuid" });
      expect(res.status).toBe(400);
    });

    it("returns 404 when message missing", async () => {
      const res = await request(app)
        .post("/api/calls/history/delete")
        .set("Cookie", "sid=alice-token")
        .send({ messageId: MSG_ID });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Call not found");
    });

    it("hides the call entry for the caller", async () => {
      const hideMessageForUser = vi.fn();
      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          findChatById: vi.fn(() => ({ id: CHAT_ID, type: "dm" })),
          findMessageById: vi.fn((id) => (id === MSG_ID ? callLog : null)),
          isMember: vi.fn(
            (cId) => cId === CHAT_ID,
          ),
          hideMessageForUser,
        },
      });
      const testApp = instance.app;
      instance.sessionStore.createSession(ALICE_ID, "alice-token4");

      const res = await request(testApp)
        .post("/api/calls/history/delete")
        .set("Cookie", "sid=alice-token4")
        .send({ messageId: MSG_ID });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(hideMessageForUser).toHaveBeenCalledWith(MSG_ID, ALICE_ID);
    });

    it("returns 403 when user is not a chat member", async () => {
      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          findChatById: vi.fn(() => ({ id: CHAT_ID, type: "dm" })),
          findMessageById: vi.fn((id) => (id === MSG_ID ? callLog : null)),
          isMember: vi.fn(() => false),
        },
      });
      const testApp = instance.app;
      instance.sessionStore.createSession(ALICE_ID, "alice-token5");

      const res = await request(testApp)
        .post("/api/calls/history/delete")
        .set("Cookie", "sid=alice-token5")
        .send({ messageId: MSG_ID });
      expect(res.status).toBe(403);
    });

    it("returns 400 when message is not a call entry", async () => {
      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          findChatById: vi.fn(() => ({ id: CHAT_ID, type: "dm" })),
          findMessageById: vi.fn((id) =>
            id === MSG_ID ? { ...callLog, body: "hello" } : null,
          ),
          isMember: vi.fn(() => true),
        },
      });
      const testApp = instance.app;
      instance.sessionStore.createSession(ALICE_ID, "alice-token6");

      const res = await request(testApp)
        .post("/api/calls/history/delete")
        .set("Cookie", "sid=alice-token6")
        .send({ messageId: MSG_ID });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Not a call entry");
    });

    it("returns 404 when chat is missing", async () => {
      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          findMessageById: vi.fn((id) => (id === MSG_ID ? callLog : null)),
          findChatById: vi.fn(() => null),
          isMember: vi.fn(() => true),
        },
      });
      const testApp = instance.app;
      instance.sessionStore.createSession(ALICE_ID, "alice-token7");

      const res = await request(testApp)
        .post("/api/calls/history/delete")
        .set("Cookie", "sid=alice-token7")
        .send({ messageId: MSG_ID });
      expect(res.status).toBe(404);
    });

    it("returns 404 when message is in a non-dm chat", async () => {
      const instance = makeApp({
        userStore: makeUserStore([ALICE]),
        deps: {
          findMessageById: vi.fn((id) => (id === MSG_ID ? callLog : null)),
          findChatById: vi.fn(() => ({ id: CHAT_ID, type: "group" })),
          isMember: vi.fn(() => true),
        },
      });
      const testApp = instance.app;
      instance.sessionStore.createSession(ALICE_ID, "alice-token8");

      const res = await request(testApp)
        .post("/api/calls/history/delete")
        .set("Cookie", "sid=alice-token8")
        .send({ messageId: MSG_ID });
      expect(res.status).toBe(404);
    });
  });
});

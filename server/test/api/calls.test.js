import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BOB_ID = "22222222-2222-4222-8222-222222222222";
const CHAT_ID = "33333333-3333-4333-8333-333333333333";

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
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { createCallManager } from "../../lib/callManager.js";

describe("callManager", () => {
  const dummyChatId = "11111111-1111-4111-8111-111111111111";
  const dummyUserId1 = "22222222-2222-4222-8222-222222222222";
  const dummyUserId2 = "33333333-3333-4333-8333-333333333333";

  const callerUser = {
    id: dummyUserId1,
    username: "alice",
    nickname: "Alice",
    avatar_url: "/avatar/alice.png",
  };

  const calleeUser = {
    id: dummyUserId2,
    username: "bob",
    nickname: "Bob",
    avatar_url: "/avatar/bob.png",
  };

  let mockDeps;
  let callManager;

  beforeEach(() => {
    mockDeps = {
      isMember: vi.fn((chatId, userId) => true),
      findChatById: vi.fn((chatId) => ({
        id: chatId,
        type: "dm",
      })),
      listChatMembers: vi.fn((chatId) => [
        { id: dummyUserId1, username: "alice" },
        { id: dummyUserId2, username: "bob" },
      ]),
      findUserById: vi.fn((id) =>
        id === dummyUserId1 ? callerUser : calleeUser,
      ),
      findUserByUsername: vi.fn((u) =>
        u === "alice" ? callerUser : calleeUser,
      ),
      emitToUser: vi.fn(),
      sendPushNotificationToUsers: vi.fn(),
    };
    callManager = createCallManager(mockDeps);
  });

  describe("getIceServers", () => {
    it("returns default STUN server if TURN is not configured", () => {
      const servers = callManager.getIceServers();
      expect(servers).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
    });

    it("includes TURN configuration if provided in env", () => {
      const customManager = createCallManager({
        ...mockDeps,
        env: {
          TURN_STUN_URL: "stun:custom.stun.org:19302",
          TURN_URL: "turn:custom.turn.org:3478",
          TURN_USERNAME: "turnuser",
          TURN_CREDENTIAL: "turnpassword",
        },
      });
      const servers = customManager.getIceServers();
      expect(servers).toEqual([
        { urls: "stun:custom.stun.org:19302" },
        {
          urls: "turn:custom.turn.org:3478",
          username: "turnuser",
          credential: "turnpassword",
        },
      ]);
    });
  });

  describe("startCall", () => {
    it("rejects invalid UUID chatId", async () => {
      const res = await callManager.startCall({
        user: callerUser,
        chatId: "not-a-uuid",
        type: "voice",
      });
      expect(res.error).toBe("Invalid chat ID");
      expect(res.status).toBe(400);
    });

    it("rejects non-dm chat", async () => {
      mockDeps.findChatById.mockReturnValueOnce({
        id: dummyChatId,
        type: "group",
      });
      const res = await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      expect(res.error).toBe("Calls are only supported in direct messages");
      expect(res.status).toBe(400);
    });

    it("rejects if user is not member of the chat", async () => {
      mockDeps.isMember.mockReturnValueOnce(false);
      const res = await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      expect(res.error).toBe("You are not a member of this chat");
      expect(res.status).toBe(403);
    });

    it("successfully creates call and emits call:incoming to callee", async () => {
      const res = await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "video",
      });
      expect(res.status).toBe(200);
      expect(res.call.chatId).toBe(dummyChatId);
      expect(res.call.callerUsername).toBe("alice");
      expect(res.call.calleeUsername).toBe("bob");
      expect(res.call.type).toBe("video");
      expect(res.call.status).toBe("ringing");

      expect(mockDeps.emitToUser).toHaveBeenCalledWith("bob", {
        type: "call:incoming",
        chatId: dummyChatId,
        callType: "video",
        caller: {
          id: callerUser.id,
          username: callerUser.username,
          nickname: callerUser.nickname,
          avatarUrl: callerUser.avatar_url,
        },
      });
    });

    it("rejects starting a call if one is already active in the chat", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      const res = await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      expect(res.status).toBe(409);
      expect(res.error).toBe("Call already in progress in this chat");
    });

    it("rejects starting a call if other participant is deleted", async () => {
      mockDeps.findUserById.mockReturnValueOnce({
        id: dummyUserId2,
        username: "deleted",
        is_deleted: 1,
      });
      const res = await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      expect(res.status).toBe(400);
      expect(res.error).toBe("Cannot call a deleted user");
    });
  });

  describe("acceptCall", () => {
    beforeEach(async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
    });

    it("rejects if caller tries to accept their own call", async () => {
      const res = await callManager.acceptCall({
        user: callerUser,
        chatId: dummyChatId,
      });
      expect(res.status).toBe(403);
    });

    it("accepts call when callee responds, updates status and notifies caller", async () => {
      const res = await callManager.acceptCall({
        user: calleeUser,
        chatId: dummyChatId,
      });
      expect(res.status).toBe(200);
      expect(res.call.status).toBe("connected");
      expect(mockDeps.emitToUser).toHaveBeenCalledWith("alice", {
        type: "call:accepted",
        chatId: dummyChatId,
      });
    });
  });

  describe("rejectCall", () => {
    beforeEach(async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
    });

    it("rejects call and cleans it from activeCalls, notifying caller", async () => {
      const res = await callManager.rejectCall({
        user: calleeUser,
        chatId: dummyChatId,
      });
      expect(res.status).toBe(200);
      expect(callManager.getActiveCall(dummyChatId)).toBeUndefined();
      expect(mockDeps.emitToUser).toHaveBeenCalledWith("alice", {
        type: "call:rejected",
        chatId: dummyChatId,
      });
    });
  });

  describe("endCall", () => {
    beforeEach(async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
    });

    it("allows caller to end call", async () => {
      const res = await callManager.endCall({
        user: callerUser,
        chatId: dummyChatId,
      });
      expect(res.status).toBe(200);
      expect(callManager.getActiveCall(dummyChatId)).toBeUndefined();
      expect(mockDeps.emitToUser).toHaveBeenCalledWith("bob", {
        type: "call:ended",
        chatId: dummyChatId,
      });
    });

    it("allows callee to end call", async () => {
      const res = await callManager.endCall({
        user: calleeUser,
        chatId: dummyChatId,
      });
      expect(res.status).toBe(200);
      expect(callManager.getActiveCall(dummyChatId)).toBeUndefined();
      expect(mockDeps.emitToUser).toHaveBeenCalledWith("alice", {
        type: "call:ended",
        chatId: dummyChatId,
      });
    });
  });

  describe("relaySignal", () => {
    beforeEach(async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
    });

    it("relays offer to peer", async () => {
      const res = await callManager.relaySignal({
        user: callerUser,
        chatId: dummyChatId,
        signalType: "offer",
        payload: { sdp: { type: "offer", sdp: "dummy-sdp" } },
      });
      expect(res.status).toBe(200);
      expect(mockDeps.emitToUser).toHaveBeenCalledWith("bob", {
        type: "call:offer",
        chatId: dummyChatId,
        sdp: { type: "offer", sdp: "dummy-sdp" },
      });
    });

    it("relays ice-candidate to peer", async () => {
      const res = await callManager.relaySignal({
        user: calleeUser,
        chatId: dummyChatId,
        signalType: "ice-candidate",
        payload: { candidate: { candidate: "candidate:1" } },
      });
      expect(res.status).toBe(200);
      expect(mockDeps.emitToUser).toHaveBeenCalledWith("alice", {
        type: "call:ice-candidate",
        chatId: dummyChatId,
        candidate: { candidate: "candidate:1" },
      });
    });
  });

  describe("cleanupUserCalls", () => {
    it("cleans up active call when participant disconnects", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      expect(callManager.getActiveCall(dummyChatId)).toBeDefined();

      callManager.cleanupUserCalls("alice");
      expect(callManager.getActiveCall(dummyChatId)).toBeUndefined();
      expect(mockDeps.emitToUser).toHaveBeenCalledWith("bob", {
        type: "call:ended",
        chatId: dummyChatId,
      });
    });
  });

  describe("getIncomingCallForUser", () => {
    it("returns call:incoming payload for a callee with a ringing call", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "video",
      });

      const incoming = await callManager.getIncomingCallForUser("bob");
      expect(incoming).toEqual({
        type: "call:incoming",
        chatId: dummyChatId,
        callType: "video",
        caller: {
          id: callerUser.id,
          username: "alice",
          nickname: "Alice",
          avatarUrl: "/avatar/alice.png",
        },
      });
    });

    it("returns null when the user is the caller, not the callee", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });

      const incoming = await callManager.getIncomingCallForUser("alice");
      expect(incoming).toBeNull();
    });

    it("returns null when there is no active call", async () => {
      const incoming = await callManager.getIncomingCallForUser("bob");
      expect(incoming).toBeNull();
    });

    it("returns null once the call is no longer ringing (accepted)", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      await callManager.acceptCall({ user: calleeUser, chatId: dummyChatId });

      const incoming = await callManager.getIncomingCallForUser("bob");
      expect(incoming).toBeNull();
    });

    it("matches username case-insensitively", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });

      const incoming = await callManager.getIncomingCallForUser("BOB");
      expect(incoming).not.toBeNull();
      expect(incoming.chatId).toBe(dummyChatId);
    });
  });

  describe("production wiring (index.js)", () => {
    it("wires findUserById into createCallManager so replayed incoming calls hydrate caller info", () => {
      // index.js cannot be imported in tests (WASM init at module load), so
      // assert the dependency wiring textually. Without findUserById,
      // getIncomingCallForUser degrades to username-only caller info
      // (no nickname, no avatar) on cold app open.
      const source = readFileSync(
        new URL("../../index.js", import.meta.url),
        "utf8",
      );
      const start = source.indexOf("const callManager = createCallManager({");
      expect(start).toBeGreaterThan(-1);
      const block = source.slice(start, source.indexOf("});", start));
      expect(block).toMatch(/\bfindUserById\b/);
    });
  });

  describe("call push notifications", () => {
    const incomingPayload = {
      title: "Incoming video call from Alice",
      body: "Tap to answer",
      data: {
        callPush: "incoming",
        chatId: dummyChatId,
        callType: "video",
        url: "/",
      },
    };
    const dismissPayload = {
      data: { callPush: "dismiss", chatId: dummyChatId },
    };

    it("sends incoming push to callee on startCall", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "video",
      });
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledTimes(1);
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledWith(
        [dummyUserId2],
        incomingPayload,
      );
    });

    it("sends dismiss push when caller ends a ringing call", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      mockDeps.sendPushNotificationToUsers.mockClear();
      await callManager.endCall({ user: callerUser, chatId: dummyChatId });
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledTimes(1);
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledWith(
        [dummyUserId2],
        dismissPayload,
      );
    });

    it("sends dismiss push when callee accepts (clears other devices)", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      mockDeps.sendPushNotificationToUsers.mockClear();
      await callManager.acceptCall({ user: calleeUser, chatId: dummyChatId });
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledTimes(1);
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledWith(
        [dummyUserId2],
        dismissPayload,
      );
    });

    it("does not send dismiss push when ending a connected call", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      await callManager.acceptCall({ user: calleeUser, chatId: dummyChatId });
      mockDeps.sendPushNotificationToUsers.mockClear();
      await callManager.endCall({ user: calleeUser, chatId: dummyChatId });
      expect(mockDeps.sendPushNotificationToUsers).not.toHaveBeenCalled();
    });

    it("sends dismiss push when callee rejects a ringing call", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      mockDeps.sendPushNotificationToUsers.mockClear();
      await callManager.rejectCall({ user: calleeUser, chatId: dummyChatId });
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledTimes(1);
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledWith(
        [dummyUserId2],
        dismissPayload,
      );
    });

    it("sends dismiss push on cleanupUserCalls of a ringing call", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      mockDeps.sendPushNotificationToUsers.mockClear();
      callManager.cleanupUserCalls("alice");
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledTimes(1);
      expect(mockDeps.sendPushNotificationToUsers).toHaveBeenCalledWith(
        [dummyUserId2],
        dismissPayload,
      );
    });

    it("does not send dismiss push on cleanupUserCalls of a connected call", async () => {
      await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      await callManager.acceptCall({ user: calleeUser, chatId: dummyChatId });
      mockDeps.sendPushNotificationToUsers.mockClear();
      callManager.cleanupUserCalls("alice");
      expect(mockDeps.sendPushNotificationToUsers).not.toHaveBeenCalled();
    });

    it("does not break call flow when push delivery throws", async () => {
      mockDeps.sendPushNotificationToUsers.mockRejectedValue(
        new Error("push service down"),
      );
      const res = await callManager.startCall({
        user: callerUser,
        chatId: dummyChatId,
        type: "voice",
      });
      expect(res.status).toBe(200);
      expect(mockDeps.emitToUser).toHaveBeenCalledWith(
        "bob",
        expect.objectContaining({ type: "call:incoming" }),
      );
    });
  });
});

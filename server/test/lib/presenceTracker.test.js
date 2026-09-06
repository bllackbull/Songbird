import { describe, test, expect, vi } from "vitest";
import { createPresenceTracker } from "../../lib/presenceTracker.js";

function setup() {
  const users = new Map([
    [
      "alice",
      {
        id: "11111111-1111-4111-8111-111111111111",
        username: "alice",
        status: "online",
        last_seen: "2026-08-04 10:00:00",
      },
    ],
    [
      "bob",
      {
        id: "22222222-2222-4222-8222-222222222222",
        username: "bob",
        status: "online",
        last_seen: "2026-08-04 10:00:00",
      },
    ],
    [
      "carol",
      {
        id: "33333333-3333-4333-8333-333333333333",
        username: "carol",
        status: "invisible",
        last_seen: "2026-08-04 10:00:00",
      },
    ],
  ]);
  const updateLastSeen = vi.fn();
  const getUserPresence = vi.fn(
    (username) => users.get(String(username || "").toLowerCase()) ?? null,
  );
  const listChatsForUser = vi.fn((userId) =>
    userId === "11111111-1111-4111-8111-111111111111" || userId === "33333333-3333-4333-8333-333333333333"
      ? [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }]
      : [],
  );
  const listChatMembers = vi.fn((chatId) =>
    chatId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      ? [{ username: "alice" }, { username: "bob" }, { username: "carol" }]
      : [],
  );
  const emitToUser = vi.fn();
  const tracker = createPresenceTracker({
    updateLastSeen,
    getUserPresence,
    listChatsForUser,
    listChatMembers,
    emitToUser,
  });
  return {
    tracker,
    updateLastSeen,
    getUserPresence,
    listChatsForUser,
    listChatMembers,
    emitToUser,
  };
}

const onlinePayload = (username) =>
  expect.objectContaining({
    type: "presence_update",
    username,
    status: "online",
    userId: "11111111-1111-4111-8111-111111111111",
  });
const offlinePayload = (username) =>
  expect.objectContaining({
    type: "presence_update",
    username,
    status: "offline",
    userId: "11111111-1111-4111-8111-111111111111",
  });

describe("presenceTracker", () => {
  test("0->1 writes last_seen and broadcasts online to self + co-members", () => {
    const { tracker, updateLastSeen, emitToUser } = setup();
    const sse1 = { ref: "sse-1" };
    tracker.markConnected("alice", sse1);
    expect(updateLastSeen).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(emitToUser.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        userId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(emitToUser).toHaveBeenCalledWith("bob", onlinePayload("alice"));
    expect(emitToUser).toHaveBeenCalledWith("carol", onlinePayload("alice"));
  });

  test("a second connection from the same user does not re-broadcast", () => {
    const { tracker, updateLastSeen, emitToUser } = setup();
    const sse1 = { ref: "sse-1" };
    const ws1 = { ref: "ws-1" };
    tracker.markConnected("alice", sse1);
    emitToUser.mockClear();
    updateLastSeen.mockClear();
    tracker.markConnected("alice", ws1);
    expect(updateLastSeen).not.toHaveBeenCalled();
    expect(emitToUser).not.toHaveBeenCalled();
    expect(tracker.isConnected("alice")).toBe(true);
  });

  test("closing one of two connections keeps the user online", () => {
    const { tracker, emitToUser } = setup();
    const sse1 = { ref: "sse-1" };
    const ws1 = { ref: "ws-1" };
    tracker.markConnected("alice", sse1);
    tracker.markConnected("alice", ws1);
    emitToUser.mockClear();
    tracker.markDisconnected("alice", sse1);
    expect(tracker.isConnected("alice")).toBe(true);
    expect(emitToUser).not.toHaveBeenCalled();
  });

  test("1->0 broadcasts offline and writes last_seen", () => {
    const { tracker, updateLastSeen, emitToUser } = setup();
    const sse1 = { ref: "sse-1" };
    tracker.markConnected("alice", sse1);
    emitToUser.mockClear();
    updateLastSeen.mockClear();
    tracker.markDisconnected("alice", sse1);
    expect(tracker.isConnected("alice")).toBe(false);
    expect(updateLastSeen).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    expect(emitToUser).toHaveBeenCalledWith("alice", offlinePayload("alice"));
    expect(emitToUser).toHaveBeenCalledWith("bob", offlinePayload("alice"));
  });

  test("invisible user never broadcasts online; effective status is offline", () => {
    const { tracker, emitToUser } = setup();
    const sse1 = { ref: "sse-1" };
    tracker.markConnected("carol", sse1);
    expect(tracker.isConnected("carol")).toBe(true);
    expect(
      tracker.effectiveStatus({ username: "carol", status: "invisible" }),
    ).toBe("offline");
    expect(emitToUser).toHaveBeenCalledWith(
      "bob",
      expect.objectContaining({
        username: "carol",
        status: "offline",
        rawStatus: "invisible",
      }),
    );
  });

  test("effectiveStatus mapping", () => {
    const { tracker } = setup();
    const sse1 = { ref: "sse-1" };
    expect(
      tracker.effectiveStatus({ username: "alice", status: "online" }),
    ).toBe("offline");
    tracker.markConnected("alice", sse1);
    expect(
      tracker.effectiveStatus({ username: "alice", status: "online" }),
    ).toBe("online");
    expect(
      tracker.effectiveStatus({ username: "carol", status: "invisible" }),
    ).toBe("offline");
    expect(tracker.effectiveStatus({})).toBe("offline");
  });

  test("broadcastStatus recomputes payload for a connected user", () => {
    const { tracker, emitToUser } = setup();
    const sse1 = { ref: "sse-1" };
    tracker.markConnected("alice", sse1);
    emitToUser.mockClear();
    tracker.broadcastStatus("alice");
    expect(emitToUser).toHaveBeenCalledWith("alice", onlinePayload("alice"));
    expect(emitToUser).toHaveBeenCalledWith("bob", onlinePayload("alice"));
  });

  test("getOnlineCount counts only connected users who prefer online", () => {
    const { tracker } = setup();
    const sse1 = { ref: "sse-1" };
    const sse2 = { ref: "sse-2" };
    tracker.markConnected("alice", sse1);
    tracker.markConnected("carol", sse2); // invisible
    expect(tracker.getOnlineCount()).toBe(1);
  });
});

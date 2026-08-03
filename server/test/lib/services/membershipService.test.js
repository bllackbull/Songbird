import { describe, test, expect, vi } from "vitest";
import { createMembershipService } from "../../../lib/services/membershipService.js";

describe("membershipService", () => {
  const createMockDb = (overrides = {}) => {
    const membersMap = new Map();
    const chatsMap = new Map();
    const usersMap = new Map();

    // Default seed
    chatsMap.set(1, {
      id: 1,
      type: "group",
      name: "Test Group",
      invite_token: "tok123",
    });
    usersMap.set(10, { id: 10, username: "alice", nickname: "Alice" });
    usersMap.set(20, { id: 20, username: "bob", nickname: "Bob" });

    membersMap.set(1, [{ id: 10, username: "alice", role: "owner" }]);

    return {
      getChatById: vi.fn((id) => chatsMap.get(Number(id)) || null),
      listChatMembers: vi.fn((id) => membersMap.get(Number(id)) || []),
      addChatMember: vi.fn((chatId, userId, role) => {
        const list = membersMap.get(Number(chatId)) || [];
        const u = usersMap.get(Number(userId));
        if (u) {
          list.push({ id: u.id, username: u.username, role });
          membersMap.set(Number(chatId), list);
        }
      }),
      removeChatMember: vi.fn((chatId, userId) => {
        const list = membersMap.get(Number(chatId)) || [];
        membersMap.set(
          Number(chatId),
          list.filter((m) => Number(m.id) !== Number(userId)),
        );
      }),
      updateChatMemberRole: vi.fn((chatId, userId, role) => {
        const list = membersMap.get(Number(chatId)) || [];
        const item = list.find((m) => Number(m.id) === Number(userId));
        if (item) item.role = role;
      }),
      findUserById: vi.fn((id) => usersMap.get(Number(id)) || null),
      findUserByUsername: vi.fn(
        (un) => [...usersMap.values()].find((u) => u.username === un) || null,
      ),
      findGroupByInviteToken: vi.fn(
        (tok) =>
          [...chatsMap.values()].find((c) => c.invite_token === tok) || null,
      ),
      addSystemMessage: vi.fn((chatId, body) => ({
        id: 99,
        chat_id: chatId,
        body,
      })),
      getRow: vi.fn(),
      run: vi.fn(),
      ...overrides,
    };
  };

  test("addMembers adds user and generates system message and sse payloads", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.addMembers({ chatId: 1, targetUserIds: [20] });
    expect(res.success).toBe(true);
    expect(res.addedCount).toBe(1);
    expect(db.addChatMember).toHaveBeenCalledWith(1, 20, "member");
    expect(db.addSystemMessage).toHaveBeenCalledWith(
      1,
      "[[system:joined:bob]]",
    );
    expect(res.sseEvents.length).toBeGreaterThan(0);
  });

  test("joinByInvite resolves chat by token and adds member", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.joinByInvite({ inviteToken: "tok123", userId: 20 });
    expect(res.success).toBe(true);
    expect(res.chat.id).toBe(1);
    expect(db.addChatMember).toHaveBeenCalledWith(1, 20, "member");
    expect(db.addSystemMessage).toHaveBeenCalledWith(
      1,
      "[[system:joined:Bob]]",
    );
  });

  test("leaveChat removes user and emits left system message", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.leaveChat({ chatId: 1, userId: 10 });
    expect(res.success).toBe(true);
    expect(db.removeChatMember).toHaveBeenCalledWith(1, 10);
    expect(db.addSystemMessage).toHaveBeenCalledWith(
      1,
      "[[system:left:Alice]]",
    );
  });

  test("removeMember removes target user and emits removed system message", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.removeMember({
      chatId: 1,
      targetUserId: 10,
      removedByUserId: 20,
    });
    expect(res.success).toBe(true);
    expect(db.removeChatMember).toHaveBeenCalledWith(1, 10);
    expect(db.addSystemMessage).toHaveBeenCalledWith(
      1,
      "[[system:removed:Alice]]",
    );
  });

  test("updateMemberRole updates role in db and emits sse event", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.updateMemberRole({
      chatId: 1,
      targetUserId: 10,
      newRole: "admin",
    });
    expect(res.success).toBe(true);
    expect(db.updateChatMemberRole).toHaveBeenCalledWith(1, 10, "admin");
  });
});

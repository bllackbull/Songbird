import { describe, test, expect, vi } from "vitest";
import { createMembershipService } from "../../../lib/services/membershipService.js";

const CHAT_ID = "11111111-1111-4111-a111-111111111111";
const ALICE_ID = "22222222-2222-4222-a222-222222222222";
const BOB_ID = "33333333-3333-4333-a333-333333333333";
const MSG_ID = "44444444-4444-4444-a444-444444444444";

describe("membershipService", () => {
  const createMockDb = (overrides = {}) => {
    const membersMap = new Map();
    const chatsMap = new Map();
    const usersMap = new Map();

    // Default seed
    chatsMap.set(CHAT_ID, {
      id: CHAT_ID,
      type: "group",
      name: "Test Group",
      invite_token: "tok123",
    });
    usersMap.set(ALICE_ID, { id: ALICE_ID, username: "alice", nickname: "Alice" });
    usersMap.set(BOB_ID, { id: BOB_ID, username: "bob", nickname: "Bob" });

    membersMap.set(CHAT_ID, [{ id: ALICE_ID, username: "alice", role: "owner" }]);

    return {
      getChatById: vi.fn((id) => chatsMap.get(String(id)) || null),
      listChatMembers: vi.fn((id) => membersMap.get(String(id)) || []),
      addChatMember: vi.fn((chatId, userId, role) => {
        const list = membersMap.get(String(chatId)) || [];
        const u = usersMap.get(String(userId));
        if (u) {
          list.push({ id: u.id, username: u.username, role });
          membersMap.set(String(chatId), list);
        }
      }),
      removeChatMember: vi.fn((chatId, userId) => {
        const list = membersMap.get(String(chatId)) || [];
        membersMap.set(
          String(chatId),
          list.filter((m) => String(m.id) !== String(userId)),
        );
      }),
      updateChatMemberRole: vi.fn((chatId, userId, role) => {
        const list = membersMap.get(String(chatId)) || [];
        const item = list.find((m) => String(m.id) === String(userId));
        if (item) item.role = role;
      }),
      findUserById: vi.fn((id) => usersMap.get(String(id)) || null),
      findUserByUsername: vi.fn(
        (un) => [...usersMap.values()].find((u) => u.username === un) || null,
      ),
      findGroupByInviteToken: vi.fn(
        (tok) =>
          [...chatsMap.values()].find((c) => c.invite_token === tok) || null,
      ),
      addSystemMessage: vi.fn((chatId, body, userId) => ({
        id: MSG_ID,
        chat_id: chatId,
        user_id: userId,
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

    const res = service.addMembers({ chatId: CHAT_ID, targetUserIds: [BOB_ID] });
    expect(res.success).toBe(true);
    expect(res.addedCount).toBe(1);
    expect(db.addChatMember).toHaveBeenCalledWith(CHAT_ID, BOB_ID, "member");
    expect(db.addSystemMessage).toHaveBeenCalledWith(
      CHAT_ID,
      "[[system:joined:bob]]",
      BOB_ID,
    );
    expect(res.sseEvents.length).toBeGreaterThan(0);
  });

  test("joinByInvite resolves chat by token and adds member", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.joinByInvite({ inviteToken: "tok123", userId: BOB_ID });
    expect(res.success).toBe(true);
    expect(res.chat.id).toBe(CHAT_ID);
    expect(db.addChatMember).toHaveBeenCalledWith(CHAT_ID, BOB_ID, "member");
    expect(db.addSystemMessage).toHaveBeenCalledWith(
      CHAT_ID,
      "[[system:joined:Bob]]",
      BOB_ID,
    );
  });

  test("leaveChat removes user and emits left system message", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.leaveChat({ chatId: CHAT_ID, userId: ALICE_ID });
    expect(res.success).toBe(true);
    expect(db.removeChatMember).toHaveBeenCalledWith(CHAT_ID, ALICE_ID);
    expect(db.addSystemMessage).toHaveBeenCalledWith(
      CHAT_ID,
      "[[system:left:Alice]]",
      ALICE_ID,
    );
  });

  test("removeMember removes target user and emits removed system message", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.removeMember({
      chatId: CHAT_ID,
      targetUserId: ALICE_ID,
      removedByUserId: BOB_ID,
    });
    expect(res.success).toBe(true);
    expect(db.removeChatMember).toHaveBeenCalledWith(CHAT_ID, ALICE_ID);
    expect(db.addSystemMessage).toHaveBeenCalledWith(
      CHAT_ID,
      "[[system:removed:Alice]]",
      ALICE_ID,
    );
  });

  test("updateMemberRole updates role in db and emits sse event", () => {
    const db = createMockDb();
    const service = createMembershipService(db);

    const res = service.updateMemberRole({
      chatId: CHAT_ID,
      targetUserId: ALICE_ID,
      newRole: "admin",
    });
    expect(res.success).toBe(true);
    expect(db.updateChatMemberRole).toHaveBeenCalledWith(CHAT_ID, ALICE_ID, "admin");
  });
});

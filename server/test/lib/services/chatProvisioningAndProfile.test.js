import { describe, test, expect, vi } from "vitest";
import { createChatProvisioningService } from "../../../lib/services/chatProvisioningService.js";
import { createProfileService } from "../../../lib/services/profileService.js";

describe("chatProvisioningService", () => {
  const createMockDb = () => ({
    createChat: vi.fn(() => 42),
    addChatMember: vi.fn(),
    findUserByUsername: vi.fn((un) =>
      un === "bob" ? { id: 20, username: "bob" } : null,
    ),
    findUserById: vi.fn((id) =>
      id === 10 ? { id: 10, username: "alice" } : null,
    ),
    crypto: { randomBytes: () => Buffer.from("abcdef123456", "hex") },
  });

  test("createGroupOrChannel provisions chat, adds owner and members, returns sse events", () => {
    const db = createMockDb();
    const service = createChatProvisioningService(db);

    const res = service.createGroupOrChannel({
      name: "New Group",
      type: "group",
      creatorUserId: 10,
      initialMemberUsernames: ["bob"],
    });

    expect(res.success).toBe(true);
    expect(res.chatId).toBe(42);
    expect(db.addChatMember).toHaveBeenCalledWith(42, 10, "owner");
    expect(db.addChatMember).toHaveBeenCalledWith(42, 20, "member");
    expect(res.sseEvents.length).toBe(2);
  });
});

describe("profileService", () => {
  const createMockDb = () => ({
    updateUserProfile: vi.fn(),
    findUserById: vi.fn((id) => ({ id, username: "alice" })),
    listChatsForUser: vi.fn(() => [{ id: 1 }, { id: 2 }]),
    listChatMembers: vi.fn((chatId) => [
      { id: 10, username: "alice" },
      { id: 20, username: "bob" },
    ]),
  });

  test("updateProfile updates profile and emits user_profile_updated events", () => {
    const db = createMockDb();
    const service = createProfileService(db);

    const res = service.updateProfile({
      userId: 10,
      updates: { nickname: "Alice W." },
    });

    expect(res.success).toBe(true);
    expect(db.updateUserProfile).toHaveBeenCalledWith(10, {
      nickname: "Alice W.",
    });
    expect(res.sseEvents.length).toBe(2);
  });
});

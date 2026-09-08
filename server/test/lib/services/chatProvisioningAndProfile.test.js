import { describe, test, expect, vi } from "vitest";
import { createChatProvisioningService } from "../../../lib/services/chatProvisioningService.js";
import { createProfileService } from "../../../lib/services/profileService.js";

const CHAT_ID = "42424242-4242-4242-a242-424242424242";
const ALICE_ID = "10101010-1010-4010-a010-101010101010";
const BOB_ID = "20202020-2020-4020-a020-202020202020";

describe("chatProvisioningService", () => {
  const createMockDb = () => ({
    createChat: vi.fn(() => CHAT_ID),
    addChatMember: vi.fn(),
    findUserByUsername: vi.fn((un) =>
      un === "bob" ? { id: BOB_ID, username: "bob" } : null,
    ),
    findUserById: vi.fn((id) =>
      id === ALICE_ID ? { id: ALICE_ID, username: "alice" } : null,
    ),
    crypto: { randomBytes: () => Buffer.from("abcdef123456", "hex") },
  });

  test("createGroupOrChannel provisions chat, adds owner and members, returns sse events", async () => {
    const db = createMockDb();
    const service = createChatProvisioningService(db);

    const res = await service.createGroupOrChannel({
      name: "New Group",
      type: "group",
      creatorUserId: ALICE_ID,
      initialMemberUsernames: ["bob"],
    });

    expect(res.success).toBe(true);
    expect(res.chatId).toBe(CHAT_ID);
    expect(db.addChatMember).toHaveBeenCalledWith(CHAT_ID, ALICE_ID, "owner");
    expect(db.addChatMember).toHaveBeenCalledWith(CHAT_ID, BOB_ID, "member");
    expect(res.sseEvents.length).toBe(2);
  });
});

describe("profileService", () => {
  const createMockDb = () => ({
    updateUserProfile: vi.fn(),
    findUserById: vi.fn((id) => ({ id, username: "alice" })),
    listChatsForUser: vi.fn(() => [{ id: "11111111-1111-4111-a111-111111111111" }, { id: "22222222-2222-4222-a222-222222222222" }]),
    listChatMembers: vi.fn((chatId) => [
      { id: ALICE_ID, username: "alice" },
      { id: BOB_ID, username: "bob" },
    ]),
  });

  test("updateProfile updates profile and emits user_profile_updated events", async () => {
    const db = createMockDb();
    const service = createProfileService(db);

    const res = await service.updateProfile({
      userId: ALICE_ID,
      updates: { nickname: "Alice W." },
    });

    expect(res.success).toBe(true);
    expect(db.updateUserProfile).toHaveBeenCalledWith(ALICE_ID, {
      nickname: "Alice W.",
    });
    expect(res.sseEvents.length).toBe(2);
  });
});

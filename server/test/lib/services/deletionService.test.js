import { describe, test, expect, vi } from "vitest";
import { createDeletionService } from "../../../lib/services/deletionService.js";

const CHAT_ID = "11111111-1111-4111-a111-111111111111";
const ALICE_ID = "10101010-1010-4010-a010-101010101010";
const BOB_ID = "20202020-2020-4020-a020-202020202020";
const CHAT_ID_100 = "10000000-0000-4000-8000-000000000100";

describe("deletionService", () => {
  const createMockDb = () => {
    return {
      findChatById: vi.fn((id) => ({ id, name: "General Chat" })),
      findUserById: vi.fn((id) => ({ id, username: "alice" })),
      listChatMembers: vi.fn((chatId) => [
        { id: ALICE_ID, username: "alice" },
        { id: BOB_ID, username: "bob" },
      ]),
      listChatsForUser: vi.fn((userId) => [{ id: CHAT_ID_100 }]),
      deleteChatById: vi.fn((chatId) => ({
        storedNames: ["file1.png", "file2.pdf"],
      })),
      deleteUserById: vi.fn((userId) => ({
        storedNames: ["avatar.jpg"],
        avatarUrl: "avatar.jpg",
      })),
    };
  };

  test("deleteChat returns files to remove and sse events for members", async () => {
    const db = createMockDb();
    const service = createDeletionService(db);

    const res = await service.deleteChat({ chatId: CHAT_ID });

    expect(res.success).toBe(true);
    expect(db.deleteChatById).toHaveBeenCalledWith(CHAT_ID);
    expect(res.storedFilesToRemove).toEqual(["file1.png", "file2.pdf"]);
    expect(res.sseEvents.length).toBe(2);
    expect(res.sseEvents[0].payload.type).toBe("chat_deleted");
  });

  test("deleteUser returns files to remove and sse updates for affected chat members", async () => {
    const db = createMockDb();
    const service = createDeletionService(db);

    const res = await service.deleteUser({ targetUserId: ALICE_ID });

    expect(res.success).toBe(true);
    expect(db.deleteUserById).toHaveBeenCalledWith(ALICE_ID);
    expect(res.storedFilesToRemove).toEqual(["avatar.jpg"]);
    expect(res.sseEvents.length).toBe(2);
    expect(res.sseEvents[0].payload.type).toBe("chat_updated");
  });
});

  test("awaits PostgreSQL-style Promise results from every deletion dependency", async () => {
    const db = {
      findChatById: vi.fn(async (id) => ({ id, name: "General Chat" })),
      findUserById: vi.fn(async (id) => ({ id, username: "alice" })),
      listChatMembers: vi.fn(async () => [
        { id: ALICE_ID, username: "alice" },
        { id: BOB_ID, username: "bob" },
      ]),
      listChatsForUser: vi.fn(async () => [{ id: CHAT_ID_100 }]),
      deleteChatById: vi.fn(async () => ({ storedNames: ["chat.bin"] })),
      deleteUserById: vi.fn(async () => ({ storedNames: ["user.bin"], avatarUrl: "avatar.jpg" })),
    };
    const service = createDeletionService(db);

    const chatResult = await service.deleteChat({ chatId: CHAT_ID });
    const userResult = await service.deleteUser({ targetUserId: ALICE_ID });

    expect(chatResult.storedFilesToRemove).toEqual(["chat.bin"]);
    expect(userResult.storedFilesToRemove).toEqual(["user.bin"]);
    expect(userResult.affectedChatIds).toEqual([CHAT_ID_100]);
    expect(db.deleteChatById).toHaveBeenCalledWith(CHAT_ID);
    expect(db.deleteUserById).toHaveBeenCalledWith(ALICE_ID);
  });

import { describe, test, expect, vi } from "vitest";
import { createDeletionService } from "../../../lib/services/deletionService.js";

describe("deletionService", () => {
  const createMockDb = () => {
    return {
      findChatById: vi.fn((id) => ({ id, name: "General Chat" })),
      findUserById: vi.fn((id) => ({ id, username: "alice" })),
      listChatMembers: vi.fn((chatId) => [
        { id: 10, username: "alice" },
        { id: 20, username: "bob" },
      ]),
      listChatsForUser: vi.fn((userId) => [{ id: 100 }]),
      deleteChatById: vi.fn((chatId) => ({
        storedNames: ["file1.png", "file2.pdf"],
      })),
      deleteUserById: vi.fn((userId) => ({
        storedNames: ["avatar.jpg"],
        avatarUrl: "avatar.jpg",
      })),
    };
  };

  test("deleteChat returns files to remove and sse events for members", () => {
    const db = createMockDb();
    const service = createDeletionService(db);

    const res = service.deleteChat({ chatId: 1 });

    expect(res.success).toBe(true);
    expect(db.deleteChatById).toHaveBeenCalledWith(1);
    expect(res.storedFilesToRemove).toEqual(["file1.png", "file2.pdf"]);
    expect(res.sseEvents.length).toBe(2);
    expect(res.sseEvents[0].payload.type).toBe("chat_deleted");
  });

  test("deleteUser returns files to remove and sse updates for affected chat members", () => {
    const db = createMockDb();
    const service = createDeletionService(db);

    const res = service.deleteUser({ targetUserId: 10 });

    expect(res.success).toBe(true);
    expect(db.deleteUserById).toHaveBeenCalledWith(10);
    expect(res.storedFilesToRemove).toEqual(["avatar.jpg"]);
    expect(res.sseEvents.length).toBe(2);
    expect(res.sseEvents[0].payload.type).toBe("chat_updated");
  });
});

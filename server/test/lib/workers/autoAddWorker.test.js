import { describe, test, expect, vi } from "vitest";
import {
  userEvents,
  initAutoAddWorker,
} from "../../../lib/workers/autoAddWorker.js";

describe("autoAddWorker", () => {
  test("bulk adds user to auto-add public chats on user:created event and creates system messages", async () => {
    const getAutoAddPublicChatIds = vi.fn(() => ["chat-1", "chat-2"]);
    const bulkAddMemberToChats = vi.fn(async () => ["chat-1", "chat-2"]);
    const findUserById = vi.fn(() => ({ id: "user-123", username: "alice", nickname: "Alice" }));
    const findChatById = vi.fn((id) => ({ id, type: "group" }));
    const createMessage = vi.fn(async () => "msg-1");
    const emitChatEvent = vi.fn();

    const worker = initAutoAddWorker({
      db: { getAutoAddPublicChatIds, bulkAddMemberToChats, findUserById, findChatById, createMessage },
      emitChatEvent,
    });

    userEvents.emit("user:created", { userId: "user-123" });
    await new Promise((r) => setTimeout(r, 50));

    expect(getAutoAddPublicChatIds).toHaveBeenCalled();
    expect(bulkAddMemberToChats).toHaveBeenCalledWith("user-123", [
      "chat-1",
      "chat-2",
    ]);
    expect(createMessage).toHaveBeenCalledWith(
      "chat-1",
      "user-123",
      "[[system:joined:Alice]]",
      null,
      null,
      null,
      { allowPlaintextSystemMessage: true }
    );
    expect(emitChatEvent).toHaveBeenCalledWith("chat-1", {
      type: "chat_message",
      chatId: "chat-1",
      userId: "user-123",
      username: "alice",
      body: "[[system:joined:Alice]]",
    });

    worker.destroy();
  });

  test("does nothing if no auto-add public chats exist", async () => {
    const getAutoAddPublicChatIds = vi.fn(() => []);
    const bulkAddMemberToChats = vi.fn();
    const emitChatEvent = vi.fn();

    const worker = initAutoAddWorker({
      db: { getAutoAddPublicChatIds, bulkAddMemberToChats },
      emitChatEvent,
    });

    userEvents.emit("user:created", { userId: "user-456" });
    await new Promise((r) => setTimeout(r, 50));

    expect(getAutoAddPublicChatIds).toHaveBeenCalled();
    expect(bulkAddMemberToChats).not.toHaveBeenCalled();
    expect(emitChatEvent).not.toHaveBeenCalled();

    worker.destroy();
  });

  test("does nothing if userId is missing", async () => {
    const getAutoAddPublicChatIds = vi.fn();
    const bulkAddMemberToChats = vi.fn();
    const emitChatEvent = vi.fn();

    const worker = initAutoAddWorker({
      db: { getAutoAddPublicChatIds, bulkAddMemberToChats },
      emitChatEvent,
    });

    userEvents.emit("user:created", {});
    await new Promise((r) => setTimeout(r, 50));

    expect(getAutoAddPublicChatIds).not.toHaveBeenCalled();

    worker.destroy();
  });

  test("unsubscribes on destroy", async () => {
    const getAutoAddPublicChatIds = vi.fn(() => ["chat-1"]);
    const bulkAddMemberToChats = vi.fn(async () => ["chat-1"]);

    const worker = initAutoAddWorker({
      db: { getAutoAddPublicChatIds, bulkAddMemberToChats },
    });

    worker.destroy();

    userEvents.emit("user:created", { userId: "user-789" });
    await new Promise((r) => setTimeout(r, 50));

    expect(getAutoAddPublicChatIds).not.toHaveBeenCalled();
  });
});

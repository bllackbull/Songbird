import { describe, test, expect } from "vitest";
import {
  createUser,
  createChat,
  addChatMember,
  createMessage,
  markMessageRead,
  markMessagesRead,
  getMessages,
  listChatsForUser,
} from "../../db.js";

describe("Saved messages seen status persistence", () => {
  test("markMessageRead marks message as read in a saved chat where sender is reader", async () => {
    const userId = createUser(
      "user_saved_" + Date.now(),
      "hash",
      "Saved User",
      null,
      "#10b981",
    );
    const chatId = createChat("Saved messages", "saved", {
      createdByUserId: userId,
    });
    addChatMember(chatId, userId, "owner");

    const messageId = createMessage(chatId, userId, "My saved note");

    // Before markMessageRead, check message
    const msgsBefore = getMessages(chatId);
    const listBefore = (
      msgsBefore && typeof msgsBefore.then === "function"
        ? await msgsBefore
        : msgsBefore
    ).messages;
    const msgBefore = listBefore.find((m) => m.id === messageId);
    expect(msgBefore).toBeDefined();

    // Call markMessageRead as reader == sender
    const readRes = markMessageRead(messageId, userId);
    if (readRes && typeof readRes.then === "function") await readRes;

    // Verify getMessages returns read_at and read_by_user_id
    const msgsAfter = getMessages(chatId);
    const listAfter = (
      msgsAfter && typeof msgsAfter.then === "function"
        ? await msgsAfter
        : msgsAfter
    ).messages;
    const msgAfter = listAfter.find((m) => m.id === messageId);
    expect(msgAfter).toBeDefined();
    expect(msgAfter.read_at).toBeTruthy();
    expect(msgAfter.read_by_user_id).toBe(userId);

    // Verify listChatsForUser returns last_message_read_at
    const chatsRes = listChatsForUser(userId);
    const chats =
      chatsRes && typeof chatsRes.then === "function"
        ? await chatsRes
        : chatsRes;
    const savedChat = chats.find((c) => c.id === chatId);
    expect(savedChat).toBeDefined();
    expect(savedChat.last_message_read_at).toBeTruthy();
    expect(savedChat.last_message_read_by_user_id).toBe(userId);
  });

  test("markMessagesRead marks all messages as read in saved chat", async () => {
    const userId = createUser(
      "user_saved_all_" + Date.now(),
      "hash",
      "Saved User All",
      null,
      "#10b981",
    );
    const chatId = createChat("Saved messages", "saved", {
      createdByUserId: userId,
    });
    addChatMember(chatId, userId, "owner");

    const msgId1 = createMessage(chatId, userId, "Note 1");
    const msgId2 = createMessage(chatId, userId, "Note 2");

    const markRes = markMessagesRead(chatId, userId);
    if (markRes && typeof markRes.then === "function") await markRes;

    const msgs = getMessages(chatId);
    const list = (msgs && typeof msgs.then === "function" ? await msgs : msgs)
      .messages;
    const m1 = list.find((m) => m.id === msgId1);
    const m2 = list.find((m) => m.id === msgId2);

    expect(m1.read_at).toBeTruthy();
    expect(m2.read_at).toBeTruthy();
  });
});

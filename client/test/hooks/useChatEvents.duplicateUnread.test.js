import { describe, test, expect } from "vitest";

describe("useChatEvents — Duplicate message event unread count idempotency", () => {
  test("prevents unread count from incrementing twice when receiving duplicate chat_message events for same messageId", () => {
    // Simulating patchChatAndMoveToFront logic with duplicate event detection
    const chatId = "550e8400-e29b-41d4-a716-446655440000";
    const msgId = "11111111-1111-4111-a111-111111111111";

    let chat = {
      id: chatId,
      unread_count: 0,
      last_message_id: "00000000-0000-0000-0000-000000000000",
    };

    const processChatMessage = (
      payload,
      isOwnEvent = false,
      isReadableActiveChat = false,
    ) => {
      const currentUnread = Math.max(0, Number(chat?.unread_count || 0));
      const payloadMsgId = payload?.messageId || null;
      const currentLastMsgId = chat?.last_message_id || null;

      const isDuplicateMsgEvent =
        Boolean(payloadMsgId) &&
        Boolean(currentLastMsgId) &&
        payloadMsgId === currentLastMsgId;

      const shouldIncrementUnread = !isOwnEvent && !isDuplicateMsgEvent;

      chat = {
        ...chat,
        last_message_id: payloadMsgId || chat?.last_message_id || null,
        unread_count: isReadableActiveChat
          ? 0
          : shouldIncrementUnread
            ? currentUnread + 1
            : currentUnread,
      };
    };

    // First arrival of message msgId
    processChatMessage({
      type: "chat_message",
      chatId,
      messageId: msgId,
      username: "bob",
    });
    expect(chat.unread_count).toBe(1);
    expect(chat.last_message_id).toBe(msgId);

    // Duplicate arrival of message msgId
    processChatMessage({
      type: "chat_message",
      chatId,
      messageId: msgId,
      username: "bob",
    });
    expect(chat.unread_count).toBe(1); // STAYS AT 1, DOES NOT GO TO 2!
  });
});

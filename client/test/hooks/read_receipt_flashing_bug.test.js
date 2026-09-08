import { describe, expect, test } from "vitest";
import { normalizeUuid } from "../../src/utils/uuidUtils.js";

// Helper replicating the state patching logic in updateOwnLatestChatPreview and useChatEvents
function patchChatPreview(chat, { messageId }) {
  const payloadMsgId = normalizeUuid(messageId);

  const nextReadAt = chat?.last_message_read_at || null;

  return {
    ...chat,
    last_message_id: payloadMsgId || chat?.last_message_id || null,
    last_message_read_at: nextReadAt,
  };
}

describe("Bug 2 Reproduction: Read Receipt Flashing on Chat Send/Receive", () => {
  test("FAILING TEST: updateOwnLatestChatPreview / chat_message overwrites a valid last_message_read_at back to null when HTTP response / SSE echo completes after chat_read arrived", () => {
    // 1. Initial chat state
    let chat = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      last_message_id: "msg-11111111-1111-4111-8111-111111111111",
      last_message_read_at: null,
    };

    // 2. User A sends new message 'msg-2'
    // Optimistic update before HTTP response (messageId is not known yet or is null):
    chat = patchChatPreview(chat, { messageId: null, isOwnEvent: true });
    expect(chat.last_message_read_at).toBeNull(); // Single checkmark (sent/unread)

    // 3. User B (active in chat) receives message and sends markMessagesRead.
    // Server emits chat_read SSE, which User A receives BEFORE HTTP POST /api/messages response finishes.
    const nowIso = new Date().toISOString();
    chat = {
      ...chat,
      last_message_read_at: nowIso, // User A's UI now shows double checkmark!
    };
    expect(chat.last_message_read_at).toBe(nowIso);

    // 4. HTTP POST /api/messages finishes or own chat_message SSE echo arrives with messageId = 'msg-2'.
    // updateOwnLatestChatPreview runs with messageId = 'msg-2'.
    chat = patchChatPreview(chat, {
      messageId: "msg-22222222-2222-4222-8222-222222222222",
      isOwnEvent: true,
    });

    // BUG VERIFICATION:
    // last_message_read_at should remain non-null (nowIso) because User B ALREADY read the message!
    // But under the current implementation, because payloadMsgId ('msg-2') !== currentLastMsgId ('msg-1'),
    // nextReadAt evaluates to null, wiping out nowIso!
    expect(chat.last_message_read_at).toBe(nowIso);
  });
});

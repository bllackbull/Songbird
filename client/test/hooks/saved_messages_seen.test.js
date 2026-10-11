import { describe, expect, test } from "vitest";

// Helper replicating the state patching logic in updateOwnLatestChatPreview and useChatEvents
function patchChatPreviewOnSend(chat, { createdAt, body, files }) {
  const isSaved = chat?.type === "saved";
  const previewTime = createdAt || new Date().toISOString();
  return {
    ...chat,
    last_message: body || chat?.last_message || "",
    last_message_files: files || [],
    last_time: previewTime,
    last_message_read_at: isSaved
      ? previewTime
      : chat?.last_message_read_at || null,
  };
}

function patchChatOnSseEvent(chat, payload, { isOwnEvent, eventTime }) {
  const isSaved = chat?.type === "saved" || payload?.chatType === "saved";
  return {
    ...chat,
    last_message_id: payload?.messageId || chat?.last_message_id || null,
    last_message: payload?.body || chat?.last_message || "",
    last_time: eventTime,
    last_message_read_at: isSaved
      ? payload?.read_at || eventTime
      : isOwnEvent
        ? null
        : chat?.last_message_read_at || null,
  };
}

describe("Saved messages seen state in client chat list and preview", () => {
  test("patchChatPreviewOnSend marks saved chat last_message_read_at immediately on send", () => {
    const savedChat = {
      id: "chat-saved-1",
      name: "Saved messages",
      type: "saved",
      last_message_id: null,
      last_message_read_at: null,
    };
    const nowIso = "2026-09-07T12:00:00.000Z";

    const updated = patchChatPreviewOnSend(savedChat, {
      createdAt: nowIso,
      body: "Saved note",
      files: [],
    });

    expect(updated.last_message_read_at).toBe(nowIso);
  });

  test("patchChatOnSseEvent does NOT overwrite saved chat last_message_read_at to null on own event echo", () => {
    const nowIso = "2026-09-07T12:00:00.000Z";
    const savedChat = {
      id: "chat-saved-1",
      name: "Saved messages",
      type: "saved",
      last_message_id: "msg-temp-1",
      last_message_read_at: nowIso,
    };

    const echoPayload = {
      type: "chat_message",
      chatId: "chat-saved-1",
      messageId: "msg-real-1",
      username: "alice",
      body: "Saved note",
      read_at: nowIso,
    };

    const updated = patchChatOnSseEvent(savedChat, echoPayload, {
      isOwnEvent: true,
      eventTime: nowIso,
    });

    expect(updated.last_message_read_at).toBe(nowIso);
  });

  test("regular chat own event still sets last_message_read_at to null (unread by recipient)", () => {
    const regularChat = {
      id: "chat-dm-1",
      name: "Bob",
      type: "dm",
      last_message_id: "msg-1",
      last_message_read_at: "2026-09-07T11:00:00.000Z",
    };
    const nowIso = "2026-09-07T12:00:00.000Z";

    const echoPayload = {
      type: "chat_message",
      chatId: "chat-dm-1",
      messageId: "msg-2",
      username: "alice",
      body: "Hey Bob",
    };

    const updated = patchChatOnSseEvent(regularChat, echoPayload, {
      isOwnEvent: true,
      eventTime: nowIso,
    });

    expect(updated.last_message_read_at).toBeNull();
  });
});

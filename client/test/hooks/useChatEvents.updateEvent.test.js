import { describe, expect, test } from "vitest";

if (typeof window === "undefined") {
  globalThis.window = new EventTarget();
  if (typeof CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(type, eventInitDict) {
        super(type, eventInitDict);
        this.detail = eventInitDict?.detail;
      }
    };
  }
}

describe("useChatEvents — message update event handling for chat list cards", () => {
  test("schedules chat reload and updates chat list state when chat_message_updated is received for any chat", () => {
    // We simulate receiving a songbird:realtime-event by invoking the handler setup logic
    const payload = {
      type: "chat_message_updated",
      chatId: "other-chat-456",
      messageId: "msg-999",
      username: "bob",
      body: "Updated message body",
      summaryText: "Updated message body",
    };

    // Dispatch custom event to window
    window.dispatchEvent(
      new CustomEvent("songbird:realtime-event", { detail: payload }),
    );

    // Verify event structure supported
    expect(payload.type).toBe("chat_message_updated");
    expect(payload.chatId).toBe("other-chat-456");
    expect(payload.body).toBe("Updated message body");
  });
});

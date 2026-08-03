import { describe, test, expect, vi } from "vitest";
import { createMessagePublicationService } from "../../../lib/services/messagePublicationService.js";

describe("messagePublicationService", () => {
  const createMockDb = () => {
    return {
      findChatById: vi.fn((id) =>
        id === 1
          ? { id: 1, type: "group", name: "General" }
          : id === 2
            ? { id: 2, type: "saved" }
            : null,
      ),
      createOrReuseMessage: vi.fn((chatId, userId, body) => ({
        id: 100,
        deduped: false,
      })),
      createMessageFiles: vi.fn(),
      editMessage: vi.fn(),
      findMessageById: vi.fn(),
      listChatMembers: vi.fn(() => [
        { id: 10, username: "alice" },
        { id: 20, username: "bob" },
      ]),
      listMutedUserIdsForChat: vi.fn(() => []),
      markMessageRead: vi.fn(),
      setMessageExpiresAt: vi.fn(),
      setMessageForwardOrigin: vi.fn(),
      findUserById: vi.fn(),
    };
  };

  test("publishTextMessage creates message and returns sse events and push recipients", () => {
    const db = createMockDb();
    const service = createMessagePublicationService(db);

    const res = service.publishTextMessage({
      chatId: 1,
      userId: 10,
      body: "Hello World",
      username: "alice",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBe(100);
    expect(res.deduped).toBe(false);
    expect(db.createOrReuseMessage).toHaveBeenCalledWith(
      1,
      10,
      "Hello World",
      null,
      null,
      null,
    );
    expect(res.sseEvents.length).toBe(1);
    expect(res.pushRecipients).toContain(20);
  });

  test("publishTextMessage marks as read for saved chat", () => {
    const db = createMockDb();
    const service = createMessagePublicationService(db);

    service.publishTextMessage({
      chatId: 2,
      userId: 10,
      body: "Note to self",
      username: "alice",
    });

    expect(db.markMessageRead).toHaveBeenCalledWith(100, 10);
  });

  test("publishUploadMessage creates message and attaches files", () => {
    const db = createMockDb();
    const service = createMessagePublicationService(db);

    const res = service.publishUploadMessage({
      chatId: 1,
      userId: 10,
      fallbackBody: "Sent a photo",
      normalizedFiles: [{ kind: "media", storedName: "abc.jpg" }],
      username: "alice",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBe(100);
    expect(db.createMessageFiles).toHaveBeenCalledWith(100, [
      { kind: "media", storedName: "abc.jpg" },
    ]);
  });

  test("editTextMessage updates body and returns chat_message_updated sse event", () => {
    const db = createMockDb();
    const service = createMessagePublicationService(db);

    const res = service.editTextMessage({
      messageId: 100,
      chatId: 1,
      body: "Edited content",
      username: "alice",
    });

    expect(res.success).toBe(true);
    expect(db.editMessage).toHaveBeenCalledWith(100, "Edited content");
    expect(res.sseEvents[0].payload.type).toBe("chat_message_updated");
  });
});

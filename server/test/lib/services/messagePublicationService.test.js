import { describe, test, expect, vi } from "vitest";
import { createMessagePublicationService } from "../../../lib/services/messagePublicationService.js";

const CHAT_ID_1 = "11111111-1111-4111-a111-111111111111";
const CHAT_ID_2 = "22222222-2222-4222-a222-222222222222";
const MSG_ID_100 = "10000000-0000-4000-8000-000000000100";
const ALICE_ID = "10101010-1010-4010-a010-101010101010";
const BOB_ID = "20202020-2020-4020-a020-202020202020";

describe("messagePublicationService", () => {
  const createMockDb = () => {
    return {
      findChatById: vi.fn((id) =>
        id === CHAT_ID_1
          ? { id: CHAT_ID_1, type: "group", name: "General" }
          : id === CHAT_ID_2
            ? { id: CHAT_ID_2, type: "saved" }
            : null,
      ),
      createOrReuseMessage: vi.fn((chatId, userId, body) => ({
        id: MSG_ID_100,
        deduped: false,
      })),
      createMessageFiles: vi.fn(),
      editMessage: vi.fn(),
      findMessageById: vi.fn(),
      listChatMembers: vi.fn(() => [
        { id: ALICE_ID, username: "alice" },
        { id: BOB_ID, username: "bob" },
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
      chatId: CHAT_ID_1,
      userId: ALICE_ID,
      body: "Hello World",
      username: "alice",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBe(MSG_ID_100);
    expect(res.deduped).toBe(false);
    expect(db.createOrReuseMessage).toHaveBeenCalledWith(
      CHAT_ID_1,
      ALICE_ID,
      "Hello World",
      null,
      null,
      null,
    );
    expect(res.sseEvents.length).toBe(1);
    expect(res.pushRecipients).toContain(BOB_ID);
  });

  test("publishTextMessage marks as read for saved chat", () => {
    const db = createMockDb();
    const service = createMessagePublicationService(db);

    service.publishTextMessage({
      chatId: CHAT_ID_2,
      userId: ALICE_ID,
      body: "Note to self",
      username: "alice",
    });

    expect(db.markMessageRead).toHaveBeenCalledWith(MSG_ID_100, ALICE_ID);
  });

  test("publishUploadMessage creates message and attaches files", () => {
    const db = createMockDb();
    const service = createMessagePublicationService(db);

    const res = service.publishUploadMessage({
      chatId: CHAT_ID_1,
      userId: ALICE_ID,
      fallbackBody: "Sent a photo",
      normalizedFiles: [{ kind: "media", storedName: "abc.jpg" }],
      username: "alice",
    });

    expect(res.success).toBe(true);
    expect(res.messageId).toBe(MSG_ID_100);
    expect(db.createMessageFiles).toHaveBeenCalledWith(MSG_ID_100, [
      { kind: "media", storedName: "abc.jpg" },
    ]);
  });

  test("editTextMessage updates body and returns chat_message_updated sse event", () => {
    const db = createMockDb();
    const service = createMessagePublicationService(db);

    const res = service.editTextMessage({
      messageId: MSG_ID_100,
      chatId: CHAT_ID_1,
      body: "Edited content",
      username: "alice",
    });

    expect(res.success).toBe(true);
    expect(db.editMessage).toHaveBeenCalledWith(MSG_ID_100, "Edited content");
    expect(res.sseEvents[0].payload.type).toBe("chat_message_updated");
  });
});

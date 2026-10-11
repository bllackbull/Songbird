import { describe, test, expect } from "vitest";
import {
  getMessages,
  createMessage,
  createChat,
  createUser,
} from "../../db.js";

describe("SQLite afterCreatedAt string comparison regression", () => {
  test("getMessages with afterId and ISO afterCreatedAt ('T') returns newer messages in SQLite mode", async () => {
    const userId = createUser(
      "user_ts_" + Date.now(),
      "hash",
      "Nick",
      null,
      "#10b981",
    );
    const chatId = createChat("TS Test Chat", "dm");

    // Create first message
    const msg1Id = createMessage(chatId, userId, "First message");

    // Small delay to ensure timestamp separation
    await new Promise((r) => setTimeout(r, 1100));

    // Create second message
    const msg2Id = createMessage(chatId, userId, "Second message");

    // Fetch messages to get msg1's created_at
    const resAll = getMessages(chatId);
    const msgs = (
      resAll && typeof resAll.then === "function" ? await resAll : resAll
    ).messages;
    expect(msgs.length).toBe(2);

    const msg1 = msgs.find((m) => m.id === msg1Id);
    const msg2 = msgs.find((m) => m.id === msg2Id);
    expect(msg1).toBeDefined();
    expect(msg2).toBeDefined();

    // Client passes ISO format with 'T' (e.g. "2026-08-13T01:25:00.000Z" or new Date(msg1.created_at).toISOString())
    const isoCreatedAt = new Date(msg1.created_at).toISOString();

    // Query messages after msg1 using ISO timestamp
    const resAfter = getMessages(chatId, {
      afterId: msg1.id,
      afterCreatedAt: isoCreatedAt,
      tailDelta: true,
    });
    const afterMsgs = (
      resAfter && typeof resAfter.then === "function"
        ? await resAfter
        : resAfter
    ).messages;

    // msg2 MUST be returned!
    const foundMsg2 = afterMsgs.some((m) => m.id === msg2Id);
    expect(foundMsg2).toBe(true);
  });
});

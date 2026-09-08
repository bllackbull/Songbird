import { describe, test, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";
import { isValidUuid } from "../../lib/uuidUtils.js";

async function loginCookie(app, username = "alice", password = "secret123") {
  const res = await request(app)
    .post("/api/login")
    .send({ username, password });
  return res.headers["set-cookie"];
}

describe("UUID API Integration Tests", () => {
  const aliceId = "11111111-1111-4111-a111-111111111111";
  const bobId = "22222222-2222-4222-a222-222222222222";
  const chatId = "33333333-3333-4333-a333-333333333333";
  const msgId = "44444444-4444-4444-a444-444444444444";
  const missingUuid = "00000000-0000-4000-8000-000000000000";

  function createTestApp() {
    const userStore = makeUserStore([
      {
        id: aliceId,
        username: "alice",
        password_hash: bcrypt.hashSync("secret123", 4),
        nickname: "Alice",
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
      {
        id: bobId,
        username: "bob",
        password_hash: bcrypt.hashSync("secret123", 4),
        nickname: "Bob",
        avatar_url: null,
        color: "#3b82f6",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);

    const chatRow = {
      id: chatId,
      name: "Alice & Bob DM",
      type: "dm",
      group_username: null,
      created_by_user_id: aliceId,
      created_at: new Date().toISOString(),
    };

    const msgRow = {
      id: msgId,
      chat_id: chatId,
      user_id: aliceId,
      body: "Hello Bob",
      reply_to_message_id: null,
      created_at: new Date().toISOString(),
    };

    return makeApp({
      userStore,
      deps: {
        findChatById: (id) => (id === chatId ? chatRow : null),
        findDmChat: (u1, u2) =>
          (u1 === aliceId && u2 === bobId) || (u1 === bobId && u2 === aliceId)
            ? chatRow
            : null,
        isMember: (cId, uId) => cId === chatId && (uId === aliceId || uId === bobId),
        findMessageById: (id) => (id === msgId ? msgRow : null),
        getMessages: (cId) =>
          cId === chatId
            ? { messages: [msgRow], hasMore: false }
            : { messages: [], hasMore: false },
        getMessageReadByUser: () => [],
        hydrateMissingVideoMetadata: async (files) => files,
        isVideoFileProcessing: () => false,
        createChat: () => chatId,
        createMessage: () => msgId,
        listChatsForUser: () => [chatRow],
        listChatMembers: (cId) =>
          cId === chatId
            ? [
                { id: aliceId, user_id: aliceId, chat_id: chatId, role: "member" },
                { id: bobId, user_id: bobId, chat_id: chatId, role: "member" },
              ]
            : [],
        listChatMembersForChats: () =>
          new Map([
            [
              chatId,
              [
                { id: aliceId, user_id: aliceId, username: "alice", role: "member" },
                { id: bobId, user_id: bobId, username: "bob", role: "member" },
              ],
            ],
          ]),
      },
    });
  }

  describe("Validation & Rejection of Invalid UUIDs (HTTP 400)", () => {
    test("rejects invalid UUID in route parameter with 400", async () => {
      const { app } = createTestApp();
      const cookie = await loginCookie(app);

      const res = await request(app)
        .get("/api/chats/not-a-valid-uuid/preview?username=alice")
        .set("Cookie", cookie);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/is not a valid UUID/i);
    });

    test("rejects invalid UUID in body parameter with 400", async () => {
      const { app } = createTestApp();
      const cookie = await loginCookie(app);

      const res = await request(app)
        .post("/api/messages/read")
        .set("Cookie", cookie)
        .send({ chatId: "invalid-chat-uuid" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/is not a valid UUID/i);
    });

    test("rejects invalid replyToMessageId UUID in request body with 400", async () => {
      const { app } = createTestApp();
      const cookie = await loginCookie(app);

      const res = await request(app)
        .post("/api/messages")
        .set("Cookie", cookie)
        .send({ chatId, replyToMessageId: "invalid-msg-uuid", body: "test" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/is not a valid UUID/i);
    });
  });

  describe("Non-existent Valid UUIDs (HTTP 404)", () => {
    test("returns 404 for valid UUID chat preview that does not exist", async () => {
      const { app } = createTestApp();
      const cookie = await loginCookie(app);

      const res = await request(app)
        .get(`/api/chats/${missingUuid}/preview?username=alice`)
        .set("Cookie", cookie);

      expect(res.status).toBe(404);
    });

    test("returns 403 when querying messages for valid UUID chat that user is not member of", async () => {
      const { app } = createTestApp();
      const cookie = await loginCookie(app);

      const res = await request(app)
        .get(`/api/messages?chatId=${missingUuid}&username=alice`)
        .set("Cookie", cookie);

      expect(res.status).toBe(403);
    });
  });

  describe("UUID Format in API Responses & FK Fields", () => {
    test("returns valid UUID for user id on /api/me", async () => {
      const { app } = createTestApp();
      const cookie = await loginCookie(app);

      const res = await request(app).get("/api/me").set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(isValidUuid(res.body.id)).toBe(true);
      expect(res.body.id).toBe(aliceId);
    });

    test("returns valid UUID for chat id and FK created_by_user_id in chat list", async () => {
      const { app } = createTestApp();
      const cookie = await loginCookie(app);

      const res = await request(app)
        .get("/api/chats?username=alice")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.chats)).toBe(true);
      expect(res.body.chats.length).toBeGreaterThan(0);
      const chat = res.body.chats[0];
      expect(isValidUuid(chat.id)).toBe(true);
      if (chat.created_by_user_id) {
        expect(isValidUuid(chat.created_by_user_id)).toBe(true);
      }
    });

    test("returns valid UUIDs for message id and FK fields (chat_id, user_id)", async () => {
      const { app } = createTestApp();
      const cookie = await loginCookie(app);

      const res = await request(app)
        .get(`/api/messages?chatId=${chatId}&username=alice`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
      expect(res.body.messages.length).toBeGreaterThan(0);

      for (const msg of res.body.messages) {
        expect(isValidUuid(msg.id)).toBe(true);
        expect(isValidUuid(msg.chat_id)).toBe(true);
        expect(isValidUuid(msg.user_id)).toBe(true);
        if (msg.reply_to_message_id) {
          expect(isValidUuid(msg.reply_to_message_id)).toBe(true);
        }
      }
    });
  });
});
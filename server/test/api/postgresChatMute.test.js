import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

async function loginCookie(app, username = "alice") {
  const res = await request(app)
    .post("/api/login")
    .send({ username, password: "secret123" });
  return res.headers["set-cookie"];
}

describe("PostgreSQL Promise mode - Chat Mute, Unmute, and Hide endpoints", () => {
  const alice = {
    id: "11111111-1111-4111-8111-111111111111",
    username: "alice",
    password_hash: bcrypt.hashSync("secret123", 4),
    nickname: "Alice",
    avatar_url: null,
    color: "#10b981",
    status: "online",
    role: "user",
    banned: false,
  };

  const testChat = {
    id: "22222222-2222-4222-8222-222222222222",
    type: "group",
    name: "Test Group",
    group_username: "test_group",
    group_visibility: "public",
  };

  test("PUT /api/chats/:chatId/mute passes resolved userId when muting and unmuting in async DB mode", async () => {
    let capturedMuteCalls = [];

    const userStore = makeUserStore([alice]);
    const { app } = makeApp({
      userStore,
      deps: {
        findUserByUsername: (u) =>
          Promise.resolve(u.toLowerCase() === "alice" ? alice : null),
        findChatById: (cid) =>
          Promise.resolve(cid === testChat.id ? testChat : null),
        isMember: (cid, uid) =>
          Promise.resolve(cid === testChat.id && uid === alice.id),
        setChatMuted: (userId, chatId, muted) => {
          capturedMuteCalls.push({ userId, chatId, muted });
          if (!userId) {
            return Promise.reject(
              new Error(
                'null value in column "user_id" violates not-null constraint',
              ),
            );
          }
          return Promise.resolve();
        },
      },
    });

    const cookie = await loginCookie(app, "alice");

    // 1. Mute chat
    const muteRes = await request(app)
      .put(`/api/chats/${testChat.id}/mute`)
      .set("Cookie", cookie)
      .send({ username: "alice", muted: true });

    expect(muteRes.status).toBe(200);
    expect(muteRes.body).toEqual({
      ok: true,
      chatId: testChat.id,
      muted: true,
    });
    expect(capturedMuteCalls.length).toBe(1);
    expect(capturedMuteCalls[0].userId).toBe(alice.id);
    expect(capturedMuteCalls[0].chatId).toBe(testChat.id);
    expect(capturedMuteCalls[0].muted).toBe(true);

    // 2. Unmute chat
    const unmuteRes = await request(app)
      .put(`/api/chats/${testChat.id}/mute`)
      .set("Cookie", cookie)
      .send({ username: "alice", muted: false });

    expect(unmuteRes.status).toBe(200);
    expect(unmuteRes.body).toEqual({
      ok: true,
      chatId: testChat.id,
      muted: false,
    });
    expect(capturedMuteCalls.length).toBe(2);
    expect(capturedMuteCalls[1].userId).toBe(alice.id);
    expect(capturedMuteCalls[1].chatId).toBe(testChat.id);
    expect(capturedMuteCalls[1].muted).toBe(false);
  });

  test("POST /api/chats/hide passes resolved userId in async DB mode", async () => {
    let capturedHide = null;

    const userStore = makeUserStore([alice]);
    const { app } = makeApp({
      userStore,
      deps: {
        findUserByUsername: (u) =>
          Promise.resolve(u.toLowerCase() === "alice" ? alice : null),
        hideChatsForUser: (userId, chatIds) => {
          capturedHide = { userId, chatIds };
          return Promise.resolve();
        },
      },
    });

    const cookie = await loginCookie(app, "alice");

    const res = await request(app)
      .post("/api/chats/hide")
      .set("Cookie", cookie)
      .send({ username: "alice", chatIds: [testChat.id] });

    expect(res.status).toBe(200);
    expect(capturedHide).toEqual({
      userId: alice.id,
      chatIds: [testChat.id],
    });
  });

  test("DELETE /api/chats/group/:chatId/avatar resolves chat, user, and members in async DB mode", async () => {
    let updateCalled = false;
    const userStore = makeUserStore([alice]);
    const { app } = makeApp({
      userStore,
      deps: {
        findUserByUsername: (u) =>
          Promise.resolve(u.toLowerCase() === "alice" ? alice : null),
        findChatById: (cid) =>
          Promise.resolve(
            cid === testChat.id
              ? {
                  ...testChat,
                  group_avatar_url: "/api/uploads/avatars/old.png",
                }
              : null,
          ),
        listChatMembers: (cid) =>
          Promise.resolve(
            cid === testChat.id ? [{ ...alice, role: "owner" }] : [],
          ),
        updateGroupChat: () => {
          updateCalled = true;
          return Promise.resolve();
        },
      },
    });

    const cookie = await loginCookie(app, "alice");

    const res = await request(app)
      .delete(`/api/chats/group/${testChat.id}/avatar`)
      .set("Cookie", cookie)
      .send({ username: "alice" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, avatarUrl: null });
    expect(updateCalled).toBe(true);
  });

  test("POST /api/mentions/resolve resolves user and chat in async DB mode", async () => {
    const userStore = makeUserStore([alice]);
    const { app } = makeApp({
      userStore,
      deps: {
        findUserByUsername: (u) =>
          Promise.resolve(u.toLowerCase() === "alice" ? alice : null),
        findChatByGroupUsername: (u) =>
          Promise.resolve(u.toLowerCase() === "test_group" ? testChat : null),
        isMember: (cid, uid) =>
          Promise.resolve(cid === testChat.id && uid === alice.id),
        listChatMembers: (cid) =>
          Promise.resolve(
            cid === testChat.id ? [{ ...alice, role: "owner" }] : [],
          ),
      },
    });

    const cookie = await loginCookie(app, "alice");

    const res = await request(app)
      .post("/api/mentions/resolve")
      .set("Cookie", cookie)
      .send({ username: "alice", mentions: ["@alice", "@test_group"] });

    expect(res.status).toBe(200);
    expect(res.body.mentions.length).toBe(2);
    expect(res.body.mentions[0].username).toBe("alice");
    expect(res.body.mentions[1].username).toBe("test_group");
  });

  test("GET /api/channels/:username/meta resolves channel chat in async DB mode", async () => {
    const channelChat = {
      id: "33333333-3333-4333-8333-333333333333",
      type: "channel",
      name: "Test Channel",
      group_username: "test_channel",
      group_visibility: "public",
      group_color: "#3b82f6",
    };

    const userStore = makeUserStore([alice]);
    const { app } = makeApp({
      userStore,
      deps: {
        findChatByGroupUsername: (u) =>
          Promise.resolve(
            u.toLowerCase() === "test_channel" ? channelChat : null,
          ),
      },
    });

    const cookie = await loginCookie(app, "alice");

    const res = await request(app)
      .get("/api/channels/test_channel/meta")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("test_channel");
    expect(res.body.name).toBe("Test Channel");
  });

  test("POST /api/messages and /api/messages/upload allow reply and edit when findMessageById returns a Promise", async () => {
    const originalMessage = {
      id: "44444444-4444-4444-8444-444444444444",
      chat_id: testChat.id,
      user_id: alice.id,
      body: "Original text",
    };

    const userStore = makeUserStore([alice]);
    const { app } = makeApp({
      userStore,
      deps: {
        findChatById: (cid) =>
          Promise.resolve(cid === testChat.id ? testChat : null),
        isMember: (cid, uid) =>
          Promise.resolve(cid === testChat.id && uid === alice.id),
        findMessageById: (mid) =>
          Promise.resolve(mid === originalMessage.id ? originalMessage : null),
        createMessage: () =>
          Promise.resolve("55555555-5555-4555-8555-555555555555"),
        editMessage: () => Promise.resolve(originalMessage.id),
      },
    });

    const cookie = await loginCookie(app, "alice");

    // 1. Reply to message via /api/messages
    const replyRes = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({
        chatId: testChat.id,
        username: "alice",
        body: "Replying to message",
        replyToMessageId: originalMessage.id,
      });

    expect(replyRes.status).toBe(200);

    // 2. Edit message via /api/messages/edit
    const editRes = await request(app)
      .post("/api/messages/edit")
      .set("Cookie", cookie)
      .send({
        chatId: testChat.id,
        username: "alice",
        body: "Edited text",
        messageId: originalMessage.id,
      });

    expect(editRes.status).toBe(200);

    // 3. Upload with reply target via /api/messages/upload
    const uploadReplyRes = await request(app)
      .post("/api/messages/upload")
      .set("Cookie", cookie)
      .send({
        chatId: testChat.id,
        username: "alice",
        body: "File with reply",
        replyToMessageId: originalMessage.id,
        storageKeys: ["uploads/doc123.pdf"],
        fileMeta: JSON.stringify([
          {
            originalName: "doc123.pdf",
            mimeType: "application/pdf",
            sizeBytes: 2048,
          },
        ]),
      });

    expect(uploadReplyRes.status).toBe(200);
  });
});

import { describe, test, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import {
  makeApp,
  makeUserStore,
} from "../helpers/makeApp.js";

// ─── Shared setup helpers ─────────────────────────────────────────────────────

function makeAppWithUser(username = "alice", password = "secret123") {
  const hash = bcrypt.hashSync(password, 4);
  const userStore = makeUserStore([
    {
      id: 1,
      username,
      password_hash: hash,
      nickname: "Alice",
      avatar_url: null,
      color: "#10b981",
      status: "online",
      role: "user",
      banned: false,
    },
  ]);
  return makeApp({ userStore });
}

async function loginAndGetCookie(
  app,
  username = "alice",
  password = "secret123",
) {
  const res = await request(app)
    .post("/api/login")
    .send({ username, password });
  return res.headers["set-cookie"];
}

// ─── POST /api/messages ───────────────────────────────────────────────────────

describe("POST /api/messages", () => {
  test("returns 401 when not authenticated", async () => {
    const { app } = makeAppWithUser();
    const res = await request(app).post("/api/messages").send({
      chatId: 1,
      username: "alice",
      body: "Hello",
    });
    expect(res.status).toBe(401);
  });

  test("returns 400 when chatId is missing", async () => {
    const { app } = makeAppWithUser();
    const cookie = await loginAndGetCookie(app);
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({ username: "alice", body: "Hello" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test("returns 400 when body is missing", async () => {
    const { app } = makeAppWithUser();
    const cookie = await loginAndGetCookie(app);
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice" });
    expect(res.status).toBe(400);
  });

  test('returns 400 when body is "[object Object]"', async () => {
    const { app } = makeAppWithUser();
    const cookie = await loginAndGetCookie(app);
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", body: "[object Object]" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid message body/i);
  });

  test("returns 400 when message exceeds max length", async () => {
    const { app } = makeAppWithUser();
    const cookie = await loginAndGetCookie(app);
    const longBody = "x".repeat(4001);
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", body: longBody });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most/i);
  });

  test("returns 403 when session username does not match", async () => {
    const { app } = makeAppWithUser();
    const cookie = await loginAndGetCookie(app);
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "bob", body: "Hello" });
    expect(res.status).toBe(403);
  });

  test("returns 403 when user is not a member of the chat", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const { app } = makeApp({
      userStore,
      deps: {
        isMember: () => false,
        findChatById: () => ({ id: 1, type: "group", name: "Test" }),
      },
    });
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", body: "Hello" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not a member/i);
  });

  test("returns 403 when non-owner tries to post to a channel", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const { app } = makeApp({
      userStore,
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: 1, type: "channel", name: "My Channel" }),
        getChatMemberRole: () => "member", // not owner
      },
    });
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", body: "Hello" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
  });

  test("returns 200 with message id when everything is valid", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const { app } = makeApp({
      userStore,
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: 1, type: "group", name: "Test" }),
        createOrReuseMessage: () => ({ id: 42, deduped: false }),
        markMessageRead: () => {},
        listChatMembers: () => [],
        listMutedUserIdsForChat: () => [],
        computeExpiryIso: () => null,
      },
    });
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", body: "Hello!" });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
    expect(res.body.deduped).toBe(false);
  });

  test("returns deduped: true when message already exists", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const { app } = makeApp({
      userStore,
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: 1, type: "group", name: "Test" }),
        createOrReuseMessage: () => ({ id: 99, deduped: true }),
        computeExpiryIso: () => null,
      },
    });
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages")
      .set("Cookie", cookie)
      .send({
        chatId: 1,
        username: "alice",
        body: "Hello!",
        clientRequestId: "req-001",
      });
    expect(res.status).toBe(200);
    expect(res.body.deduped).toBe(true);
  });
});

// ─── POST /api/messages/edit ──────────────────────────────────────────────────

describe("POST /api/messages/edit", () => {
  function makeEditApp(messageOverride = {}) {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const message = {
      id: 5,
      chat_id: 1,
      user_id: 1,
      body: "Old body",
      ...messageOverride,
    };
    return makeApp({
      userStore,
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: 1, type: "group", name: "Test" }),
        findMessageById: () => message,
        getChatMemberRole: () => "member",
        editMessage: () => {},
      },
    });
  }

  test("returns 400 when body is empty after trim", async () => {
    const { app } = makeEditApp();
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages/edit")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", messageId: 5, body: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  test("returns 403 when user is not the message author", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    // Message authored by user_id: 99, not alice (id: 1)
    const { app } = makeApp({
      userStore,
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: 1, type: "group", name: "Test" }),
        findMessageById: () => ({
          id: 5,
          chat_id: 1,
          user_id: 99,
          body: "Old",
        }),
        getChatMemberRole: () => "member",
      },
    });
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages/edit")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", messageId: 5, body: "New body" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/author/i);
  });

  test("returns 200 on successful edit", async () => {
    const { app } = makeEditApp();
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages/edit")
      .set("Cookie", cookie)
      .send({
        chatId: 1,
        username: "alice",
        messageId: 5,
        body: "Updated body",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBe(5);
  });
});

// ─── POST /api/messages/delete ────────────────────────────────────────────────

describe("POST /api/messages/delete", () => {
  function makeDeleteApp(messageOverride = {}) {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const message = { id: 7, chat_id: 1, user_id: 1, ...messageOverride };
    return makeApp({
      userStore,
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: 1, type: "group", name: "Test" }),
        findMessageById: () => message,
        getChatMemberRole: () => "member",
        hideMessageForUser: () => {},
        hideMessageForEveryone: () => {},
      },
    });
  }

  test("returns 400 when messageId is missing", async () => {
    const { app } = makeDeleteApp();
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages/delete")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice" });
    expect(res.status).toBe(400);
  });

  test("deletes for self by default (scope: self)", async () => {
    const { app } = makeDeleteApp();
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages/delete")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", messageId: 7 });
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("self");
  });

  test("deletes for everyone when author requests scope: everyone", async () => {
    const { app } = makeDeleteApp();
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages/delete")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", messageId: 7, scope: "everyone" });
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe("everyone");
  });

  test("returns 403 when non-author tries to delete for everyone", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    // Message by a different user
    const { app } = makeApp({
      userStore,
      deps: {
        isMember: () => true,
        findChatById: () => ({ id: 1, type: "group", name: "Test" }),
        findMessageById: () => ({ id: 7, chat_id: 1, user_id: 99 }),
        getChatMemberRole: () => "member",
      },
    });
    const cookie = (
      await request(app)
        .post("/api/login")
        .send({ username: "alice", password: "secret123" })
    ).headers["set-cookie"];
    const res = await request(app)
      .post("/api/messages/delete")
      .set("Cookie", cookie)
      .send({ chatId: 1, username: "alice", messageId: 7, scope: "everyone" });
    expect(res.status).toBe(403);
  });
});

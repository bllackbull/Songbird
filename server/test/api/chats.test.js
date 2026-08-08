import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

async function loginCookie(app) {
  const res = await request(app)
    .post("/api/login")
    .send({ username: "alice", password: "secret123" });
  return res.headers["set-cookie"];
}

describe("GET /api/groups/invite/:token", () => {
  test("includes the verified state of the invited chat", async () => {
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: bcrypt.hashSync("secret123", 4),
        nickname: "Alice",
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
        findChatByInviteToken: (token) =>
          token === "invite-token"
            ? {
                id: 12,
                type: "group",
                name: "Verified Group",
                group_username: "verified_group",
                verified: 1,
              }
            : null,
      },
    });

    const res = await request(app)
      .get("/api/groups/invite/invite-token")
      .set("Cookie", await loginCookie(app));

    expect(res.status).toBe(200);
    expect(res.body.group.verified).toBe(true);
  });

  test("awaits the membership check and preserves false for a non-member", async () => {
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: bcrypt.hashSync("secret123", 4),
        nickname: "Alice",
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
        findChatByInviteToken: async () => ({
          id: 12,
          type: "group",
          name: "Invite Group",
          group_username: "invite_group",
        }),
        isMember: async () => false,
      },
    });

    const res = await request(app)
      .get("/api/groups/invite/invite-token")
      .set("Cookie", await loginCookie(app));

    expect(res.status).toBe(200);
    expect(res.body.alreadyMember).toBe(false);
  });

  test("resolves an async public username fallback when the token lookup is empty", async () => {
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: bcrypt.hashSync("secret123", 4),
        nickname: "Alice",
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
        findChatByInviteToken: async () => null,
        findChatByGroupUsername: async (username) =>
          username === "public_group"
            ? {
                id: 13,
                type: "group",
                name: "Public Group",
                group_username: "public_group",
                group_visibility: "public",
              }
            : null,
        isMember: async () => false,
      },
    });

    const res = await request(app)
      .get("/api/groups/invite/public_group")
      .set("Cookie", await loginCookie(app));

    expect(res.status).toBe(200);
    expect(res.body.group.id).toBe(13);
    expect(res.body.alreadyMember).toBe(false);
  });

  test("resolves async invite lookups and joins a non-member", async () => {
    const userStore = makeUserStore([
      {
        id: 1,
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
        id: 2,
        username: "bob",
        nickname: "Bob",
        avatar_url: null,
        color: "#3b82f6",
      },
    ]);
    const members = [];
    let systemMessageArgs = null;
    const chat = {
      id: 12,
      type: "group",
      name: "Invite Group",
      group_username: "invite_group",
      invite_token: "invite-token",
    };
    const { app } = makeApp({
      userStore,
      deps: {
        findChatByInviteToken: async () => chat,
        isMember: async () => false,
        listChatMembers: () => members,
        addChatMember: (chatId, userId, role) => {
          members.push({ id: userId, username: "alice", role, chat_id: chatId });
        },
        findChatById: () => chat,
        createMessage: (...args) => {
          systemMessageArgs = args;
          return 20;
        },
      },
    });

    const res = await request(app)
      .post("/api/groups/invite/invite-token/join")
      .set("Cookie", await loginCookie(app))
      .send({ username: "alice" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, id: 12, alreadyMember: false });
    expect(members).toHaveLength(1);
    expect(systemMessageArgs?.slice(0, 3)).toEqual([
      12,
      1,
      "[[system:joined:Alice]]",
    ]);
  });
});

describe("GET /api/users effective presence", () => {
  test("marks connected users online and disconnected users offline", async () => {
    const { app, sessionStore } = makeApp({
      userStore: makeUserStore([
        { id: 1, username: "alice", status: "online" },
        { id: 2, username: "bob", status: "online" },
      ]),
      deps: {
        listUsers: () => [
          { id: 1, username: "alice", status: "online", nickname: null, avatar_url: null, color: null, role: "user", verified: 0 },
          { id: 2, username: "bob", status: "online", nickname: null, avatar_url: null, color: null, role: "user", verified: 0 },
        ],
        isConnected: (username) => username === "alice",
      },
    });
    sessionStore.createSession(1, "tok");
    const res = await request(app).get("/api/users").set("Cookie", "sid=tok");
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.users.map((u) => [u.username, u]));
    expect(byName.alice.status).toBe("online");
    expect(byName.bob.status).toBe("offline");
  });
});


describe("PostgreSQL Promise chat membership mutations", () => {
  const users = [
    {
      id: 1,
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
      id: 2,
      username: "bob",
      nickname: "Bob",
      avatar_url: null,
      color: "#3b82f6",
      status: "online",
      role: "user",
      banned: false,
    },
  ];

  const group = {
    id: 12,
    type: "group",
    name: "Async Group",
    group_username: "async_group",
    group_visibility: "public",
    allow_member_invites: 1,
  };

  test("joins a public chat when membership dependencies return Promises", async () => {
    const addChatMember = vi.fn().mockResolvedValue(true);
    const createMessage = vi.fn().mockResolvedValue(20);
    const { app } = makeApp({
      userStore: makeUserStore(users),
      deps: {
        findUserByUsername: async (username) => users.find((user) => user.username === username) || null,
        findChatById: async () => group,
        isGroupMemberRemoved: async () => false,
        isMember: async () => false,
        unhideChat: async () => {},
        clearChatMemberLeft: async () => {},
        addChatMember,
        createMessage,
      },
    });

    const res = await request(app)
      .post("/api/chats/group/12/join-public")
      .set("Cookie", await loginCookie(app))
      .send({ username: "alice" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, id: 12, alreadyMember: false });
    expect(addChatMember).toHaveBeenCalledWith(12, 1, "member");
    expect(createMessage).toHaveBeenCalledWith(
      12,
      1,
      "[[system:joined:Alice]]",
      null,
      null,
      null,
      { allowPlaintextSystemMessage: true },
    );
  });

  test("leaves a chat when membership dependencies return Promises", async () => {
    const removeChatMember = vi.fn().mockResolvedValue(true);
    const createMessage = vi.fn().mockResolvedValue(20);
    const { app } = makeApp({
      userStore: makeUserStore(users),
      deps: {
        findUserByUsername: async (username) => users.find((user) => user.username === username) || null,
        findChatById: async () => group,
        isMember: async () => true,
        listChatMembers: async () => [
          { id: 1, username: "alice", role: "owner" },
          { id: 2, username: "bob", role: "member" },
        ],
        setChatMemberRole: async () => {},
        removeChatMember,
        markChatMemberLeft: async () => {},
        createMessage,
      },
    });

    const res = await request(app)
      .post("/api/chats/group/12/leave")
      .set("Cookie", await loginCookie(app))
      .send({ username: "alice" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(removeChatMember).toHaveBeenCalledWith(12, 1);
    expect(createMessage).toHaveBeenCalledWith(
      12,
      1,
      "[[system:left:Alice]]",
      null,
      null,
      null,
      { allowPlaintextSystemMessage: true },
    );
  });

  test("removes a member when membership dependencies return Promises", async () => {
    const removeChatMember = vi.fn().mockResolvedValue(true);
    const createMessage = vi.fn().mockResolvedValue(20);
    const { app } = makeApp({
      userStore: makeUserStore(users),
      deps: {
        findUserByUsername: async (username) => users.find((user) => user.username === username) || null,
        findChatById: async () => group,
        listChatMembers: async () => [
          { id: 1, username: "alice", role: "owner" },
          { id: 2, username: "bob", role: "member" },
        ],
        removeChatMember,
        markGroupMemberRemoved: async () => {},
        createMessage,
      },
    });

    const res = await request(app)
      .post("/api/chats/group/12/remove-member")
      .set("Cookie", await loginCookie(app))
      .send({ username: "alice", targetUsername: "bob" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(removeChatMember).toHaveBeenCalledWith(12, 2);
    expect(createMessage).toHaveBeenCalledWith(
      12,
      1,
      "[[system:removed:Bob]]",
      null,
      null,
      null,
      { allowPlaintextSystemMessage: true },
    );
  });
});

describe("GET /api/chats/:chatId/preview missing-chat compatibility", () => {
  const alice = {
    id: 1,
    username: "alice",
    password_hash: bcrypt.hashSync("secret123", 4),
    nickname: "Alice",
    avatar_url: null,
    color: "#10b981",
    status: "online",
    role: "user",
    banned: false,
  };

  test("keeps the normal missing-chat response as a 404", async () => {
    const { app } = makeApp({
      userStore: makeUserStore([alice]),
      deps: {
        findChatById: async () => null,
      },
    });

    const res = await request(app)
      .get("/api/chats/999/preview?username=alice")
      .set("Cookie", await loginCookie(app));

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Chat not found." });
  });

  test("returns a successful missing marker for background previews", async () => {
    const { app } = makeApp({
      userStore: makeUserStore([alice]),
      deps: {
        findChatById: async () => null,
      },
    });

    const res = await request(app)
      .get("/api/chats/999/preview?username=alice&allowMissing=1")
      .set("Cookie", await loginCookie(app));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ missing: true });
  });

  test("returns a successful missing marker for a private chat the user cannot access", async () => {
    const { app } = makeApp({
      userStore: makeUserStore([alice]),
      deps: {
        findChatById: async () => ({
          id: 999,
          type: "group",
          group_visibility: "private",
        }),
        isMember: async () => false,
      },
    });

    const res = await request(app)
      .get("/api/chats/999/preview?username=alice&allowMissing=true")
      .set("Cookie", await loginCookie(app));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ missing: true });
  });
});

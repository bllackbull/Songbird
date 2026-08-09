import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

function makeAdminApp(deps = {}) {
  const admin = { id: 1, username: "admin", nickname: "Admin", role: "admin" };
  const sessionStore = makeSessionStore();
  sessionStore.createSession(admin.id, "admin-session");
  return makeApp({
    sessionStore,
    userStore: makeUserStore([
      admin,
      { id: 2, username: "bob", nickname: "Bob", role: "user" },
      { id: 3, username: "carol", nickname: "Carol", role: "user" },
    ]),
    deps: {
      isUserAdmin: (userId) => Number(userId) === admin.id,
      findChatById: () => ({ id: 9, name: "Test Group", type: "group" }),
      ...deps,
    },
  });
}

describe("POST /api/admin/chats/:id/members", () => {
  test("creates and broadcasts a join system message for a newly added group member", async () => {
    const createMessage = vi.fn();
    const emitChatEvent = vi.fn();
    const { app } = makeAdminApp({
      addChatMember: () => 1,
      createMessage,
      emitChatEvent,
    });

    const res = await request(app)
      .post("/api/admin/chats/9/members")
      .set("Cookie", "sid=admin-session")
      .send({ userId: 2 });

    expect(res.status).toBe(200);
    expect(createMessage).toHaveBeenCalledWith(
      9,
      1,
      "[[system:joined:Bob]]",
      null,
      null,
      null,
      { allowPlaintextSystemMessage: true },
    );
    expect(emitChatEvent).toHaveBeenCalledWith(9, {
      type: "chat_message",
      chatId: 9,
      username: "admin",
      body: "[[system:joined:Bob]]",
    });
  });

  test("creates a join system message for every bulk-added group member", async () => {
    const createMessage = vi.fn();
    const emitChatEvent = vi.fn();
    const { app } = makeAdminApp({
      addAllEligibleChatMembers: () => ({
        addedUsers: [
          { id: 2, username: "bob", nickname: "Bob" },
          { id: 3, username: "carol", nickname: "Carol" },
        ],
        skippedLeftCount: 1,
      }),
      createMessage,
      emitChatEvent,
    });

    const res = await request(app)
      .post("/api/admin/chats/9/members")
      .set("Cookie", "sid=admin-session")
      .send({ all: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ addedCount: 2, skippedLeftCount: 1 });
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(emitChatEvent).toHaveBeenCalledWith(9, {
      type: "chat_message",
      chatId: 9,
      username: "admin",
      body: "[[system:joined:Bob]]",
    });
    expect(emitChatEvent).toHaveBeenCalledWith(9, {
      type: "chat_message",
      chatId: 9,
      username: "admin",
      body: "[[system:joined:Carol]]",
    });
  });
});

describe("async PostgreSQL admin dependencies", () => {
  test("/api/admin/chats awaits the async chat list result", async () => {
    const chats = [{ id: 9, name: "Async Group", type: "group" }];
    const { app } = makeAdminApp({
      adminListChats: vi.fn().mockResolvedValue({ chats, total: 1 }),
    });

    const res = await request(app)
      .get("/api/admin/chats")
      .set("Cookie", "sid=admin-session");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ chats, total: 1 });
  });
});

describe("admin presence overlays", () => {
  test("/api/admin/users marks connected online users with online: 1", async () => {
    const { app } = makeAdminApp({
      adminListUsers: () => ({
        users: [{ id: 2, username: "bob", status: "online", role: "user", banned: 0, verified: 0 }],
        total: 1,
      }),
      isConnected: () => true,
    });

    const res = await request(app)
      .get("/api/admin/users")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(res.body.users[0].online).toBe(1);
  });

  test("/api/admin/stats reports live onlineUsers from getOnlineCount", async () => {
    const { app } = makeAdminApp({
      getAdminStats: () => ({ onlineUsers: 0, totalUsers: 1 }),
      getOnlineCount: () => 1,
    });

    const res = await request(app)
      .get("/api/admin/stats")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(res.body.onlineUsers).toBe(1);
  });
});

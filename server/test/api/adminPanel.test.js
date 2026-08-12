import { describe, test, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

const temporaryPaths = [];

afterEach(() => {
  temporaryPaths.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

function makeAdminApp(deps = {}) {
  const admin = { id: "a0000000-0000-4000-8000-000000000001", username: "admin", nickname: "Admin", role: "admin" };
  const sessionStore = makeSessionStore();
  sessionStore.createSession(admin.id, "admin-session");
  return makeApp({
    sessionStore,
    userStore: makeUserStore([
      admin,
      { id: "b0000000-0000-4000-8000-000000000002", username: "bob", nickname: "Bob", role: "user" },
      { id: "c0000000-0000-4000-8000-000000000003", username: "carol", nickname: "Carol", role: "user" },
    ]),
    deps: {
      isUserAdmin: (userId) => userId === admin.id,
      findChatById: () => ({ id: "d0000000-0000-4000-8000-000000000009", name: "Test Group", type: "group" }),
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
      .post("/api/admin/chats/d0000000-0000-4000-8000-000000000009/members")
      .set("Cookie", "sid=admin-session")
      .send({ userId: "b0000000-0000-4000-8000-000000000002" });

    expect(res.status).toBe(200);
    expect(createMessage).toHaveBeenCalledWith(
      "d0000000-0000-4000-8000-000000000009",
      "a0000000-0000-4000-8000-000000000001",
      "[[system:joined:Bob]]",
      null,
      null,
      null,
      { allowPlaintextSystemMessage: true },
    );
    expect(emitChatEvent).toHaveBeenCalledWith("d0000000-0000-4000-8000-000000000009", {
      type: "chat_message",
      chatId: "d0000000-0000-4000-8000-000000000009",
      username: "admin",
      userId: "a0000000-0000-4000-8000-000000000001",
      body: "[[system:joined:Bob]]",
    });
  });

  test("creates a join system message for every bulk-added group member", async () => {
    const createMessage = vi.fn();
    const emitChatEvent = vi.fn();
    const { app } = makeAdminApp({
      addAllEligibleChatMembers: () => ({
        addedUsers: [
          { id: "b0000000-0000-4000-8000-000000000002", username: "bob", nickname: "Bob" },
          { id: "c0000000-0000-4000-8000-000000000003", username: "carol", nickname: "Carol" },
        ],
        skippedLeftCount: 1,
      }),
      createMessage,
      emitChatEvent,
    });

    const res = await request(app)
      .post("/api/admin/chats/d0000000-0000-4000-8000-000000000009/members")
      .set("Cookie", "sid=admin-session")
      .send({ all: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ addedCount: 2, skippedLeftCount: 1 });
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(emitChatEvent).toHaveBeenCalledWith("d0000000-0000-4000-8000-000000000009", {
      type: "chat_message",
      chatId: "d0000000-0000-4000-8000-000000000009",
      username: "admin",
      userId: "a0000000-0000-4000-8000-000000000001",
      body: "[[system:joined:Bob]]",
    });
    expect(emitChatEvent).toHaveBeenCalledWith("d0000000-0000-4000-8000-000000000009", {
      type: "chat_message",
      chatId: "d0000000-0000-4000-8000-000000000009",
      username: "admin",
      userId: "a0000000-0000-4000-8000-000000000001",
      body: "[[system:joined:Carol]]",
    });
  });
});

describe("PostgreSQL maintenance actions", () => {
  test("reports PostgreSQL-specific capabilities", async () => {
    const { app } = makeAdminApp({ dbConfig: { client: "postgres" } });

    const res = await request(app)
      .get("/api/admin/maintenance/info")
      .set("Cookie", "sid=admin-session");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      engine: "postgres",
      backupExtension: ".dump",
      offlineRestoreRequired: true,
      offlineDeleteRequired: true,
    });
  });

  test("uses native PostgreSQL maintenance dependencies for backup, vacuum, and reset", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "songbird-admin-panel-"));
    temporaryPaths.push(directory);
    const backup = vi.fn(async (target) => fs.writeFileSync(target, "archive"));
    const vacuum = vi.fn(async () => {});
    const reset = vi.fn(async () => ({ storedNames: ["message.bin"] }));
    const removeStoredFileNames = vi.fn();
    const { app } = makeAdminApp({
      dbConfig: { client: "postgres" },
      postgresMaintenance: { backup, vacuum },
      adminResetDatabase: reset,
      removeStoredFileNames,
      fs,
      path,
      dataDir: directory,
    });

    const backupRes = await request(app)
      .get("/api/admin/maintenance/download-db")
      .set("Cookie", "sid=admin-session");
    expect(backupRes.status).toBe(200);
    expect(backup).toHaveBeenCalledTimes(1);
    expect(backup.mock.calls[0][0]).toMatch(/\.dump$/);
    expect(fs.existsSync(backup.mock.calls[0][0])).toBe(false);

    const vacuumRes = await request(app)
      .post("/api/admin/maintenance/vacuum")
      .set("Cookie", "sid=admin-session");
    expect(vacuumRes.status).toBe(200);
    expect(vacuum).toHaveBeenCalledTimes(1);

    const resetRes = await request(app)
      .post("/api/admin/maintenance/reset")
      .set("Cookie", "sid=admin-session")
      .send({ confirm: "reset everything" });
    expect(resetRes.status).toBe(200);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(removeStoredFileNames).toHaveBeenCalledWith(["message.bin"]);
  });

  test("awaits clear-messages work before removing files", async () => {
    const clearMessages = vi.fn(async () => ({ storedNames: ["message.bin"] }));
    const removeStoredFileNames = vi.fn();
    const { app } = makeAdminApp({
      dbConfig: { client: "postgres" },
      adminClearAllMessages: clearMessages,
      removeStoredFileNames,
    });

    const res = await request(app)
      .post("/api/admin/maintenance/clear-messages")
      .set("Cookie", "sid=admin-session")
      .send({ confirm: "clear messages" });

    expect(res.status).toBe(200);
    expect(removeStoredFileNames).toHaveBeenCalledWith(["message.bin"]);
  });

  test("keeps destructive PostgreSQL restore and deletion offline-only", async () => {
    const restore = vi.fn(async () => {});
    const dropDatabase = vi.fn(async () => {});
    const { app } = makeAdminApp({
      dbConfig: { client: "postgres" },
      postgresMaintenance: { restore, dropDatabase },
    });

    const restoreRes = await request(app)
      .post("/api/admin/maintenance/restore")
      .set("Cookie", "sid=admin-session")
      .attach("database", Buffer.from("archive"), "songbird.dump");
    expect(restoreRes.status).toBe(409);
    expect(restore).not.toHaveBeenCalled();

    const deleteRes = await request(app)
      .post("/api/admin/maintenance/delete")
      .set("Cookie", "sid=admin-session")
      .send({ confirm: "delete postgres database" });
    expect(deleteRes.status).toBe(409);
    expect(dropDatabase).not.toHaveBeenCalled();
  });
});
describe("async PostgreSQL admin dependencies", () => {
  test("/api/admin/chats awaits the async chat list result", async () => {
    const chats = [{ id: "d0000000-0000-4000-8000-000000000009", name: "Async Group", type: "group" }];
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
        users: [{ id: "b0000000-0000-4000-8000-000000000002", username: "bob", status: "online", role: "user", banned: 0, verified: 0 }],
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

describe("POST /api/admin/users verified status", () => {
  test("creates user with verified=1 when verified: true is passed", async () => {
    const adminRun = vi.fn();
    let calls = 0;
    const adminGetRow = vi.fn().mockImplementation((sql) => {
      const lower = String(sql || "").toLowerCase();
      if (lower.includes("users")) {
        calls += 1;
        if (calls === 1) return null;
        return { id: "u0000000-0000-4000-8000-000000000099", username: "newverified", nickname: "Verified User", color: "#10b981", role: "user", verified: 1 };
      }
      return null;
    });

    const { app } = makeAdminApp({
      adminRun,
      adminGetRow,
    });

    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", "sid=admin-session")
      .send({
        username: "newverified",
        nickname: "Verified User",
        password: "password123",
        verified: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: "newverified", verified: 1 });
    expect(adminRun).toHaveBeenCalledWith(
      expect.stringMatching(/insert into/i),
      expect.arrayContaining([1]),
    );
  });
});

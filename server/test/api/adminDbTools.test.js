import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

const user = {
  id: 7,
  username: "alice",
  nickname: "Alice",
  avatar_url: null,
  color: "#10b981",
  status: "online",
  role: "user",
};

const chat = {
  id: 12,
  name: "General",
  type: "group",
  group_username: "general",
  group_visibility: "public",
  group_color: "#10b981",
  allow_member_invites: 1,
  created_by_user_id: 7,
};

function makeAdminDbToolsApp({
  adminGetRow,
  adminRun = vi.fn(async () => 1),
  adminTransaction,
  adminResetDatabase,
} = {}) {
  process.env.ADMIN_API_TOKEN = "test-admin-token";
  const transaction =
    adminTransaction ||
    (async (callback) => {
      await adminRun("BEGIN");
      try {
        const result = await callback(adminRun);
        await adminRun("COMMIT");
        return result;
      } catch (error) {
        await adminRun("ROLLBACK");
        throw error;
      }
    });
  return makeApp({
    deps: {
      isLoopbackRequest: () => true,
      adminGetRow: adminGetRow || vi.fn(async () => null),
      adminGetAll: vi.fn(async () => []),
      adminRun,
      adminTransaction: transaction,
      adminResetDatabase: adminResetDatabase || vi.fn(async () => ({ storedNames: [] })),
      adminSave: vi.fn(),
    },
  }).app;
}

beforeEach(() => {
  process.env.ADMIN_API_TOKEN = "test-admin-token";
});

afterEach(() => {
  delete process.env.ADMIN_API_TOKEN;
  vi.restoreAllMocks();
});

describe("POST /api/admin/db-tools database edits", () => {
  test("edits a user when database reads return PostgreSQL promises", async () => {
    const adminGetRow = vi.fn(async (sql, params = []) => {
      if (sql.includes("FROM users WHERE username = ?")) return user;
      if (sql.includes("FROM users WHERE id = ?"))
        return { ...user, nickname: "Alice Updated" };
      return null;
    });
    const app = makeAdminDbToolsApp({ adminGetRow });

    const res = await request(app)
      .post("/api/admin/db-tools")
      .set("x-songbird-admin-token", "test-admin-token")
      .send({
        action: "edit_user",
        payload: { userSelector: "alice", nickname: "Alice Updated" },
      });

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      id: 7,
      username: "alice",
      nickname: "Alice Updated",
    });
  });

  test("edits a chat when database reads return PostgreSQL promises", async () => {
    const adminGetRow = vi.fn(async (sql) => {
      if (sql.includes("FROM chats") && sql.includes("WHERE group_username"))
        return chat;
      if (sql.includes("FROM chats") && sql.includes("WHERE id = ?"))
        return { ...chat, name: "Team General" };
      return null;
    });
    const app = makeAdminDbToolsApp({ adminGetRow });

    const res = await request(app)
      .post("/api/admin/db-tools")
      .set("x-songbird-admin-token", "test-admin-token")
      .send({
        action: "edit_chat",
        payload: { chatSelector: "general", name: "Team General" },
      });

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      id: 12,
      type: "group",
      name: "Team General",
    });
  });

  test("awaits every user deletion before committing the PostgreSQL transaction", async () => {
    const events = [];
    const adminRun = vi.fn((sql) => {
      const statement = String(sql).trim().split(/\\s+/, 1)[0].toUpperCase();
      events.push(statement);
      if (statement === "BEGIN" || statement === "COMMIT")
        return Promise.resolve(1);
      return new Promise((resolve) =>
        setTimeout(() => {
          events.push(`${statement}:done`);
          resolve(1);
        }, 0),
      );
    });
    const adminTransaction = vi.fn(async (callback) => {
      await adminRun("BEGIN");
      try {
        const result = await callback(adminRun);
        await adminRun("COMMIT");
        return result;
      } catch (error) {
        await adminRun("ROLLBACK");
        throw error;
      }
    });
    const app = makeAdminDbToolsApp({ adminRun, adminTransaction });

    const res = await request(app)
      .post("/api/admin/db-tools")
      .set("x-songbird-admin-token", "test-admin-token")
      .send({ action: "delete_users", payload: { selectors: ["7"] } });

    expect(res.status).toBe(200);
    expect(events.indexOf("COMMIT")).toBeGreaterThan(-1);
    const commitIndex = events.indexOf("COMMIT");
    const completedWrites = events.filter((event) => event.endsWith(":done"));
    expect(completedWrites.length).toBeGreaterThan(0);
    expect(
      events.slice(0, commitIndex).filter((event) => event.endsWith(":done"))
        .length,
    ).toBe(completedWrites.length);
  });

  test("creates a chat without SQLite-only rowid syntax in PostgreSQL mode", async () => {
    const seenSql = [];
    const adminGetRow = vi.fn(async (sql, params = []) => {
      seenSql.push(sql);
      if (
        sql.includes("FROM users WHERE username = ?") &&
        params[0] === "alice"
      )
        return user;
      if (sql.includes("FROM users WHERE id = ?")) return { color: user.color };
      if (sql.includes("FROM chats") && sql.includes("SELECT id FROM"))
        return null;
      if (sql.includes("SELECT id, name, type")) {
        return { ...chat, name: "Project", group_username: "project" };
      }
      return null;
    });
    const adminRun = vi.fn(async (sql) => {
      seenSql.push(sql);
      return 1;
    });
    const app = makeAdminDbToolsApp({ adminGetRow, adminRun });

    const res = await request(app)
      .post("/api/admin/db-tools")
      .set("x-songbird-admin-token", "test-admin-token")
      .send({
        action: "create_chat",
        payload: {
          type: "group",
          name: "Project",
          owner: "alice",
          username: "project",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      id: 12,
      type: "group",
      name: "Project",
    });
    expect(seenSql.join("\n")).not.toMatch(/rowid|last_insert_rowid/i);
  });

  test("handles verify and ban actions with PostgreSQL promise-based user lookups", async () => {
    const adminGetRow = vi.fn(async (sql) => {
      if (sql.includes("FROM users WHERE username = ?")) return user;
      if (sql.includes("COUNT(*) AS count FROM sessions")) return { count: 3 };
      return null;
    });
    const adminRun = vi.fn(async () => 1);
    const app = makeAdminDbToolsApp({ adminGetRow, adminRun });

    for (const [action, expected] of [
      ["toggle_user_verified", { verified: true }],
      ["toggle_user_ban", { banned: true, sessionsExpired: 3 }],
    ]) {
      const res = await request(app)
        .post("/api/admin/db-tools")
        .set("x-songbird-admin-token", "test-admin-token")
        .send({ action, payload: { userSelector: "alice" } });
      expect(res.status).toBe(200);
      expect(res.body.result).toMatchObject({ id: user.id, ...expected });
    }

    expect(adminRun).toHaveBeenCalledWith(
      "UPDATE users SET verified = ? WHERE id = ?",
      [1, user.id],
    );
    expect(adminRun).toHaveBeenCalledWith(
      "UPDATE users SET banned = ? WHERE id = ?",
      [1, user.id],
    );
  });

  test("handles verify and add-member actions with PostgreSQL promise-based chat lookups", async () => {
    const adminGetRow = vi.fn(async (sql) => {
      if (sql.includes("FROM chats")) return chat;
      if (sql.includes("FROM users WHERE username = ?")) return user;
      if (sql.includes("FROM chat_members")) return null;
      if (sql.includes("FROM chat_left_members")) return null;
      return null;
    });
    const adminRun = vi.fn(async () => 1);
    const app = makeAdminDbToolsApp({ adminGetRow, adminRun });

    const verifyRes = await request(app)
      .post("/api/admin/db-tools")
      .set("x-songbird-admin-token", "test-admin-token")
      .send({
        action: "toggle_chat_verified",
        payload: { chatSelector: "general" },
      });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.result).toMatchObject({
      id: chat.id,
      verified: true,
    });

    const addRes = await request(app)
      .post("/api/admin/db-tools")
      .set("x-songbird-admin-token", "test-admin-token")
      .send({
        action: "add_chat_members",
        payload: { chatSelector: "general", userSelectors: ["alice"] },
      });
    expect(addRes.status).toBe(200);
    expect(addRes.body.result).toMatchObject({
      chatId: chat.id,
      addedCount: 1,
    });
    expect(adminRun).toHaveBeenCalledWith(
      "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chat.id, user.id, "member"],
    );
  });

  test("uses the schema-preserving reset implementation for a running PostgreSQL server", async () => {
    const reset = vi.fn(async () => ({ storedNames: ["message.bin"] }));
    const app = makeAdminDbToolsApp({ adminResetDatabase: reset });

    const res = await request(app)
      .post("/api/admin/db-tools")
      .set("x-songbird-admin-token", "test-admin-token")
      .send({ action: "reset_db" });

    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ cleared: true, filesRemoved: 1 });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  test("generates users when PostgreSQL collection reads return promises", async () => {
    const adminRun = vi.fn(async () => 1);
    const app = makeAdminDbToolsApp({ adminRun });

    const res = await request(app)
      .post("/api/admin/db-tools")
      .set("x-songbird-admin-token", "test-admin-token")
      .send({
        action: "generate_users",
        payload: {
          count: 1,
          password: "Passw0rd!",
          nicknamePrefix: "User",
          usernamePrefix: "user",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.result).toEqual({ created: 1 });
    expect(adminRun).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO users"),
      expect.any(Array),
    );
  });
});

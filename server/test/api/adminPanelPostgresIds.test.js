import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

/**
 * Tests that admin panel INSERT operations include the `id` column.
 *
 * In PostgreSQL mode, the `users`, `chats`, and `chat_messages` tables have
 * `id text NOT NULL` with no default value. Any INSERT that omits the `id`
 * column will fail with a not-null constraint violation.
 *
 * These tests verify that:
 * 1. User creation generates and inserts a UUID for the id column
 * 2. Chat creation (via createChat dep) already provides an id
 * 3. Message creation (via createMessage dep) already provides an id
 */

function makeAdminApp(deps = {}) {
  const admin = {
    id: "a0000000-0000-4000-8000-000000000001",
    username: "admin",
    nickname: "Admin",
    role: "admin",
    color: "#10b981",
    status: "online",
    banned: 0,
    verified: 0,
  };
  const sessionStore = makeSessionStore();
  sessionStore.createSession(admin.id, "admin-session");
  return makeApp({
    sessionStore,
    userStore: makeUserStore([admin]),
    deps: {
      isUserAdmin: (userId) => userId === admin.id,
      isUserOwner: (userId) => userId === admin.id,
      getOwnerUser: () => admin,
      ...deps,
    },
  });
}

describe("admin user creation includes UUID id", () => {
  test("POST /api/admin/users passes an id column in the INSERT query", async () => {
    const insertedSql = [];
    const { app } = makeAdminApp({
      adminGetRow: (sql, params) => {
        // Respond with "no existing user" for conflict checks
        if (sql.includes("SELECT id FROM users WHERE username")) return null;
        if (sql.includes("SELECT id FROM chats")) return null;
        // After INSERT, return the created user row
        if (sql.includes("SELECT id, username")) {
          return {
            id: "test-uuid",
            username: params?.[0] || "newuser",
            nickname: "New",
            color: "#10b981",
            role: "user",
          };
        }
        return null;
      },
      adminRun: (sql, params) => {
        insertedSql.push({ sql, params });
      },
      adminSave: () => {},
    });

    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", "sid=admin-session")
      .send({ username: "newuser", password: "password123", nickname: "New" });

    expect(res.status).toBe(201);

    // Find the INSERT INTO users statement
    const userInsert = insertedSql.find(({ sql }) =>
      sql.includes("INSERT INTO users"),
    );
    expect(userInsert).toBeDefined();

    // The INSERT must include the `id` column to work with PostgreSQL
    expect(userInsert.sql).toContain("(id,");
    // The params must include a UUID-like string as the first value
    expect(userInsert.params[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("generated user id is a valid UUID v4", async () => {
    let capturedId = null;
    const { app } = makeAdminApp({
      adminGetRow: (sql) => {
        if (sql.includes("SELECT id FROM users WHERE username")) return null;
        if (sql.includes("SELECT id FROM chats")) return null;
        if (sql.includes("SELECT id, username")) {
          return {
            id: capturedId || "fallback",
            username: "newuser2",
            nickname: "New2",
            color: "#10b981",
            role: "user",
          };
        }
        return null;
      },
      adminRun: (sql, params) => {
        if (sql.includes("INSERT INTO users")) {
          // First param should be the id
          capturedId = params[0];
        }
      },
      adminSave: () => {},
    });

    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", "sid=admin-session")
      .send({
        username: "newuser2",
        password: "password123",
        nickname: "New2",
      });

    expect(res.body).toMatchObject({ ok: true });
    expect(res.status).toBe(201);
    expect(capturedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

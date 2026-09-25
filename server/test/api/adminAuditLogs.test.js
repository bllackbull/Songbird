import { describe, test, expect } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

// Regression test for ephemeral-disk log loss: the admin audit trail must be
// served from the injected DB-backed store (deps.readAdminAuditLogs /
// deps.writeAdminAuditLog / deps.clearAdminAuditLogs), never from
// logs/admin.log on disk.

function makeAuditApp({ owner = true } = {}) {
  const admin = {
    id: "a0000000-0000-4000-8000-000000000001",
    username: "admin",
    nickname: "Admin",
    role: "owner",
  };
  const user = {
    id: "b0000000-0000-4000-8000-000000000002",
    username: "bob",
    nickname: "Bob",
    role: "user",
  };
  const sessionStore = makeSessionStore();
  sessionStore.createSession(admin.id, "admin-session");
  sessionStore.createSession(user.id, "user-session");
  const built = makeApp({
    sessionStore,
    userStore: makeUserStore([admin, user]),
    deps: {
      isUserAdmin: (userId) => userId === admin.id,
      isUserOwner: () => owner,
    },
  });
  return { ...built, admin, user };
}

describe("GET /api/admin/logs (DB-backed audit trail)", () => {
  test("round-trips entries written via deps.writeAdminAuditLog", async () => {
    const { app, deps } = makeAuditApp();
    deps.writeAdminAuditLog({
      actorUserId: "a0000000-0000-4000-8000-000000000001",
      actorUsername: "admin",
      action: "user.ban",
      targetType: "user",
      targetLabel: "@bob",
    });

    const res = await request(app)
      .get("/api/admin/logs")
      .set("Cookie", "sid=admin-session");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0]).toMatchObject({
      action: "user.ban",
      actorUsername: "admin",
      targetLabel: "@bob",
    });
  });

  test("returns newest first with limit/offset pagination", async () => {
    const { app, deps } = makeAuditApp();
    for (let i = 1; i <= 3; i++) {
      deps.writeAdminAuditLog({
        action: `action.${i}`,
        actorUsername: "admin",
      });
    }

    const page1 = await request(app)
      .get("/api/admin/logs?limit=2&offset=0")
      .set("Cookie", "sid=admin-session");
    expect(page1.body.total).toBe(3);
    expect(page1.body.logs.map((l) => l.action)).toEqual([
      "action.3",
      "action.2",
    ]);

    const page2 = await request(app)
      .get("/api/admin/logs?limit=2&offset=2")
      .set("Cookie", "sid=admin-session");
    expect(page2.body.logs.map((l) => l.action)).toEqual(["action.1"]);
  });

  test("supports search across actor/action/label/details", async () => {
    const { app, deps } = makeAuditApp();
    deps.writeAdminAuditLog({ action: "user.ban", targetLabel: "@bob" });
    deps.writeAdminAuditLog({ action: "chat.create", targetLabel: "General" });

    const res = await request(app)
      .get("/api/admin/logs?search=bob")
      .set("Cookie", "sid=admin-session");
    expect(res.body.total).toBe(1);
    expect(res.body.logs[0].action).toBe("user.ban");
  });

  test("rejects non-admin users", async () => {
    const { app } = makeAuditApp();
    const res = await request(app)
      .get("/api/admin/logs")
      .set("Cookie", "sid=user-session");
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/logs (DB-backed audit trail)", () => {
  test("clears via deps.clearAdminAuditLogs and logs the clear action", async () => {
    const { app, deps } = makeAuditApp();
    deps.writeAdminAuditLog({ action: "user.ban" });

    const res = await request(app)
      .delete("/api/admin/logs")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // Clear wipes everything, then the clear action itself is recorded.
    expect(deps.__auditLogStore).toHaveLength(1);
    expect(deps.__auditLogStore[0].action).toBe("logs.clear");
  });

  test("requires owner role", async () => {
    const { app } = makeAuditApp({ owner: false });
    const res = await request(app)
      .delete("/api/admin/logs")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(403);
  });
});

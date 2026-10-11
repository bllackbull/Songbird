import { describe, test, expect } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

function makeAdminApp() {
  const admin = {
    id: "a0000000-0000-4000-8000-000000000001",
    username: "admin",
    nickname: "Admin",
    role: "admin",
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
  const { app } = makeApp({
    sessionStore,
    userStore: makeUserStore([admin, user]),
    deps: {
      isUserAdmin: (userId) => userId === admin.id,
    },
  });
  return app;
}

describe("GET /api/admin/logs/worker", () => {
  test("returns the standard system-log shape for admins", async () => {
    const app = makeAdminApp();
    const res = await request(app)
      .get("/api/admin/logs/worker")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(typeof res.body.available).toBe("boolean");
    expect(Array.isArray(res.body.lines)).toBe(true);
  });

  test("rejects unauthenticated requests", async () => {
    const app = makeAdminApp();
    const res = await request(app).get("/api/admin/logs/worker");
    expect(res.status).toBe(401);
  });

  test("rejects non-admin users", async () => {
    const app = makeAdminApp();
    const res = await request(app)
      .get("/api/admin/logs/worker")
      .set("Cookie", "sid=user-session");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/logs/sources", () => {
  test("includes the worker source so the UI can gray it out when remote", async () => {
    const app = makeAdminApp();
    const res = await request(app)
      .get("/api/admin/logs/sources")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(res.body.sources.worker).toBeDefined();
    expect(typeof res.body.sources.worker.available).toBe("boolean");
  });
});

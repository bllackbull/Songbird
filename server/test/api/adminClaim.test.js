import { describe, test, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

describe("POST /api/admin/claim", () => {
  let app;
  let deps;

  beforeEach(() => {
    process.env.ADMIN_API_TOKEN = "test-admin-secret-token";
    deps = {
      getSessionFromRequest: (...args) => deps.onGetSession(...args),
      setUserRole: (...args) => deps.onSetUserRole(...args),
      getRow: (...args) => deps.onGetRow(...args),
      writeAdminLog: () => {},
    };
    deps.onGetSession = () => ({ id: "42424242-4242-4242-a242-424242424242", username: "testuser" });
    deps.onSetUserRole = async (id, role) => ({ id, role });
    deps.onGetRow = async (query) => {
      if (
        typeof query === "string" &&
        query.includes("users WHERE role = 'owner'")
      ) {
        return null; // No owner exists
      }
      return null;
    };

    app = makeApp({ deps }).app;
  });

  afterEach(() => {
    delete process.env.ADMIN_API_TOKEN;
  });

  test("rejects unauthenticated requests with 401", async () => {
    deps.onGetSession = () => null;
    const res = await request(app)
      .post("/api/admin/claim")
      .set("x-forwarded-proto", "https")
      .send({ token: "test-admin-secret-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Not authenticated");
  });

  test("rejects incorrect token with 401", async () => {
    const res = await request(app)
      .post("/api/admin/claim")
      .set("x-forwarded-proto", "https")
      .send({ token: "wrong-token" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid admin token");
  });

  test("promotes user to 'owner' when no owner exists", async () => {
    let assignedRole = null;
    deps.onSetUserRole = async (id, role) => {
      assignedRole = role;
      return { id, role };
    };

    const res = await request(app)
      .post("/api/admin/claim")
      .set("x-forwarded-proto", "https")
      .send({ token: "test-admin-secret-token" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.role).toBe("owner");
    expect(assignedRole).toBe("owner");
  });

  test("promotes user to 'admin' when an owner already exists", async () => {
    deps.onGetRow = async (query) => {
      if (
        typeof query === "string" &&
        query.includes("users WHERE role = 'owner'")
      ) {
        return { id: "11111111-1111-4111-a111-111111111111", username: "existing_owner" };
      }
      return null;
    };

    let assignedRole = null;
    deps.onSetUserRole = async (id, role) => {
      assignedRole = role;
      return { id, role };
    };

    const res = await request(app)
      .post("/api/admin/claim")
      .set("x-forwarded-proto", "https")
      .send({ token: "test-admin-secret-token" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.role).toBe("admin");
    expect(assignedRole).toBe("admin");
  });

  test("rejects remote non-HTTPS request with 403", async () => {
    const res = await request(app)
      .post("/api/admin/claim")
      .set("x-forwarded-proto", "http")
      .set("host", "example.com")
      .send({ token: "test-admin-secret-token" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/HTTPS connection required/i);
  });
});

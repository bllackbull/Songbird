import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

describe("GET /api/admin/users and GET /api/admin/chats filter params", () => {
  it("passes verified filter to adminListUsers", async () => {
    const admin = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      nickname: "Admin",
      role: "admin",
    };
    const sessionStore = makeSessionStore();
    sessionStore.createSession(admin.id, "admin-session");
    const adminListUsers = vi.fn().mockResolvedValue({ users: [], total: 0 });
    const { app } = makeApp({
      sessionStore,
      userStore: makeUserStore([admin]),
      deps: {
        isUserAdmin: (userId) => userId === admin.id,
        adminListUsers,
      },
    });
    const res = await request(app)
      .get("/api/admin/users?verified=1")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(adminListUsers).toHaveBeenCalledWith(
      expect.objectContaining({ verifiedFilter: "1" }),
    );
  });

  it("passes visibility, verified, auto_add, remote filters to adminListChats", async () => {
    const admin = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      nickname: "Admin",
      role: "admin",
    };
    const sessionStore = makeSessionStore();
    sessionStore.createSession(admin.id, "admin-session");
    const adminListChats = vi.fn().mockResolvedValue({ chats: [], total: 0 });
    const { app } = makeApp({
      sessionStore,
      userStore: makeUserStore([admin]),
      deps: {
        isUserAdmin: (userId) => userId === admin.id,
        adminListChats,
      },
    });
    const res = await request(app)
      .get(
        "/api/admin/chats?visibility=private&verified=1&auto_add=1&remote=active",
      )
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(adminListChats).toHaveBeenCalledWith(
      expect.objectContaining({
        visibilityFilter: "private",
        verifiedFilter: "1",
        autoAddFilter: "1",
        remoteFilter: "active",
      }),
    );
  });

  it("passes connectedUsernames to adminListUsers when filtering status", async () => {
    const admin = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      nickname: "Admin",
      role: "admin",
    };
    const sessionStore = makeSessionStore();
    sessionStore.createSession(admin.id, "admin-session");
    const adminListUsers = vi.fn().mockResolvedValue({ users: [], total: 0 });
    const { app } = makeApp({
      sessionStore,
      userStore: makeUserStore([admin]),
      deps: {
        isUserAdmin: (userId) => userId === admin.id,
        adminListUsers,
        getConnectedUsernames: () => ["alice"],
      },
    });
    const res = await request(app)
      .get("/api/admin/users?status=online")
      .set("Cookie", "sid=admin-session");
    expect(res.status).toBe(200);
    expect(adminListUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        statusFilter: "online",
        connectedUsernames: ["alice"],
      }),
    );
  });
});

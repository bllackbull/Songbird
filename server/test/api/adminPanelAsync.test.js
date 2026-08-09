import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

describe("async admin-panel mutations", () => {
  test("waits for user deletion before responding", async () => {
    const admin = {
      id: 1,
      username: "admin",
      nickname: "Admin",
      role: "admin",
    };
    const target = { id: 2, username: "bob", nickname: "Bob", role: "user" };
    const sessionStore = makeSessionStore();
    sessionStore.createSession(admin.id, "admin-session");
    const events = [];
    const adminDeleteUser = vi.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            events.push("deleted");
            resolve({ storedNames: [] });
          }, 0);
        }),
    );
    const { app } = makeApp({
      sessionStore,
      userStore: makeUserStore([admin, target]),
      deps: {
        isUserAdmin: (userId) => Number(userId) === admin.id,
        findUserById: (userId) =>
          Number(userId) === target.id ? target : admin,
        adminDeleteUser,
      },
    });

    const response = await request(app)
      .delete("/api/admin/users/2")
      .set("Cookie", "sid=admin-session");

    expect(response.status).toBe(200);
    expect(events).toEqual(["deleted"]);
    expect(adminDeleteUser).toHaveBeenCalledWith(2);
  });
});

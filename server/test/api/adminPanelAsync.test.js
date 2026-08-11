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
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "admin",
      nickname: "Admin",
      role: "admin",
    };
    const target = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", username: "bob", nickname: "Bob", role: "user" };
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
        isUserAdmin: (userId) => userId === admin.id,
        findUserById: (userId) =>
          userId === target.id ? target : admin,
        adminDeleteUser,
      },
    });

    const response = await request(app)
      .delete("/api/admin/users/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
      .set("Cookie", "sid=admin-session");

    expect(response.status).toBe(200);
    expect(events).toEqual(["deleted"]);
    expect(adminDeleteUser).toHaveBeenCalledWith("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});

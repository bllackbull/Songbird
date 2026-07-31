import { describe, test, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

async function loginCookie(app) {
  const res = await request(app)
    .post("/api/login")
    .send({ username: "alice", password: "secret123" });
  return res.headers["set-cookie"];
}

describe("GET /api/groups/invite/:token", () => {
  test("includes the verified state of the invited chat", async () => {
    const userStore = makeUserStore([
      {
        id: 1,
        username: "alice",
        password_hash: bcrypt.hashSync("secret123", 4),
        nickname: "Alice",
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const { app } = makeApp({
      userStore,
      deps: {
        findChatByInviteToken: (token) =>
          token === "invite-token"
            ? {
                id: 12,
                type: "group",
                name: "Verified Group",
                group_username: "verified_group",
                verified: 1,
              }
            : null,
      },
    });

    const res = await request(app)
      .get("/api/groups/invite/invite-token")
      .set("Cookie", await loginCookie(app));

    expect(res.status).toBe(200);
    expect(res.body.group.verified).toBe(true);
  });
});

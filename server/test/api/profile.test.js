import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALICE_ID = "11111111-1111-4111-a111-111111111111";
const BOB_ID = "22222222-2222-4222-a222-222222222222";

function makeAppWithAlice(overrides = {}) {
  const hash = bcrypt.hashSync("secret123", 4);
  const userStore = makeUserStore([
    {
      id: ALICE_ID,
      username: "alice",
      password_hash: hash,
      nickname: "Alice",
      avatar_url: null,
      color: "#10b981",
      status: "online",
      role: "user",
      banned: false,
    },
  ]);
  return makeApp({ userStore, ...overrides });
}

async function loginCookie(app) {
  const res = await request(app)
    .post("/api/login")
    .send({ username: "alice", password: "secret123" });
  return res.headers["set-cookie"];
}

// ─── GET /api/profile ─────────────────────────────────────────────────────────

describe("GET /api/profile", () => {
  test("returns 401 when not authenticated", async () => {
    const { app } = makeAppWithAlice();
    const res = await request(app).get("/api/profile?username=alice");
    expect(res.status).toBe(401);
  });

  test("returns 400 when username query param is missing", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app).get("/api/profile").set("Cookie", cookie);
    expect(res.status).toBe(400);
  });

  test("returns 404 when user does not exist", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .get("/api/profile?username=nobody")
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  test("returns profile data for an existing user", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .get("/api/profile?username=alice")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "alice", nickname: "Alice" });
  });
});

// ─── PUT /api/profile ─────────────────────────────────────────────────────────

describe("PUT /api/profile", () => {
  test("returns 401 when not authenticated", async () => {
    const { app } = makeAppWithAlice();
    const res = await request(app).put("/api/profile").send({
      currentUsername: "alice",
      username: "alice2",
    });
    expect(res.status).toBe(401);
  });

  test("returns 400 when currentUsername is missing", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/profile")
      .set("Cookie", cookie)
      .send({ username: "alice2" });
    expect(res.status).toBe(400);
  });

  test("returns 400 when new username is shorter than 3 characters", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/profile")
      .set("Cookie", cookie)
      .send({ currentUsername: "alice", username: "ab" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 3/i);
  });

  test("returns 400 for an invalid username pattern", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/profile")
      .set("Cookie", cookie)
      .send({ currentUsername: "alice", username: "Alice Smith" });
    expect(res.status).toBe(400);
  });

  test("returns 409 when new username is already taken", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: ALICE_ID,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
      {
        id: BOB_ID,
        username: "bob",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#3b82f6",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const { app } = makeApp({ userStore });
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/profile")
      .set("Cookie", cookie)
      .send({ currentUsername: "alice", username: "bob" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test("returns 200 with updated profile on success", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: ALICE_ID,
        username: "alice",
        password_hash: hash,
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
        updateUserProfile: () => {},
        removeAvatarByUrl: () => {},
        // Return the updated user
        findUserById: () => ({
          id: ALICE_ID,
          username: "alice2",
          nickname: "Ali",
          avatar_url: null,
          color: "#10b981",
          status: "online",
        }),
        listChatsForUser: () => [],
        listChatMembers: () => [],
        emitSseEvent: () => {},
      },
    });
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/profile")
      .set("Cookie", cookie)
      .send({ currentUsername: "alice", username: "alice2", nickname: "Ali" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice2");
  });
});

// ─── PUT /api/password ────────────────────────────────────────────────────────

describe("PUT /api/password", () => {
  test("returns 401 when not authenticated", async () => {
    const { app } = makeAppWithAlice();
    const res = await request(app).put("/api/password").send({
      username: "alice",
      currentPassword: "secret123",
      newPassword: "newpass123",
    });
    expect(res.status).toBe(401);
  });

  test("returns 400 when new password is shorter than 6 characters", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/password")
      .set("Cookie", cookie)
      .send({
        username: "alice",
        currentPassword: "secret123",
        newPassword: "abc",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 6/i);
  });

  test("returns 401 when current password is wrong", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/password")
      .set("Cookie", cookie)
      .send({
        username: "alice",
        currentPassword: "wrongpass",
        newPassword: "newpass123",
      });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  test("returns 200 on successful password change", async () => {
    const { app } = makeAppWithAlice({
      deps: { updateUserPassword: () => {} },
    });
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/password")
      .set("Cookie", cookie)
      .send({
        username: "alice",
        currentPassword: "secret123",
        newPassword: "newpass123",
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── PUT /api/status ─────────────────────────────────────────────────────────

describe("PUT /api/status", () => {
  test("returns 401 when not authenticated", async () => {
    const { app } = makeAppWithAlice();
    const res = await request(app)
      .put("/api/status")
      .send({ username: "alice", status: "online" });
    expect(res.status).toBe(401);
  });

  test("returns 400 for an invalid status value", async () => {
    const { app } = makeAppWithAlice();
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/status")
      .set("Cookie", cookie)
      .send({ username: "alice", status: "busy" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid status/i);
  });

  test('accepts "online" as a valid status', async () => {
    const { app } = makeAppWithAlice({
      deps: {
        updateUserStatus: () => {},
        getUserPresence: () => ({
          username: "alice",
          status: "online",
          last_seen: null,
        }),
        listChatsForUser: () => [],
        listChatMembers: () => [],
        emitSseEvent: () => {},
      },
    });
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/status")
      .set("Cookie", cookie)
      .send({ username: "alice", status: "online" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("online");
  });

  test('accepts "invisible" as a valid status', async () => {
    const { app } = makeAppWithAlice({
      deps: {
        updateUserStatus: () => {},
        getUserPresence: () => ({
          username: "alice",
          status: "invisible",
          last_seen: null,
        }),
        listChatsForUser: () => [],
        listChatMembers: () => [],
        emitSseEvent: () => {},
      },
    });
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/status")
      .set("Cookie", cookie)
      .send({ username: "alice", status: "invisible" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("invisible");
  });
});

describe("PUT /api/status", () => {
  test("broadcasts presence through the tracker after updating status", async () => {
    const broadcastPresence = vi.fn();
    const { app } = makeAppWithAlice({ deps: { broadcastPresence } });
    const cookie = await loginCookie(app);
    const res = await request(app)
      .put("/api/status")
      .set("Cookie", cookie)
      .send({ username: "alice", status: "invisible" });
    expect(res.status).toBe(200);
    expect(broadcastPresence).toHaveBeenCalledWith("alice");
  });
});

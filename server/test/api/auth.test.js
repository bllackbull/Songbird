import { describe, test, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";
import { userEvents } from "../../lib/workers/autoAddWorker.js";

// ─── Test UUIDs ───────────────────────────────────────────────────────────────
const UUID_ALICE = "a0000000-0000-4000-8000-000000000001";
const UUID_BOB = "b0000000-0000-4000-8000-000000000002";

// ─── Helper — extract the session cookie from a Set-Cookie header ─────────────
function extractSid(res) {
  const cookie = (res.headers["set-cookie"] ?? [])
    .map(String)
    .find((c) => c.startsWith("sid="));
  if (!cookie) return null;
  return cookie.split(";")[0].replace("sid=", "");
}

// ─── /api/register ────────────────────────────────────────────────────────────

describe("POST /api/register", () => {
  test("creates a new user and returns 200 with user data", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/register").send({
      username: "alice",
      password: "secret123",
      nickname: "Alice",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "alice", nickname: "Alice" });
    expect(res.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("sets a session cookie on successful registration", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/register").send({
      username: "bob",
      password: "hunter22",
    });
    expect(res.status).toBe(200);
    expect(extractSid(res)).not.toBeNull();
  });

  test("emits user:created event on userEvents listener when user registers", async () => {
    const { app } = makeApp();
    const emitted = [];
    const handler = (data) => emitted.push(data);
    userEvents.on("user:created", handler);

    try {
      const res = await request(app).post("/api/register").send({
        username: "eventuser",
        password: "password123",
      });
      expect(res.status).toBe(200);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toEqual({ userId: res.body.id });
    } finally {
      userEvents.off("user:created", handler);
    }
  });

  test("returns 409 when username is already taken", async () => {
    const userStore = makeUserStore([
      {
        id: UUID_ALICE,
        username: "alice",
        password_hash: "x",
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    const { app } = makeApp({ userStore });
    const res = await request(app).post("/api/register").send({
      username: "alice",
      password: "secret123",
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test("returns 400 when username is missing", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/register")
      .send({ password: "secret123" });
    expect(res.status).toBe(400);
  });

  test("returns 400 when password is missing", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/register")
      .send({ username: "alice" });
    expect(res.status).toBe(400);
  });

  test("returns 400 when username is shorter than 3 characters", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/register")
      .send({ username: "ab", password: "secret123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 3/i);
  });

  test("returns 400 when password is shorter than 6 characters", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/register")
      .send({ username: "alice", password: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 6/i);
  });

  test("returns 400 for an invalid username pattern", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/register")
      .send({ username: "Alice Smith", password: "secret123" });
    expect(res.status).toBe(400);
  });

  test("returns 403 when sign-up is disabled", async () => {
    const { app } = makeApp({ settings: { SIGN_UP: false } });
    const res = await request(app)
      .post("/api/register")
      .send({ username: "alice", password: "secret123" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });
});

// ─── /api/login ───────────────────────────────────────────────────────────────

describe("POST /api/login", () => {
  function makeAppWithUser(username = "alice", password = "secret123") {
    const hash = bcrypt.hashSync(password, 4); // low cost for test speed
    const userStore = makeUserStore([
      {
        id: UUID_ALICE,
        username,
        password_hash: hash,
        nickname: "Alice",
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);
    return makeApp({ userStore });
  }

  test("returns 200 and user data with correct credentials", async () => {
    const { app } = makeAppWithUser();
    const res = await request(app)
      .post("/api/login")
      .send({ username: "alice", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "alice", nickname: "Alice" });
    expect(res.body.id).toBe(UUID_ALICE);
  });

  test("sets a session cookie on successful login", async () => {
    const { app } = makeAppWithUser();
    const res = await request(app)
      .post("/api/login")
      .send({ username: "alice", password: "secret123" });
    expect(extractSid(res)).not.toBeNull();
  });

  test("returns 401 for wrong password", async () => {
    const { app } = makeAppWithUser();
    const res = await request(app)
      .post("/api/login")
      .send({ username: "alice", password: "wrongpass" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  test("returns 401 for unknown username", async () => {
    const { app } = makeAppWithUser();
    const res = await request(app)
      .post("/api/login")
      .send({ username: "nobody", password: "secret123" });
    expect(res.status).toBe(401);
  });

  test("returns 403 for a banned user", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: UUID_ALICE,
        username: "alice",
        password_hash: hash,
        nickname: null,
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: true,
      },
    ]);
    const { app } = makeApp({ userStore });
    const res = await request(app)
      .post("/api/login")
      .send({ username: "alice", password: "secret123" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/banned/i);
  });

  test("returns 400 when credentials are missing", async () => {
    const { app } = makeAppWithUser();
    const res = await request(app).post("/api/login").send({});
    expect(res.status).toBe(400);
  });
});

// ─── /api/me ─────────────────────────────────────────────────────────────────

describe("GET /api/me", () => {
  async function loginAndGetCookie(app, username, password) {
    const res = await request(app)
      .post("/api/login")
      .send({ username, password });
    return res.headers["set-cookie"];
  }

  test("returns 401 when not authenticated", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  test("returns user data when authenticated", async () => {
    const hash = bcrypt.hashSync("secret123", 4);
    const userStore = makeUserStore([
      {
        id: UUID_ALICE,
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
    const { app } = makeApp({ userStore });
    const cookie = await loginAndGetCookie(app, "alice", "secret123");
    const res = await request(app).get("/api/me").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "alice", nickname: "Alice" });
    expect(res.body.id).toBe(UUID_ALICE);
  });
});

// ─── /api/logout ─────────────────────────────────────────────────────────────

describe("POST /api/logout", () => {
  test("returns 200 with { ok: true }", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/logout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test("clears the session cookie", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/logout");
    const cookie = (res.headers["set-cookie"] ?? []).find((c) =>
      c.startsWith("sid="),
    );
    expect(cookie).toMatch(/Max-Age=0/i);
  });
});

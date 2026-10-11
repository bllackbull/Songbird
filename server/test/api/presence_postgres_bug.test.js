import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const ALICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Bug 1 Reproduction: Real-time Presence Updates in Postgres Mode", () => {
  let originalDbClient;

  beforeEach(() => {
    originalDbClient = process.env.DB_CLIENT;
    process.env.DB_CLIENT = "postgres";
  });

  afterEach(() => {
    if (originalDbClient !== undefined) {
      process.env.DB_CLIENT = originalDbClient;
    } else {
      delete process.env.DB_CLIENT;
    }
  });

  test("PUT /api/status in Postgres mode broadcasts the updated status, not the stale pre-update status", async () => {
    let dbStatus = "online";
    const broadcastPresence = vi.fn(async () => {
      return {
        id: ALICE_ID,
        username: "alice",
        status: dbStatus,
      };
    });

    const updateUserStatusAsync = vi.fn((userId, status) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          dbStatus = status;
          resolve(1);
        }, 10);
      });
    });

    const alice = {
      id: ALICE_ID,
      username: "alice",
      role: "user",
      status: "online",
    };

    const { app, sessionStore } = makeApp({
      userStore: makeUserStore([alice]),
      deps: {
        findUserByUsername: (u) =>
          Promise.resolve(u === "alice" ? alice : null),
        updateUserStatus: (userId, status) =>
          updateUserStatusAsync(userId, status),
        broadcastPresence,
      },
    });

    sessionStore.createSession(ALICE_ID, "tok-alice");

    const res = await request(app)
      .put("/api/status")
      .set("Cookie", "sid=tok-alice")
      .send({ username: "alice", status: "invisible" });

    expect(res.status).toBe(200);

    const presenceResult = await broadcastPresence.mock.results[0]?.value;
    expect(presenceResult.status).toBe("invisible");
  });
});

import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const ALICE_ID = "11111111-1111-4111-a111-111111111111";

function presenceApp({ isConnected = () => false, status = "online" } = {}) {
  const alice = {
    id: ALICE_ID,
    username: "alice",
    status,
    last_seen: "2026-08-04 10:00:00",
  };
  return makeApp({
    userStore: makeUserStore([alice]),
    deps: {
      isConnected,
      getUserPresence: (username) =>
        String(username || "").toLowerCase() === "alice" ? alice : null,
    },
  });
}

describe("GET /api/presence", () => {
  test("returns effective status for a connected online user", async () => {
    const { app, sessionStore } = presenceApp({ isConnected: () => true });
    sessionStore.createSession(ALICE_ID, "tok");
    const res = await request(app)
      .get("/api/presence?username=alice")
      .set("Cookie", "sid=tok");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      username: "alice",
      status: "online",
      rawStatus: "online",
    });
  });

  test("returns offline for a disconnected user even if last_seen is fresh", async () => {
    const { app, sessionStore } = presenceApp({ isConnected: () => false });
    sessionStore.createSession(ALICE_ID, "tok");
    const res = await request(app)
      .get("/api/presence?username=alice")
      .set("Cookie", "sid=tok");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("offline");
    expect(res.body.rawStatus).toBe("online");
  });

  test("returns offline with rawStatus invisible for a connected invisible user", async () => {
    const { app, sessionStore } = presenceApp({
      isConnected: () => true,
      status: "invisible",
    });
    sessionStore.createSession(ALICE_ID, "tok");
    const res = await request(app)
      .get("/api/presence?username=alice")
      .set("Cookie", "sid=tok");
    expect(res.body.status).toBe("offline");
    expect(res.body.rawStatus).toBe("invisible");
  });

  test("404 for unknown user", async () => {
    const { app, sessionStore } = presenceApp();
    sessionStore.createSession(ALICE_ID, "tok");
    const res = await request(app)
      .get("/api/presence?username=nobody")
      .set("Cookie", "sid=tok");
    expect(res.status).toBe(404);
  });
});

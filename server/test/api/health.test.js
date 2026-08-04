import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

describe("GET /api/health", () => {
  test("returns 200 with { ok: true }", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("GET /api/events (SSE)", () => {
  test("calls connectPresence on open and disconnectPresence on close", async () => {
    const connectPresence = vi.fn();
    const disconnectPresence = vi.fn();
    const { app, sessionStore } = makeApp({
      userStore: makeUserStore([{ id: 1, username: "alice", status: "online" }]),
      deps: { connectPresence, disconnectPresence },
    });
    sessionStore.createSession(1, "sse-token");

    let req;
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("SSE response timed out")),
          4000,
        );
        req = request(app)
          .get("/api/events?username=alice")
          .set("Cookie", "sid=sse-token")
          .buffer(false)
          .on("response", (res) => {
            res.on("error", () => {});
            clearTimeout(timer);
            resolve();
          })
          .on("error", () => {});
        req.end();
      });

      expect(connectPresence).toHaveBeenCalledWith("alice", expect.anything());
      expect(disconnectPresence).not.toHaveBeenCalled();

      req.req.destroy();
      await vi.waitFor(() => {
        expect(disconnectPresence).toHaveBeenCalledWith(
          "alice",
          expect.anything(),
        );
      });
    } finally {
      req?.req?.destroy?.();
    }
  });
});

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";
import { resolveTurnConfig } from "../../lib/turnConfig.js";

const ENV_KEYS = [
  "TURN_STUN_URL",
  "TURN_URL",
  "TURN_USERNAME",
  "TURN_CREDENTIAL",
  "TURN_TOKEN_ID",
  "TURN_API_TOKEN",
];
let savedEnv = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function setupAdminApp(secrets = {}) {
  const sessionStore = makeSessionStore();
  const userStore = makeUserStore([
    { id: "u-admin", username: "admin", nickname: "Admin", role: "admin" },
    { id: "u-user", username: "user", nickname: "User", role: "user" },
  ]);
  sessionStore.createSession("u-admin", "sid-admin");
  sessionStore.createSession("u-user", "sid-user");
  const store = new Map(Object.entries(secrets));
  const dbGetSetting = (key) => store.get(key) ?? null;
  const dbSetSetting = vi.fn((key, value) => store.set(key, value));
  const dbDeleteSetting = vi.fn((key) => store.delete(key));
  const dbSave = vi.fn();
  const writeAdminAuditLog = vi.fn();
  const checkTurnHealth = vi.fn(async () => ({
    configured: true,
    managed: false,
    reachable: true,
    latencyMs: 12,
  }));
  const { app } = makeApp({
    sessionStore,
    userStore,
    deps: {
      isUserAdmin: (id) => id === "u-admin",
      dbGetSetting,
      dbSetSetting,
      dbDeleteSetting,
      dbSave,
      writeAdminAuditLog,
      checkTurnHealth,
      resolveTurnConfig: () => resolveTurnConfig({ dbGetSetting }),
    },
  });
  return {
    app,
    store,
    dbSetSetting,
    dbDeleteSetting,
    dbSave,
    writeAdminAuditLog,
    checkTurnHealth,
  };
}

describe("admin TURN configuration", () => {
  test("status reports flags and never returns secret values", async () => {
    const { app } = setupAdminApp({
      TURN_URL: "turn:relay.example.com:3478",
      TURN_USERNAME: "songbird",
      TURN_CREDENTIAL: "super-secret-credential",
      TURN_API_TOKEN: "cf-secret-token",
    });
    const res = await request(app)
      .get("/api/admin/turn/status")
      .set("Cookie", "sid=sid-admin");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("self-hosted");
    expect(res.body.turnUrl).toBe("turn:relay.example.com:3478");
    expect(res.body.hasCredential).toBe(true);
    expect(res.body.hasApiToken).toBe(true);
    expect(res.body).not.toHaveProperty("credential");
    expect(res.body).not.toHaveProperty("apiToken");
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("super-secret-credential");
    expect(raw).not.toContain("cf-secret-token");
  });

  test("PUT writes only the supplied config keys", async () => {
    const { app, dbSetSetting, store } = setupAdminApp();
    const res = await request(app)
      .put("/api/admin/turn/config")
      .set("Cookie", "sid=sid-admin")
      .send({
        turnUrl: "turn:relay.example.com:3478",
        username: "songbird",
        credential: "new-password",
      });
    expect(res.status).toBe(200);
    expect(dbSetSetting.mock.calls).toEqual([
      ["TURN_URL", "turn:relay.example.com:3478"],
      ["TURN_USERNAME", "songbird"],
      ["TURN_CREDENTIAL", "new-password"],
    ]);
    expect(store.get("TURN_CREDENTIAL")).toBe("new-password");
  });

  test("PUT ignores an env-managed TURN URL", async () => {
    process.env.TURN_URL = "turn:env.example.com:3478";
    const { app, dbSetSetting } = setupAdminApp();
    const res = await request(app)
      .put("/api/admin/turn/config")
      .set("Cookie", "sid=sid-admin")
      .send({
        turnUrl: "turn:panel.example.com:3478",
        username: "u",
        credential: "c",
      });
    expect(res.status).toBe(200);
    expect(dbSetSetting.mock.calls).toEqual([
      ["TURN_USERNAME", "u"],
      ["TURN_CREDENTIAL", "c"],
    ]);
  });

  test("PUT rejects half-configured Cloudflare keys without writing", async () => {
    const { app, dbSetSetting } = setupAdminApp();
    const res = await request(app)
      .put("/api/admin/turn/config")
      .set("Cookie", "sid=sid-admin")
      .send({ tokenId: "cf-key" });
    expect(res.status).toBe(400);
    expect(dbSetSetting).not.toHaveBeenCalled();
  });

  test("PUT rejects blank values without deleting anything", async () => {
    const { app, dbDeleteSetting, dbSetSetting } = setupAdminApp({
      TURN_URL: "turn:relay.example.com:3478",
      TURN_USERNAME: "u",
      TURN_CREDENTIAL: "old-password",
    });
    const res = await request(app)
      .put("/api/admin/turn/config")
      .set("Cookie", "sid=sid-admin")
      .send({ credential: "" });
    expect(res.status).toBe(400);
    expect(dbDeleteSetting).not.toHaveBeenCalled();
    expect(dbSetSetting).not.toHaveBeenCalled();
  });

  test("DELETE config wipes saved keys but leaves env-managed ones", async () => {
    process.env.TURN_URL = "turn:env.example.com:3478";
    const { app, dbDeleteSetting } = setupAdminApp({
      TURN_CREDENTIAL: "old-password",
      TURN_TOKEN_ID: "cf-key",
      TURN_API_TOKEN: "cf-token",
    });
    const res = await request(app)
      .delete("/api/admin/turn/config")
      .set("Cookie", "sid=sid-admin");
    expect(res.status).toBe(200);
    expect(dbDeleteSetting.mock.calls).toEqual([
      ["TURN_STUN_URL"],
      ["TURN_USERNAME"],
      ["TURN_CREDENTIAL"],
      ["TURN_TOKEN_ID"],
      ["TURN_API_TOKEN"],
    ]);
  });

  test("PUT with a mode clears the other mode's saved keys", async () => {
    const { app, dbDeleteSetting, dbSetSetting } = setupAdminApp({
      TURN_TOKEN_ID: "cf-key",
      TURN_API_TOKEN: "cf-token",
    });
    const res = await request(app)
      .put("/api/admin/turn/config")
      .set("Cookie", "sid=sid-admin")
      .send({
        mode: "self-hosted",
        stunUrl: "stun:stun.l.google.com:19302",
        turnUrl: "turn:relay.example.com:3478",
        username: "songbird",
        credential: "password",
      });
    expect(res.status).toBe(200);
    expect(dbDeleteSetting.mock.calls).toEqual([
      ["TURN_TOKEN_ID"],
      ["TURN_API_TOKEN"],
    ]);
    expect(dbSetSetting.mock.calls).toContainEqual([
      "TURN_CREDENTIAL",
      "password",
    ]);
  });

  test("audit log never records secret values", async () => {
    const { app, writeAdminAuditLog } = setupAdminApp();
    await request(app)
      .put("/api/admin/turn/config")
      .set("Cookie", "sid=sid-admin")
      .send({
        tokenId: "cf-key",
        apiToken: "cf-token-secret",
      });
    expect(writeAdminAuditLog).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(writeAdminAuditLog.mock.calls[0][0])).not.toContain(
      "cf-token-secret",
    );
  });

  test("non-admin cannot access setup endpoints", async () => {
    const { app } = setupAdminApp();
    expect(
      (
        await request(app)
          .get("/api/admin/turn/status")
          .set("Cookie", "sid=sid-user")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .put("/api/admin/turn/config")
          .set("Cookie", "sid=sid-user")
          .send({ tokenId: "a", apiToken: "b" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/admin/turn/test")
          .set("Cookie", "sid=sid-user")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete("/api/admin/turn/config")
          .set("Cookie", "sid=sid-user")
      ).status,
    ).toBe(403);
  });

  test("POST test probes the effective config", async () => {
    const { app, checkTurnHealth } = setupAdminApp({
      TURN_URL: "turn:relay.example.com:3478",
    });
    const res = await request(app)
      .post("/api/admin/turn/test")
      .set("Cookie", "sid=sid-admin");
    expect(res.status).toBe(200);
    expect(res.body.reachable).toBe(true);
    expect(checkTurnHealth).toHaveBeenCalledTimes(1);
    expect(checkTurnHealth.mock.calls[0][0]).toEqual({
      TURN_TOKEN_ID: "",
      TURN_API_TOKEN: "",
      TURN_URL: "turn:relay.example.com:3478",
    });
  });
});

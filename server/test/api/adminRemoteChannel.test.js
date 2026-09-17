import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

// The dev machine's root .env may hold real Telegram creds (env wins over DB
// by design). Strip them so endpoint tests exercise the DB-backed flow.
const ENV_KEYS = [
  "REMOTE_CHANNEL_TELEGRAM_API_ID",
  "REMOTE_CHANNEL_TELEGRAM_API_HASH",
  "REMOTE_CHANNEL_TELEGRAM_SESSION_STRING",
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

function setupAdminApp(overrides = {}) {
  const sessionStore = makeSessionStore();
  const userStore = makeUserStore([
    {
      id: "u-admin",
      username: "admin",
      nickname: "Admin",
      role: "admin",
      status: "online",
    },
    {
      id: "u-user",
      username: "user",
      nickname: "User",
      role: "user",
      status: "online",
    },
  ]);
  sessionStore.createSession("u-admin", "sid-admin");
  sessionStore.createSession("u-user", "sid-user");
  const reloadConfig = vi.fn(async () => ({}));
  const store = new Map(Object.entries(overrides.secrets ?? {}));
  const dbSetSetting = vi.fn((key, value) => store.set(key, value));
  const dbDeleteSetting = vi.fn((key) => store.delete(key));
  const { app } = makeApp({
    sessionStore,
    userStore,
    settings: {
      REMOTE_CHANNEL: true,
      REMOTE_CHANNEL_TELEGRAM_PROXY_URL: "",
    },
    deps: {
      isUserAdmin: (id) => id === "u-admin",
      remoteChannelManager: {
        getHealth: () => ({ enabled: true }),
        reloadConfig,
      },
      dbGetSetting: (key) => store.get(key) ?? null,
      dbSetSetting,
      dbDeleteSetting,
      ...overrides.deps,
    },
  });
  return { app, reloadConfig, store, dbSetSetting, dbDeleteSetting };
}

describe("admin remote-channel setup", () => {
  test("GET status exposes flags but never secrets", async () => {
    const { app } = setupAdminApp();
    const res = await request(app)
      .get("/api/admin/remote-channel/status")
      .set("Cookie", "sid=sid-admin");
    expect(res.status).toBe(200);
    expect(res.body.hasSession).toBe(false);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("SESSION_STRING");
    expect(raw).not.toContain("API_HASH");
    expect(res.body.managedByEnv).toEqual({ apiId: false, apiHash: false, sessionString: false });
  });

  test("non-admin cannot access setup endpoints", async () => {
    const { app } = setupAdminApp();
    const res = await request(app)
      .get("/api/admin/remote-channel/status")
      .set("Cookie", "sid=sid-user");
    expect(res.status).toBe(403);
  });

  test("send-code rejects bad input before any network", async () => {
    const { app } = setupAdminApp();
    const badPhone = await request(app)
      .post("/api/admin/remote-channel/send-code")
      .set("Cookie", "sid=sid-admin")
      .send({ apiId: 123, apiHash: "hash", phoneNumber: "not-a-phone" });
    expect(badPhone.status).toBe(400);
    const badId = await request(app)
      .post("/api/admin/remote-channel/send-code")
      .set("Cookie", "sid=sid-admin")
      .send({ apiId: 0, apiHash: "hash", phoneNumber: "+15551234567" });
    expect(badId.status).toBe(400);
  });

  test("sign-in without pending login fails cleanly", async () => {
    const { app } = setupAdminApp();
    const res = await request(app)
      .post("/api/admin/remote-channel/sign-in")
      .set("Cookie", "sid=sid-admin")
      .send({ code: "12345" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/code first/i);
  });

  test("DELETE session clears, hot-reloads, and flips the live flag", async () => {
    const remoteChannels = { enabled: true, telegramConfigured: true };
    const { app, reloadConfig, store, dbDeleteSetting } = setupAdminApp({
      secrets: {
        REMOTE_CHANNEL_TELEGRAM_API_ID: "123",
        REMOTE_CHANNEL_TELEGRAM_API_HASH: "hash",
        REMOTE_CHANNEL_TELEGRAM_SESSION_STRING: "sess",
      },
      deps: { REMOTE_CHANNELS: remoteChannels },
    });
    expect(store.has("REMOTE_CHANNEL_TELEGRAM_SESSION_STRING")).toBe(true);
    const res = await request(app)
      .delete("/api/admin/remote-channel/session")
      .set("Cookie", "sid=sid-admin");
    expect(res.status).toBe(200);
    expect(dbDeleteSetting).toHaveBeenCalledWith(
      "REMOTE_CHANNEL_TELEGRAM_SESSION_STRING",
    );
    expect(store.has("REMOTE_CHANNEL_TELEGRAM_SESSION_STRING")).toBe(false);
    expect(reloadConfig).toHaveBeenCalled();
    // Channel routes gate on this live object — no restart required.
    expect(remoteChannels.telegramConfigured).toBe(false);
  });

  test("test without credentials fails fast without network", async () => {
    const { app } = setupAdminApp();
    const res = await request(app)
      .post("/api/admin/remote-channel/test")
      .set("Cookie", "sid=sid-admin");
    expect(res.status).toBe(400);
  });

  test("status reflects DB-stored credentials without leaking them", async () => {
    const { app } = setupAdminApp({
      secrets: {
        REMOTE_CHANNEL_TELEGRAM_API_ID: "123",
        REMOTE_CHANNEL_TELEGRAM_API_HASH: "secret-hash-value",
        REMOTE_CHANNEL_TELEGRAM_SESSION_STRING: "secret-session-value",
      },
    });
    const res = await request(app)
      .get("/api/admin/remote-channel/status")
      .set("Cookie", "sid=sid-admin");
    expect(res.status).toBe(200);
    expect(res.body.hasSession).toBe(true);
    expect(res.body.hasApiCredentials).toBe(true);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("secret-hash-value");
    expect(raw).not.toContain("secret-session-value");
  });
});

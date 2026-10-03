import { describe, test, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";

import {
  makeApp,
  makeSessionStore,
  makeUserStore,
} from "../helpers/makeApp.js";

function setupSecretsApp({ isOwner = true } = {}) {
  const sessionStore = makeSessionStore();
  const userStore = makeUserStore([
    {
      id: "u-1",
      username: "boss",
      nickname: "Boss",
      role: "user",
      status: "online",
    },
  ]);
  sessionStore.createSession("u-1", "sid-1");
  const { app } = makeApp({
    sessionStore,
    userStore,
    deps: {
      isUserAdmin: () => true,
      isUserOwner: () => isOwner,
    },
  });
  return { app };
}

describe("GET /api/admin/secrets", () => {
  let oldCron, oldWebhook, oldAdmin;
  beforeEach(() => {
    oldCron = process.env.REMOTE_CHANNEL_CRON_SECRET;
    oldWebhook = process.env.WEBHOOK_SECRET;
    oldAdmin = process.env.ADMIN_API_TOKEN;
    process.env.REMOTE_CHANNEL_CRON_SECRET = "cron-secret";
    process.env.WEBHOOK_SECRET = "webhook-secret";
    process.env.ADMIN_API_TOKEN = "admin-token";
  });
  afterEach(() => {
    if (oldCron === undefined) delete process.env.REMOTE_CHANNEL_CRON_SECRET;
    else process.env.REMOTE_CHANNEL_CRON_SECRET = oldCron;
    if (oldWebhook === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = oldWebhook;
    if (oldAdmin === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = oldAdmin;
  });

  test("owner receives all three secrets", async () => {
    const { app } = setupSecretsApp({ isOwner: true });
    const res = await request(app)
      .get("/api/admin/secrets")
      .set("Cookie", "sid=sid-1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      cronSecret: "cron-secret",
      webhookSecret: "webhook-secret",
      adminApiToken: "admin-token",
    });
  });

  test("admin (non-owner) is denied", async () => {
    const { app } = setupSecretsApp({ isOwner: false });
    const res = await request(app)
      .get("/api/admin/secrets")
      .set("Cookie", "sid=sid-1");
    expect(res.status).toBe(403);
  });

  test("unauthenticated requests are denied", async () => {
    const { app } = setupSecretsApp({ isOwner: true });
    const res = await request(app).get("/api/admin/secrets");
    expect(res.status).toBe(401);
  });

  test("services payload no longer leaks the tick secret to admins", async () => {
    const { app } = setupSecretsApp({ isOwner: false });
    const res = await request(app)
      .get("/api/admin/services")
      .set("Cookie", "sid=sid-1");
    expect(res.status).toBe(200);
    expect(res.body.remoteChannel?.tickCronSecret).toBeUndefined();
  });
});

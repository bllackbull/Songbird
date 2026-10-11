import { describe, test, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

// ─── /api/app/info ────────────────────────────────────────────────────────────
//
// Every setting that the admin panel can change must be reflected in the
// /api/app/info response so that client-side code can pick it up on page load
// without needing a rebuild or server restart (for non-restart-required keys).
//
// Tests are grouped by the SettingsTab group they belong to.

describe("GET /api/app/info", () => {
  // ── Shape ──────────────────────────────────────────────────────────────────

  test("returns 200 with all expected fields present", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/app/info");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      // Registration
      accountCreationEnabled: expect.any(Boolean),
      // Limits
      messageMaxChars: expect.any(Number),
      usernameMaxChars: expect.any(Number),
      nicknameMaxChars: expect.any(Number),
      // File uploads
      fileUploadEnabled: expect.any(Boolean),
      fileUploadMaxFiles: expect.any(Number),
      fileUploadMaxSizeMb: expect.any(Number),
      fileUploadMaxTotalSizeMb: expect.any(Number),
      // Client behaviour
      chatMessageFetchLimit: expect.any(Number),
      chatMessagePageSize: expect.any(Number),
      chatCacheTtlHours: expect.any(Number),
      // Remote channels object
      remoteChannels: expect.any(Object),
    });
  });

  // ── Registration ───────────────────────────────────────────────────────────

  test('SIGN_UP=false → accountCreationEnabled is false', async () => {
    const { app } = makeApp({ settings: { SIGN_UP: false } });
    const res = await request(app).get("/api/app/info");
    expect(res.status).toBe(200);
    expect(res.body.accountCreationEnabled).toBe(false);
  });

  test('SIGN_UP=true → accountCreationEnabled is true', async () => {
    const { app } = makeApp({ settings: { SIGN_UP: true } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.accountCreationEnabled).toBe(true);
  });

  // ── Limits ─────────────────────────────────────────────────────────────────

  test('MESSAGE_MAX_CHARS=500 → messageMaxChars is 500', async () => {
    const { app } = makeApp({ settings: { MESSAGE_MAX_CHARS: 500 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.messageMaxChars).toBe(500);
  });

  test('USERNAME_MAX_CHARS=20 → usernameMaxChars is 20', async () => {
    const { app } = makeApp({ settings: { USERNAME_MAX_CHARS: 20 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.usernameMaxChars).toBe(20);
  });

  test('NICKNAME_MAX_CHARS=30 → nicknameMaxChars is 30', async () => {
    const { app } = makeApp({ settings: { NICKNAME_MAX_CHARS: 30 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.nicknameMaxChars).toBe(30);
  });

  // ── File uploads ───────────────────────────────────────────────────────────

  test('FILE_UPLOAD=false → fileUploadEnabled is false', async () => {
    const { app } = makeApp({ settings: { FILE_UPLOAD: false } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.fileUploadEnabled).toBe(false);
  });

  test('FILE_UPLOAD=true → fileUploadEnabled is true', async () => {
    const { app } = makeApp({ settings: { FILE_UPLOAD: true } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.fileUploadEnabled).toBe(true);
  });

  test('FILE_UPLOAD_MAX_FILES=3 → fileUploadMaxFiles is 3', async () => {
    const { app } = makeApp({ settings: { FILE_UPLOAD_MAX_FILES: 3 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.fileUploadMaxFiles).toBe(3);
  });

  test('FILE_UPLOAD_MAX_SIZE_MB=50 → fileUploadMaxSizeMb is 50', async () => {
    const { app } = makeApp({ settings: { FILE_UPLOAD_MAX_SIZE_MB: 50 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.fileUploadMaxSizeMb).toBe(50);
  });

  test('FILE_UPLOAD_MAX_TOTAL_SIZE_MB=200 → fileUploadMaxTotalSizeMb is 200', async () => {
    const { app } = makeApp({ settings: { FILE_UPLOAD_MAX_TOTAL_SIZE_MB: 200 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.fileUploadMaxTotalSizeMb).toBe(200);
  });

  // ── Client behaviour ───────────────────────────────────────────────────────

  test('CHAT_MESSAGE_FETCH_LIMIT=30 → chatMessageFetchLimit is 30', async () => {
    const { app } = makeApp({ settings: { CHAT_MESSAGE_FETCH_LIMIT: 30 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.chatMessageFetchLimit).toBe(30);
  });

  test('CHAT_MESSAGE_PAGE_SIZE=20 → chatMessagePageSize is 20', async () => {
    const { app } = makeApp({ settings: { CHAT_MESSAGE_PAGE_SIZE: 20 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.chatMessagePageSize).toBe(20);
  });

  test('CHAT_CACHE_TTL=48 → chatCacheTtlHours is 48', async () => {
    const { app } = makeApp({ settings: { CHAT_CACHE_TTL: 48 } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.chatCacheTtlHours).toBe(48);
  });

  // ── Remote channels ────────────────────────────────────────────────────────

  test("remoteChannels.enabled is false when REMOTE_CHANNELS dep is disabled", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/app/info");
    expect(res.body.remoteChannels.enabled).toBe(false);
  });

  test('REMOTE_CHANNEL_UI=true → remoteChannels.uiEnabled is true', async () => {
    const { app } = makeApp({ settings: { REMOTE_CHANNEL_UI: true } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.remoteChannels.uiEnabled).toBe(true);
  });

  test('REMOTE_CHANNEL_UI=false → remoteChannels.uiEnabled is false', async () => {
    const { app } = makeApp({ settings: { REMOTE_CHANNEL_UI: false } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.remoteChannels.uiEnabled).toBe(false);
  });

  test('REMOTE_CHANNEL_MEDIA_STREAM=true → remoteChannels.mediaStreamEnabled is true', async () => {
    const { app } = makeApp({ settings: { REMOTE_CHANNEL_MEDIA_STREAM: true } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.remoteChannels.mediaStreamEnabled).toBe(true);
  });

  test('REMOTE_CHANNEL_MEDIA_STREAM=false → remoteChannels.mediaStreamEnabled is false', async () => {
    const { app } = makeApp({ settings: { REMOTE_CHANNEL_MEDIA_STREAM: false } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.remoteChannels.mediaStreamEnabled).toBe(false);
  });
});

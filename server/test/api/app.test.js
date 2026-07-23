import { describe, test, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

describe("GET /api/app/info", () => {
  test("returns 200 with expected shape", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/app/info");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      accountCreationEnabled: expect.any(Boolean),
      fileUploadEnabled: expect.any(Boolean),
      messageMaxChars: expect.any(Number),
      usernameMaxChars: expect.any(Number),
      nicknameMaxChars: expect.any(Number),
      remoteChannels: expect.any(Object),
    });
  });

  test('reflects getSetting("SIGN_UP") = false in accountCreationEnabled', async () => {
    const { app } = makeApp({ settings: { SIGN_UP: false } });
    const res = await request(app).get("/api/app/info");
    expect(res.status).toBe(200);
    expect(res.body.accountCreationEnabled).toBe(false);
  });

  test('reflects getSetting("FILE_UPLOAD") = false in fileUploadEnabled', async () => {
    const { app } = makeApp({ settings: { FILE_UPLOAD: false } });
    const res = await request(app).get("/api/app/info");
    expect(res.body.fileUploadEnabled).toBe(false);
  });

  test("remoteChannels.enabled is false when REMOTE_CHANNELS is disabled", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/app/info");
    expect(res.body.remoteChannels.enabled).toBe(false);
  });
});

import { describe, test, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

const presignPayload = {
  filename: "rate-limit-test.png",
  contentType: "image/png",
  fileSize: 1024,
};

function makeAuthedApp() {
  const appObj = makeApp({});
  const userId = appObj.userStore.createUser(
    "presignuser",
    "pass",
    "Presign User",
    null,
    "#10b981",
  );
  const token = `presign-token-${Math.random().toString(36).slice(2)}`;
  appObj.sessionStore.createSession(userId, token);
  return { appObj, cookie: `sid=${token}` };
}

describe("POST /api/uploads/presign rate limiting", () => {
  test("rejects unauthenticated presign with 401", async () => {
    const { appObj } = makeAuthedApp();
    const res = await request(appObj.app)
      .post("/api/uploads/presign")
      .send(presignPayload);
    expect(res.status).toBe(401);
  });

  test("allows presign under the limit with rate-limit headers", async () => {
    const { appObj, cookie } = makeAuthedApp();
    const res = await request(appObj.app)
      .post("/api/uploads/presign")
      .set("Cookie", [cookie])
      .send(presignPayload);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // express-rate-limit draft-6 standard headers
    expect(res.headers["ratelimit-limit"]).toBe("30");
  });

  test("returns 429 JSON after 30 presigns within a minute", async () => {
    const { appObj, cookie } = makeAuthedApp();
    let lastRes = null;
    for (let i = 0; i < 31; i++) {
      lastRes = await request(appObj.app)
        .post("/api/uploads/presign")
        .set("Cookie", [cookie])
        .send(presignPayload);
      if (i < 30) {
        expect(lastRes.status).toBe(200);
      }
    }
    expect(lastRes.status).toBe(429);
    expect(lastRes.body.error).toMatch(/too many upload requests/i);
  });
});

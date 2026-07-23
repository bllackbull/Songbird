import { describe, test, expect } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

describe("GET /api/health", () => {
  test("returns 200 with { ok: true }", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

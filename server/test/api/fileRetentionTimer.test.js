import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import path from "path";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";
import { normalizeSqlForPostgres } from "../../lib/sqlNormalizer.js";

const ALICE_ID = "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4";
const CHAT_ID = "c0c0c0c0-d1d1-4e2e-af3f-060606060606";
const MSG_ID = "d0d0d0d0-e1e1-4f2f-b040-171717171717";

function makeAppWithUser(settingsOverrides = {}) {
  const hash = bcrypt.hashSync("secret123", 4);
  const userStore = makeUserStore([
    {
      id: ALICE_ID,
      username: "alice",
      password_hash: hash,
      nickname: "Alice",
      avatar_url: null,
      color: "#10b981",
      status: "online",
      role: "user",
      banned: false,
    },
  ]);
  const emitChatEvent = vi.fn();
  const settings = {
    FILE_UPLOAD: true,
    MESSAGE_FILE_RETENTION: 7,
    ...settingsOverrides,
  };
  const MESSAGE_FILE_LIMITS = {
    maxFiles: 10,
    maxTotalBytes: 100 * 1024 * 1024,
  };
  const appObj = makeApp({
    userStore,
    settings,
    MESSAGE_FILE_LIMITS,
    deps: {
      emitChatEvent,
      findChatById: () => ({ id: CHAT_ID, type: "group", name: "Test Group" }),
      findUserByUsername: (u) => userStore.findUserByUsername(u),
      isMember: () => true,
      createOrReuseMessage: () => ({ id: MSG_ID, deduped: false }),
      createMessageFiles: vi.fn(),
      listMessageFilesByMessageIds: () => [],
      computeExpiryIso: (created, days) =>
        days > 0 ? "2026-08-18T12:00:00.000Z" : null,
      listChatMembers: () => [],
      inferMimeFromFilename: (f) => "application/pdf",
      decodeOriginalFilename: (f) => f,
      isDangerousUploadFile: () => false,
      path,
      hasEnoughFreeDiskSpace: () => true,
      sanitizePositiveInt: (v) => v || null,
      sanitizeDurationSeconds: (v) => v || null,
      parseUploadFileMetadata: () => ({}),
      storageEncryption: { encryptFileInPlace: () => {} },
      getUploadKind: () => "document",
      uploadFiles: {
        array: () => (req, _res, next) => {
          req.files = [
            {
              originalname: "doc.pdf",
              mimetype: "application/pdf",
              filename: "doc.pdf",
              size: 100,
            },
          ];
          req.body = req.body || {};
          req.body.chatId = req.body.chatId || CHAT_ID;
          req.body.username = req.body.username || "alice";
          req.body.uploadType = req.body.uploadType || "document";
          next();
        },
      },
    },
  });
  return { ...appObj, emitChatEvent };
}

async function loginAndGetCookie(app) {
  const res = await request(app)
    .post("/api/login")
    .send({ username: "alice", password: "secret123" });
  return res.headers["set-cookie"];
}

describe("Issue 1: File Retention Expiry Payload in /api/messages/upload and SSE", () => {
  test("POST /api/messages/upload returns file objects with expiresAt / expires_at and emits them via SSE", async () => {
    const { app, emitChatEvent } = makeAppWithUser({
      MESSAGE_FILE_RETENTION: 7,
    });
    const cookie = await loginAndGetCookie(app);

    const res = await request(app)
      .post("/api/messages/upload")
      .set("Cookie", cookie)
      .field("chatId", CHAT_ID)
      .field("username", "alice")
      .field("uploadType", "document");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(MSG_ID);

    // Verify response JSON includes files array with expiresAt / expires_at
    expect(res.body).toHaveProperty("files");
    expect(Array.isArray(res.body.files)).toBe(true);
    expect(res.body.files.length).toBeGreaterThan(0);
    expect(res.body.files[0]).toHaveProperty("expiresAt");
    expect(res.body.files[0].expiresAt).toBe("2026-08-18T12:00:00.000Z");

    // Verify SSE payload includes files array with expiresAt / expires_at
    expect(emitChatEvent).toHaveBeenCalled();
    const chatEventPayload = emitChatEvent.mock.calls[0][1];
    expect(chatEventPayload.type).toBe("chat_message");
    expect(chatEventPayload).toHaveProperty("files");
    expect(Array.isArray(chatEventPayload.files)).toBe(true);
    expect(chatEventPayload.files.length).toBeGreaterThan(0);
    expect(chatEventPayload.files[0]).toHaveProperty("expiresAt");
    expect(chatEventPayload.files[0].expiresAt).toBe(
      "2026-08-18T12:00:00.000Z",
    );
  });
});

describe("Issue 3: PostgreSQL query normalization for SQLite datetime(...)", () => {
  test("normalizeSqlForPostgres handles UPDATE SET expires_at = datetime(created_at, '+' || ? || ' days')", () => {
    const sql = `UPDATE chat_message_files SET expires_at = datetime(created_at, '+' || ? || ' days') WHERE (expires_at IS NULL OR expires_at = '')`;
    const normalized = normalizeSqlForPostgres(sql, [7]);
    expect(normalized.sql).not.toContain("datetime(");
    expect(normalized.sql).toMatch(/created_at/i);
    expect(normalized.sql).toMatch(/interval/i);
  });
});

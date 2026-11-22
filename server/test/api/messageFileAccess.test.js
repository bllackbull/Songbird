import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import multer from "multer";
import { createUploadTools } from "../../lib/uploads.js";

const STORED_NAME = "photo-from-a.png";
const CHAT_ID = "chat-a-b";
const FILE_ROW = {
  original_name: "photo.png",
  mime_type: "",
  storage_key: null,
  storage_driver: "local",
  chat_id: CHAT_ID,
};

function buildApp({ session = null, isMemberResult = true, rows = null, storageProvider = null } = {}) {
  const uploadRootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "songbird-access-"),
  );
  const avatarUploadRootDir = path.join(uploadRootDir, "avatars");
  fs.writeFileSync(path.join(uploadRootDir, STORED_NAME), "encrypted-bytes");

  const tools = createUploadTools({
    fs,
    path,
    crypto,
    multer,
    adminGetRow: () => fileRow,
    adminRun: () => {},
    adminSave: () => {},
    uploadRootDir,
    avatarUploadRootDir,
    fileUploadMaxSize: 10 * 1024 * 1024,
    fileUploadMaxFiles: 10,
    fileUploadMaxTotalSize: 50 * 1024 * 1024,
    storageEncryption: {
      encryptFileInPlace: () => true,
      decryptBuffer: (buf) => buf,
      decryptFileToBuffer: () => Buffer.from("photo-bytes"),
      getDecryptedFileSize: () => 11,
    },
    storageProvider,
  });

  const app = express();
  tools.registerUploadRoutes(app, {
    adminGetRow: () => FILE_ROW,
    adminGetAll: () => rows || [FILE_ROW],
    requireSession: async (_req, res) => {
      if (!session) {
        res.status(401).json({ error: "Not authenticated." });
        return null;
      }
      return session;
    },
    isMember: async (chatId) =>
      typeof isMemberResult === "function"
        ? isMemberResult(chatId)
        : isMemberResult,
  });

  return { app, uploadRootDir };
}

let uploadRootDir;

afterEach(() => {
  if (uploadRootDir) fs.rmSync(uploadRootDir, { recursive: true, force: true });
});

describe("GET /api/uploads/messages/:storedName access control", () => {
  it("rejects anonymous requests", async () => {
    const built = buildApp({ session: null });
    uploadRootDir = built.uploadRootDir;

    const res = await request(built.app).get(
      `/api/uploads/messages/${STORED_NAME}`,
    );

    expect(res.status).toBe(401);
  });

  it("rejects an authenticated user who is not a member of the file's chat", async () => {
    const built = buildApp({
      session: { id: "user-c" },
      isMemberResult: false,
    });
    uploadRootDir = built.uploadRootDir;

    const res = await request(built.app)
      .get(`/api/uploads/messages/${STORED_NAME}`)
      .set("Cookie", ["sid=user-c"]);

    expect(res.status).toBe(403);
  });

  it("allows a member of any chat holding a forwarded copy with the same stored name", async () => {
    const foreignRow = { ...FILE_ROW, chat_id: "chat-a-c" };
    const ownRow = { ...FILE_ROW, chat_id: CHAT_ID };
    const built = buildApp({
      session: { id: "user-b" },
      rows: [foreignRow, ownRow],
      isMemberResult: (chatId) => chatId === CHAT_ID,
    });
    uploadRootDir = built.uploadRootDir;

    const res = await request(built.app)
      .get(`/api/uploads/messages/${STORED_NAME}`)
      .set("Cookie", ["sid=user-b"]);

    expect(res.status).toBe(200);
  });

  it("serves the file to an authenticated member of the file's chat", async () => {
    const built = buildApp({ session: { id: "user-b" }, isMemberResult: true });
    uploadRootDir = built.uploadRootDir;

    const res = await request(built.app)
      .get(`/api/uploads/messages/${STORED_NAME}`)
      .set("Cookie", ["sid=user-b"]);

    expect(res.status).toBe(200);
    expect(res.headers["content-length"]).toBe("11");
  });

  it("redirects remote files to a short-lived presigned URL, not the public CDN URL", async () => {
    const getDownloadUrl = vi.fn(async () => "https://signed.example.com/photo?sig=abc");
    const built = buildApp({
      session: { id: "user-b" },
      rows: [{ ...FILE_ROW, storage_driver: "remote" }],
      storageProvider: { type: "remote", getDownloadUrl },
    });
    uploadRootDir = built.uploadRootDir;

    const res = await request(built.app)
      .get(`/api/uploads/messages/${STORED_NAME}`)
      .set("Cookie", ["sid=user-b"]);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://signed.example.com/photo?sig=abc");
    expect(getDownloadUrl).toHaveBeenCalledWith(
      `uploads/messages/${STORED_NAME}`,
      { expiresIn: 300, forcePresigned: true },
    );
  });
});

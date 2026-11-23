import { describe, expect, test } from "vitest";
import request from "supertest";
import { makeApp } from "../helpers/makeApp.js";

const FILE_ID = "file-1";
const STORAGE_KEY = "uploads/messages/pending.png";

function appFor({
  user = null,
  file,
  isMember = () => false,
  isPendingUploadOwner = () => false,
  adminGetRow = () => null,
}) {
  return makeApp({
    deps: {
      adminGetRow,
      requireSession: async (_req, res) => {
        if (!user) {
          res.status(401).json({ error: "Not authenticated." });
          return null;
        }
        return { id: user };
      },
      isMember,
      isPendingUploadOwner,
      findMessageFileById: (id) => (String(id) === FILE_ID ? file : null),
    },
  });
}

const sentFile = {
  id: FILE_ID,
  message_id: "msg-1",
  storage_key: STORAGE_KEY,
  storage_driver: "local",
  mime_type: "image/png",
};

const pendingFile = {
  id: FILE_ID,
  message_id: 0,
  storage_key: STORAGE_KEY,
  storage_driver: "local",
  mime_type: "image/png",
};

describe("GET /api/uploads/file/:id access control", () => {
  test("rejects anonymous requests", async () => {
    const appObj = appFor({ file: sentFile });
    expect(
      (await request(appObj.app).get(`/api/uploads/file/${FILE_ID}`)).status,
    ).toBe(401);
  });

  test("rejects a non-member for a file attached to a message", async () => {
    const appObj = appFor({
      user: "user-c",
      file: sentFile,
      isMember: () => false,
    });
    expect(
      (await request(appObj.app).get(`/api/uploads/file/${FILE_ID}`)).status,
    ).toBe(403);
  });

  test("allows a member of the file's chat", async () => {
    const appObj = appFor({
      user: "user-b",
      file: sentFile,
      isMember: (chatId, userId) => chatId === "chat-1" && userId === "user-b",
      adminGetRow: (sql) =>
        String(sql).includes("chat_messages") ? { chat_id: "chat-1" } : null,
    });

    expect(
      (await request(appObj.app).get(`/api/uploads/file/${FILE_ID}`)).status,
    ).toBe(200);
  });

  test("allows the uploader to preview their own pending upload", async () => {
    const appObj = appFor({
      user: "user-a",
      file: pendingFile,
      isPendingUploadOwner: (key, userId) =>
        key === STORAGE_KEY && userId === "user-a",
    });
    expect(
      (await request(appObj.app).get(`/api/uploads/file/${FILE_ID}`)).status,
    ).toBe(200);
  });

  test("rejects another user previewing a pending upload", async () => {
    const appObj = appFor({
      user: "user-c",
      file: pendingFile,
      isPendingUploadOwner: (key, userId) =>
        key === STORAGE_KEY && userId === "user-a",
    });
    expect(
      (await request(appObj.app).get(`/api/uploads/file/${FILE_ID}`)).status,
    ).toBe(403);
  });
});

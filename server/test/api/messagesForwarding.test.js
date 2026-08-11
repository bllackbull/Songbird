import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const ALICE_ID = "a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4";
const SOURCE_CHAT_ID = "c0c0c0c0-d1d1-4e2e-af3f-060606060606";
const TARGET_CHAT_ID = "c1c1c1c1-d2d2-4f3f-b040-171717171717";
const SOURCE_MSG_ID = "d0d0d0d0-e1e1-4f2f-b040-171717171717";
const NEW_MSG_ID = "d1d1d1d1-e2e2-4030-c151-282828282828";

describe("POST /api/messages/forward", () => {
  test("awaits PostgreSQL message creation before writing the forward origin", async () => {
    const createMessage = vi.fn().mockResolvedValue(NEW_MSG_ID);
    const setMessageForwardOrigin = vi.fn().mockResolvedValue(undefined);
    const user = { id: ALICE_ID, username: "alice", nickname: "Alice", role: "user" };
    const sourceChat = { id: SOURCE_CHAT_ID, name: "Source", type: "group" };
    const targetChat = { id: TARGET_CHAT_ID, name: "Target", type: "group" };
    const { app, sessionStore } = makeApp({
      userStore: makeUserStore([user]),
      deps: {
        findUserByUsername: vi.fn().mockResolvedValue(user),
        findUserById: vi.fn().mockReturnValue(user),
        findMessageById: vi
          .fn()
          .mockResolvedValue({ id: SOURCE_MSG_ID, chat_id: SOURCE_CHAT_ID, user_id: ALICE_ID, body: "hello" }),
        findChatById: vi
          .fn()
          .mockImplementation(async (id) =>
            id === SOURCE_CHAT_ID ? sourceChat : targetChat,
          ),
        isMember: vi.fn().mockResolvedValue(true),
        listMessageFilesByMessageIds: vi.fn().mockResolvedValue([]),
        createMessage,
        setMessageForwardOrigin,
        emitChatEvent: vi.fn(),
      },
    });
    sessionStore.createSession(ALICE_ID, "forward-session");

    const response = await request(app)
      .post("/api/messages/forward")
      .set("Cookie", "sid=forward-session")
      .send({
        username: "alice",
        sourceMessageId: SOURCE_MSG_ID,
        targetChatIds: [TARGET_CHAT_ID],
        body: "hello",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, ids: [NEW_MSG_ID] });
    expect(setMessageForwardOrigin).toHaveBeenCalledWith(
      NEW_MSG_ID,
      expect.any(Object),
    );
  });
});

import { describe, test, expect, vi } from "vitest";
import request from "supertest";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

describe("POST /api/messages/forward", () => {
  test("awaits PostgreSQL message creation before writing the forward origin", async () => {
    const createMessage = vi.fn().mockResolvedValue(123);
    const setMessageForwardOrigin = vi.fn().mockResolvedValue(undefined);
    const user = { id: 1, username: "alice", nickname: "Alice", role: "user" };
    const sourceChat = { id: 7, name: "Source", type: "group" };
    const targetChat = { id: 9, name: "Target", type: "group" };
    const { app, sessionStore } = makeApp({
      userStore: makeUserStore([user]),
      deps: {
        findUserByUsername: vi.fn().mockResolvedValue(user),
        findUserById: vi.fn().mockReturnValue(user),
        findMessageById: vi
          .fn()
          .mockResolvedValue({ id: 55, chat_id: 7, user_id: 1, body: "hello" }),
        findChatById: vi
          .fn()
          .mockImplementation(async (id) =>
            id === 7 ? sourceChat : targetChat,
          ),
        isMember: vi.fn().mockResolvedValue(true),
        listMessageFilesByMessageIds: vi.fn().mockResolvedValue([]),
        createMessage,
        setMessageForwardOrigin,
        emitChatEvent: vi.fn(),
      },
    });
    sessionStore.createSession(1, "forward-session");

    const response = await request(app)
      .post("/api/messages/forward")
      .set("Cookie", "sid=forward-session")
      .send({
        username: "alice",
        sourceMessageId: 55,
        targetChatIds: [9],
        body: "hello",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, ids: [123] });
    expect(setMessageForwardOrigin).toHaveBeenCalledWith(
      123,
      expect.any(Object),
    );
  });
});

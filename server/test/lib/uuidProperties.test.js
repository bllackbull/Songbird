import { describe, test, expect, vi } from "vitest";
import fc from "fast-check";
import request from "supertest";
import bcrypt from "bcryptjs";
import { generateUuid, isValidUuid } from "../../lib/uuidUtils.js";
import { validateUuidParams } from "../../lib/uuidMiddleware.js";
import { makeApp, makeUserStore } from "../helpers/makeApp.js";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Property-based tests for UUIDs (Server)", () => {
  // Property 1: Entity Creation Generates Valid UUID
  test("Property 1: Entity Creation Generates Valid UUID", () => {
    fc.assert(
      fc.property(fc.nat(), () => {
        const uuid = generateUuid();
        expect(typeof uuid).toBe("string");
        expect(UUID_V4_REGEX.test(uuid)).toBe(true);
        expect(isValidUuid(uuid)).toBe(true);
      }),
      { numRuns: 100 },
    );

    const userStore = makeUserStore();
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 16 }).filter((s) => /^[a-z0-9._]+$/.test(s)),
        (username) => {
          const userId = userStore.createUser(
            username,
            "hash",
            "Nick",
            null,
            "#10b981",
          );
          expect(isValidUuid(userId)).toBe(true);
          expect(UUID_V4_REGEX.test(userId)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 2: UUID Lookup Round-Trip
  test("Property 2: UUID Lookup Round-Trip", () => {
    const userStore = makeUserStore();
    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 16 }).filter((s) => /^[a-z0-9._]+$/.test(s)),
        (username) => {
          const userId = userStore.createUser(
            username,
            "hash",
            "Nick",
            null,
            "#10b981",
          );
          const found = userStore.findUserById(userId);
          expect(found).not.toBeNull();
          expect(found.id).toBe(userId);
          expect(found.username).toBe(username);
        },
      ),
      { numRuns: 50 },
    );
  });

  // Property 3: Non-Existent UUID Returns Null
  test("Property 3: Non-Existent UUID Returns Null", () => {
    const userStore = makeUserStore();
    fc.assert(
      fc.property(fc.uuid(), (randomUuid) => {
        const found = userStore.findUserById(randomUuid);
        expect(found).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  // Property 4: Bidirectional Validation Consistency
  test("Property 4: Bidirectional Validation Consistency", () => {
    const middleware = validateUuidParams("id");

    fc.assert(
      fc.property(fc.string(), (str) => {
        const req = { params: { id: str } };
        let statusCode = null;
        let body = null;
        const res = {
          status(code) {
            statusCode = code;
            return res;
          },
          json(data) {
            body = data;
            return res;
          },
        };
        const next = vi.fn();

        middleware(req, res, next);

        const isValid = isValidUuid(str);
        const isNonEmpty = Boolean(str && str.trim());

        if (isValid) {
          expect(next).toHaveBeenCalledTimes(1);
          expect(statusCode).toBeNull();
        } else {
          expect(next).not.toHaveBeenCalled();
          expect(statusCode).toBe(400);
          if (!isNonEmpty) {
            expect(body.error).toBe("Parameter 'id' is required.");
          } else {
            expect(body.error).toBe("Parameter 'id' is not a valid UUID.");
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  // Property 5: Case-Insensitive UUID Matching
  test("Property 5: Case-Insensitive UUID Matching", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(fc.boolean(), { minLength: 36, maxLength: 36 }),
        (uuid, mask) => {
          const variant = uuid
            .split("")
            .map((char, i) => (mask[i] ? char.toUpperCase() : char.toLowerCase()))
            .join("");

          expect(isValidUuid(uuid)).toBe(true);
          expect(isValidUuid(variant)).toBe(true);
          expect(uuid.toLowerCase()).toBe(variant.toLowerCase());
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 6: Non-Existent Entity Returns 404
  test("Property 6: Non-Existent Entity Returns 404", async () => {
    const aliceId = generateUuid();
    const userStore = makeUserStore([
      {
        id: aliceId,
        username: "alice",
        password_hash: bcrypt.hashSync("secret123", 4),
        nickname: "Alice",
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);

    const { app } = makeApp({
      userStore,
      deps: {
        findChatById: () => null,
      },
    });

    const cookieRes = await request(app)
      .post("/api/login")
      .send({ username: "alice", password: "secret123" });
    const cookie = cookieRes.headers["set-cookie"];

    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (randomUuid) => {
        const res = await request(app)
          .get(`/api/chats/${randomUuid}/preview?username=alice`)
          .set("Cookie", cookie);

        expect(res.status).toBe(404);
      }),
      { numRuns: 20 },
    );
  });

  // Property 7: All Response Identifier Fields Are Valid UUIDs
  test("Property 7: All Response Identifier Fields Are Valid UUIDs", async () => {
    const aliceId = generateUuid();
    const chatId = generateUuid();
    const userStore = makeUserStore([
      {
        id: aliceId,
        username: "alice",
        password_hash: bcrypt.hashSync("secret123", 4),
        nickname: "Alice",
        avatar_url: null,
        color: "#10b981",
        status: "online",
        role: "user",
        banned: false,
      },
    ]);

    const chatRow = {
      id: chatId,
      name: "Group Chat",
      type: "group",
      created_by_user_id: aliceId,
      created_at: new Date().toISOString(),
    };

    const { app } = makeApp({
      userStore,
      deps: {
        listChatsForUser: () => [chatRow],
        listChatMembersForChats: () =>
          new Map([
            [
              chatId,
              [
                { id: aliceId, user_id: aliceId, username: "alice", role: "member" },
              ],
            ],
          ]),
      },
    });

    const cookieRes = await request(app)
      .post("/api/login")
      .send({ username: "alice", password: "secret123" });
    const cookie = cookieRes.headers["set-cookie"];

    const meRes = await request(app).get("/api/me").set("Cookie", cookie);
    expect(meRes.status).toBe(200);
    expect(isValidUuid(meRes.body.id)).toBe(true);

    const chatsRes = await request(app)
      .get("/api/chats?username=alice")
      .set("Cookie", cookie);
    expect(chatsRes.status).toBe(200);
    expect(Array.isArray(chatsRes.body.chats)).toBe(true);

    for (const chat of chatsRes.body.chats) {
      expect(isValidUuid(chat.id)).toBe(true);
      if (chat.created_by_user_id) {
        expect(isValidUuid(chat.created_by_user_id)).toBe(true);
      }
    }
  });
});

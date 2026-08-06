import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp } from "../helpers/makeApp.js";
import { createSessionHelpers } from "../../lib/sessions.js";
import { loadSettings } from "../../lib/appSettings.js";
import { dbKnex } from "../../db/knex.js";
import {
  findUserByUsername,
  findUserById,
  listUsers,
  searchUsers,
  createUser,
  findDmChat,
  createChat,
  addChatMember,
  addAllEligibleChatMembers,
  searchPublicGroups,
  searchPublicChannels,
  getRemoteChannelSourceByChatId,
  getRemoteChannelSourceById,
  listEnabledRemoteChannelSources,
  hasChatMemberLeft,
  isGroupMemberRemoved,
  findChatByGroupUsername,
  findChatByInviteToken,
  findChatById,
  isMember,
  listChatMembers,
  listChatMembersForChats,
  getChatMemberRole,
  listChatsForUser,
  createMessage,
  findMessageIdByClientRequestId,
  createOrReuseMessage,
  findSavedChatByUserId,
  ensureSavedChatForUser,
  findMessageById,
  getMessages,
  getFirstUnreadMessage,
  findMessageFileById,
  listMessageFilesByMessageIds,
  listMessageFilesNeedingMetadata,
  getUserPresence,
  getMessageReadCounts,
  getMessageAuthors,
  getMessageReadByUser,
  getTotalUnreadCount,
  listPushSubscriptionsByUserIds,
  listMutedUserIdsForChat,
  createSession,
  getSession,
  getUserRole,
  isUserAdmin,
  isUserOwner,
  getOwnerUser,
  run,
  getAll,
  getRow,
} from "../../db.js";

describe("Dual Database Driver Regression Tests (SQLite & Postgres)", () => {
  let originalDbClient;

  beforeEach(() => {
    originalDbClient = process.env.DB_CLIENT;
  });

  afterEach(() => {
    if (originalDbClient !== undefined) {
      process.env.DB_CLIENT = originalDbClient;
    } else {
      delete process.env.DB_CLIENT;
    }
    vi.restoreAllMocks();
  });

  // 1. Dual-engine behavior under SQLite and Postgres modes
  describe("DB helper functions under Postgres vs SQLite modes", () => {
    test("findUserByUsername returns Promise resolving to user or null under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql, params) => {
        if (params && params[0] === "alice") {
          return { rows: [{ id: 1, username: "alice", role: "user" }] };
        }
        return { rows: [] };
      });

      const resPromiseAlice = findUserByUsername("alice");
      expect(typeof resPromiseAlice?.then).toBe("function");
      const alice = await resPromiseAlice;
      expect(alice).toEqual({ id: 1, username: "alice", role: "user" });

      const resPromiseUnknown = findUserByUsername("unknown");
      expect(typeof resPromiseUnknown?.then).toBe("function");
      const unknown = await resPromiseUnknown;
      expect(unknown).toBeNull();
    });

    test("findChatByGroupUsername returns Promise resolving to chat or null under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql, params) => {
        if (params && (params[0] === "devgroup" || params[1] === "@devgroup")) {
          return {
            rows: [
              {
                id: 10,
                name: "Dev Group",
                group_username: "devgroup",
                type: "group",
              },
            ],
          };
        }
        return { rows: [] };
      });

      const chatPromise = findChatByGroupUsername("devgroup");
      expect(typeof chatPromise?.then).toBe("function");
      const chat = await chatPromise;
      expect(chat?.id).toBe(10);

      const unknownPromise = findChatByGroupUsername("nonexistent");
      expect(typeof unknownPromise?.then).toBe("function");
      const unknown = await unknownPromise;
      expect(unknown).toBeNull();
    });

    test("isMember resolves booleans correctly under both SQLite and Postgres modes", async () => {
      // SQLite Mode
      delete process.env.DB_CLIENT;
      const resSqliteFalse = await isMember(99999, 99999);
      expect(resSqliteFalse).toBe(false);

      // Postgres Mode
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql, params) => {
        if (params[0] === 1 && params[1] === 2) {
          return { rows: [{ chat_id: 1 }] };
        }
        return { rows: [] };
      });

      const resPgTrue = await isMember(1, 2);
      expect(resPgTrue).toBe(true);

      const resPgFalse = await isMember(1, 999);
      expect(resPgFalse).toBe(false);

      // Undefined & NaN parameter safety
      expect(await isMember(undefined, 2)).toBe(false);
      expect(await isMember(1, undefined)).toBe(false);
      expect(await isMember(NaN, NaN)).toBe(false);
    });

    test("hasChatMemberLeft resolves booleans correctly under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql, params) => {
        if (params[0] === 1 && params[1] === 5) {
          return { rows: [{ left_chat: 1 }] };
        }
        return { rows: [] };
      });

      expect(await hasChatMemberLeft(1, 5)).toBe(true);
      expect(await hasChatMemberLeft(1, 99)).toBe(false);
    });

    test("isGroupMemberRemoved resolves booleans correctly under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql, params) => {
        if (params[0] === 1 && params[1] === 5) {
          return { rows: [{ removed: 1 }] };
        }
        return { rows: [] };
      });

      expect(await isGroupMemberRemoved(1, 5)).toBe(true);
      expect(await isGroupMemberRemoved(1, 99)).toBe(false);
    });

    test("getUserRole, isUserAdmin, isUserOwner, getOwnerUser resolve properly under Postgres mode", async () => {
      process.env.DB_CLIENT = "postgres";
      vi.spyOn(dbKnex, "raw").mockImplementation(async (sql, params) => {
        const query = String(sql || "");
        if (query.includes("role FROM users WHERE id = ?")) {
          if (params[0] === 1) return { rows: [{ role: "admin" }] };
          if (params[0] === 2) return { rows: [{ role: "owner" }] };
          if (params[0] === 3) return { rows: [{ role: "user" }] };
          return { rows: [] };
        }
        if (query.includes("role = 'owner'")) {
          return { rows: [{ id: 2, username: "boss" }] };
        }
        return { rows: [] };
      });

      expect(await getUserRole(1)).toBe("admin");
      expect(await isUserAdmin(1)).toBe(true);
      expect(await isUserOwner(1)).toBe(false);

      expect(await getUserRole(2)).toBe("owner");
      expect(await isUserAdmin(2)).toBe(true);
      expect(await isUserOwner(2)).toBe(true);

      expect(await getUserRole(3)).toBe("user");
      expect(await isUserAdmin(3)).toBe(false);

      const owner = await getOwnerUser();
      expect(owner).toEqual({ id: 2, username: "boss" });
    });
  });

  // 2. getSessionFromRequest and requireSession resolution
  describe("getSessionFromRequest and requireSession helper resolution", () => {
    test("handles synchronous session store (SQLite)", () => {
      const { getSessionFromRequest, requireSession } = createSessionHelpers({
        getSession: (token) =>
          token === "valid" ? { id: 1, username: "sync_user" } : null,
        touchSession: () => {},
        isProduction: false,
      });

      const reqValid = { headers: { cookie: "sid=valid" } };
      const reqInvalid = { headers: { cookie: "sid=invalid" } };

      const res1 = getSessionFromRequest(reqValid);
      expect(res1).toEqual({ id: 1, username: "sync_user" });

      const res2 = getSessionFromRequest(reqInvalid);
      expect(res2).toBeNull();

      const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const reqAuth = requireSession(reqValid, mockRes);
      expect(reqAuth).toEqual({ id: 1, username: "sync_user" });

      const reqUnauth = requireSession(reqInvalid, mockRes);
      expect(reqUnauth).toBeNull();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    test("handles asynchronous session store returning Promises (Postgres)", async () => {
      const { getSessionFromRequest, requireSession } = createSessionHelpers({
        getSession: (token) =>
          Promise.resolve(
            token === "valid" ? { id: 2, username: "async_user" } : null,
          ),
        touchSession: () => {},
        isProduction: false,
      });

      const reqValid = { headers: { cookie: "sid=valid" } };
      const reqInvalid = { headers: { cookie: "sid=invalid" } };

      const sessionPromise = getSessionFromRequest(reqValid);
      expect(typeof sessionPromise?.then).toBe("function");
      const s1 = await sessionPromise;
      expect(s1).toEqual({ id: 2, username: "async_user" });

      const s2 = await getSessionFromRequest(reqInvalid);
      expect(s2).toBeNull();

      const mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const reqAuthPromise = requireSession(reqValid, mockRes);
      expect(typeof reqAuthPromise?.then).toBe("function");
      const reqAuth = await reqAuthPromise;
      expect(reqAuth).toEqual({ id: 2, username: "async_user" });

      const reqUnauthPromise = requireSession(reqInvalid, mockRes);
      expect(typeof reqUnauthPromise?.then).toBe("function");
      const reqUnauth = await reqUnauthPromise;
      expect(reqUnauth).toBeNull();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  // 3. loadSettings handling sync vs async arrays
  describe("loadSettings dual driver handling", () => {
    test("handles synchronous dbGetAll Settings array", async () => {
      const dbGetAllSync = () => [{ key: "USERNAME_MAX_CHARS", value: "20" }];
      await loadSettings(dbGetAllSync);
    });

    test("handles asynchronous dbGetAll Settings Promise", async () => {
      const dbGetAllAsync = () =>
        Promise.resolve([{ key: "USERNAME_MAX_CHARS", value: "30" }]);
      await loadSettings(dbGetAllAsync);
    });
  });

  // 4. API Auth Endpoints under Promise-returning database driver
  describe("Auth API route handlers with Promise-returning DB functions", () => {
    test("POST /api/register succeeds without 409 on empty DB when findUserByUsername returns Promise.resolve(null)", async () => {
      const findUserByUsernameAsync = vi
        .fn()
        .mockReturnValue(Promise.resolve(null));
      const createUserAsync = vi.fn().mockReturnValue(Promise.resolve(42));

      const { app } = makeApp({
        deps: {
          findUserByUsername: findUserByUsernameAsync,
          createUser: createUserAsync,
        },
      });

      const res = await request(app).post("/api/register").send({
        username: "newuser",
        password: "password123",
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 42,
        username: "newuser",
      });
    });

    test("POST /api/register returns 409 when findUserByUsername returns Promise resolving to user", async () => {
      const findUserByUsernameAsync = vi
        .fn()
        .mockReturnValue(Promise.resolve({ id: 1, username: "existing" }));

      const { app } = makeApp({
        deps: {
          findUserByUsername: findUserByUsernameAsync,
        },
      });

      const res = await request(app).post("/api/register").send({
        username: "existing",
        password: "password123",
      });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Username already exists." });
    });

    test("POST /api/register returns 409 when findChatByGroupUsername returns Promise resolving to group", async () => {
      const findUserByUsernameAsync = vi
        .fn()
        .mockReturnValue(Promise.resolve(null));
      const findChatByGroupUsernameAsync = vi
        .fn()
        .mockReturnValue(Promise.resolve({ id: 5, name: "Existing Group" }));

      const { app } = makeApp({
        deps: {
          findUserByUsername: findUserByUsernameAsync,
          findChatByGroupUsername: findChatByGroupUsernameAsync,
        },
      });

      const res = await request(app).post("/api/register").send({
        username: "groupname",
        password: "password123",
      });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "Username already exists." });
    });

    test("POST /api/login returns 401 without throwing Illegal arguments when findUserByUsername returns Promise.resolve(null)", async () => {
      const findUserByUsernameAsync = vi
        .fn()
        .mockReturnValue(Promise.resolve(null));

      const { app } = makeApp({
        deps: {
          findUserByUsername: findUserByUsernameAsync,
        },
      });

      const res = await request(app).post("/api/login").send({
        username: "nonexistent",
        password: "password123",
      });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Invalid credentials." });
    });

    test("POST /api/login returns 403 when findUserByUsername returns Promise resolving to banned user", async () => {
      const findUserByUsernameAsync = vi.fn().mockReturnValue(
        Promise.resolve({
          id: 7,
          username: "banneduser",
          banned: true,
        }),
      );

      const { app } = makeApp({
        deps: {
          findUserByUsername: findUserByUsernameAsync,
        },
      });

      const res = await request(app).post("/api/login").send({
        username: "banneduser",
        password: "password123",
      });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Account is banned." });
    });

    test("POST /api/login authenticates user when findUserByUsername returns Promise resolving to valid user", async () => {
      const hashed = bcrypt.hashSync("correctpassword", 10);
      const findUserByUsernameAsync = vi.fn().mockReturnValue(
        Promise.resolve({
          id: 12,
          username: "validuser",
          password_hash: hashed,
          banned: false,
          role: "user",
        }),
      );

      const { app } = makeApp({
        deps: {
          findUserByUsername: findUserByUsernameAsync,
        },
      });

      const resSuccess = await request(app).post("/api/login").send({
        username: "validuser",
        password: "correctpassword",
      });

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body).toMatchObject({
        id: 12,
        username: "validuser",
      });

      const resWrongPassword = await request(app).post("/api/login").send({
        username: "validuser",
        password: "wrongpassword",
      });

      expect(resWrongPassword.status).toBe(401);
      expect(resWrongPassword.body).toEqual({ error: "Invalid credentials." });
    });

    test("GET /api/me handles async getSessionFromRequest Promise", async () => {
      const asyncSession = {
        id: 15,
        username: "sessionuser",
        role: "user",
        status: "online",
      };

      const { app } = makeApp({
        deps: {
          getSessionFromRequest: () => Promise.resolve(asyncSession),
        },
      });

      const res = await request(app).get("/api/me");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: 15,
        username: "sessionuser",
      });
    });

    test("POST /api/logout handles async session deletion Promise", async () => {
      const deleteSessionAsync = vi.fn().mockReturnValue(Promise.resolve());

      const { app } = makeApp({
        deps: {
          deleteSession: deleteSessionAsync,
        },
      });

      const res = await request(app)
        .post("/api/logout")
        .set("Cookie", ["sid=active_token"]);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(deleteSessionAsync).toHaveBeenCalledWith("active_token");
    });
  });

  // 5. Production crash regression tests under PostgreSQL DB driver mode
  describe("PostgreSQL Driver Crash Regressions (Sessions & Chat Loading)", () => {
    // 5.1 Issue 1: Undefined binding(s) detected for keys [0] when compiling RAW query: INSERT INTO sessions (user_id, token) VALUES (?, ?)
    describe("Issue 1: Undefined binding(s) in session creation", () => {
      test("run and dbRun throw or fail with Undefined binding(s) when userId or token is undefined in Postgres mode", async () => {
        process.env.DB_CLIENT = "postgres";

        // Calling run with undefined userId
        let errUserId;
        try {
          await run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [
            undefined,
            "valid_token_123",
          ]);
        } catch (err) {
          errUserId = err;
        }
        expect(errUserId).toBeDefined();
        expect(String(errUserId?.message || errUserId)).toMatch(
          /Undefined binding\(s\) detected/i
        );

        // Calling run with undefined token
        let errToken;
        try {
          await run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [
            42,
            undefined,
          ]);
        } catch (err) {
          errToken = err;
        }
        expect(errToken).toBeDefined();
        expect(String(errToken?.message || errToken)).toMatch(
          /Undefined binding\(s\) detected/i
        );
      });

      test("POST /api/register handles undefined userId from createUser gracefully or passes valid bindings to createSession", async () => {
        process.env.DB_CLIENT = "postgres";
        const createSessionSpy = vi.fn().mockImplementation(async (userId, token) => {
          if (userId === undefined || token === undefined) {
            throw new Error(
              "Undefined binding(s) detected for keys [0] when compiling RAW query: INSERT INTO sessions (user_id, token) VALUES (?, ?)"
            );
          }
        });

        // Case A: createUser returns undefined (e.g. invalid insert or missing ID)
        const { app: appBrokenUser } = makeApp({
          deps: {
            findUserByUsername: () => Promise.resolve(null),
            createUser: () => Promise.resolve(undefined),
            createSession: createSessionSpy,
          },
        });

        await request(appBrokenUser)
          .post("/api/register")
          .send({ username: "testuser", password: "password123" });

        // createSession was called with undefined userId, catching the bug/failure
        expect(createSessionSpy).toHaveBeenCalledWith(undefined, expect.any(String));

        // Case B: createUser returns valid numeric ID
        createSessionSpy.mockClear();
        const { app: appValidUser } = makeApp({
          deps: {
            findUserByUsername: () => Promise.resolve(null),
            createUser: () => Promise.resolve(101),
            createSession: createSessionSpy,
          },
        });

        const resValid = await request(appValidUser)
          .post("/api/register")
          .send({ username: "validuser", password: "password123" });

        expect(resValid.status).toBe(200);
        expect(createSessionSpy).toHaveBeenCalledWith(101, expect.any(String));
      });

      test("POST /api/login handles undefined user.id gracefully or passes valid non-undefined bindings to createSession", async () => {
        process.env.DB_CLIENT = "postgres";
        const hashed = bcrypt.hashSync("password123", 10);
        const createSessionSpy = vi.fn().mockImplementation(async (userId, token) => {
          if (userId === undefined || token === undefined) {
            throw new Error(
              "Undefined binding(s) detected for keys [0] when compiling RAW query: INSERT INTO sessions (user_id, token) VALUES (?, ?)"
            );
          }
        });

        // Case A: findUserByUsername returns user object without 'id' (userId is undefined)
        const { app: appNoId } = makeApp({
          deps: {
            findUserByUsername: () =>
              Promise.resolve({
                username: "noiduser",
                password_hash: hashed,
                banned: false,
              }),
            createSession: createSessionSpy,
          },
        });

        await request(appNoId)
          .post("/api/login")
          .send({ username: "noiduser", password: "password123" });

        expect(createSessionSpy).toHaveBeenCalledWith(undefined, expect.any(String));

        // Case B: findUserByUsername returns user with valid id
        createSessionSpy.mockClear();
        const { app: appValidId } = makeApp({
          deps: {
            findUserByUsername: () =>
              Promise.resolve({
                id: 55,
                username: "valididuser",
                password_hash: hashed,
                banned: false,
              }),
            createSession: createSessionSpy,
          },
        });

        const resValid = await request(appValidId)
          .post("/api/login")
          .send({ username: "valididuser", password: "password123" });

        expect(resValid.status).toBe(200);
        expect(createSessionSpy).toHaveBeenCalledWith(55, expect.any(String));
      });
    });

    // 5.2 Issue 2: TypeError: getAll(...).map is not a function at listChatsForUser
    describe("Issue 2: getAll(...).map is not a function in listChatsForUser", () => {
      test("listChatsForUser handles Promise returned by getAll under Postgres mode without throwing map is not a function", async () => {
        process.env.DB_CLIENT = "postgres";
        vi.spyOn(dbKnex, "raw").mockImplementation(() =>
          Promise.resolve({ rows: [] })
        );

        const res = listChatsForUser(1);
        expect(typeof res?.then).toBe("function");
        const chats = await res;
        expect(chats).toEqual([]);
      });

      test("GET /api/chats handles async listChatsForUser and findUserByUsername returning Promises", async () => {
        process.env.DB_CLIENT = "postgres";
        const asyncListChatsForUser = vi.fn().mockImplementation(() => {
          return Promise.resolve([
            { id: 1, name: "General", type: "group" },
          ]);
        });

        const { app, sessionStore, userStore } = makeApp({
          deps: {
            listChatsForUser: asyncListChatsForUser,
            findUserByUsername: () =>
              Promise.resolve({ id: 10, username: "alice" }),
            listChatMembersForChats: () => new Map(),
          },
        });
        userStore.users.set("alice", { id: 10, username: "alice", role: "user" });
        sessionStore.createSession(10, "valid");

        // Calling GET /api/chats?username=alice
        const res = await request(app)
          .get("/api/chats?username=alice")
          .set("Cookie", ["sid=valid"]);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          chats: [expect.objectContaining({ id: 1, name: "General" })],
        });
      });
    });

    // 5.3 Issue 3: Postgres invalid input syntax for type integer: "NaN" error in listChatsForUser
    describe("Issue 3: Postgres invalid input syntax for type integer: 'NaN' in listChatsForUser", () => {
      test("listChatsForUser safely returns empty array without passing NaN bindings to SQL when userId is NaN, undefined, or non-numeric", async () => {
        process.env.DB_CLIENT = "postgres";
        let capturedParams = null;
        vi.spyOn(dbKnex, "raw").mockImplementation((sql, params) => {
          capturedParams = params;
          return Promise.resolve({ rows: [] });
        });

        // 1. listChatsForUser with NaN
        const resNaN = await listChatsForUser(NaN);
        expect(resNaN).toEqual([]);
        expect(capturedParams).toBeNull(); // No query should be executed for NaN

        // 2. listChatsForUser with undefined
        const resUndef = await listChatsForUser(undefined);
        expect(resUndef).toEqual([]);
        expect(capturedParams).toBeNull(); // No query should be executed for undefined

        // 3. listChatsForUser with invalid string
        const resStr = await listChatsForUser("not_a_number");
        expect(resStr).toEqual([]);
        expect(capturedParams).toBeNull(); // No query should be executed for invalid string
      });

      test("GET /api/chats safely handles invalid or missing user.id without passing NaN to listChatsForUser", async () => {
        process.env.DB_CLIENT = "postgres";
        const listChatsForUserMock = vi.fn().mockImplementation((userId) => {
          const uid = Number(userId);
          if (Number.isNaN(uid)) {
            const err = new Error('invalid input syntax for type integer: "NaN"');
            err.code = "22P02";
            throw err;
          }
          return [];
        });

        const { app, sessionStore, userStore } = makeApp({
          deps: {
            listChatsForUser: listChatsForUserMock,
            findUserByUsername: () =>
              Promise.resolve({ id: 10, username: "validuser" }),
            listChatMembersForChats: () => new Map(),
          },
        });
        userStore.users.set("validuser", { id: 10, username: "validuser", role: "user" });
        sessionStore.createSession(10, "valid");

        const res = await request(app)
          .get("/api/chats?username=validuser")
          .set("Cookie", ["sid=valid"]);

        expect(res.status).toBe(200);
        expect(listChatsForUserMock).toHaveBeenCalledWith(10);
      });
    });

    // 6. Direct Audit of DB helper functions in server/db.js under PostgreSQL mode
    describe("Direct DB Helpers Audit under PostgreSQL Mode", () => {
      beforeEach(() => {
        process.env.DB_CLIENT = "postgres";
        vi.spyOn(dbKnex, "raw").mockImplementation(async (sql, params) => {
          const strSql = String(sql || "");
          if (strSql.includes("users")) {
            return {
              rows: [
                {
                  id: 1,
                  username: "alice",
                  nickname: "Alice",
                  avatar_url: null,
                  color: "#10b981",
                  status: "online",
                  role: "admin",
                  banned: false,
                  verified: true,
                  password_hash: "hash",
                },
              ],
            };
          }
          if (strSql.includes("chats")) {
            return {
              rows: [
                {
                  id: 10,
                  name: "General",
                  type: "group",
                  group_username: "general",
                  group_color: "#10b981",
                  invite_token: "token123",
                  group_visibility: "public",
                  verified: true,
                },
              ],
            };
          }
          if (strSql.includes("chat_members")) {
            return {
              rows: [
                {
                  chat_id: 10,
                  user_id: 1,
                  role: "owner",
                  left_chat: 0,
                  removed: 0,
                  username: "alice",
                },
              ],
            };
          }
          if (strSql.includes("chat_messages")) {
            return {
              rows: [
                {
                  id: 100,
                  chat_id: 10,
                  user_id: 1,
                  body: "Hello",
                  created_at: "2026-01-01T00:00:00.000Z",
                },
              ],
            };
          }
          if (strSql.includes("remote_channel_sources")) {
            return {
              rows: [
                {
                  id: 5,
                  chat_id: 10,
                  provider: "telegram",
                  enabled: 1,
                  paused: 0,
                },
              ],
            };
          }
          return { rows: [] };
        });
      });

      test("searchUsers returns Array (not un-awaited Promise) when awaited in Postgres mode", async () => {
        const promise = searchUsers("ali");
        expect(typeof promise?.then).toBe("function");
        const res = await promise;
        expect(Array.isArray(res)).toBe(true);
        expect(res[0]).toHaveProperty("username", "alice");
      });

      test("listUsers returns Array when awaited in Postgres mode", async () => {
        const res = await listUsers();
        expect(Array.isArray(res)).toBe(true);
        expect(res[0]).toHaveProperty("username", "alice");
      });

      test("searchPublicGroups returns Array when awaited in Postgres mode", async () => {
        const res = await searchPublicGroups("gen", 1);
        expect(Array.isArray(res)).toBe(true);
        expect(res[0]).toHaveProperty("name", "General");
      });

      test("searchPublicChannels returns Array when awaited in Postgres mode", async () => {
        const res = await searchPublicChannels("gen", 1);
        expect(Array.isArray(res)).toBe(true);
      });

      test("listChatMembers returns Array when awaited in Postgres mode", async () => {
        const res = await listChatMembers(10);
        expect(Array.isArray(res)).toBe(true);
      });

      test("listChatMembersForChats returns Map instance (NOT un-awaited Promise) in Postgres mode", async () => {
        const res = listChatMembersForChats([10]);
        // MUST resolve to Map or be Map, NOT a Promise returning Map or throwing "rows is not iterable"
        const finalMap = (res && typeof res.then === "function") ? await res : res;
        expect(finalMap).toBeInstanceOf(Map);
      });

      test("getMessages returns Array/Object when awaited in Postgres mode", async () => {
        const res = getMessages(10);
        const finalRes = (res && typeof res.then === "function") ? await res : res;
        expect(finalRes).toBeDefined();
        if (Array.isArray(finalRes)) {
          expect(Array.isArray(finalRes)).toBe(true);
        } else {
          expect(Array.isArray(finalRes.messages)).toBe(true);
        }
      });

      test("getChatMemberRole returns role string (NOT null/'[object Promise]') in Postgres mode", async () => {
        const res = getChatMemberRole(10, 1);
        expect(typeof res?.then).toBe("function");
        const role = await res;
        expect(role).toBe("owner");
      });

      test("listEnabledRemoteChannelSources returns Array when awaited in Postgres mode", async () => {
        const res = await listEnabledRemoteChannelSources("telegram");
        expect(Array.isArray(res)).toBe(true);
      });

      test("findDmChat resolves to ID or null correctly in Postgres mode", async () => {
        process.env.DB_CLIENT = "postgres";
        const res = findDmChat(1, 2);
        const id = (res && typeof res.then === "function") ? await res : res;
        expect(id).toBe(10);

        // Undefined and NaN parameter safety
        const resUndef = await findDmChat(undefined, undefined);
        expect(resUndef).toBeNull();
        const resNaN = await findDmChat(NaN, 2);
        expect(resNaN).toBeNull();
      });
    });

    // 7. Comprehensive Audit of API Routes with Promise-Returning DB Helpers
    describe("API Endpoints Audit under PostgreSQL Mode (Promise-returning DB Helpers)", () => {
      let app, userStore, sessionStore;
      const alice = { id: 10, username: "alice", role: "admin", status: "online", color: "#10b981", avatar_url: null, banned: false, verified: true };
      const bob = { id: 20, username: "bob", role: "user", status: "online", color: "#10b981", avatar_url: null, banned: false, verified: false };
      const groupChat = { id: 1, name: "General", type: "group", group_username: "general", group_color: "#10b981", invite_token: "token123", group_visibility: "public" };

      beforeEach(() => {
        process.env.DB_CLIENT = "postgres";
        const asyncDeps = {
          findUserByUsername: (u) => Promise.resolve(u === "alice" ? alice : u === "bob" ? bob : null),
          findUserById: (id) => Promise.resolve(id === 10 ? alice : id === 20 ? bob : null),
          listUsers: () => Promise.resolve([alice, bob]),
          searchUsers: () => Promise.resolve([bob]),
          searchPublicGroups: () => Promise.resolve([groupChat]),
          searchPublicChannels: () => Promise.resolve([]),
          listChatMembers: () => Promise.resolve([{ ...alice, role: "owner" }, { ...bob, role: "member" }]),
          listChatMembersForChats: () => Promise.resolve(new Map([[1, [{ ...alice, role: "owner" }]]])),
          listChatsForUser: () => Promise.resolve([groupChat]),
          findChatById: () => Promise.resolve(groupChat),
          findChatByGroupUsername: (name) => Promise.resolve(name === groupChat?.group_username ? groupChat : null),
          findChatByInviteToken: () => Promise.resolve(groupChat),
          findDmChat: () => Promise.resolve(1),
          getMessages: () => Promise.resolve({ messages: [], hasMore: false }),
          getFirstUnreadMessage: () => Promise.resolve(null),
          getChatMemberRole: () => Promise.resolve("owner"),
          isMember: () => Promise.resolve(true),
          isGroupMemberRemoved: () => Promise.resolve(false),
          hasChatMemberLeft: () => Promise.resolve(false),
          listEnabledRemoteChannelSources: () => Promise.resolve([]),
          getRemoteChannelSourceByChatId: () => Promise.resolve(null),
          getRemoteChannelSourceById: () => Promise.resolve(null),
          listPushSubscriptionsByUserIds: () => Promise.resolve([]),
          listMutedUserIdsForChat: () => Promise.resolve([]),
          ensureSavedChatForUser: () => Promise.resolve({ id: 99, name: "Saved messages", type: "saved" }),
          unhideChat: () => Promise.resolve(),
          listMessageFilesByMessageIds: () => Promise.resolve([]),
          getMessageReadByUser: () => Promise.resolve([]),
          getMessageReadCounts: () => Promise.resolve([]),
          isLoopbackRequest: () => true,
          createMessage: () => Promise.resolve(100),
          getMessageAuthors: () => Promise.resolve([]),
          getMessageReadByUser: () => Promise.resolve(false),
          getTotalUnreadCount: () => Promise.resolve(0),
          getUserPresence: () => Promise.resolve({ status: "online", lastSeen: null }),
          createChat: () => Promise.resolve(1),
          addChatMember: () => Promise.resolve(true),
          addAllEligibleChatMembers: () => Promise.resolve({ addedUsers: [], skippedLeftCount: 0 }),
          isUserAdmin: () => Promise.resolve(true),
          isUserOwner: () => Promise.resolve(true),
          getOwnerUser: () => Promise.resolve(alice),
          adminListUsers: () => Promise.resolve({ users: [alice, bob], total: 2 }),
          adminListChats: () => Promise.resolve([groupChat]),
          adminCountUsers: () => Promise.resolve(2),
          adminCountChats: () => Promise.resolve(1),
          adminGetRow: () => Promise.resolve(null),
          adminGetAll: () => Promise.resolve([]),
          adminRun: () => Promise.resolve(1),
          dbGetAllSettings: () => Promise.resolve([]),
          getAllSettings: () => Promise.resolve([]),
          hydrateMissingVideoMetadata: (files) => Promise.resolve(files || []),
        };

        const result = makeApp({ deps: asyncDeps });
        app = result.app;
        userStore = result.userStore;
        sessionStore = result.sessionStore;

        userStore.users.set("alice", alice);
        userStore.users.set("bob", bob);
        sessionStore.createSession(10, "valid_alice_session");
      });

      test("GET /api/discover under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/discover?username=alice&query=bob")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.users)).toBe(true);
        expect(Array.isArray(res.body.groups)).toBe(true);
        expect(Array.isArray(res.body.channels)).toBe(true);
      });

      test("GET /api/chats under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/chats?username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.chats)).toBe(true);
      });

      test("GET /api/chats/saved under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/chats/saved?username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).toBe(200);
      });

      test("POST /api/chats/dm under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/dm")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", targetUsername: "bob" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/group under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/group")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", name: "New Group", members: ["bob"] });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/groups/invite/:token under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/groups/invite/token123")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/groups/invite/:token/join under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/groups/invite/token123/join")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/channels/:username/meta under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/channels/general/meta")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/channels/:username/messages under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/channels/general/messages")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/chats/:chatId/preview under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/chats/1/preview?username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/chats/group/:chatId/invite-link under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/chats/group/1/invite-link?username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/group/:chatId/regenerate-invite under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/group/1/regenerate-invite")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("PUT /api/chats/group/:chatId under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .put("/api/chats/group/1")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", name: "Renamed Group" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/group/:chatId/leave under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/group/1/leave")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/group/:chatId/delete under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/group/1/delete")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/group/:chatId/remove-member under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/group/1/remove-member")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", targetUserId: 20 });
        expect(res.status).not.toBe(500);
      });

      test("DELETE /api/chats/group/:chatId/avatar under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .delete("/api/chats/group/1/avatar")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("PUT /api/chats/:chatId/mute under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .put("/api/chats/1/mute")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", muted: true });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/hide under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/hide")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", chatId: 1 });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/group/:chatId/join-public under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/group/1/join-public")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/users under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/users?username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/mentions/resolve under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/mentions/resolve")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ usernames: ["alice", "bob"], chatId: 1, currentUsername: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/messages under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/messages?chatId=1&username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/messages/first-unread under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/messages/first-unread?chatId=1&username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/messages/read under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/messages/read")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ chatId: 1, username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/messages/read-one under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/messages/read-one")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ messageId: 100, username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/messages/read-counts under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/messages/read-counts")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", messageIds: [100] });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/messages/typing under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/messages/typing")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ chatId: 1, username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/messages under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/messages")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ chatId: 1, username: "alice", body: "Hello world" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/messages/edit under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/messages/edit")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ messageId: 100, username: "alice", editedBody: "Updated message" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/messages/delete under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/messages/delete")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ messageId: 100, username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/messages/forward under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/messages/forward")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ sourceMessageId: 100, targetChatIds: [1], username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/profile under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/profile?username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("PUT /api/profile under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .put("/api/profile")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ currentUsername: "alice", username: "alice", nickname: "Alice New" });
        expect(res.status).not.toBe(500);
      });

      test("PUT /api/password under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .put("/api/password")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", currentPassword: "password123", newPassword: "newpassword123" });
        expect(res.status).not.toBe(500);
      });

      test("PUT /api/status under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .put("/api/status")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", status: "online" });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/admin/stats under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/admin/stats")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/admin/system under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/admin/system")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/admin/users under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/admin/users")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/admin/users under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/admin/users")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "charlie", password: "password123" });
        expect(res.status).not.toBe(500);
      });

      test("PATCH /api/admin/users/:id under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .patch("/api/admin/users/20")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ nickname: "Bob Updated" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/admin/users/:id/ban under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/admin/users/20/ban")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ banned: true });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/admin/users/:id/role under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/admin/users/20/role")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ role: "admin" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/admin/users/:id/reset-password under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/admin/users/20/reset-password")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ newPassword: "password123" });
        expect(res.status).not.toBe(500);
      });

      test("DELETE /api/admin/users/:id under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .delete("/api/admin/users/20")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/admin/chats under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/admin/chats")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/admin/chats under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/admin/chats")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ name: "Admin Group", type: "group", owner: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("PATCH /api/admin/chats/:id under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .patch("/api/admin/chats/1")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ name: "Admin Group Renamed" });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/admin/chats/:id/members under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/admin/chats/1/members")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/admin/chats/:id/members under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/admin/chats/1/members")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ userId: 20 });
        expect(res.status).not.toBe(500);
      });

      test("DELETE /api/admin/chats/:id/members/:userId under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .delete("/api/admin/chats/1/members/20")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("PATCH /api/admin/chats/:id/members/:userId under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .patch("/api/admin/chats/1/members/20")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ role: "admin" });
        expect(res.status).not.toBe(500);
      });

      test("DELETE /api/admin/chats/:id under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .delete("/api/admin/chats/1")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/admin/logs under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/admin/logs")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("DELETE /api/admin/logs under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .delete("/api/admin/logs")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/admin/db-tools under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/admin/db-tools")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ action: "vacuum" });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/health under Postgres Promise DB mode", async () => {
        const res = await request(app).get("/api/health");
        expect(res.status).not.toBe(500);
      });

      test("GET /api/presence under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/presence?username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/push/public-key under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/push/public-key")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/push/subscribe under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/push/subscribe")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice", subscription: { endpoint: "https://push.example.com", keys: { p256dh: "k", auth: "a" } } });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/push/unsubscribe under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/push/unsubscribe")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ endpoint: "https://push.example.com" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/push/test under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/push/test")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ username: "alice" });
        expect(res.status).not.toBe(500);
      });

      test("GET /api/push/debug under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/push/debug?username=alice")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("GET /api/chats/:chatId/remote-channel under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .get("/api/chats/1/remote-channel")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("PUT /api/chats/:chatId/remote-channel under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .put("/api/chats/1/remote-channel")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ provider: "telegram", source_chat_id: "123" });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/:chatId/remote-channel/pause under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/1/remote-channel/pause")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/:chatId/remote-channel/resume under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/1/remote-channel/resume")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/:chatId/remote-channel/skip under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/1/remote-channel/skip")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/:chatId/remote-channel/skip-all under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/1/remote-channel/skip-all")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/:chatId/remote-channel/test under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/chats/1/remote-channel/test")
          .set("Cookie", ["sid=valid_alice_session"]);
        expect(res.status).not.toBe(500);
      });

      test("POST /api/uploads/presign under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/uploads/presign")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ filename: "test.png", mimeType: "image/png", sizeBytes: 100 });
        expect(res.status).not.toBe(500);
      });

      test("POST /api/chats/group under Postgres Promise DB mode creates group without spurious 409 or member undefined errors", async () => {
        const res = await request(app)
          .post("/api/chats/group")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({
            type: "group",
            nickname: "My New Group",
            username: "new_group_handle_123",
            creator: "alice",
            members: ["bob"],
          });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("id");
      });

      test("POST /api/messages under Postgres Promise DB mode creates text message successfully without throwing Unable to create message error", async () => {
        const res = await request(app)
          .post("/api/messages")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({
            chatId: 1,
            username: "alice",
            body: "Hello from Postgres mode test",
          });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("id");
      });

      test("POST /api/uploads/complete under Postgres Promise DB mode", async () => {
        const res = await request(app)
          .post("/api/uploads/complete")
          .set("Cookie", ["sid=valid_alice_session"])
          .send({ uploadId: "up123" });
        expect(res.status).not.toBe(500);
      });
    });
  });
});

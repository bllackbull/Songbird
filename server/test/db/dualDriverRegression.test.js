import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { makeApp } from "../helpers/makeApp.js";
import { createSessionHelpers } from "../../lib/sessions.js";
import { loadSettings } from "../../lib/appSettings.js";
import { dbKnex } from "../../db/knex.js";
import {
  findUserByUsername,
  findChatByGroupUsername,
  isMember,
  hasChatMemberLeft,
  isGroupMemberRemoved,
  getUserRole,
  isUserAdmin,
  isUserOwner,
  getOwnerUser,
  createSession,
  listChatsForUser,
  run,
  getAll,
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
  });
});

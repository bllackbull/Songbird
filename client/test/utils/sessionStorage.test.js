import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSavedSessionUser,
  saveSessionUser,
  clearSavedSessionUser,
  fetchSessionUser,
} from "../../src/utils/sessionStorage.js";

const originalFetch = globalThis.fetch;

describe("sessionStorage utils", () => {
  let mockStore = {};

  beforeEach(() => {
    mockStore = {};
    const fakeLocalStorage = {
      getItem: (key) => mockStore[key] ?? null,
      setItem: (key, val) => {
        mockStore[key] = String(val);
      },
      removeItem: (key) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
    };
    vi.stubGlobal("localStorage", fakeLocalStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  describe("saveSessionUser / getSavedSessionUser / clearSavedSessionUser", () => {
    test("saves and retrieves session user from localStorage", () => {
      const user = { username: "alice", id: "123-uuid", role: "user" };
      saveSessionUser(user);
      expect(getSavedSessionUser()).toEqual(user);
    });

    test("returns null if no session user is stored", () => {
      expect(getSavedSessionUser()).toBeNull();
    });

    test("clearSavedSessionUser removes stored user", () => {
      saveSessionUser({ username: "alice" });
      clearSavedSessionUser();
      expect(getSavedSessionUser()).toBeNull();
    });
  });

  describe("fetchSessionUser", () => {
    test("returns normalized user on 200 OK", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "uuid-1", username: "bob", role: "user" }),
      });

      const user = await fetchSessionUser();
      expect(user.username).toBe("bob");
    });

    test("throws error with isUnauthenticated=true on 401 Unauthorized", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      let thrownError = null;
      try {
        await fetchSessionUser();
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.isUnauthenticated).toBe(true);
      expect(thrownError.isNetworkError).toBeUndefined();
    });

    test("throws error with isNetworkError=true when fetch fails (server unreachable)", async () => {
      globalThis.fetch = vi
        .fn()
        .mockRejectedValue(new TypeError("Failed to fetch"));

      let thrownError = null;
      try {
        await fetchSessionUser();
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.isNetworkError).toBe(true);
      expect(thrownError.isUnauthenticated).toBeUndefined();
    });

    test("throws error with isServerError=true on 502 Bad Gateway (server unreachable)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      });

      let thrownError = null;
      try {
        await fetchSessionUser();
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).not.toBeNull();
      expect(thrownError.isServerError).toBe(true);
      expect(thrownError.isUnauthenticated).toBeUndefined();
    });
  });
});

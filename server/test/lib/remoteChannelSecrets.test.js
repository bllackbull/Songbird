import { describe, test, expect, beforeEach, afterEach } from "vitest";
import {
  resolveTelegramSecrets,
  saveTelegramSecrets,
  clearTelegramSession,
  TELEGRAM_API_ID_KEY,
  TELEGRAM_API_HASH_KEY,
  TELEGRAM_SESSION_STRING_KEY,
} from "../../lib/remoteChannelSecrets.js";

const ENV_KEYS = [
  TELEGRAM_API_ID_KEY,
  TELEGRAM_API_HASH_KEY,
  TELEGRAM_SESSION_STRING_KEY,
];
let savedEnv = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("resolveTelegramSecrets", () => {
  test("returns empty when nothing is stored", async () => {
    const creds = await resolveTelegramSecrets({ dbGetSetting: () => null });
    expect(creds).toMatchObject({ apiId: 0, apiHash: "", sessionString: "" });
    expect(creds.managedByEnv).toEqual({
      apiId: false,
      apiHash: false,
      sessionString: false,
    });
  });

  test("falls back to DB rows when env is absent", async () => {
    const rows = {
      [TELEGRAM_API_ID_KEY]: "123",
      [TELEGRAM_API_HASH_KEY]: "hash",
      [TELEGRAM_SESSION_STRING_KEY]: "sess",
    };
    const creds = await resolveTelegramSecrets({
      dbGetSetting: (key) => rows[key] ?? null,
    });
    expect(creds).toMatchObject({
      apiId: 123,
      apiHash: "hash",
      sessionString: "sess",
    });
  });

  test("env vars win over DB rows", async () => {
    process.env[TELEGRAM_API_ID_KEY] = "999";
    process.env[TELEGRAM_SESSION_STRING_KEY] = "env-sess";
    const rows = {
      [TELEGRAM_API_ID_KEY]: "123",
      [TELEGRAM_API_HASH_KEY]: "hash",
      [TELEGRAM_SESSION_STRING_KEY]: "db-sess",
    };
    const creds = await resolveTelegramSecrets({
      dbGetSetting: (key) => rows[key] ?? null,
    });
    expect(creds.apiId).toBe(999);
    expect(creds.apiHash).toBe("hash");
    expect(creds.sessionString).toBe("env-sess");
    expect(creds.managedByEnv).toEqual({
      apiId: true,
      apiHash: false,
      sessionString: true,
    });
  });
});

describe("save/clear helpers", () => {
  test("saveTelegramSecrets writes only provided keys", async () => {
    const store = new Map();
    const ok = await saveTelegramSecrets(
      { dbSetSetting: (k, v) => store.set(k, v), dbSave: () => {} },
      { apiId: 123 },
    );
    expect(ok).toBe(true);
    expect(store.get(TELEGRAM_API_ID_KEY)).toBe("123");
    expect(store.has(TELEGRAM_API_HASH_KEY)).toBe(false);
  });

  test("save/clear report failure when persistence is missing", async () => {
    await expect(saveTelegramSecrets({}, { apiId: 123 })).resolves.toBe(
      false,
    );
    await expect(clearTelegramSession({})).resolves.toBe(false);
  });

  test("clearTelegramSession removes only the session row", async () => {
    const store = new Map([
      [TELEGRAM_SESSION_STRING_KEY, "sess"],
      [TELEGRAM_API_ID_KEY, "123"],
    ]);
    const ok = await clearTelegramSession({
      dbDeleteSetting: (k) => store.delete(k),
      dbSave: () => {},
    });
    expect(ok).toBe(true);
    expect(store.has(TELEGRAM_SESSION_STRING_KEY)).toBe(false);
    expect(store.get(TELEGRAM_API_ID_KEY)).toBe("123");
  });
});

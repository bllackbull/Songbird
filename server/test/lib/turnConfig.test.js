import { describe, test, expect, vi } from "vitest";
import {
  resolveTurnConfig,
  saveTurnConfig,
  getTurnMode,
  validateTurnPatch,
  toHealthEnv,
} from "../../lib/turnConfig.js";

describe("resolveTurnConfig", () => {
  test("env TURN_URL wins over saved value and is flagged as env-managed", async () => {
    const config = await resolveTurnConfig({
      dbGetSetting: () => "turn:saved.example.com:3478",
      env: { TURN_URL: "turn:env.example.com:3478" },
    });
    expect(config.turnUrl).toBe("turn:env.example.com:3478");
    expect(config.managedByEnv.turnUrl).toBe(true);
  });

  test("uses saved values when env vars are absent", async () => {
    const config = await resolveTurnConfig({
      dbGetSetting: (key) =>
        key === "TURN_URL" ? "turn:saved.example.com:3478" : null,
      env: {},
    });
    expect(config.turnUrl).toBe("turn:saved.example.com:3478");
    expect(config.managedByEnv.turnUrl).toBe(false);
  });

  test("falls back to the default STUN URL", async () => {
    const config = await resolveTurnConfig({
      dbGetSetting: () => null,
      env: {},
    });
    expect(config.stunUrl).toBe("stun:stun.l.google.com:19302");
  });

  test("waits for an async dbGetSetting (Postgres)", async () => {
    const config = await resolveTurnConfig({
      dbGetSetting: (key) =>
        Promise.resolve(key === "TURN_TOKEN_ID" ? "cf-key" : null),
      env: {},
    });
    expect(config.tokenId).toBe("cf-key");
  });
});

describe("saveTurnConfig", () => {
  test("writes only the supplied keys", async () => {
    const dbSetSetting = vi.fn();
    const dbSave = vi.fn();
    const ok = await saveTurnConfig(
      { dbSetSetting, dbSave, dbDeleteSetting: vi.fn(), env: {} },
      { turnUrl: "turn:relay.example.com:3478", username: "songbird" },
    );
    expect(ok).toBe(true);
    expect(dbSetSetting.mock.calls).toEqual([
      ["TURN_URL", "turn:relay.example.com:3478"],
      ["TURN_USERNAME", "songbird"],
    ]);
    expect(dbSave).toHaveBeenCalledTimes(1);
  });

  test("an empty string deletes the saved key", async () => {
    const dbDeleteSetting = vi.fn();
    const dbSetSetting = vi.fn();
    const ok = await saveTurnConfig(
      { dbSetSetting, dbSave: vi.fn(), dbDeleteSetting, env: {} },
      { credential: "" },
    );
    expect(ok).toBe(true);
    expect(dbDeleteSetting.mock.calls).toEqual([["TURN_CREDENTIAL"]]);
    expect(dbSetSetting).not.toHaveBeenCalled();
  });

  test("ignores env-managed keys", async () => {
    const dbSetSetting = vi.fn();
    await saveTurnConfig(
      {
        dbSetSetting,
        dbSave: vi.fn(),
        dbDeleteSetting: vi.fn(),
        env: { TURN_URL: "turn:env.example.com:3478" },
      },
      { turnUrl: "turn:other.example.com:3478", username: "u" },
    );
    expect(dbSetSetting.mock.calls).toEqual([["TURN_USERNAME", "u"]]);
  });

  test("returns false when persistence is unavailable", async () => {
    const ok = await saveTurnConfig(
      { dbSave: vi.fn(), dbDeleteSetting: vi.fn(), env: {} },
      { turnUrl: "turn:relay.example.com:3478" },
    );
    expect(ok).toBe(false);
  });
});

describe("getTurnMode", () => {
  test("prefers Cloudflare when both keys are set", () => {
    expect(
      getTurnMode({
        tokenId: "key",
        apiToken: "token",
        turnUrl: "turn:x:3478",
      }),
    ).toBe("cloudflare");
  });

  test("uses self-hosted when only a relay URL is set", () => {
    expect(getTurnMode({ turnUrl: "turn:x:3478" })).toBe("self-hosted");
  });

  test("falls back to STUN-only", () => {
    expect(getTurnMode({})).toBe("stun-only");
  });
});

describe("validateTurnPatch", () => {
  const empty = {
    stunUrl: "",
    turnUrl: "",
    username: "",
    credential: "",
    tokenId: "",
    apiToken: "",
  };

  test("rejects a Cloudflare key ID without an API token", () => {
    expect(validateTurnPatch({ tokenId: "cf-key" }, empty).valid).toBe(false);
  });

  test("rejects a relay URL without username and credential", () => {
    expect(
      validateTurnPatch({ turnUrl: "turn:relay.example.com:3478" }, empty)
        .valid,
    ).toBe(false);
  });

  test("accepts a complete self-hosted relay patch", () => {
    expect(
      validateTurnPatch(
        {
          turnUrl: "turn:relay.example.com:3478",
          username: "u",
          credential: "c",
        },
        empty,
      ),
    ).toEqual({ valid: true });
  });

  test("rejects blank patch values — clearing is a separate action", () => {
    expect(validateTurnPatch({ credential: "" }, empty).valid).toBe(false);
    expect(validateTurnPatch({ turnUrl: "" }, empty).valid).toBe(false);
  });

  test("accepts the default STUN URL when saving a relay patch", () => {
    expect(
      validateTurnPatch(
        {
          turnUrl: "turn:relay.example.com:3478",
          username: "u",
          credential: "c",
        },
        { ...empty, stunUrl: "stun:stun.l.google.com:19302" },
      ),
    ).toEqual({ valid: true });
  });

  test("rejects a malformed TURN URL", () => {
    expect(
      validateTurnPatch(
        { turnUrl: "http://relay.example.com", username: "u", credential: "c" },
        empty,
      ).valid,
    ).toBe(false);
  });
});

describe("toHealthEnv", () => {
  test("maps exactly the three keys checkTurnHealth reads", () => {
    expect(
      toHealthEnv({
        tokenId: "cf-key",
        apiToken: "cf-token",
        turnUrl: "turn:relay.example.com:3478",
        credential: "secret",
      }),
    ).toEqual({
      TURN_TOKEN_ID: "cf-key",
      TURN_API_TOKEN: "cf-token",
      TURN_URL: "turn:relay.example.com:3478",
    });
  });
});

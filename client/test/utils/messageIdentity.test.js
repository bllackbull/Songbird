import { describe, expect, test } from "vitest";
import { resolveServerMessageId } from "../../src/utils/uuidUtils.js";

const SERVER_ID = "e03087cb-a6c1-4584-9bf4-b119c2d9e1e7";

describe("resolveServerMessageId", () => {
  test("prefers the echoed server id over a pending client id", () => {
    expect(
      resolveServerMessageId({
        id: "pending-1795253177682-8bnn88",
        _serverId: SERVER_ID,
        _clientId: "pending-1795253177682-8bnn88",
      }),
    ).toBe(SERVER_ID);
  });

  test("falls back to id when there is no server id", () => {
    expect(resolveServerMessageId({ id: SERVER_ID })).toBe(SERVER_ID);
  });

  test("returns null when neither identity is a UUID", () => {
    expect(resolveServerMessageId({ id: "pending-1" })).toBeNull();
    expect(resolveServerMessageId(null)).toBeNull();
  });
});

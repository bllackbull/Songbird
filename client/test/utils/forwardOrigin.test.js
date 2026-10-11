import { describe, test, expect } from "vitest";
import { resolveForwardedTarget } from "../../src/utils/forwardOrigin.js";

const UUID = "f058c254-bd7f-4fd2-9cdc-bc1c9a413de3";

describe("resolveForwardedTarget", () => {
  test("remote telegram message with a UUID channel id opens the channel, not self", () => {
    // Regression: `remoteForwardedChatId > 0` is always false for UUID
    // strings, which misrouted remote-channel messages to the viewer's own
    // profile (kind: "self").
    const target = resolveForwardedTarget({
      forwardedFromChatId: null,
      forwardedFromUserId: null,
      forwardedFromLabel: "songbirdtest",
      remoteForwardedChatId: UUID,
      storedForwardedLabel: "songbirdtest",
      chatName: "Mirror",
      chatColor: "#10b981",
    });
    expect(target).toMatchObject({ kind: "chat", chatId: UUID });
  });

  test("remote songbird message with a UUID channel id opens the channel", () => {
    const target = resolveForwardedTarget({
      forwardedFromChatId: null,
      forwardedFromUserId: null,
      forwardedFromLabel: "Some Channel",
      remoteForwardedChatId: UUID,
      storedForwardedLabel: "Some Channel",
      chatName: "Mirror",
    });
    expect(target?.kind).toBe("chat");
    expect(target?.chatId).toBe(UUID);
  });

  test("legacy numeric-string channel id still opens the channel", () => {
    const target = resolveForwardedTarget({
      forwardedFromChatId: null,
      forwardedFromUserId: null,
      forwardedFromLabel: "old",
      remoteForwardedChatId: "42",
      storedForwardedLabel: "old",
      chatName: "Mirror",
    });
    expect(target).toMatchObject({ kind: "chat", chatId: "42" });
  });

  test("stored chat forward opens that chat", () => {
    const target = resolveForwardedTarget({
      forwardedFromChatId: UUID,
      forwardedFromLabel: "Source",
      forwardedOriginAvatarUrl: "/avatar.png",
      forwardedOriginColor: "#ff0000",
    });
    expect(target).toMatchObject({
      kind: "chat",
      chatId: UUID,
      label: "Source",
    });
  });

  test("stored user forward opens that user", () => {
    const target = resolveForwardedTarget({
      forwardedFromUserId: "u-1",
      forwardedFromUsername: "alice",
      forwardedFromLabel: "Alice",
    });
    expect(target).toMatchObject({
      kind: "user",
      userId: "u-1",
      username: "alice",
    });
  });

  test("label without any id falls back to self", () => {
    expect(resolveForwardedTarget({ storedForwardedLabel: "Someone" })).toEqual(
      { kind: "self" },
    );
  });

  test("no label resolves to null (header not interactive)", () => {
    expect(resolveForwardedTarget({})).toBeNull();
  });

  test("deleted origins resolve to null", () => {
    expect(
      resolveForwardedTarget({
        forwardedFromChatId: UUID,
        forwardedFromLabel: "x",
        isDeletedForwardedChat: true,
      }),
    ).toBeNull();
    expect(
      resolveForwardedTarget({
        forwardedFromUserId: "u-1",
        forwardedFromLabel: "x",
        isDeletedForwardedUser: true,
      }),
    ).toBeNull();
  });
});

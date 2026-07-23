import { describe, test, expect } from "vitest";
import {
  isRemoteChannelMessage,
  isMessageAuthoredByUser,
  isMessageFromOtherUser,
} from "../../src/utils/messageOwnership.js";

describe("isRemoteChannelMessage", () => {
  test('returns true when client_request_id starts with "remote:"', () => {
    expect(isRemoteChannelMessage({ client_request_id: "remote:abc123" })).toBe(
      true,
    );
  });

  test('returns true when clientRequestId starts with "remote:" (camelCase)', () => {
    expect(isRemoteChannelMessage({ clientRequestId: "remote:xyz" })).toBe(
      true,
    );
  });

  test('returns true when _clientId starts with "remote:"', () => {
    expect(isRemoteChannelMessage({ _clientId: "remote:foo" })).toBe(true);
  });

  test("returns true when isRemoteChannelMessage flag is true", () => {
    expect(isRemoteChannelMessage({ isRemoteChannelMessage: true })).toBe(true);
  });

  test("returns false for a regular message without remote prefix", () => {
    expect(isRemoteChannelMessage({ client_request_id: "local:abc123" })).toBe(
      false,
    );
  });

  test("returns false for null", () => {
    expect(isRemoteChannelMessage(null)).toBe(false);
  });

  test("returns false for an empty object", () => {
    expect(isRemoteChannelMessage({})).toBe(false);
  });

  test('is case-insensitive for the "remote:" prefix', () => {
    expect(isRemoteChannelMessage({ client_request_id: "REMOTE:abc" })).toBe(
      true,
    );
    expect(isRemoteChannelMessage({ client_request_id: "Remote:abc" })).toBe(
      true,
    );
  });
});

describe("isMessageAuthoredByUser", () => {
  const message = { username: "alice", user_id: 1 };

  test("returns true when message username matches user string", () => {
    expect(isMessageAuthoredByUser(message, "alice")).toBe(true);
  });

  test("is case-insensitive for username comparison", () => {
    expect(isMessageAuthoredByUser(message, "ALICE")).toBe(true);
    expect(isMessageAuthoredByUser(message, "Alice")).toBe(true);
  });

  test("returns false when username does not match", () => {
    expect(isMessageAuthoredByUser(message, "bob")).toBe(false);
  });

  test("returns true when user object username matches message username", () => {
    expect(isMessageAuthoredByUser(message, { username: "alice", id: 1 })).toBe(
      true,
    );
  });

  test("returns false when user object username does not match", () => {
    expect(isMessageAuthoredByUser(message, { username: "bob", id: 1 })).toBe(
      false,
    );
  });

  test("returns false for a remote channel message even if username matches", () => {
    const remoteMsg = { username: "alice", client_request_id: "remote:123" };
    expect(isMessageAuthoredByUser(remoteMsg, "alice")).toBe(false);
  });

  test("returns false when user is empty string", () => {
    expect(isMessageAuthoredByUser(message, "")).toBe(false);
  });

  test("returns false when user is null", () => {
    expect(isMessageAuthoredByUser(message, null)).toBe(false);
  });

  test("returns false when message is null", () => {
    expect(isMessageAuthoredByUser(null, "alice")).toBe(false);
  });
});

describe("isMessageFromOtherUser", () => {
  test("returns the inverse of isMessageAuthoredByUser", () => {
    const msg = { username: "alice" };
    expect(isMessageFromOtherUser(msg, "alice")).toBe(false);
    expect(isMessageFromOtherUser(msg, "bob")).toBe(true);
  });
});

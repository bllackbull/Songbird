import { describe, test, expect } from "vitest";
import {
  safeParseJson,
  normalizeMessageBody,
  buildChatListCacheKey,
  buildMessagesCacheKey,
  buildMessagesIndexKey,
  buildChannelSeenCacheKey,
  isCacheExpired,
  isCacheableMessage,
  sanitizeMessageForCache,
  pruneMessagesIndex,
  CHAT_CACHE_VERSION,
  CHAT_MESSAGES_INDEX_LIMIT,
} from "../../src/utils/chatCache.js";

// ─── safeParseJson ────────────────────────────────────────────────────────────

describe("safeParseJson", () => {
  test("parses a valid JSON string", () => {
    expect(safeParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  test("parses a JSON array", () => {
    expect(safeParseJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  test("returns null for invalid JSON", () => {
    expect(safeParseJson("not json")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(safeParseJson("")).toBeNull();
  });

  test("returns null for null", () => {
    expect(safeParseJson(null)).toBeNull();
  });

  test("returns null for undefined", () => {
    expect(safeParseJson(undefined)).toBeNull();
  });
});

// ─── normalizeMessageBody ─────────────────────────────────────────────────────

describe("normalizeMessageBody", () => {
  test("returns a string as-is", () => {
    expect(normalizeMessageBody("hello")).toBe("hello");
  });

  test('returns empty string for "[object Object]" string', () => {
    expect(normalizeMessageBody("[object Object]")).toBe("");
  });

  test("returns empty string for null", () => {
    expect(normalizeMessageBody(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(normalizeMessageBody(undefined)).toBe("");
  });

  test("extracts .text from an object", () => {
    expect(normalizeMessageBody({ text: "hi there" })).toBe("hi there");
  });

  test("falls back to .body when .text is absent", () => {
    expect(normalizeMessageBody({ body: "body text" })).toBe("body text");
  });

  test("returns empty string for an object with neither text nor body", () => {
    expect(normalizeMessageBody({ foo: "bar" })).toBe("");
  });

  test("coerces non-string primitives", () => {
    expect(normalizeMessageBody(42)).toBe("42");
  });
});

// ─── cache key builders ───────────────────────────────────────────────────────

describe("buildChatListCacheKey", () => {
  test("lowercases the username", () => {
    expect(buildChatListCacheKey("Alice")).toBe(
      "songbird-chat-list-cache:alice",
    );
  });

  test("handles empty username", () => {
    expect(buildChatListCacheKey("")).toBe("songbird-chat-list-cache:");
  });

  test("handles null username", () => {
    expect(buildChatListCacheKey(null)).toBe("songbird-chat-list-cache:");
  });
});

describe("buildMessagesCacheKey", () => {
  test("includes both username and chatId", () => {
    expect(buildMessagesCacheKey("Alice", 5)).toBe(
      "songbird-chat-messages-cache:alice:5",
    );
  });

  test("coerces chatId to a number", () => {
    expect(buildMessagesCacheKey("alice", "10")).toBe(
      "songbird-chat-messages-cache:alice:10",
    );
  });

  test("defaults chatId to 0 for falsy values", () => {
    expect(buildMessagesCacheKey("alice", null)).toBe(
      "songbird-chat-messages-cache:alice:0",
    );
  });
});

describe("buildMessagesIndexKey", () => {
  test("lowercases the username", () => {
    expect(buildMessagesIndexKey("Bob")).toBe(
      "songbird-chat-messages-index:bob",
    );
  });
});

describe("buildChannelSeenCacheKey", () => {
  test("includes both username and chatId", () => {
    expect(buildChannelSeenCacheKey("alice", 3)).toBe(
      "songbird-channel-seen:alice:3",
    );
  });
});

// ─── isCacheExpired ───────────────────────────────────────────────────────────

describe("isCacheExpired", () => {
  test("returns true for null entry", () => {
    expect(isCacheExpired(null, 10000)).toBe(true);
  });

  test("returns true for non-object entry", () => {
    expect(isCacheExpired("string", 10000)).toBe(true);
  });

  test("returns true when updatedAt is not a finite number", () => {
    expect(isCacheExpired({ updatedAt: "bad" }, 10000)).toBe(true);
  });

  test("returns false for a fresh entry", () => {
    const entry = { updatedAt: Date.now() - 1000 };
    expect(isCacheExpired(entry, 10000)).toBe(false);
  });

  test("returns true when entry is older than ttl", () => {
    const entry = { updatedAt: Date.now() - 20000 };
    expect(isCacheExpired(entry, 10000)).toBe(true);
  });

  test("returns false for an entry exactly at the ttl boundary", () => {
    // updatedAt = now → age = 0, which is <= ttlMs
    const entry = { updatedAt: Date.now() };
    expect(isCacheExpired(entry, 0)).toBe(false);
  });
});

// ─── isCacheableMessage ───────────────────────────────────────────────────────

describe("isCacheableMessage", () => {
  const validMessage = { id: 1, body: "hi", files: [] };

  test("returns true for a valid cacheable message", () => {
    expect(isCacheableMessage(validMessage)).toBe(true);
  });

  test("returns false for null", () => {
    expect(isCacheableMessage(null)).toBe(false);
  });

  test("returns false when id is 0", () => {
    expect(isCacheableMessage({ id: 0 })).toBe(false);
  });

  test("returns false when id is negative", () => {
    expect(isCacheableMessage({ id: -1 })).toBe(false);
  });

  test('returns false when _delivery is "sending"', () => {
    expect(isCacheableMessage({ ...validMessage, _delivery: "sending" })).toBe(
      false,
    );
  });

  test("returns false when _awaitingServerEcho is true", () => {
    expect(
      isCacheableMessage({ ...validMessage, _awaitingServerEcho: true }),
    ).toBe(false);
  });

  test("returns false when _processingPending is true", () => {
    expect(
      isCacheableMessage({ ...validMessage, _processingPending: true }),
    ).toBe(false);
  });

  test("returns false when files contain a blob URL", () => {
    const msg = { id: 1, files: [{ url: "blob:http://localhost/abc" }] };
    expect(isCacheableMessage(msg)).toBe(false);
  });

  test("returns false when files contain a _localUrl blob", () => {
    const msg = { id: 1, files: [{ _localUrl: "blob:http://localhost/abc" }] };
    expect(isCacheableMessage(msg)).toBe(false);
  });

  test("returns true when id comes from _serverId", () => {
    expect(isCacheableMessage({ _serverId: 42 })).toBe(true);
  });
});

// ─── sanitizeMessageForCache ──────────────────────────────────────────────────

describe("sanitizeMessageForCache", () => {
  test("strips all internal _ fields", () => {
    const msg = {
      id: 1,
      body: "hello",
      _files: [],
      _clientId: "abc",
      _chatId: 5,
      _queuedAt: 123,
      _delivery: "sent",
      _uploadType: "media",
      _uploadProgress: 0.5,
      _awaitingServerEcho: false,
      _processingPending: false,
      _serverId: 1,
      _visibilityTime: null,
      _readByMe: true,
    };
    const result = sanitizeMessageForCache(msg);
    expect(result).not.toHaveProperty("_files");
    expect(result).not.toHaveProperty("_clientId");
    expect(result).not.toHaveProperty("_chatId");
    expect(result).not.toHaveProperty("_delivery");
    expect(result).not.toHaveProperty("_serverId");
    expect(result).not.toHaveProperty("_readByMe");
  });

  test("preserves non-internal fields", () => {
    const msg = { id: 1, body: "hello", username: "alice" };
    const result = sanitizeMessageForCache(msg);
    expect(result.id).toBe(1);
    expect(result.username).toBe("alice");
  });

  test("normalizes the body through normalizeMessageBody", () => {
    const msg = { id: 1, body: "[object Object]" };
    expect(sanitizeMessageForCache(msg).body).toBe("");
  });

  test("strips internal file fields", () => {
    const msg = {
      id: 1,
      body: "hi",
      files: [
        {
          id: 10,
          url: "/api/file.jpg",
          _localUrl: "blob:x",
          _localId: "y",
          _uploadProgress: 0.9,
          _pending: true,
        },
      ],
    };
    const result = sanitizeMessageForCache(msg);
    const file = result.files[0];
    expect(file).not.toHaveProperty("_localUrl");
    expect(file).not.toHaveProperty("_localId");
    expect(file).not.toHaveProperty("_uploadProgress");
    expect(file).not.toHaveProperty("_pending");
    expect(file.id).toBe(10);
  });

  test("clears blob URLs from file.url", () => {
    const msg = {
      id: 1,
      body: "hi",
      files: [{ id: 10, url: "blob:http://localhost/abc" }],
    };
    expect(sanitizeMessageForCache(msg).files[0].url).toBe("");
  });

  test("normalizes replyTo body", () => {
    const msg = {
      id: 1,
      body: "reply",
      replyTo: { id: 2, body: "[object Object]" },
    };
    expect(sanitizeMessageForCache(msg).replyTo.body).toBe("");
  });

  test("returns non-object input as-is", () => {
    expect(sanitizeMessageForCache(null)).toBeNull();
    expect(sanitizeMessageForCache("string")).toBe("string");
  });
});

// ─── pruneMessagesIndex ───────────────────────────────────────────────────────

describe("pruneMessagesIndex", () => {
  test("returns entries sorted by updatedAt descending", () => {
    const index = [
      { chatId: 1, updatedAt: 100 },
      { chatId: 2, updatedAt: 300 },
      { chatId: 3, updatedAt: 200 },
    ];
    const result = pruneMessagesIndex("alice", index);
    expect(result[0].chatId).toBe(2);
    expect(result[1].chatId).toBe(3);
    expect(result[2].chatId).toBe(1);
  });

  test("filters out entries with invalid chatId", () => {
    const index = [
      { chatId: 0, updatedAt: 100 },
      { chatId: 5, updatedAt: 200 },
      { chatId: -1, updatedAt: 300 },
    ];
    const result = pruneMessagesIndex("alice", index);
    expect(result).toHaveLength(1);
    expect(result[0].chatId).toBe(5);
  });

  test("filters out entries with non-finite updatedAt", () => {
    const index = [
      { chatId: 1, updatedAt: NaN },
      { chatId: 2, updatedAt: 100 },
    ];
    const result = pruneMessagesIndex("alice", index);
    expect(result).toHaveLength(1);
    expect(result[0].chatId).toBe(2);
  });

  test(`trims to CHAT_MESSAGES_INDEX_LIMIT (${CHAT_MESSAGES_INDEX_LIMIT}) entries`, () => {
    const index = Array.from(
      { length: CHAT_MESSAGES_INDEX_LIMIT + 10 },
      (_, i) => ({
        chatId: i + 1,
        updatedAt: i,
      }),
    );
    const result = pruneMessagesIndex("alice", index);
    expect(result).toHaveLength(CHAT_MESSAGES_INDEX_LIMIT);
  });

  test("handles an empty index", () => {
    expect(pruneMessagesIndex("alice", [])).toEqual([]);
  });
});

// ─── constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  test("CHAT_CACHE_VERSION is a positive integer", () => {
    expect(Number.isInteger(CHAT_CACHE_VERSION)).toBe(true);
    expect(CHAT_CACHE_VERSION).toBeGreaterThan(0);
  });

  test("CHAT_MESSAGES_INDEX_LIMIT is a positive integer", () => {
    expect(Number.isInteger(CHAT_MESSAGES_INDEX_LIMIT)).toBe(true);
    expect(CHAT_MESSAGES_INDEX_LIMIT).toBeGreaterThan(0);
  });
});

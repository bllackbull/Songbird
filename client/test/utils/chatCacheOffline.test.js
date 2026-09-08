import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import * as chatCache from "../../src/utils/chatCache.js";
import * as cacheDb from "../../src/utils/cacheDb.js";
import { OPEN_CHAT_ID_KEY } from "../../src/utils/chatPageConstants.js";

describe("chatCache offline behavior", () => {
  const username = "testuser";
  const chatId = "c123-chat-uuid";

  beforeEach(() => {
    vi.stubGlobal("window", { indexedDB: {} });
    vi.stubGlobal("navigator", { onLine: false });
    vi.spyOn(cacheDb, "isIdbAvailable").mockReturnValue(true);
    vi.spyOn(chatCache, "canUseIdb").mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("readMessagesCacheAsync preserves expired cache entries when offline", async () => {
    const oldTimestamp = Date.now() - 1000 * 60 * 60 * 48; // 48 hours old
    const cachePayload = {
      chatId,
      version: chatCache.CHAT_CACHE_VERSION,
      messages: [{ id: "m1", body: "Hello offline world" }],
      updatedAt: oldTimestamp,
    };

    vi.spyOn(cacheDb, "idbGet").mockResolvedValue({ data: cachePayload });

    const result = await chatCache.readMessagesCacheAsync(username, chatId);
    expect(result).not.toBeNull();
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].body).toBe("Hello offline world");
  });

  test("readChatListCacheAsync preserves expired chat list when offline", async () => {
    const oldTimestamp = Date.now() - 1000 * 60 * 60 * 48; // 48 hours old
    const cachePayload = {
      version: chatCache.CHAT_CACHE_VERSION,
      chats: [{ id: chatId, name: "General", type: "group" }],
      updatedAt: oldTimestamp,
    };

    vi.spyOn(cacheDb, "idbGet").mockResolvedValue({ data: cachePayload });

    const result = await chatCache.readChatListCacheAsync(username);
    expect(result).not.toBeNull();
    expect(result.chats).toHaveLength(1);
    expect(result.chats[0].id).toBe(chatId);
  });

  test("OPEN_CHAT_ID_KEY restoration matches cached chat cleanly", async () => {
    const sessionStorageMap = new Map();
    sessionStorageMap.set(OPEN_CHAT_ID_KEY, chatId);

    const mockSessionStorage = {
      getItem: (key) => sessionStorageMap.get(key) || null,
      setItem: (k, v) => sessionStorageMap.set(k, String(v)),
      removeItem: (k) => sessionStorageMap.delete(k),
    };

    vi.stubGlobal("window", {
      indexedDB: {},
      sessionStorage: mockSessionStorage,
    });

    const cachePayload = {
      version: chatCache.CHAT_CACHE_VERSION,
      chats: [
        { id: chatId, name: "Offline Group", type: "group" },
        { id: "c456", name: "Other Chat", type: "dm", members: [{ username: "other" }] },
      ],
      updatedAt: Date.now(),
    };

    vi.spyOn(cacheDb, "idbGet").mockResolvedValue({ data: cachePayload });

    const cached = await chatCache.readChatListCacheAsync(username);
    expect(cached).not.toBeNull();

    const storedChatId = window.sessionStorage.getItem(OPEN_CHAT_ID_KEY);
    const activeChat = cached.chats.find((c) => c.id === storedChatId);
    expect(activeChat).toBeDefined();
    expect(activeChat.id).toBe(chatId);
  });
});

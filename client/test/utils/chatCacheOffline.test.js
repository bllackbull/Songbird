import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import * as chatCache from "../../src/utils/chatCache.js";
import * as cacheDb from "../../src/utils/cacheDb.js";

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
});

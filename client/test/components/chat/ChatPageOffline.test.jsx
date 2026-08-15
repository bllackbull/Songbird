import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ChatPage from "../../../src/pages/ChatPage.jsx";
import { OPEN_CHAT_ID_KEY } from "../../../src/utils/chatPageConstants.js";
import { CACHE_STORES } from "../../../src/utils/cacheDb.js";
import {
  writeIdbCache,
  deleteIdbCache,
  CHAT_CACHE_VERSION,
} from "../../../src/utils/chatCache.js";

describe("ChatPage — Offline Active Chat Restoration", () => {
  const user = { username: "testuser", role: "user" };

  beforeEach(() => {
    // Stub fetch to simulate offline network failure
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch (offline)")),
    );
  });

  afterEach(async () => {
    window.sessionStorage.removeItem(OPEN_CHAT_ID_KEY);
    await deleteIdbCache(
      CACHE_STORES.chatList,
      `songbird-chat-list-cache:testuser`,
    );
    vi.unstubAllGlobals();
  });

  test("restores active group chat state from cache when OPEN_CHAT_ID_KEY is in sessionStorage", async () => {
    const cachedGroupId = "offline-group-101";
    window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, cachedGroupId);

    const cachedChats = [
      {
        id: cachedGroupId,
        name: "Offline Restored Group",
        type: "group",
        group_color: "#10b981",
        allow_member_invites: 1,
        members_count: 4,
        last_message: "Cached offline message",
      },
      {
        id: "offline-dm-202",
        name: "Other User",
        type: "dm",
        members: [{ username: "testuser" }, { username: "other" }],
      },
    ];

    await writeIdbCache(
      CACHE_STORES.chatList,
      `songbird-chat-list-cache:testuser`,
      {
        version: CHAT_CACHE_VERSION,
        chats: cachedChats,
        updatedAt: Date.now(),
      },
    );

    render(
      <ChatPage
        user={user}
        setUser={vi.fn()}
        isDark={false}
        setIsDark={vi.fn()}
        toggleTheme={vi.fn()}
      />,
    );

    // Verify active chat header title displays the restored group name
    await expect
      .element(page.getByText("Offline Restored Group").first())
      .toBeInTheDocument();
  });

  test("restores active DM chat state and peer from cache when OPEN_CHAT_ID_KEY is in sessionStorage", async () => {
    const cachedDmId = "offline-dm-202";
    window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, cachedDmId);

    const cachedChats = [
      {
        id: "offline-group-101",
        name: "Some Group",
        type: "group",
      },
      {
        id: cachedDmId,
        name: "Alice Peer",
        type: "dm",
        members: [
          { username: "testuser", nickname: "Test User" },
          { username: "alice_peer", nickname: "Alice Peer" },
        ],
        last_message: "Hey offline friend",
      },
    ];

    await writeIdbCache(
      CACHE_STORES.chatList,
      `songbird-chat-list-cache:testuser`,
      {
        version: CHAT_CACHE_VERSION,
        chats: cachedChats,
        updatedAt: Date.now(),
      },
    );

    render(
      <ChatPage
        user={user}
        setUser={vi.fn()}
        isDark={false}
        setIsDark={vi.fn()}
        toggleTheme={vi.fn()}
      />,
    );

    // Verify active chat title renders the restored DM peer name
    await expect
      .element(page.getByText("Alice Peer").first())
      .toBeInTheDocument();
  });

  test("leaves active chat unselected when OPEN_CHAT_ID_KEY is not in sessionStorage", async () => {
    window.sessionStorage.removeItem(OPEN_CHAT_ID_KEY);

    const cachedChats = [
      {
        id: "offline-group-101",
        name: "Offline Group",
        type: "group",
      },
    ];

    await writeIdbCache(
      CACHE_STORES.chatList,
      `songbird-chat-list-cache:testuser`,
      {
        version: CHAT_CACHE_VERSION,
        chats: cachedChats,
        updatedAt: Date.now(),
      },
    );

    render(
      <ChatPage
        user={user}
        setUser={vi.fn()}
        isDark={false}
        setIsDark={vi.fn()}
        toggleTheme={vi.fn()}
      />,
    );

    // Sidebar should display cached chat
    await expect
      .element(page.getByText("Offline Group").first())
      .toBeInTheDocument();

    // Verify empty chat / select a chat prompt is shown when no active chat is selected
    await expect
      .element(page.getByText(/select a chat/i).first())
      .toBeInTheDocument();
  });
});

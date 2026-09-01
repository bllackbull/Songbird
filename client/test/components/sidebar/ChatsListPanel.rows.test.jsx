/**
 * Row layout and divider tests for ChatsListPanel
 */
import "../../../src/index.css";
import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ChatsListPanel from "../../../src/components/sidebar/list/ChatsListPanel.jsx";

const ME = { id: 1, username: "alice", nickname: "Alice", color: "#10b981" };

function makeDmChat(id, username, nickname) {
  return {
    id,
    type: "dm",
    verified: false,
    members: [
      {
        id: ME.id,
        username: ME.username,
        nickname: ME.nickname,
        color: ME.color,
        status: "offline",
        role: "member",
        user_role: "user",
        user_verified: 0,
      },
      {
        id: id * 10,
        username,
        nickname,
        avatar_url: null,
        color: "#3b82f6",
        status: "offline",
        role: "member",
        user_role: "user",
        user_verified: 0,
      },
    ],
    last_message: "Hello there",
    last_time: "2026-09-01T12:00:00Z",
    last_message_files: [],
    unread_count: 0,
    _muted: false,
  };
}

const BASE_PROPS = {
  loadingChats: false,
  visibleChats: [],
  user: ME,
  editMode: false,
  activeChatId: null,
  selectedChats: [],
  formatChatTimestamp: (t) => (t ? "12:00 PM" : ""),
  requestDeleteChats: vi.fn(),
  toggleSelectChat: vi.fn(),
  setActiveChatId: vi.fn(),
  setActivePeer: vi.fn(),
  setMobileTab: vi.fn(),
  setUnreadInChat: vi.fn(),
  lastMessageIdRef: { current: null },
  chatsSearchQuery: "",
  chatsSearchFocused: false,
  discoverLoading: false,
  discoverUsers: [],
  discoverGroups: [],
  discoverChannels: [],
  discoverSaved: false,
  isSavedChatActive: false,
};

describe("ChatsListPanel — row layout & dividers", () => {
  test("renders chat list items as full-width rows without rounded card borders", async () => {
    const chats = [
      makeDmChat(101, "bob", "Bob"),
      makeDmChat(102, "carol", "Carol"),
    ];

    render(<ChatsListPanel {...BASE_PROPS} visibleChats={chats} />);

    const bobButton = page.getByRole("button", { name: /Bob/i });
    await expect.element(bobButton).toBeInTheDocument();

    // Verify there are no card-like rounded-2xl classes on the chat rows
    const cardElements = document.querySelectorAll(".rounded-2xl");
    expect(cardElements.length).toBe(0);
  });

  test("renders avatar-inset divider line on intermediate rows and omits on last row", async () => {
    const chats = [
      makeDmChat(101, "bob", "Bob"),
      makeDmChat(102, "carol", "Carol"),
    ];

    render(<ChatsListPanel {...BASE_PROPS} visibleChats={chats} />);

    const bobButton = page.getByRole("button", { name: /Bob/i });
    await expect.element(bobButton).toBeInTheDocument();

    const borders = document.querySelectorAll(".border-b");
    // Only the first item (intermediate) has the border-b divider
    expect(borders.length).toBe(1);
  });

  test("renders empty chat row (no text/messages) with the exact same height as a chat with messages", async () => {
    const chatWithMsg = makeDmChat(101, "bob", "Bob");
    const emptyChat = {
      ...makeDmChat(102, "carol", "Carol"),
      last_message: null,
      last_time: null,
      last_message_files: [],
    };

    render(
      <ChatsListPanel
        {...BASE_PROPS}
        visibleChats={[chatWithMsg, emptyChat]}
      />,
    );

    const bobButton = page.getByRole("button", { name: /Bob/i });
    const carolButton = page.getByRole("button", { name: /Carol/i });
    await expect.element(bobButton).toBeInTheDocument();
    await expect.element(carolButton).toBeInTheDocument();

    const bobEl = bobButton.element();
    const carolEl = carolButton.element();

    const bobHeight = bobEl.getBoundingClientRect().height;
    const carolHeight = carolEl.getBoundingClientRect().height;

    expect(carolHeight).toBeGreaterThan(0);
    expect(carolHeight).toBe(bobHeight);
  });

  test("centers row pill symmetrically between the divider line above and the divider line below", async () => {
    const chats = [
      makeDmChat(101, "bob", "Bob"),
      makeDmChat(102, "carol", "Carol"),
      makeDmChat(103, "dave", "Dave"),
    ];

    render(<ChatsListPanel {...BASE_PROPS} visibleChats={chats} />);

    const carolButton = page.getByRole("button", { name: /Carol/i });
    await expect.element(carolButton).toBeInTheDocument();

    const dividers = document.querySelectorAll(".border-b");
    expect(dividers.length).toBe(2);

    const dividerAbove = dividers[0].getBoundingClientRect();
    const dividerBelow = dividers[1].getBoundingClientRect();
    const carolPill = carolButton.element().getBoundingClientRect();

    const spaceAbove = carolPill.top - dividerAbove.bottom;
    const spaceBelow = dividerBelow.top - carolPill.bottom;

    expect(spaceAbove).toBeGreaterThan(0);
    expect(spaceBelow).toBeGreaterThan(0);
    expect(Math.abs(spaceAbove - spaceBelow)).toBeLessThanOrEqual(1);
  });

  test("highlights the active chat row without card borders", async () => {
    const chats = [
      makeDmChat(101, "bob", "Bob"),
      makeDmChat(102, "carol", "Carol"),
    ];

    render(
      <ChatsListPanel
        {...BASE_PROPS}
        visibleChats={chats}
        activeChatId={101}
      />,
    );

    const bobButton = page.getByRole("button", { name: /Bob/i });
    await expect.element(bobButton).toBeInTheDocument();

    const activeRows = document.querySelectorAll(".bg-emerald-50");
    expect(activeRows.length).toBe(1);
  });

  test("renders discover search results as rows with avatar-inset dividers", async () => {
    const discoverUsers = [
      {
        id: 1,
        username: "user1",
        nickname: "User One",
        color: "#10b981",
        role: "member",
      },
      {
        id: 2,
        username: "user2",
        nickname: "User Two",
        color: "#3b82f6",
        role: "member",
      },
    ];

    render(
      <ChatsListPanel
        {...BASE_PROPS}
        chatsSearchFocused={true}
        chatsSearchQuery="user"
        discoverUsers={discoverUsers}
      />,
    );

    const userOneButton = page.getByRole("button", { name: /User One/i });
    await expect.element(userOneButton).toBeInTheDocument();

    // No rounded card borders
    const cardElements = document.querySelectorAll(".rounded-2xl");
    expect(cardElements.length).toBe(0);

    // Intermediate divider on first user, omitted on last user
    const borders = document.querySelectorAll(".border-b");
    expect(borders.length).toBe(1);
  });
});

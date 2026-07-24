/**
 * Badge tests for MessageItem forwarded-from header — the "Forwarded from"
 * label and origin-name button that appears above forwarded messages.
 *
 * Covers two forwarded origins:
 *   1. Forwarded from a user  (forwarded_from_user_id > 0)
 *   2. Forwarded from a chat/channel (forwarded_from_chat_id > 0)
 *
 * Tests run at both desktop (1280×800) and mobile (390×844) viewports.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageItem } from "../../../src/components/chat/messages/MessageItem.jsx";

const ME = { id: 1, username: "alice", nickname: "Alice", color: "#10b981" };
const BOB = { id: 2, username: "bob", nickname: "Bob", color: "#3b82f6" };

// Message forwarded from a user
function makeUserForwardedMsg(overrides = {}) {
  return {
    id: 1,
    user_id: BOB.id,
    username: BOB.username,
    nickname: BOB.nickname,
    color: BOB.color,
    avatar_url: null,
    body: "Forwarded content",
    created_at: "2024-01-01T12:00:00.000Z",
    read_at: null,
    read_by_user_id: null,
    edited: 0,
    files: [],
    replyTo: null,
    user_verified: 0,
    user_role: "user",
    forwarded_from_user_id: 3,
    forwarded_from_label: "Carol",
    forwarded_from_username: "carol",
    forwarded_from_avatar_url: null,
    forwarded_from_color: "#f59e0b",
    forwarded_from_chat_id: 0,
    ...overrides,
  };
}

// Message forwarded from a channel/group chat
function makeChatForwardedMsg(overrides = {}) {
  return {
    id: 2,
    user_id: BOB.id,
    username: BOB.username,
    nickname: BOB.nickname,
    color: BOB.color,
    avatar_url: null,
    body: "Channel post",
    created_at: "2024-01-01T12:00:00.000Z",
    read_at: null,
    read_by_user_id: null,
    edited: 0,
    files: [],
    replyTo: null,
    user_verified: 0,
    user_role: "user",
    forwarded_from_chat_id: 99,
    forwarded_from_label: "News Channel",
    forwarded_from_username: "news_channel",
    forwarded_from_avatar_url: null,
    forwarded_from_color: "#10b981",
    forwarded_from_user_id: 0,
    ...overrides,
  };
}

// Keep old name as alias so existing tests don't need rewriting
const makeForwardedMsg = makeUserForwardedMsg;

function makeForwardedUser(overrides = {}) {
  return {
    id: 3,
    username: "carol",
    nickname: "Carol",
    avatar_url: null,
    color: "#f59e0b",
    status: "online",
    verified: false,
    role: "user",
    ...overrides,
  };
}

function makeForwardedChat(overrides = {}) {
  return {
    id: 99,
    name: "News Channel",
    type: "channel",
    group_avatar_url: null,
    group_color: "#10b981",
    verified: false,
    ...overrides,
  };
}

const BASE_PROPS = {
  user: ME,
  isFirstInGroup: true,
  formatTime: () => "12:00",
  unreadMarkerId: null,
  messageFilesProps: {},
  getMessageDayLabel: null,
  isDesktop: true,
  isMobileTouchDevice: false,
  isGroupChat: false,
  isChannelChat: false,
  onReply: vi.fn(),
  onJumpToMessage: vi.fn(),
  onForwardMessage: vi.fn(),
  onOpenSenderProfile: null,
  onOpenMention: null,
  onOpenForwardOrigin: vi.fn(),
  onOpenContextMenu: null,
};

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

for (const [label, viewport] of [
  ["desktop", DESKTOP_VIEWPORT],
  ["mobile", MOBILE_VIEWPORT],
]) {
  describe(`MessageItem forwarded-from header badges — ${label} (${viewport.width}px)`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    test("shows Verified badge for a verified forwarded user", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={makeForwardedUser({ verified: true })}
          forwardedUserStatus="ready"
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    });

    test("hides Verified badge for unverified forwarded user", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={makeForwardedUser({ verified: false })}
          forwardedUserStatus="ready"
        />,
      );
      await expect
        .element(page.getByText("Forwarded from"))
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
    });

    test("shows Owner badge for forwarded user with role='owner'", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={makeForwardedUser({ role: "owner" })}
          forwardedUserStatus="ready"
        />,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .toBeInTheDocument();
    });

    test("shows Admin badge for forwarded user with role='admin'", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={makeForwardedUser({ role: "admin" })}
          forwardedUserStatus="ready"
        />,
      );
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows no role badge for plain forwarded user", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={makeForwardedUser({ role: "user" })}
          forwardedUserStatus="ready"
        />,
      );
      await expect
        .element(page.getByText("Forwarded from"))
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("shows both Verified and Admin badges for verified admin forwarded user", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={makeForwardedUser({ verified: true, role: "admin" })}
          forwardedUserStatus="ready"
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows no badges for plain unverified forwarded user", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={makeForwardedUser({ verified: false, role: "user" })}
          forwardedUserStatus="ready"
        />,
      );
      await expect
        .element(page.getByText("Forwarded from"))
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("no badges shown when forwarded user is not yet resolved (null)", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={null}
          forwardedUserStatus={null}
        />,
      );
      // "Forwarded from" label still shows but no user badges
      await expect
        .element(page.getByText("Forwarded from"))
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
    });

    test("Verified badge appears before role badge in DOM", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeForwardedMsg()}
          forwardedUser={makeForwardedUser({ verified: true, role: "owner" })}
          forwardedUserStatus="ready"
        />,
      );
      const verified = page.getByLabelText("Verified");
      const owner = page.getByLabelText("Server Owner");
      await expect.element(verified).toBeInTheDocument();
      await expect.element(owner).toBeInTheDocument();
      const verifiedEl = verified.element();
      const ownerEl = owner.element();
      expect(
        verifiedEl.compareDocumentPosition(ownerEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  // ─── Forwarded from a channel/group chat ─────────────────────────────────────

  describe(`MessageItem forwarded-from chat/channel badges — ${label}`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    test("shows Verified badge for a verified forwarded channel", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeChatForwardedMsg()}
          forwardedChat={makeForwardedChat({ verified: true })}
          forwardedChatStatus="ready"
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    });

    test("hides Verified badge for unverified forwarded channel", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeChatForwardedMsg()}
          forwardedChat={makeForwardedChat({ verified: false })}
          forwardedChatStatus="ready"
        />,
      );
      await expect
        .element(page.getByText("Forwarded from"))
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
    });

    test("does NOT show role badge for forwarded channel (chats have no server role)", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeChatForwardedMsg()}
          forwardedChat={makeForwardedChat({ verified: true })}
          forwardedChatStatus="ready"
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("no Verified badge when forwarded chat is not yet resolved (null)", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          msg={makeChatForwardedMsg()}
          forwardedChat={null}
          forwardedChatStatus={null}
        />,
      );
      await expect
        .element(page.getByText("Forwarded from"))
        .toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
    });
  });
}

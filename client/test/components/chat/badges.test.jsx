/**
 * Badge rendering tests for MessageItem — covers:
 *   - Sender name row (with-avatar branch, group chat)
 *   - Sender name row (compact/no-avatar branch, group chat)
 *   - Reply chip author name inside the message bubble
 *
 * All suites run at both desktop (1280×800) and mobile (390×844) viewports
 * to guarantee badges appear in both rendering contexts.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageItem } from "../../../src/components/chat/messages/MessageItem.jsx";

const ME = { id: 1, username: "alice", nickname: "Alice", color: "#10b981" };
const BOB = { id: 2, username: "bob", nickname: "Bob", color: "#3b82f6" };

function makeMsg(overrides = {}) {
  return {
    id: 1,
    user_id: BOB.id,
    username: BOB.username,
    nickname: BOB.nickname,
    color: BOB.color,
    avatar_url: null,
    body: "Hello world",
    created_at: "2024-01-01T12:00:00.000Z",
    read_at: null,
    read_by_user_id: null,
    edited: 0,
    files: [],
    replyTo: null,
    user_verified: 0,
    user_role: "user",
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
  onOpenForwardOrigin: null,
  onOpenContextMenu: null,
};

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

for (const [label, viewport] of [
  ["desktop", DESKTOP_VIEWPORT],
  ["mobile", MOBILE_VIEWPORT],
]) {
  // ─── Sender badges — with-avatar branch ──────────────────────────────────────

  describe(`MessageItem sender badges (with-avatar, first-in-group) — ${label}`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    test("shows Verified badge when user_verified=1", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({ user_verified: 1 })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    });

    test("shows Owner badge when user_role='owner'", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({ user_role: "owner" })}
        />,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .toBeInTheDocument();
    });

    test("shows Admin badge when user_role='admin'", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({ user_role: "admin" })}
        />,
      );
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows both Verified and Owner for verified owner", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({ user_verified: 1, user_role: "owner" })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .toBeInTheDocument();
    });

    test("shows both Verified and Admin for verified admin", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({ user_verified: 1, user_role: "admin" })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows no badges for plain unverified user", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({ user_verified: 0, user_role: "user" })}
        />,
      );
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

    test("no badges for deleted author even if flags set", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({
            username: "deleted",
            nickname: "Deleted user",
            user_verified: 1,
            user_role: "owner",
          })}
        />,
      );
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
    });

    test("no sender badges on own messages", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({
            user_id: ME.id,
            username: ME.username,
            nickname: ME.nickname,
            color: ME.color,
            user_verified: 1,
            user_role: "admin",
          })}
        />,
      );
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("Verified badge appears before role badge in DOM", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={true}
          msg={makeMsg({ user_verified: 1, user_role: "admin" })}
        />,
      );
      const verified = page.getByLabelText("Verified");
      const admin = page.getByLabelText("Server Admin");
      await expect.element(verified).toBeInTheDocument();
      await expect.element(admin).toBeInTheDocument();
      const verifiedEl = await verified.element();
      const adminEl = await admin.element();
      expect(
        verifiedEl.compareDocumentPosition(adminEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  // ─── Sender badges — compact/no-avatar branch ────────────────────────────────

  describe(`MessageItem sender badges (compact, not-first-in-group) — ${label}`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    test("shows Verified badge in compact sender name", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={false}
          msg={makeMsg({ user_verified: 1 })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    });

    test("shows Owner badge in compact sender name", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={false}
          msg={makeMsg({ user_role: "owner" })}
        />,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .toBeInTheDocument();
    });

    test("shows both badges in compact sender name", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={false}
          msg={makeMsg({ user_verified: 1, user_role: "admin" })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows no badges for plain user in compact sender name", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={false}
          msg={makeMsg({ user_verified: 0, user_role: "user" })}
        />,
      );
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

    test("compact: Verified appears before role badge in DOM", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          isFirstInGroup={false}
          msg={makeMsg({ user_verified: 1, user_role: "owner" })}
        />,
      );
      const verified = page.getByLabelText("Verified");
      const owner = page.getByLabelText("Server Owner");
      await expect.element(verified).toBeInTheDocument();
      await expect.element(owner).toBeInTheDocument();
      const verifiedEl = await verified.element();
      const ownerEl = await owner.element();
      expect(
        verifiedEl.compareDocumentPosition(ownerEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  // ─── Reply chip badges (inside the message bubble) ───────────────────────────

  describe(`MessageItem reply chip badges — ${label}`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    function makeReply(overrides = {}) {
      return {
        id: 99,
        body: "Original",
        username: "bob",
        nickname: "Bob",
        color: "#3b82f6",
        verified: false,
        role: "user",
        ...overrides,
      };
    }

    test("shows Verified badge in reply chip when verified=true", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          msg={makeMsg({ replyTo: makeReply({ verified: true }) })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    });

    test("shows Admin badge in reply chip when role='admin'", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          msg={makeMsg({ replyTo: makeReply({ role: "admin" }) })}
        />,
      );
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows both badges for verified admin in reply chip", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          msg={makeMsg({
            replyTo: makeReply({ verified: true, role: "admin" }),
          })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows no badges for plain user in reply chip", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          msg={makeMsg({
            replyTo: makeReply({ verified: false, role: "user" }),
          })}
        />,
      );
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

    test("shows verified badge in channel reply chip (channel is verified)", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isChannelChat={true}
          msg={makeMsg({
            replyTo: makeReply({ verified: true, role: "admin" }),
          })}
        />,
      );
      // Verified badge shows — the channel itself can be verified
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
      // Role badge is suppressed — channels don't have user server roles
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("suppresses role badge in channel reply chip", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isChannelChat={true}
          msg={makeMsg({
            replyTo: makeReply({ verified: false, role: "owner" }),
          })}
        />,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
    });

    test("reply chip: Verified appears before role badge in DOM", async () => {
      render(
        <MessageItem
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          isGroupChat={true}
          msg={makeMsg({
            replyTo: makeReply({ verified: true, role: "owner" }),
          })}
        />,
      );
      const verified = page.getByLabelText("Verified");
      const owner = page.getByLabelText("Server Owner");
      await expect.element(verified).toBeInTheDocument();
      await expect.element(owner).toBeInTheDocument();
      const verifiedEl = await verified.element();
      const ownerEl = await owner.element();
      expect(
        verifiedEl.compareDocumentPosition(ownerEl) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
}

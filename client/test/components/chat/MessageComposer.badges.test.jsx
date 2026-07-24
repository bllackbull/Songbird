/**
 * Badge tests for MessageComposer reply strip — the banner that appears
 * above the text input when you are replying to a message.
 *
 * Tests run at both desktop (1280×800) and mobile (390×844) viewport sizes
 * because the same component renders in both contexts.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { MessageComposer } from "../../../src/components/chat/messages/MessageComposer.jsx";

// Minimum props that keep the composer renderable without crashing
const BASE_PROPS = {
  activeChatId: 1,
  isDesktop: true,
  fileUploadEnabled: false,
  voiceMessagesEnabled: false,
  canSend: true,
  handleSend: vi.fn(),
  onComposerResize: vi.fn(),
  replyTarget: null,
  onClearReply: vi.fn(),
  editTarget: null,
  onClearEdit: vi.fn(),
  onReplyToMessage: vi.fn(),
  pendingUploadFiles: [],
  pendingUploadType: null,
  onAddPendingUpload: vi.fn(),
  onRemovePendingUpload: vi.fn(),
  onClearPendingUploads: vi.fn(),
  uploadError: null,
  activeUploadProgress: null,
  pendingVoiceMessage: null,
  onClearPendingVoiceMessage: vi.fn(),
  onMessageInput: vi.fn(),
  isChannelChat: false,
};

function makeReplyTarget(overrides = {}) {
  return {
    id: 10,
    username: "bob",
    nickname: "Bob",
    displayName: "Bob",
    body: "Hey there",
    icon: null,
    color: "#3b82f6",
    verified: false,
    role: null,
    ...overrides,
  };
}

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

for (const [label, viewport] of [
  ["desktop", DESKTOP_VIEWPORT],
  ["mobile", MOBILE_VIEWPORT],
]) {
  describe(`MessageComposer reply strip — ${label} (${viewport.width}px)`, () => {
    beforeEach(async () => {
      await page.viewport(viewport.width, viewport.height);
    });

    test("shows Verified badge when replyTarget.verified=true", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={makeReplyTarget({ verified: true })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
    });

    test("hides Verified badge when replyTarget.verified=false", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={makeReplyTarget({ verified: false })}
        />,
      );
      // Wait for the "Reply to Bob" label to confirm the strip is rendered
      await expect.element(page.getByText(/Reply to/)).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
    });

    test("shows Owner badge when replyTarget.role='owner'", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={makeReplyTarget({ role: "owner" })}
        />,
      );
      await expect
        .element(page.getByLabelText("Server Owner"))
        .toBeInTheDocument();
    });

    test("shows Admin badge when replyTarget.role='admin'", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={makeReplyTarget({ role: "admin" })}
        />,
      );
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows no role badge for plain user", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={makeReplyTarget({ role: null })}
        />,
      );
      await expect.element(page.getByText(/Reply to/)).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .not.toBeInTheDocument();
    });

    test("shows both Verified and Admin badges for verified admin", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={makeReplyTarget({ verified: true, role: "admin" })}
        />,
      );
      await expect.element(page.getByLabelText("Verified")).toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Admin"))
        .toBeInTheDocument();
    });

    test("shows no badges for plain unverified user", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={makeReplyTarget({ verified: false, role: null })}
        />,
      );
      await expect.element(page.getByText(/Reply to/)).toBeInTheDocument();
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

    test("Verified badge appears before role badge in DOM", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={makeReplyTarget({ verified: true, role: "owner" })}
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

    test("no badges shown when no replyTarget", async () => {
      render(
        <MessageComposer
          {...BASE_PROPS}
          isDesktop={label === "desktop"}
          replyTarget={null}
        />,
      );
      await expect
        .element(page.getByLabelText("Verified"))
        .not.toBeInTheDocument();
      await expect
        .element(page.getByLabelText("Server Owner"))
        .not.toBeInTheDocument();
    });
  });
}

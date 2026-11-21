import { beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { useState } from "react";
import { useOverlayBack } from "../../../src/hooks/chat/useOverlayBack.js";

function BackHarness() {
  const [open, setOpen] = useState(false);
  const [closedByBack, setClosedByBack] = useState(false);
  useOverlayBack(
    open,
    () => {
      setClosedByBack(true);
      setOpen(false);
    },
    "sbChatOpen",
  );
  return (
    <>
      <button data-testid="open-chat" onClick={() => setOpen(true)}>
        open chat
      </button>
      <button data-testid="close-chat" onClick={() => setOpen(false)}>
        close chat
      </button>
      {open && <div data-testid="chat-view">chat</div>}
      {closedByBack && <div data-testid="closed-by-back">closed</div>}
    </>
  );
}

async function openChat() {
  render(<BackHarness />);
  await userEvent.click(page.getByTestId("open-chat"));
  await vi.waitFor(() => {
    expect(window.history.state?.sbChatOpen).toBe(true);
  });
}

beforeEach(() => {
  // Simulate the app's own SPA navigation history so a stray history.back()
  // while the fix is missing stays inside the test document.
  window.history.pushState(
    {
      sbBaseline: (window.__sbBaselineSeq = (window?.__sbBaselineSeq || 0) + 1),
    },
    "",
  );
  window.__sbBaselineMarker = window.history.state?.sbBaseline;
});

describe("useOverlayBack (Android system back)", () => {
  test("back gesture closes the open chat instead of exiting the app", async () => {
    await openChat();

    // The Android system back button behaves like history.back().
    window.history.back();

    await expect.element(page.getByTestId("chat-view")).not.toBeInTheDocument();
    await expect
      .element(page.getByTestId("closed-by-back"))
      .toBeInTheDocument();
    await vi.waitFor(() => {
      // The sentinel entry was popped; we land on the baseline entry.
      expect(window.history.state?.sbBaseline).toBe(window.__sbBaselineMarker);
    });
  });

  test("closing the chat with the close button pops the sentinel entry", async () => {
    await openChat();

    await userEvent.click(page.getByTestId("close-chat"));

    await expect.element(page.getByTestId("chat-view")).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(window.history.state?.sbBaseline).toBe(window.__sbBaselineMarker);
    });
  });

  test("one back gesture closes only the topmost overlay", async () => {
    function StackHarness() {
      const [stage, setStage] = useState("media");
      // Chat entry is pushed first, media entry on top — matches real usage.
      useOverlayBack(
        stage !== "closed",
        () => setStage("closed"), // close chat
        "sbChatOpen",
      );
      useOverlayBack(
        stage === "media",
        () => setStage("chat"), // close media, reveal the chat
        "sbMediaModal",
      );
      return (
        <>
          {stage === "media" && <div data-testid="media-open">media</div>}
          {stage !== "closed" && <div data-testid="chat-open">chat</div>}
        </>
      );
    }
    render(<StackHarness />);
    await vi.waitFor(() => {
      expect(window.history.state?.sbMediaModal).toBe(true);
    });

    window.history.back();

    // Media closes, chat stays open. One press, one thing.
    await expect
      .element(page.getByTestId("media-open"))
      .not.toBeInTheDocument();
    await expect.element(page.getByTestId("chat-open")).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(window.history.state?.sbChatOpen).toBe(true);
    });

    window.history.back();

    await expect.element(page.getByTestId("chat-open")).not.toBeInTheDocument();
    await vi.waitFor(() => {
      expect(window.history.state?.sbBaseline).toBe(window.__sbBaselineMarker);
    });
  });

  test("back gesture is ignored while no chat is open", async () => {
    render(<BackHarness />);

    window.history.back();

    await expect
      .element(page.getByTestId("closed-by-back"))
      .not.toBeInTheDocument();
    await vi.waitFor(() => {
      // Moved off our baseline entry (popped a foreign one); the hook must
      // have ignored the pop and closed nothing.
      expect(window.history.state?.sbBaseline).not.toBe(
        window.__sbBaselineMarker,
      );
    });
  });

  test("confirming an overlay opened over a closing overlay keeps the chat open", async () => {
    function DeleteFlowHarness() {
      const [chatOpen, setChatOpen] = useState(false);
      const [menuOpen, setMenuOpen] = useState(false);
      const [modalOpen, setModalOpen] = useState(false);
      const [chatClosedByBack, setChatClosedByBack] = useState(false);

      // Order matches ChatPage: modal is declared before AppContextMenu.
      useOverlayBack(
        chatOpen,
        () => {
          setChatClosedByBack(true);
          setChatOpen(false);
        },
        "sbChatOpen",
      );
      useOverlayBack(modalOpen, () => setModalOpen(false), "sbDeleteScopeModal");
      useOverlayBack(menuOpen, () => setMenuOpen(false), "sbContextMenu");

      return (
        <>
          <button data-testid="open-chat" onClick={() => setChatOpen(true)}>
            open chat
          </button>
          <button data-testid="open-menu" onClick={() => setMenuOpen(true)}>
            open menu
          </button>
          <button
            data-testid="delete-click"
            onClick={() => {
              setModalOpen(true);
              setMenuOpen(false);
            }}
          >
            delete
          </button>
          <button
            data-testid="confirm-delete"
            onClick={() => setModalOpen(false)}
          >
            confirm delete
          </button>
          {chatOpen && <div data-testid="chat-view">chat</div>}
          {chatClosedByBack && <div data-testid="closed-by-back">closed</div>}
        </>
      );
    }

    render(<DeleteFlowHarness />);
    await userEvent.click(page.getByTestId("open-chat"));
    await vi.waitFor(() => {
      expect(window.history.state?.sbChatOpen).toBe(true);
    });
    await userEvent.click(page.getByTestId("open-menu"));
    await vi.waitFor(() => {
      expect(window.history.state?.sbContextMenu).toBe(true);
    });

    // Clicking "Delete" in the menu opens the modal and closes the menu at once.
    await userEvent.click(page.getByTestId("delete-click"));
    await vi.waitFor(() => {
      expect(window.history.state?.sbDeleteScopeModal).toBe(true);
    });

    await userEvent.click(page.getByTestId("confirm-delete"));

    await expect.element(page.getByTestId("chat-view")).toBeInTheDocument();
    await expect
      .element(page.getByTestId("closed-by-back"))
      .not.toBeInTheDocument();
  });

  // Same flow for every ChatPage modal opened straight from the context menu:
  // the menu's queued back() lands after the new modal pushes its sentinel,
  // so the popstate must close neither the new modal nor the chat (issue #188).
  test.each([
    ["delete message", "sbDeleteScopeModal"],
    ["chat profile", "sbChatProfileModal"],
    ["delete chats", "sbDeleteChatsModal"],
    ["forward message", "sbForwardModal"],
  ])("%s modal opened from a closing context menu stays open", async (_label, modalKey) => {
    function ContextMenuModalHarness() {
      const [chatOpen, setChatOpen] = useState(true);
      const [menuOpen, setMenuOpen] = useState(false);
      const [modalOpen, setModalOpen] = useState(false);

      // Menu effect runs before the new modal's effect, matching ChatPage.
      useOverlayBack(chatOpen, () => setChatOpen(false), "sbChatOpen");
      useOverlayBack(menuOpen, () => setMenuOpen(false), "sbContextMenu");
      useOverlayBack(modalOpen, () => setModalOpen(false), modalKey);

      return (
        <>
          <button data-testid="open-menu" onClick={() => setMenuOpen(true)}>
            open menu
          </button>
          <button
            data-testid="open-modal"
            onClick={() => {
              setModalOpen(true);
              setMenuOpen(false);
            }}
          >
            open modal
          </button>
          {chatOpen && <div data-testid="chat-view">chat</div>}
          {modalOpen && <div data-testid="modal-view">modal</div>}
        </>
      );
    }

    render(<ContextMenuModalHarness />);
    await userEvent.click(page.getByTestId("open-menu"));
    await vi.waitFor(() => {
      expect(window.history.state?.sbContextMenu).toBe(true);
    });
    await userEvent.click(page.getByTestId("open-modal"));

    await expect.element(page.getByTestId("modal-view")).toBeInTheDocument();
    await expect.element(page.getByTestId("chat-view")).toBeInTheDocument();
  });
});

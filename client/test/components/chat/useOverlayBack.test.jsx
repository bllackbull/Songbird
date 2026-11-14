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
});

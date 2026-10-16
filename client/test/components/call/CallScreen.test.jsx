import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { CallScreen } from "../../../src/components/call/CallScreen.jsx";

function makeProps(overrides = {}) {
  return {
    callState: "ringing",
    callType: "voice",
    callPeer: { username: "alice", nickname: "Alice" },
    callDuration: 65,
    isMuted: false,
    isCameraOff: false,
    isSpeakerOn: true,
    localVideoRef: { current: null },
    remoteVideoRef: { current: null },
    remoteAudioRef: { current: null },
    onAccept: vi.fn(),
    onReject: vi.fn(),
    onEnd: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleCamera: vi.fn(),
    onToggleSpeaker: vi.fn(),
    ...overrides,
  };
}

function buttonLabels() {
  const buttons = document.querySelectorAll("button");
  return [...buttons].map((b) => b.getAttribute("aria-label"));
}

describe("CallScreen controls layout", () => {
  beforeEach(() => {
    // Must be a constructable function since the component uses `new Audio()`.
    // (Arrow functions cannot be constructed and crash the render.)
    vi.stubGlobal(
      "Audio",
      vi.fn(function MockAudio() {
        return {
          loop: false,
          play: () => Promise.resolve(),
          pause: () => {},
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("ringing (incoming call)", () => {
    test("shows accept + reject with a wide gap and no mute/camera", async () => {
      render(<CallScreen {...makeProps()} />);
      await expect
        .element(page.getByRole("button", { name: "Accept call" }))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Reject call" }))
        .toBeInTheDocument();
      await expect
        .element(page.getByRole("button", { name: "Mute" }))
        .not.toBeInTheDocument();

      // Wide gap between accept and decline
      const container = page
        .getByRole("button", { name: "Accept call" })
        .element().parentElement;
      expect(container.className).toContain("gap-24");

      // Accept comes before reject in DOM order
      expect(buttonLabels()).toEqual(["Accept call", "Reject call"]);
    });

    test("accept and reject fire their handlers", async () => {
      const props = makeProps();
      render(<CallScreen {...props} />);
      await userEvent.click(page.getByRole("button", { name: "Accept call" }));
      expect(props.onAccept).toHaveBeenCalledTimes(1);
      await userEvent.click(page.getByRole("button", { name: "Reject call" }));
      expect(props.onReject).toHaveBeenCalledTimes(1);
    });
  });

  describe("connected video call", () => {
    test("secondary buttons sit on their own row above the centered end button", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "video" })}
        />,
      );
      await expect
        .element(page.getByRole("button", { name: "End call" }))
        .toBeInTheDocument();

      expect(buttonLabels()).toEqual([
        "Turn speaker off",
        "Mute",
        "Turn camera off",
        "End call",
      ]);

      // End button is alone in its row (centered)
      const endBtn = page.getByRole("button", { name: "End call" }).element();
      const directButtons = [...endBtn.parentElement.children].filter(
        (el) => el.tagName === "BUTTON",
      );
      expect(directButtons).toEqual([endBtn]);

      // Speaker / mute / camera share the row above
      const topRow = page.getByRole("button", { name: "Mute" }).element()
        .parentElement;
      expect(topRow.className).toContain("gap-6");
      expect(
        [...topRow.querySelectorAll("button")].map((b) =>
          b.getAttribute("aria-label"),
        ),
      ).toEqual(["Turn speaker off", "Mute", "Turn camera off"]);
    });

    test("speaker toggle fires its handler", async () => {
      const props = makeProps({
        callState: "connected",
        callType: "video",
      });
      render(<CallScreen {...props} />);
      await userEvent.click(
        page.getByRole("button", { name: "Turn speaker off" }),
      );
      expect(props.onToggleSpeaker).toHaveBeenCalledTimes(1);
    });
  });

  describe("connected voice call", () => {
    test("secondary row holds mute, camera, and speaker above the end button", async () => {
      const props = makeProps({
        callState: "connected",
        callType: "voice",
        isCameraOff: true,
      });
      render(<CallScreen {...props} />);
      await expect
        .element(page.getByRole("button", { name: "End call" }))
        .toBeInTheDocument();

      // Camera starts off in voice calls, but the toggle is still shown
      expect(buttonLabels()).toEqual([
        "Turn speaker off",
        "Mute",
        "Turn camera on",
        "End call",
      ]);
      const endBtn = page.getByRole("button", { name: "End call" }).element();
      const directButtons = [...endBtn.parentElement.children].filter(
        (el) => el.tagName === "BUTTON",
      );
      expect(directButtons).toEqual([endBtn]);
    });

    test("camera toggle fires its handler in voice calls", async () => {
      const props = makeProps({
        callState: "connected",
        callType: "voice",
        isCameraOff: true,
      });
      render(<CallScreen {...props} />);
      await userEvent.click(
        page.getByRole("button", { name: "Turn camera on" }),
      );
      expect(props.onToggleCamera).toHaveBeenCalledTimes(1);
    });
  });

  describe("calling (outgoing)", () => {
    test("shows only the end button", async () => {
      render(<CallScreen {...makeProps({ callState: "calling" })} />);
      await expect
        .element(page.getByRole("button", { name: "End call" }))
        .toBeInTheDocument();
      expect(buttonLabels()).toEqual(["End call"]);
    });
  });
});

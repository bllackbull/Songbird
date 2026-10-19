import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
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
        "Chat",
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
        "Chat",
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

  describe("connected video layout", () => {
    function videos() {
      return {
        remote: document.querySelector('video[aria-label="Remote video"]'),
        local: document.querySelector('video[aria-label="Local video"]'),
        placeholder: document.querySelector(
          '[data-testid="main-video-placeholder"]',
        ),
      };
    }

    test("both cameras on: remote fullscreen with local PiP", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "video",
            isCameraOff: false,
            isRemoteCameraOff: false,
          })}
        />,
      );
      await expect
        .element(page.getByRole("button", { name: "End call" }))
        .toBeInTheDocument();
      const { remote, local, placeholder } = videos();
      expect(remote).not.toBeNull();
      expect(local).not.toBeNull();
      expect(remote.className).toContain("inset-0");
      expect(local.className).toContain("bottom-4 right-4");
      expect(placeholder).not.toBeNull();
    });

    test("only remote camera on: remote fullscreen, local hidden", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "video",
            isCameraOff: true,
            isRemoteCameraOff: false,
          })}
        />,
      );
      await expect
        .element(page.getByRole("button", { name: "End call" }))
        .toBeInTheDocument();
      const { remote, local } = videos();
      expect(remote).not.toBeNull();
      expect(local).not.toBeNull();
      expect(remote.className).toContain("inset-0");
      expect(local.className).toContain("hidden");
    });

    test("only local camera on: local fullscreen, remote hidden", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "video",
            isCameraOff: false,
            isRemoteCameraOff: true,
          })}
        />,
      );
      await expect
        .element(page.getByRole("button", { name: "End call" }))
        .toBeInTheDocument();
      const { remote, local } = videos();
      expect(remote).not.toBeNull();
      expect(local).not.toBeNull();
      expect(remote.className).toContain("hidden");
      expect(local.className).toContain("inset-0");
    });

    test("both cameras off: no video elements", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "video",
            isCameraOff: true,
            isRemoteCameraOff: true,
          })}
        />,
      );
      await expect
        .element(page.getByRole("button", { name: "End call" }))
        .toBeInTheDocument();
      const { remote, local, placeholder } = videos();
      expect(remote).toBeNull();
      expect(local).toBeNull();
      expect(placeholder).toBeNull();
    });
  });

  describe("Secure badge tooltip stacking", () => {
    // Tailwind is not loaded in browser tests, so declare the utilities the
    // stacking assertion depends on: the call screen overlay's and the
    // tooltip pill's (bracketed class names are CSS-escaped in selectors).
    const CSS = `
      .fixed{position:fixed}
      .z-\\[9999\\]{z-index:9999}
      .z-\\[100000\\]{z-index:100000}
      .z-20{z-index:20}
      .z-30{z-index:30}
    `;
    let styleEl;
    beforeAll(() => {
      styleEl = document.createElement("style");
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    });
    afterAll(() => styleEl.remove());

    test("Secure badge tooltip stacks above the call screen overlay", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "voice" })}
        />,
      );
      await page.getByText("Secure").hover();
      await expect.element(page.getByRole("tooltip")).toBeInTheDocument();

      const tooltip = page.getByRole("tooltip").element();
      const overlay = document.querySelector('[class*="z-[9999]"]');
      const tooltipZ = Number(getComputedStyle(tooltip).zIndex);
      const overlayZ = Number(getComputedStyle(overlay).zIndex);
      expect(tooltipZ).toBeGreaterThan(overlayZ);
    });

    test("connected peer-info bar moves up but keeps the video stage pinned", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "voice" })}
        />,
      );
      const name = page.getByText("Alice");
      await expect.element(name).toBeInTheDocument();
      const bar = name.element().closest("div.relative.z-20");
      // The bar must keep its ORIGINAL total height (pt-14 + pb-6 == the old
      // pt-20) so the flex-1 video stage below does not expand upward when the
      // avatar content moves up - otherwise the camera box would travel up
      // with it and the two would still nearly overlap.
      expect(bar.className).toContain("pt-14");
      expect(bar.className).toContain("pb-6");
      expect(bar.className).not.toContain("pt-20");
    });

    test("Secure badge zone outstacks the peer-info bar for hit-testing", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "voice" })}
        />,
      );
      const name = page.getByText("Alice");
      await expect.element(name).toBeInTheDocument();

      // The badge hovering zone and the peer-info bar both span the badge's
      // on-screen position; with an equal z-index the later DOM node (the
      // bar, with its transparent top padding) wins pointer events and the
      // Tooltips around the badge never see a hover. The badge zone must sit
      // strictly above it.
      const badgeZone = page
        .getByText("Secure")
        .element()
        .closest("div.absolute");
      const bar = name.element().closest("div.relative.z-20");
      const badgeZ = Number(getComputedStyle(badgeZone).zIndex);
      const barZ = Number(getComputedStyle(bar).zIndex);
      expect(badgeZ).toBeGreaterThan(barZ);
    });
  });

  describe("peer name length handling", () => {
    // There is no character-count cap on display names anywhere in the app
    // (the chat list elides via CSS `truncate`, not a char slice). The call
    // screen must match that: NICKNAME_MAX is admin-configurable up to 64,
    // so the ringing screen's centered name must clip instead of wrapping
    // and pushing the state labels down.
    test("ringing screen truncates a long peer name like the chat list", async () => {
      render(
        <CallScreen
          {...makeProps({
            callPeer: {
              username: "alice",
              nickname: "An Extremely Long Nickname That Overflows The Row",
            },
          })}
        />,
      );
      const name = page.getByText("An Extremely Long Nickname That Overflows");
      await expect.element(name).toBeInTheDocument();
      const nameEl = name.element();
      expect(nameEl.className).toContain("truncate");
      expect(nameEl.className).toContain("max-w-[20rem]");
    });

    test("connected peer-info bar name keeps its truncate", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callPeer: {
              username: "alice",
              nickname: "An Extremely Long Nickname That Overflows The Row",
            },
          })}
        />,
      );
      const name = page.getByText("An Extremely Long Nickname That Overflows");
      await expect.element(name).toBeInTheDocument();
      expect(name.element().className).toContain("truncate");
    });
  });

  describe("install bar stacking trap", () => {
    // The app shell renders `position: relative; z-index: var(--app-z, 20)`
    // (App.jsx), which creates a stacking context at level 20. CallScreen
    // renders inside that shell, so its z-[9999] is clamped to 20 while the
    // fixed InstallBar sibling sits at z=40 - the call modal painted below
    // the bar. It must portal to document.body like Tooltip.
    function stackingShell() {
      // Mimic the app shell's stacking context: relative + z-index + overflow.
      const ctx = document.createElement("div");
      Object.assign(ctx.style, {
        position: "relative",
        zIndex: "20",
        overflow: "hidden",
      });
      document.body.appendChild(ctx);
      return ctx;
    }

    test("call dialog escapes the shell stacking context to body", async () => {
      const ctx = stackingShell();
      render(<CallScreen {...makeProps({ callState: "connected", callType: "voice" })} />, {
        container: ctx,
      });
      await expect.element(page.getByRole("dialog")).toBeInTheDocument();

      const dialog = page.getByRole("dialog").element();
      expect(ctx.contains(dialog)).toBe(false);
      expect(document.body.contains(dialog)).toBe(true);
    });
  });

  describe("Chat button and floating PiP mode", () => {
    test("Chat button is shown on connected call as icon-only secondary button with h-16 w-16 size", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "voice" })}
        />,
      );
      const chatBtn = page.getByRole("button", { name: "Chat" });
      await expect.element(chatBtn).toBeInTheDocument();
      const el = chatBtn.element();
      expect(el.className).toContain("h-16");
      expect(el.className).toContain("w-16");
      expect(el.className).toContain("bg-transparent");
      expect(el.className).not.toContain("border");
      expect(el.textContent.trim()).toBe("");
      // Check that it's in the target user bar on the right side with increased side gap
      const bar = el.closest("div.relative.z-20");
      expect(bar).not.toBeNull();
      expect(bar.className).toContain("justify-between");
      expect(bar.className).toContain("px-10");
      expect(bar.className).toContain("sm:px-14");
    });

    test("Chat button is not shown during ringing state", async () => {
      render(<CallScreen {...makeProps({ callState: "ringing" })} />);
      await expect
        .element(page.getByRole("button", { name: "Chat" }))
        .not.toBeInTheDocument();
    });

    test("Chat button is not shown during calling state", async () => {
      render(<CallScreen {...makeProps({ callState: "calling" })} />);
      await expect
        .element(page.getByRole("button", { name: "Chat" }))
        .not.toBeInTheDocument();
    });

    test("clicking Chat button exits fullscreen and renders floating box in top right corner by default", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "video",
            isRemoteCameraOff: false,
          })}
        />,
      );
      await expect.element(page.getByRole("dialog")).toBeInTheDocument();
      await userEvent.click(page.getByRole("button", { name: "Chat" }));

      // Fullscreen dialog is gone
      await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

      // Floating box is in the document with top-right positioning and smooth entrance animation
      const box = page.getByTestId("floating-call-box");
      await expect.element(box).toBeInTheDocument();
      expect(box.element().className).toContain("top-6");
      expect(box.element().className).toContain("right-6");
      expect(box.element().className).toContain("sb-pip-enter");
      expect(box.element().getAttribute("role")).toBe("button");
      expect(box.element().getAttribute("aria-label")).toBe("Return to call");

      // Remote video is rendered inside the floating box
      const video = box.element().querySelector('video[aria-label="Remote video"]');
      expect(video).not.toBeNull();
    });

    test("floating box shows avatar when remote camera is not available", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "voice",
            isRemoteCameraOff: true,
            callPeer: { username: "alice", nickname: "Alice" },
          })}
        />,
      );
      await userEvent.click(page.getByRole("button", { name: "Chat" }));

      const box = page.getByTestId("floating-call-box");
      await expect.element(box).toBeInTheDocument();

      // Video element is NOT present
      const video = box.element().querySelector('video[aria-label="Remote video"]');
      expect(video).toBeNull();

      // Avatar with peer name and initial is shown
      expect(box.element().textContent).toContain("Alice");
      expect(box.element().textContent).toContain("A");
    });

    test("clicking on the floating box enters fullscreen mode again with reverse expansion animation", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "voice" })}
        />,
      );
      await userEvent.click(page.getByRole("button", { name: "Chat" }));
      await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

      const box = page.getByTestId("floating-call-box");
      await expect.element(box).toBeInTheDocument();

      // Click the box to expand back to fullscreen
      await userEvent.click(box);

      // Fullscreen dialog is back with reverse expansion animation
      await expect.element(page.getByRole("dialog")).toBeInTheDocument();
      expect(page.getByRole("dialog").element().className).toContain("sb-call-modal-enter");
      await expect.element(page.getByTestId("floating-call-box")).not.toBeInTheDocument();
    });

    test("dragging the floating box moves it without entering fullscreen", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "voice" })}
        />,
      );
      await userEvent.click(page.getByRole("button", { name: "Chat" }));
      const box = page.getByTestId("floating-call-box");
      await expect.element(box).toBeInTheDocument();

      const boxEl = box.element();
      // Simulate drag
      boxEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 200, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 250, clientY: 270, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 250, clientY: 270, button: 0 }));

      // Box should still be in document (did not restore fullscreen)
      await expect.element(page.getByTestId("floating-call-box")).toBeInTheDocument();
      await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
      // Style left and top should be set after drag commit
      await expect.poll(() => boxEl.style.left).toBeTruthy();
      await expect.poll(() => boxEl.style.top).toBeTruthy();
    });

    test("floating box always snaps to the nearest corner on drag release", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "voice" })}
        />,
      );
      await userEvent.click(page.getByRole("button", { name: "Chat" }));
      const box = page.getByTestId("floating-call-box");
      const boxEl = box.element();

      // Drag towards upper-left
      boxEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 200, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 80, clientY: 80, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: 80, clientY: 80, button: 0 }));

      // Snaps to CORNER_MARGIN (24px) in the top-left
      await expect.poll(() => boxEl.style.left).toBe("24px");
      await expect.poll(() => boxEl.style.top).toBe("24px");
    });

    test("body overflow is hidden in fullscreen and restored when minimized", async () => {
      render(
        <CallScreen
          {...makeProps({ callState: "connected", callType: "voice" })}
        />,
      );
      await expect.poll(() => document.body.style.overflow).toBe("hidden");

      await userEvent.click(page.getByRole("button", { name: "Chat" }));
      await expect.poll(() => document.body.style.overflow).toBe("");

      await userEvent.click(page.getByTestId("floating-call-box"));
      await expect.poll(() => document.body.style.overflow).toBe("hidden");
    });
  });

  describe("peer avatar accent color", () => {
    test("uses peer accent color for non-video call avatar when callPeer.color is provided", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "calling",
            callType: "voice",
            callPeer: { username: "alice", nickname: "Alice", color: "#f97316" },
          })}
        />,
      );
      await expect.element(page.getByRole("dialog")).toBeInTheDocument();
      const dialog = page.getByRole("dialog").element();
      const avatarEl = dialog.querySelector(".rounded-full");
      expect(avatarEl.style.backgroundColor).toBe("rgb(249, 115, 22)");
    });

    test("uses peer accent color in connected header avatar", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "voice",
            callPeer: { username: "alice", nickname: "Alice", color: "#8b5cf6" },
          })}
        />,
      );
      await expect.element(page.getByRole("dialog")).toBeInTheDocument();
      const dialog = page.getByRole("dialog").element();
      const avatarEl = dialog.querySelector(".rounded-full");
      expect(avatarEl.style.backgroundColor).toBe("rgb(139, 92, 246)");
    });

    test("uses peer accent color in floating minimized call box", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "voice",
            callPeer: { username: "alice", nickname: "Alice", color: "#ef4444" },
          })}
        />,
      );
      await userEvent.click(page.getByRole("button", { name: "Chat" }));
      const box = page.getByTestId("floating-call-box");
      const avatarEl = box.element().querySelector(".rounded-full");
      expect(avatarEl.style.backgroundColor).toBe("rgb(239, 68, 68)");
    });
  });

  describe("peer badges", () => {
    test("renders verified badge and owner role badge when peer has them", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "calling",
            callType: "voice",
            callPeer: {
              username: "alice",
              nickname: "Alice",
              verified: true,
              role: "owner",
            },
          })}
        />,
      );
      await expect.element(page.getByRole("img", { name: "Verified" })).toBeInTheDocument();
      await expect.element(page.getByRole("img", { name: "Server Owner" })).toBeInTheDocument();
    });

    test("renders verified badge and admin role badge in connected header", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "voice",
            callPeer: {
              username: "alice",
              nickname: "Alice",
              verified: true,
              role: "admin",
            },
          })}
        />,
      );
      await expect.element(page.getByRole("img", { name: "Verified" })).toBeInTheDocument();
      await expect.element(page.getByRole("img", { name: "Server Admin" })).toBeInTheDocument();
    });

    test("renders badges in floating minimized call box", async () => {
      render(
        <CallScreen
          {...makeProps({
            callState: "connected",
            callType: "voice",
            callPeer: {
              username: "alice",
              nickname: "Alice",
              user_verified: 1,
              user_role: "owner",
            },
          })}
        />,
      );
      await userEvent.click(page.getByRole("button", { name: "Chat" }));
      const box = page.getByTestId("floating-call-box");
      expect(box.element().querySelector('[aria-label="Verified"]')).not.toBeNull();
      expect(box.element().querySelector('[aria-label="Server Owner"]')).not.toBeNull();
    });
  });
});

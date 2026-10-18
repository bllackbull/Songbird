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
});

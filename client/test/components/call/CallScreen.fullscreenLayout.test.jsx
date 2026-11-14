import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
// Measures real geometry, so the app's styles have to be loaded here.
import "../../../src/index.css";
import { CallScreen } from "../../../src/components/call/CallScreen.jsx";

describe("CallScreen fullscreen button placement", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Audio",
      vi.fn(function MockAudio() {
        return { loop: false, play: () => Promise.resolve(), pause: () => {} };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each([
    ["wide", 1600, 200],
    ["tall", 200, 1600],
  ])("sits on the top-right corner of a %s picture", async (_name, width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const timer = setInterval(() => ctx.fillRect(0, 0, width, height), 30);
    try {
      await render(
        <CallScreen
          callState="connected"
          callType="voice"
          callPeer={{ username: "alice", nickname: "Alice" }}
          callDuration={5}
          isCameraOff
          isRemoteCameraOff
          isRemoteScreenSharing
          isSpeakerOn
          localVideoRef={{ current: null }}
          remoteVideoRef={{ current: null }}
          remoteAudioRef={{ current: null }}
        />,
      );
      const video = page.getByLabelText("Remote video").element();
      video.srcObject = canvas.captureStream(30);
      await vi.waitFor(() => expect(video.videoWidth).toBe(width), { timeout: 5000 });

      const box = video.getBoundingClientRect();
      const aspect = width / height;
      const pictureWidth = Math.min(box.width, box.height * aspect);
      const pictureHeight = pictureWidth / aspect;
      const pictureRight = box.left + (box.width + pictureWidth) / 2;
      const pictureTop = box.top + (box.height - pictureHeight) / 2;

      await vi.waitFor(() => {
        const button = page
          .getByRole("button", { name: "Enter fullscreen" })
          .element()
          .getBoundingClientRect();
        expect(button.right).toBeLessThanOrEqual(pictureRight);
        expect(pictureRight - button.right).toBeLessThan(16);
        expect(button.top).toBeGreaterThanOrEqual(pictureTop);
        expect(button.top - pictureTop).toBeLessThan(16);
      });
    } finally {
      clearInterval(timer);
    }
  });
});

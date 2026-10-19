import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { useEffect, useRef, useState } from "react";
import { useWebRTCCall } from "../../../src/hooks/chat/useWebRTCCall.js";

// No network in tests: the hook fetches ICE servers on mount.
vi.mock("../../../src/api/chatApi.js", () => ({
  fetchIceServers: vi.fn(async () => []),
  fetchIncomingCall: vi.fn(async () => ({})),
  sendCallSignal: vi.fn(async () => ({ ok: true })),
}));

function SpeakerHarness() {
  const { isSpeakerOn, toggleSpeaker } = useWebRTCCall({});
  return (
    <button type="button" onClick={toggleSpeaker}>
      {isSpeakerOn ? "speaker on" : "speaker off"}
    </button>
  );
}

describe("useWebRTCCall speaker toggle", () => {
  test("starts on and flips on each toggle", async () => {
    render(<SpeakerHarness />);
    await expect
      .element(page.getByRole("button", { name: "speaker on" }))
      .toBeInTheDocument();

    await userEvent.click(page.getByRole("button", { name: "speaker on" }));
    await expect
      .element(page.getByRole("button", { name: "speaker off" }))
      .toBeInTheDocument();

    await userEvent.click(page.getByRole("button", { name: "speaker off" }));
    await expect
      .element(page.getByRole("button", { name: "speaker on" }))
      .toBeInTheDocument();
  });
});

function MediaIntegrityHarness() {
  const realtimeSenderRef = useRef(() => true);
  const {
    callState,
    isSpeakerOn,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    acceptCall,
    toggleSpeaker,
    handleSignal,
  } = useWebRTCCall({ realtimeSenderRef });

  const [reloadCount, setReloadCount] = useState(0);
  const [monitoring, setMonitoring] = useState(false);

  // Attaches DOM listeners for the media element load algorithm's observable
  // events. Only armed after the initial stream attachment, so the connection
  // itself doesn't count.
  useEffect(() => {
    if (!monitoring) return undefined;
    const mediaElements = [
      localVideoRef.current,
      remoteVideoRef.current,
      remoteAudioRef.current,
    ].filter(Boolean);
    const onReload = () => setReloadCount((count) => count + 1);
    for (const element of mediaElements) {
      element.addEventListener("loadstart", onReload);
      element.addEventListener("emptied", onReload);
    }
    return () => {
      for (const element of mediaElements) {
        element.removeEventListener("loadstart", onReload);
        element.removeEventListener("emptied", onReload);
      }
    };
  }, [monitoring, localVideoRef, remoteVideoRef, remoteAudioRef]);

  return (
    <div>
      <video data-testid="local-video" muted autoPlay playsInline ref={localVideoRef} />
      <video data-testid="remote-video" autoPlay playsInline ref={remoteVideoRef} />
      <audio data-testid="remote-audio" autoPlay ref={remoteAudioRef} />
      <p data-testid="call-state">{callState}</p>
      <p data-testid="media-reloads">{String(reloadCount)}</p>
      <button type="button" onClick={() => handleSignal({ type: "call:incoming", chatId: "c1", callType: "video" })}>
        simulate incoming
      </button>
      <button type="button" onClick={acceptCall}>
        accept
      </button>
      <button type="button" onClick={() => setMonitoring(true)}>
        arm
      </button>
      <button type="button" onClick={toggleSpeaker}>
        {isSpeakerOn ? "speaker on" : "speaker off"}
      </button>
    </div>
  );
}

describe("useWebRTCCall speaker toggle media integrity", () => {
  test("does not reset attached media streams or mute state on speaker toggle", async () => {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(
      new MediaStream(),
    );
    render(<MediaIntegrityHarness />);

    await userEvent.click(page.getByRole("button", { name: "simulate incoming" }));
    await expect
      .element(page.getByTestId("call-state"))
      .toHaveTextContent("ringing");

    await userEvent.click(page.getByRole("button", { name: "accept" }));
    await expect
      .element(page.getByTestId("call-state"))
      .toHaveTextContent("connected");

    // The association effect has attached the local stream; arm event counting
    // only from here so the connection itself is not counted as a reload.
    await expect
      .poll(
        () => Boolean(document.querySelector("video[data-testid='local-video']")?.srcObject),
      )
      .toBe(true);
    await userEvent.click(page.getByRole("button", { name: "arm" }));

    await userEvent.click(page.getByRole("button", { name: "speaker on" }));
    await expect
      .element(page.getByRole("button", { name: "speaker off" }))
      .toBeInTheDocument();

    // Assigning srcObject invokes the media element load algorithm, which
    // fires loadstart/emptied. Toggling the speaker must not do that.
    await expect
      .element(page.getByTestId("media-reloads"))
      .toHaveTextContent("0");

    // Mute must still be applied to the remote media elements (speaker off).
    await expect
      .poll(
        () =>
          Boolean(document.querySelector("video[data-testid='remote-video']")?.muted),
      )
      .toBe(true);

    await userEvent.click(page.getByRole("button", { name: "speaker off" }));
    await expect
      .element(page.getByRole("button", { name: "speaker on" }))
      .toBeInTheDocument();

    await expect
      .element(page.getByTestId("media-reloads"))
      .toHaveTextContent("0");
    await expect
      .poll(
        () =>
          Boolean(document.querySelector("video[data-testid='remote-video']")?.muted),
      )
      .toBe(false);
  });
});

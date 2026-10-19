import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { useEffect, useRef, useState } from "react";
import { useWebRTCCall } from "../../../src/hooks/chat/useWebRTCCall.js";
import { CallScreen } from "../../../src/components/call/CallScreen.jsx";

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

function CallEndHarness() {
  const { callState, callEndReason, handleSignal } = useWebRTCCall({});
  return (
    <div>
      <p data-testid="call-state">{callState}</p>
      <p data-testid="call-end-reason">{callEndReason || ""}</p>
      <button
        type="button"
        onClick={() =>
          handleSignal({ type: "call:incoming", chatId: "c1", callType: "voice" })
        }
      >
        simulate incoming
      </button>
      <button
        type="button"
        onClick={() => handleSignal({ type: "call:rejected", chatId: "c1" })}
      >
        simulate rejected
      </button>
      <button
        type="button"
        onClick={() => handleSignal({ type: "call:ended", chatId: "c1" })}
      >
        simulate ended
      </button>
    </div>
  );
}

describe("useWebRTCCall end notice", () => {
  test("declined call shows a reason before resetting to idle", async () => {
    render(<CallEndHarness />);
    await userEvent.click(page.getByRole("button", { name: "simulate incoming" }));
    await expect
      .element(page.getByTestId("call-state"))
      .toHaveTextContent("ringing");

    await userEvent.click(page.getByRole("button", { name: "simulate rejected" }));
    await expect
      .element(page.getByTestId("call-end-reason"))
      .toHaveTextContent("declined");
    await expect
      .element(page.getByTestId("call-state"))
      .toHaveTextContent("ringing");

    await expect
      .poll(() => document.querySelector('[data-testid="call-state"]')?.textContent, {
        timeout: 5000,
      })
      .toBe("idle");
  });

  test("remote end after connecting reports ended", async () => {
    render(<CallEndHarness />);
    await userEvent.click(page.getByRole("button", { name: "simulate incoming" }));
    await userEvent.click(page.getByRole("button", { name: "simulate ended" }));
    await expect
      .element(page.getByTestId("call-end-reason"))
      .toHaveTextContent("ended");
  });
});

function RejectHarness() {
  const { callState, callEndReason, isCallClosing, rejectCall, handleSignal } =
    useWebRTCCall({});
  return (
    <div>
      <p data-testid="call-state">{callState}</p>
      <p data-testid="call-end-reason">{callEndReason || ""}</p>
      <p data-testid="is-call-closing">{String(isCallClosing)}</p>
      <button
        type="button"
        onClick={() =>
          handleSignal({ type: "call:incoming", chatId: "c1", callType: "voice" })
        }
      >
        simulate incoming
      </button>
      <button type="button" onClick={rejectCall}>
        reject
      </button>
    </div>
  );
}

describe("useWebRTCCall local reject", () => {
  test("keeps the call alive through the exit window instead of vanishing", async () => {
    render(<RejectHarness />);
    await userEvent.click(page.getByRole("button", { name: "simulate incoming" }));
    await expect
      .element(page.getByTestId("call-state"))
      .toHaveTextContent("ringing");

    await userEvent.click(page.getByRole("button", { name: "reject" }));
    await expect
      .element(page.getByTestId("is-call-closing"))
      .toHaveTextContent("true");
    await expect
      .element(page.getByTestId("call-state"))
      .toHaveTextContent("ringing");
  });
});

function RejectScreenHarness() {
  const {
    callState,
    callEndReason,
    isCallClosing,
    callType,
    callPeer,
    callDuration,
    isMuted,
    isCameraOff,
    isSpeakerOn,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    rejectCall,
    handleSignal,
  } = useWebRTCCall({});
  return (
    <div>
      {callState !== "idle" ? (
        <CallScreen
          callState={callState}
          callEndReason={callEndReason}
          isCallClosing={isCallClosing}
          callType={callType}
          callPeer={callPeer}
          callDuration={callDuration}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isSpeakerOn={isSpeakerOn}
          localVideoRef={localVideoRef}
          remoteVideoRef={remoteVideoRef}
          remoteAudioRef={remoteAudioRef}
          onAccept={() => {}}
          onReject={rejectCall}
          onEnd={() => {}}
          onToggleMute={() => {}}
          onToggleCamera={() => {}}
          onToggleSpeaker={() => {}}
        />
      ) : null}
      <button
        type="button"
        onClick={() =>
          handleSignal({ type: "call:incoming", chatId: "c1", callType: "voice" })
        }
      >
        simulate incoming
      </button>
    </div>
  );
}

describe("CallScreen local reject exit", () => {
  test("runs the exit animation before unmounting", async () => {
    render(<RejectScreenHarness />);
    await userEvent.click(page.getByRole("button", { name: "simulate incoming" }));
    const reject = page.getByRole("button", { name: "Reject call" });
    await expect.element(reject).toBeInTheDocument();
    await userEvent.click(reject);

    // The dialog must still be mounted with the exit animation applied.
    await expect
      .poll(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return "unmounted";
        return dialog.className.includes("sb-call-exit")
          ? "animating"
          : "no-exit-class";
      })
      .toBe("animating");
  });
});

describe("CallScreen local reject timing", () => {
  test("fades out over the exit window instead of vanishing", async () => {
    render(<RejectScreenHarness />);
    await userEvent.click(page.getByRole("button", { name: "simulate incoming" }));
    await expect
      .element(page.getByRole("button", { name: "Reject call" }))
      .toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Reject call" }));

    expect(document.querySelector('[role="dialog"]').className).toContain(
      "sb-call-exit",
    );
    // Still on screen partway through the 250ms exit animation.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await expect
      .poll(() => Boolean(document.querySelector('[role="dialog"]')), {
        timeout: 2000,
      })
      .toBe(false);
  });
});

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { useEffect, useRef } from "react";
import { useWebRTCCall } from "../../../src/hooks/chat/useWebRTCCall.js";

// No network in tests: signals are routed between the two peers in-page.
vi.mock("../../../src/api/chatApi.js", () => ({
  fetchIceServers: vi.fn(async () => []),
  fetchIncomingCall: vi.fn(async () => ({})),
  sendCallSignal: vi.fn(async () => ({ ok: true })),
}));

const CHAT_ID = "chat-share";

// Mirrors what the server relays to the other participant.
function toPeerEvent(signalType, data) {
  switch (signalType) {
    case "start":
      return { type: "call:incoming", chatId: CHAT_ID, callType: data.type };
    case "accept":
      return { type: "call:accepted", chatId: CHAT_ID };
    case "reject":
      return { type: "call:rejected", chatId: CHAT_ID };
    case "end":
      return { type: "call:ended", chatId: CHAT_ID };
    default:
      return { ...data, type: `call:${signalType}`, chatId: CHAT_ID };
  }
}

function useLinkedSender(peerSignalRef) {
  return useRef(({ signalType, data }) => {
    const event = toPeerEvent(signalType, data || {});
    setTimeout(() => void peerSignalRef.current?.(event), 0);
    return true;
  });
}

function Peer({ name, call, remoteVideoRef, remoteAudioRef, localVideoRef }) {
  return (
    <section aria-label={name}>
      <video data-testid={`${name}-remote-video`} autoPlay playsInline muted ref={remoteVideoRef} />
      <audio autoPlay ref={remoteAudioRef} />
      <video autoPlay playsInline muted ref={localVideoRef} />
      <p data-testid={`${name}-state`}>{call.callState}</p>
      <p data-testid={`${name}-sharing`}>{String(call.isScreenSharing)}</p>
      <p data-testid={`${name}-remote-sharing`}>{String(call.isRemoteScreenSharing)}</p>
    </section>
  );
}

function TwoPeerHarness() {
  const aliceSignalRef = useRef(null);
  const bobSignalRef = useRef(null);
  const aliceSender = useLinkedSender(bobSignalRef);
  const bobSender = useLinkedSender(aliceSignalRef);
  const alice = useWebRTCCall({ realtimeSenderRef: aliceSender });
  const bob = useWebRTCCall({ realtimeSenderRef: bobSender });
  const {
    remoteVideoRef: aliceRemoteVideoRef,
    remoteAudioRef: aliceRemoteAudioRef,
    localVideoRef: aliceLocalVideoRef,
  } = alice;
  const {
    remoteVideoRef: bobRemoteVideoRef,
    remoteAudioRef: bobRemoteAudioRef,
    localVideoRef: bobLocalVideoRef,
  } = bob;

  useEffect(() => {
    aliceSignalRef.current = alice.handleSignal;
    bobSignalRef.current = bob.handleSignal;
  }, [alice.handleSignal, bob.handleSignal]);

  return (
    <div>
      <Peer
        name="alice"
        call={alice}
        remoteVideoRef={aliceRemoteVideoRef}
        remoteAudioRef={aliceRemoteAudioRef}
        localVideoRef={aliceLocalVideoRef}
      />
      <Peer
        name="bob"
        call={bob}
        remoteVideoRef={bobRemoteVideoRef}
        remoteAudioRef={bobRemoteAudioRef}
        localVideoRef={bobLocalVideoRef}
      />
      <button
        type="button"
        onClick={() =>
          alice.startCall({ chatId: CHAT_ID, calleeUsername: "bob", type: "voice" })
        }
      >
        alice calls
      </button>
      <button
        type="button"
        onClick={() =>
          alice.startCall({ chatId: CHAT_ID, calleeUsername: "bob", type: "video" })
        }
      >
        alice video calls
      </button>
      <button type="button" onClick={alice.toggleCamera}>
        alice toggles camera
      </button>
      <button type="button" onClick={bob.acceptCall}>
        bob accepts
      </button>
      <button type="button" onClick={alice.toggleScreenShare}>
        alice toggles share
      </button>
      <button type="button" onClick={bob.toggleScreenShare}>
        bob toggles share
      </button>
    </div>
  );
}

// A real (non-silent) audio track, standing in for the microphone.
function makeMicStream() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const dest = ctx.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  return dest.stream;
}

// A canvas that keeps painting, standing in for the captured screen.
function makeScreenStream(width = 320, height = 180) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  let frame = 0;
  const timer = setInterval(() => {
    frame += 1;
    ctx.fillStyle = frame % 2 ? "#10b981" : "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, 30);
  const stream = canvas.captureStream(30);
  stream.getVideoTracks()[0].addEventListener("ended", () => clearInterval(timer));
  return { stream, stopPainting: () => clearInterval(timer) };
}

async function waitFor(check, timeoutMs = 15000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Timed out waiting for condition");
}

describe("useWebRTCCall screen sharing between two peers", () => {
  const painters = [];

  beforeEach(() => {
    // Camera frames are 160x120 so they can be told apart from the screen.
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockImplementation(
      async (constraints = {}) => {
        const stream = constraints.audio ? makeMicStream() : new MediaStream();
        if (constraints.video) {
          const camera = makeScreenStream(160, 120);
          painters.push(camera.stopPainting);
          camera.stream.getVideoTracks().forEach((t) => stream.addTrack(t));
        }
        return stream;
      },
    );
    if (typeof navigator.mediaDevices.getDisplayMedia !== "function") {
      navigator.mediaDevices.getDisplayMedia = () => Promise.reject(new Error("unset"));
    }
    vi.spyOn(navigator.mediaDevices, "getDisplayMedia").mockImplementation(async () => {
      const screen = makeScreenStream();
      painters.push(screen.stopPainting);
      return screen.stream;
    });
  });

  afterEach(() => {
    painters.splice(0).forEach((stop) => stop());
    vi.restoreAllMocks();
  });

  async function connectVoiceCall(callButton = "alice calls") {
    render(<TwoPeerHarness />);
    await userEvent.click(page.getByRole("button", { name: callButton }));
    await expect.element(page.getByTestId("bob-state")).toHaveTextContent("ringing");
    await userEvent.click(page.getByRole("button", { name: "bob accepts" }));
    await expect.element(page.getByTestId("alice-state")).toHaveTextContent("connected");
    await expect.element(page.getByTestId("bob-state")).toHaveTextContent("connected");
  }

  test("caller shares their screen in a voice call and the callee receives frames", async () => {
    await connectVoiceCall();

    await userEvent.click(page.getByRole("button", { name: "alice toggles share" }));
    await expect.element(page.getByTestId("alice-sharing")).toHaveTextContent("true");
    await expect.element(page.getByTestId("bob-remote-sharing")).toHaveTextContent("true");

    const bobRemote = page.getByTestId("bob-remote-video").element();
    await waitFor(() => bobRemote.videoWidth > 0 && bobRemote.videoHeight > 0);
    // Audio still flows on the same stream.
    expect(bobRemote.srcObject.getAudioTracks().length).toBeGreaterThan(0);

    await userEvent.click(page.getByRole("button", { name: "alice toggles share" }));
    await expect.element(page.getByTestId("alice-sharing")).toHaveTextContent("false");
    await expect.element(page.getByTestId("bob-remote-sharing")).toHaveTextContent("false");
    await expect.element(page.getByTestId("alice-state")).toHaveTextContent("connected");
    await expect.element(page.getByTestId("bob-state")).toHaveTextContent("connected");
  });

  test("callee can share too, and the browser's stop button ends the share", async () => {
    await connectVoiceCall();

    await userEvent.click(page.getByRole("button", { name: "bob toggles share" }));
    await expect.element(page.getByTestId("bob-sharing")).toHaveTextContent("true");
    await expect.element(page.getByTestId("alice-remote-sharing")).toHaveTextContent("true");

    const aliceRemote = page.getByTestId("alice-remote-video").element();
    await waitFor(() => aliceRemote.videoWidth > 0);

    // Simulate the browser's "Stop sharing" bar: the capture track ends.
    const displayStream = await navigator.mediaDevices.getDisplayMedia.mock.results[0].value;
    const [track] = displayStream.getVideoTracks();
    track.stop();
    track.dispatchEvent(new Event("ended"));

    await expect.element(page.getByTestId("bob-sharing")).toHaveTextContent("false");
    await expect.element(page.getByTestId("alice-remote-sharing")).toHaveTextContent("false");
  });

  test("closing the share picker leaves the call untouched", async () => {
    await connectVoiceCall();
    navigator.mediaDevices.getDisplayMedia.mockRejectedValueOnce(
      new DOMException("Permission denied", "NotAllowedError"),
    );

    await userEvent.click(page.getByRole("button", { name: "alice toggles share" }));
    await new Promise((r) => setTimeout(r, 300));
    await expect.element(page.getByTestId("alice-sharing")).toHaveTextContent("false");
    await expect.element(page.getByTestId("bob-remote-sharing")).toHaveTextContent("false");
    await expect.element(page.getByTestId("alice-state")).toHaveTextContent("connected");
  });

  test("in a video call the screen replaces the camera and stopping brings the camera back", async () => {
    await connectVoiceCall("alice video calls");
    const bobRemote = page.getByTestId("bob-remote-video").element();
    await waitFor(() => bobRemote.videoWidth === 160);

    await userEvent.click(page.getByRole("button", { name: "alice toggles share" }));
    await expect.element(page.getByTestId("bob-remote-sharing")).toHaveTextContent("true");
    await waitFor(() => bobRemote.videoWidth === 320);
    // Swapping tracks needs no extra video line on the connection.
    expect(bobRemote.srcObject.getVideoTracks()).toHaveLength(1);

    await userEvent.click(page.getByRole("button", { name: "alice toggles share" }));
    await expect.element(page.getByTestId("bob-remote-sharing")).toHaveTextContent("false");
    await waitFor(() => bobRemote.videoWidth === 160);
  });

  test("turning the camera on after a voice-call share reuses the same video sender", async () => {
    await connectVoiceCall();
    const bobRemote = page.getByTestId("bob-remote-video").element();

    await userEvent.click(page.getByRole("button", { name: "alice toggles share" }));
    await waitFor(() => bobRemote.videoWidth === 320);
    await userEvent.click(page.getByRole("button", { name: "alice toggles share" }));
    await expect.element(page.getByTestId("bob-remote-sharing")).toHaveTextContent("false");

    await userEvent.click(page.getByRole("button", { name: "alice toggles camera" }));
    await waitFor(() => bobRemote.videoWidth === 160);
    expect(bobRemote.srcObject.getVideoTracks()).toHaveLength(1);
  });
});

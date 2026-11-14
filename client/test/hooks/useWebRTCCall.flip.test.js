import { describe, it, expect, vi } from "vitest";
import { swapCameraTrack } from "../../src/hooks/chat/useWebRTCCall.js";

function makeSender(track = null) {
  return {
    track,
    replaceTrack: vi.fn(async function replaceTrack(next) {
      this.track = next;
    }),
    setStreams: vi.fn(),
  };
}

function makeTrack(id) {
  return { kind: "video", id, stop: vi.fn() };
}

// Video element spy that counts srcObject assignments (reassigning srcObject
// on iOS Safari reloads the element and resets object-fit).
function makeVideoEl(initial = null) {
  const el = {};
  let value = initial;
  let assignments = 0;
  Object.defineProperty(el, "srcObject", {
    get: () => value,
    set: (next) => {
      assignments += 1;
      value = next;
    },
  });
  el.assignmentCount = () => assignments;
  return el;
}

describe("swapCameraTrack", () => {
  // The caller stops and removes the outgoing camera before acquiring the new
  // one (iOS Safari cannot hold two captures at once), so the stream may have
  // no video track when the swap starts.
  it("adds the new track to the stream and retargets the sender", async () => {
    const newTrack = makeTrack("cam-back");
    const cameraSender = makeSender(makeTrack("cam-front"));
    const pc = {
      getSenders: () => [makeSender({ kind: "audio" }), cameraSender],
      getTransceivers: () => [],
      addTrack: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [],
      removeTrack: vi.fn(),
      addTrack: vi.fn(),
    };
    const videoEl = makeVideoEl();
    videoEl.srcObject = stream;

    const result = await swapCameraTrack({ pc, stream, newTrack, videoEl });

    expect(stream.addTrack).toHaveBeenCalledWith(newTrack);
    // Already playing this stream: the element must not be reloaded.
    expect(videoEl.srcObject).toBe(stream);
    expect(videoEl.assignmentCount()).toBe(1);
    expect(cameraSender.replaceTrack).toHaveBeenCalledWith(newTrack);
    expect(newTrack.stop).not.toHaveBeenCalled();
    expect(result).toEqual({ sender: cameraSender, needsNegotiation: false });
    expect(pc.addTrack).not.toHaveBeenCalled();
  });

  it("adds the track to the pc when no sender or transceiver exists", async () => {
    const newTrack = makeTrack("cam-back");
    const pc = {
      getSenders: () => [],
      getTransceivers: () => [],
      addTrack: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [],
      removeTrack: vi.fn(),
      addTrack: vi.fn(),
    };

    const result = await swapCameraTrack({ pc, stream, newTrack, videoEl: null });

    expect(pc.addTrack).toHaveBeenCalledWith(newTrack, stream);
    expect(result).toEqual({ sender: undefined, needsNegotiation: true });
  });

  it("removes and stops the new track when the sender swap fails", async () => {
    const newTrack = makeTrack("cam-back");
    const failingSender = makeSender(makeTrack("cam-front"));
    failingSender.replaceTrack = vi.fn(async () => {
      throw new Error("InvalidStateError");
    });
    const pc = {
      getSenders: () => [failingSender],
      getTransceivers: () => [],
      addTrack: vi.fn(),
    };
    const videoEl = { srcObject: null };
    const stream = {
      getVideoTracks: () => [],
      removeTrack: vi.fn(),
      addTrack: vi.fn(),
    };

    await expect(
      swapCameraTrack({ pc, stream, newTrack, videoEl }),
    ).rejects.toThrow("InvalidStateError");

    // The sender still carries the stopped previous camera, so the stream
    // must not advertise a track it is not sending.
    expect(stream.removeTrack).toHaveBeenCalledWith(newTrack);
    expect(videoEl.srcObject).toBe(stream);
    expect(newTrack.stop).toHaveBeenCalled();
  });

  it("binds the element when it was not playing the stream", async () => {
    const newTrack = makeTrack("cam-back");
    const cameraSender = makeSender(makeTrack("cam-front"));
    const pc = {
      getSenders: () => [cameraSender],
      getTransceivers: () => [],
      addTrack: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [],
      removeTrack: vi.fn(),
      addTrack: vi.fn(),
    };
    const videoEl = makeVideoEl(); // unbound

    await swapCameraTrack({ pc, stream, newTrack, videoEl });

    expect(videoEl.srcObject).toBe(stream);
    expect(videoEl.assignmentCount()).toBe(1);
  });
});

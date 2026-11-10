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

describe("swapCameraTrack", () => {
  it("swaps the stream and sender to the new track and stops the old one", async () => {
    const oldTrack = makeTrack("cam-front");
    const newTrack = makeTrack("cam-back");
    const cameraSender = makeSender(oldTrack);
    const pc = {
      getSenders: () => [makeSender({ kind: "audio" }), cameraSender],
      getTransceivers: () => [],
      addTrack: vi.fn(),
    };
    const stream = {
      getVideoTracks: () => [oldTrack],
      removeTrack: vi.fn(),
      addTrack: vi.fn(),
    };
    const videoEl = { srcObject: null };

    const result = await swapCameraTrack({ pc, stream, newTrack, videoEl });

    expect(stream.removeTrack).toHaveBeenCalledWith(oldTrack);
    expect(stream.addTrack).toHaveBeenCalledWith(newTrack);
    expect(videoEl.srcObject).toBe(stream);
    expect(cameraSender.replaceTrack).toHaveBeenCalledWith(newTrack);
    expect(oldTrack.stop).toHaveBeenCalled();
    expect(result).toEqual({ sender: cameraSender, needsNegotiation: false });
    expect(pc.addTrack).not.toHaveBeenCalled();
  });

  it("returns null when the stream has no video track", async () => {
    const stream = {
      getVideoTracks: () => [],
      removeTrack: vi.fn(),
      addTrack: vi.fn(),
    };
    const result = await swapCameraTrack({
      pc: {
        getSenders: () => [],
        getTransceivers: () => [],
        addTrack: vi.fn(),
      },
      stream,
      newTrack: makeTrack("x"),
      videoEl: null,
    });
    expect(result).toBeNull();
    expect(stream.removeTrack).not.toHaveBeenCalled();
  });

  it("restores the stream and stops the new track when the sender swap fails", async () => {
    const oldTrack = makeTrack("cam-front");
    const newTrack = makeTrack("cam-back");
    const failingSender = makeSender(oldTrack);
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
      getVideoTracks: () => [oldTrack],
      removeTrack: vi.fn(),
      addTrack: vi.fn(),
    };

    await expect(
      swapCameraTrack({ pc, stream, newTrack, videoEl }),
    ).rejects.toThrow("InvalidStateError");

    // The stream must match what the sender still carries (the old camera).
    expect(stream.removeTrack).toHaveBeenCalledWith(newTrack);
    expect(stream.addTrack).toHaveBeenCalledWith(oldTrack);
    expect(videoEl.srcObject).toBe(stream);
    expect(newTrack.stop).toHaveBeenCalled();
    expect(oldTrack.stop).not.toHaveBeenCalled();
  });
});

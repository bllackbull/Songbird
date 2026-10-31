import { describe, it, expect, vi } from "vitest";
import { attachOutgoingVideoTrack } from "../../src/hooks/chat/useWebRTCCall.js";

function makeSender(track = null) {
  return {
    track,
    replaceTrack: vi.fn(async function replaceTrack(next) {
      this.track = next;
    }),
    setStreams: vi.fn(),
  };
}

function makeTransceiver({ kind = "video", direction = "sendrecv", sender }) {
  return {
    direction,
    currentDirection: direction,
    stopped: false,
    receiver: { track: { kind } },
    sender: sender || makeSender(),
  };
}

function makePc({ senders = [], transceivers = [] } = {}) {
  return {
    getSenders: () => senders,
    getTransceivers: () => transceivers,
    addTrack: vi.fn(() => makeSender()),
  };
}

const screenTrack = { kind: "video", id: "screen" };
const stream = { id: "local" };

describe("attachOutgoingVideoTrack", () => {
  it("swaps the camera sender's track without renegotiating", async () => {
    const cameraSender = makeSender({ kind: "video", id: "camera" });
    const pc = makePc({
      senders: [makeSender({ kind: "audio" }), cameraSender],
    });

    const result = await attachOutgoingVideoTrack(pc, screenTrack, stream);

    expect(cameraSender.replaceTrack).toHaveBeenCalledWith(screenTrack);
    expect(result).toEqual({ sender: cameraSender, needsNegotiation: false });
    expect(pc.addTrack).not.toHaveBeenCalled();
  });

  it("turns a receive-only video transceiver (voice call) into a sender", async () => {
    const transceiver = makeTransceiver({ direction: "recvonly" });
    const pc = makePc({
      senders: [makeSender({ kind: "audio" }), transceiver.sender],
      transceivers: [makeTransceiver({ kind: "audio" }), transceiver],
    });

    const result = await attachOutgoingVideoTrack(pc, screenTrack, stream);

    expect(transceiver.sender.replaceTrack).toHaveBeenCalledWith(screenTrack);
    expect(transceiver.sender.setStreams).toHaveBeenCalledWith(stream);
    expect(transceiver.direction).toBe("sendrecv");
    expect(result.needsNegotiation).toBe(true);
    expect(pc.addTrack).not.toHaveBeenCalled();
  });

  it("reuses an already-sending empty video sender without renegotiating", async () => {
    const transceiver = makeTransceiver({ direction: "sendrecv" });
    const pc = makePc({
      senders: [transceiver.sender],
      transceivers: [transceiver],
    });

    const result = await attachOutgoingVideoTrack(pc, screenTrack, stream);

    expect(result).toEqual({
      sender: transceiver.sender,
      needsNegotiation: false,
    });
  });

  it("adds a new track when no video transceiver exists", async () => {
    const pc = makePc({
      senders: [makeSender({ kind: "audio" })],
      transceivers: [makeTransceiver({ kind: "audio" })],
    });

    const result = await attachOutgoingVideoTrack(pc, screenTrack, stream);

    expect(pc.addTrack).toHaveBeenCalledWith(screenTrack, stream);
    expect(result.needsNegotiation).toBe(true);
  });
});

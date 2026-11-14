import { describe, it, expect, afterEach, vi } from "vitest";
import { logIceDiagnostics } from "../../src/utils/iceDiagnostics.js";

function fakePc({ stats = [], getStatsImpl = null } = {}) {
  return {
    connectionState: "failed",
    iceConnectionState: "failed",
    signalingState: "stable",
    getStats:
      getStatsImpl ||
      (async () => ({
        forEach: (fn) => stats.forEach(fn),
      })),
  };
}

describe("logIceDiagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("summarizes candidate pair states and types on failure", async () => {
    const pc = fakePc({
      stats: [
        {
          type: "local-candidate",
          id: "L1",
          candidateType: "host",
          protocol: "udp",
        },
        {
          type: "remote-candidate",
          id: "R1",
          candidateType: "relay",
          protocol: "udp",
        },
        {
          type: "candidate-pair",
          localCandidateId: "L1",
          remoteCandidateId: "R1",
          state: "failed",
          nominated: true,
        },
      ],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await logIceDiagnostics(pc, "failed");

    expect(warn).toHaveBeenCalledTimes(1);
    const [prefix, payload] = warn.mock.calls[0];
    expect(prefix).toBe("[call] ICE failed:");
    expect(payload).toContain('"host/udp -> relay/udp:failed nominated"');
    expect(payload).toContain('"connection":"failed"');
    expect(payload).toContain('"ice":"failed"');
  });

  it("does not throw when getStats rejects or the pc is gone", async () => {
    const pc = fakePc({
      getStatsImpl: async () => {
        throw new Error("closed");
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(logIceDiagnostics(pc, "failed")).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});

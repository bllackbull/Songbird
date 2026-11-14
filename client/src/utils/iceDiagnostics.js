/**
 * Console-only ICE failure summary for call debugging: which candidate types
 * were gathered (host/srflx/relay) and what state each pair reached when the
 * connection failed. Addresses stay mDNS-obfuscated by the browser, so no
 * private IPs are printed.
 */
export async function logIceDiagnostics(pc, reason) {
  try {
    const stats = await pc.getStats();
    const candidateKinds = new Map();
    const pairs = [];
    stats.forEach((report) => {
      if (
        report.type === "local-candidate" ||
        report.type === "remote-candidate"
      ) {
        candidateKinds.set(
          report.id,
          `${report.candidateType || "?"}/${report.protocol || "?"}`,
        );
      } else if (report.type === "candidate-pair") {
        pairs.push(report);
      }
    });
    const pairLabel = (pair) =>
      `${candidateKinds.get(pair.localCandidateId) || "?"} -> ${
        candidateKinds.get(pair.remoteCandidateId) || "?"
      }:${pair.state}${pair.nominated ? " nominated" : ""}`;
    console.warn(
      `[call] ICE ${reason}:`,
      JSON.stringify({
        connection: pc.connectionState,
        ice: pc.iceConnectionState,
        signaling: pc.signalingState,
        pairs: pairs.map(pairLabel),
      }),
    );
  } catch (_) {}
}

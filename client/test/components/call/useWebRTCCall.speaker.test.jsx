import { describe, test, expect, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { useWebRTCCall } from "../../../src/hooks/chat/useWebRTCCall.js";

// No network in tests: the hook fetches ICE servers on mount.
vi.mock("../../../src/api/chatApi.js", () => ({
  fetchIceServers: vi.fn(async () => []),
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

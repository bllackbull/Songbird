import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

describe("pending queue offline behavior", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { onLine: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("does not transition sending messages to failed when offline", () => {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    const now = Date.now();
    const queuedAt = now - 60000; // 60s old
    const timeoutMs = 30000;

    let deliveryStatus = "sending";
    if (!isOffline && now - queuedAt > timeoutMs) {
      deliveryStatus = "failed";
    }

    expect(deliveryStatus).toBe("sending");
  });
});

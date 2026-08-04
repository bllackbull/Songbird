import { describe, expect, test, vi } from "vitest";

if (typeof window === "undefined") {
  globalThis.window = new EventTarget();
  if (typeof CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(type, eventInitDict) {
        super(type, eventInitDict);
        this.detail = eventInitDict?.detail;
      }
    };
  }
}

describe("useChatEvents — custom realtime event dispatch", () => {
  test("dispatches songbird:realtime-event on window when a valid WebSocket event is received", () => {
    const listener = vi.fn();
    window.addEventListener("songbird:realtime-event", listener);

    const payload = {
      type: "presence_update",
      username: "alice",
      status: "online",
    };
    window.dispatchEvent(
      new CustomEvent("songbird:realtime-event", { detail: payload }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual(payload);

    window.removeEventListener("songbird:realtime-event", listener);
  });
});

import { describe, test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createWebSocketGateway } from "../../lib/websocketGateway.js";

describe("WebSocket Gateway Call Signaling", () => {
  test("handles call_signal messages and delegates to callManager", async () => {
    const callManager = {
      startCall: vi.fn(async () => ({ status: 200, call: {} })),
      acceptCall: vi.fn(async () => ({ status: 200, call: {} })),
      rejectCall: vi.fn(async () => ({ status: 200 })),
      endCall: vi.fn(async () => ({ status: 200 })),
      relaySignal: vi.fn(async () => ({ status: 200 })),
      cleanupUserCalls: vi.fn(),
    };

    const gateway = createWebSocketGateway({ callManager });

    // Mock a websocket client
    const ws = new EventEmitter();
    ws.isAlive = true;
    ws.readyState = 1;
    ws.send = vi.fn();

    const session = { id: "user-1", username: "alice" };

    gateway.wss.emit("connection", ws, {}, session);

    // 1. start call signal
    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          action: "call_signal",
          signalType: "start",
          chatId: "chat-uuid-1",
          data: { type: "video" },
        }),
      ),
    );

    // Wait a tick for async handler
    await new Promise((r) => setTimeout(r, 10));

    expect(callManager.startCall).toHaveBeenCalledWith({
      user: session,
      chatId: "chat-uuid-1",
      type: "video",
    });

    // 2. relay signal
    ws.emit(
      "message",
      Buffer.from(
        JSON.stringify({
          action: "call_signal",
          signalType: "offer",
          chatId: "chat-uuid-1",
          data: { sdp: "dummy-sdp" },
        }),
      ),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(callManager.relaySignal).toHaveBeenCalledWith({
      user: session,
      chatId: "chat-uuid-1",
      signalType: "offer",
      payload: { sdp: "dummy-sdp" },
    });

    // 3. on close, cleans up active user calls
    ws.emit("close");

    expect(callManager.cleanupUserCalls).toHaveBeenCalledWith("alice");

    gateway.close();
  });
});

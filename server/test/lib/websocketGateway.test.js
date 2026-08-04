import { describe, test, expect, vi } from "vitest";
import { createWebSocketGateway } from "../../lib/websocketGateway.js";
import { createSseHub } from "../../lib/sse.js";
import { createRedisClient } from "../../lib/redis.js";

describe("WebSocket Gateway", () => {
  test("registers and manages WebSocket gateway structure", () => {
    const sseHub = { getCachedMembers: vi.fn(() => [{ username: "alice" }]) };
    const gateway = createWebSocketGateway({ sseHub });

    expect(gateway.wss).toBeDefined();
    expect(gateway.clientsByUsername).toBeDefined();
    expect(typeof gateway.sendEvent).toBe("function");
    expect(typeof gateway.sendChatEvent).toBe("function");
    expect(typeof gateway.broadcastAll).toBe("function");

    gateway.close();
  });

  test("dispatches events via Redis Pub/Sub if configured", async () => {
    const redisClient = createRedisClient({ forceInProcess: true });
    const gateway = createWebSocketGateway({ redisClient });

    const publishSpy = vi.spyOn(redisClient, "publish");
    gateway.broadcastAll({ type: "test" });

    expect(publishSpy).toHaveBeenCalledWith(
      "songbird:events",
      expect.stringContaining('"broadcast":true'),
    );

    gateway.close();
  });

  test("sseHub delegates events to registered event listeners like wsGateway", () => {
    const wsAlice = { readyState: 1, send: vi.fn() };
    const getCachedMembers = vi.fn((chatId) => [{ username: "alice" }]);
    const sseHub = { getCachedMembers, emitChatEvent: undefined };

    // Create sseHub via createSseHub
    const realSseHub = createSseHub({ listChatMembers: getCachedMembers });
    const gateway = createWebSocketGateway({ sseHub: realSseHub });

    gateway.clientsByUsername.set("alice", new Set([wsAlice]));

    realSseHub.emitChatEvent(10, { type: "chat_message", text: "hello" });

    expect(wsAlice.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", text: "hello" }));

    gateway.close();
  });

  test("sends chat events to connected websocket clients when emitChatEvent or wsGateway.sendChatEvent is called", () => {
    const wsAlice = { readyState: 1, send: vi.fn() };
    const wsBob = { readyState: 1, send: vi.fn() };

    const getCachedMembers = vi.fn((chatId) => [
      { username: "alice" },
      { username: "bob" },
    ]);
    const sseHub = { getCachedMembers };
    const gateway = createWebSocketGateway({ sseHub });

    // Manually register connected ws clients
    gateway.clientsByUsername.set("alice", new Set([wsAlice]));
    gateway.clientsByUsername.set("bob", new Set([wsBob]));

    gateway.sendChatEvent(10, { type: "chat_message", text: "hello" });

    expect(getCachedMembers).toHaveBeenCalledWith(10);
    expect(wsAlice.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", text: "hello" }));
    expect(wsBob.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", text: "hello" }));

    gateway.close();
  });
});

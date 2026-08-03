import { describe, test, expect, vi } from "vitest";
import { createWebSocketGateway } from "../../lib/websocketGateway.js";
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
});

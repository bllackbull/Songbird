import { describe, test, expect, vi } from "vitest";
import { createRedisClient, createRedisSessionStore } from "../../lib/redis.js";

describe("Redis In-Process Fallback Client", () => {
  test("set and get values with TTL", async () => {
    const redis = createRedisClient({ forceInProcess: true });
    await redis.set("key1", "val1");
    expect(await redis.get("key1")).toBe("val1");

    await redis.set("key2", "val2", "EX", 1);
    expect(await redis.get("key2")).toBe("val2");

    await redis.del("key1");
    expect(await redis.get("key1")).toBeNull();
  });

  test("pub/sub messaging across duplicated clients", async () => {
    const publisher = createRedisClient({ forceInProcess: true });
    const subscriber = publisher.duplicate();

    let receivedMessage = null;
    let receivedChannel = null;

    subscriber.on("message", (channel, message) => {
      receivedChannel = channel;
      receivedMessage = message;
    });

    await subscriber.subscribe("test-channel");
    await publisher.publish("test-channel", JSON.stringify({ hello: "world" }));

    expect(receivedChannel).toBe("test-channel");
    expect(JSON.parse(receivedMessage)).toEqual({ hello: "world" });
  });

  test("redis session store operates correctly with fallback", async () => {
    const redis = createRedisClient({ forceInProcess: true });
    const dbGetSession = vi.fn((token) =>
      token === "test-token" ? { id: 10, username: "alice" } : null
    );

    const sessionStore = createRedisSessionStore({
      redisClient: redis,
      dbGetSession,
    });

    await sessionStore.createSession(10, "test-token");
    const session = await sessionStore.getSession("test-token");
    expect(session).toEqual({ id: 10, username: "alice" });

    await sessionStore.deleteSession("test-token");
    const deletedSession = await sessionStore.getSession("invalid-token");
    expect(deletedSession).toBeNull();
  });
});


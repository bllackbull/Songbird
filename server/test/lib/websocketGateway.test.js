import { describe, test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
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

    const chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    realSseHub.emitChatEvent(chatId, { type: "chat_message", chatId, text: "hello" });

    expect(wsAlice.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", chatId, text: "hello" }));

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

    const chatId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    gateway.sendChatEvent(chatId, { type: "chat_message", chatId, text: "hello" });

    expect(getCachedMembers).toHaveBeenCalledWith(chatId);
    expect(wsAlice.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", chatId, text: "hello" }));
    expect(wsBob.send).toHaveBeenCalledWith(JSON.stringify({ type: "chat_message", chatId, text: "hello" }));

    gateway.close();
  });

  test("invokes onUserConnected and onUserDisconnected on connection/close", () => {
    const onUserConnected = vi.fn();
    const onUserDisconnected = vi.fn();
    const gateway = createWebSocketGateway({ onUserConnected, onUserDisconnected });

    const ws = new EventEmitter();
    gateway.wss.emit("connection", ws, {}, { username: "Alice" });

    expect(onUserConnected).toHaveBeenCalledWith("alice", ws);
    expect(gateway.clientsByUsername.get("alice")).toEqual(new Set([ws]));

    ws.emit("close");
    expect(onUserDisconnected).toHaveBeenCalledWith("alice", ws);
    expect(gateway.clientsByUsername.has("alice")).toBe(false);

    gateway.close();
  });

  test("handles Promise-returning getSessionFromToken during HTTP upgrade", async () => {
    const onUserConnected = vi.fn();
    const server = new EventEmitter();
    const session = { id: "s1", username: "alice" };
    const getSessionFromToken = vi.fn(() => Promise.resolve(session));

    const gateway = createWebSocketGateway({
      server,
      getSessionFromToken,
      onUserConnected,
    });

    vi.spyOn(gateway.wss, "handleUpgrade").mockImplementation((req, socket, head, callback) => {
      callback({ on: () => {} });
    });

    const request = {
      url: "/ws",
      headers: { host: "localhost", cookie: "sid=valid-token" },
    };
    const socket = {};
    const head = Buffer.from([]);

    server.emit("upgrade", request, socket, head);

    // Wait for promise tick
    await new Promise((r) => setTimeout(r, 10));

    expect(onUserConnected).toHaveBeenCalledWith("alice", expect.anything());
    expect(gateway.clientsByUsername.get("alice")).toBeDefined();

    gateway.close();
  });

  test("terminates sockets that fail to respond to heartbeat ping", async () => {
    const gateway = createWebSocketGateway({
      heartbeatIntervalMs: 50,
      heartbeatTimeoutMs: 50,
    });
    // Simulate socket connection
    const mockWs = {
      readyState: 1, // OPEN
      isAlive: true,
      ping: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
    };

    gateway.wss.emit("connection", mockWs, {}, { username: "testuser" });

    // Wait for heartbeat tick
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(mockWs.ping).toHaveBeenCalled();
    expect(mockWs.isAlive).toBe(false);

    // Wait for next heartbeat tick (unresponsive socket)
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(mockWs.terminate).toHaveBeenCalled();

    gateway.close();
  });

  test("terminates sockets after heartbeatTimeoutMs when unresponsive to ping", async () => {
    const gateway = createWebSocketGateway({
      heartbeatIntervalMs: 200,
      heartbeatTimeoutMs: 50,
    });
    const mockWs = {
      readyState: 1,
      isAlive: true,
      ping: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn(),
      send: vi.fn(),
    };

    gateway.wss.emit("connection", mockWs, {}, { username: "testuser" });

    // Wait for first heartbeat interval tick (200ms) + small offset (30ms)
    await new Promise((resolve) => setTimeout(resolve, 230));
    expect(mockWs.ping).toHaveBeenCalled();
    expect(mockWs.isAlive).toBe(false);
    expect(mockWs.terminate).not.toHaveBeenCalled();

    // Wait for heartbeatTimeoutMs (50ms) to elapse (total 280ms, well before 2nd interval at 400ms)
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(mockWs.terminate).toHaveBeenCalled();

    gateway.close();
  });

  test("does not terminate socket if pong is received before heartbeatTimeoutMs", async () => {
    let pongHandler;
    const gateway = createWebSocketGateway({
      heartbeatIntervalMs: 200,
      heartbeatTimeoutMs: 100,
    });
    const mockWs = {
      readyState: 1,
      isAlive: true,
      ping: vi.fn(),
      terminate: vi.fn(),
      on: vi.fn((event, handler) => {
        if (event === "pong") pongHandler = handler;
      }),
      send: vi.fn(),
    };

    gateway.wss.emit("connection", mockWs, {}, { username: "testuser" });

    // Wait for ping tick at 200ms
    await new Promise((resolve) => setTimeout(resolve, 230));
    expect(mockWs.ping).toHaveBeenCalled();
    expect(mockWs.isAlive).toBe(false);

    // Simulate pong arriving before timeout
    if (pongHandler) pongHandler();
    expect(mockWs.isAlive).toBe(true);

    // Wait for heartbeatTimeoutMs to elapse
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(mockWs.terminate).not.toHaveBeenCalled();

    gateway.close();
  });
});

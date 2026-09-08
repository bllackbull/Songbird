import { WebSocketServer, WebSocket } from "ws";

export function createWebSocketGateway({
  server,
  sseHub,
  redisClient,
  getSessionFromToken,
  onUserConnected,
  onUserDisconnected,
  heartbeatIntervalMs = 30000,
  heartbeatTimeoutMs = 10000,
}) {
  const wss = new WebSocketServer({ noServer: true });
  const clientsByUsername = new Map();

  const instanceId = Math.random().toString(36).substring(2);

  function clearHeartbeatTimeoutTimer(ws) {
    if (ws && ws._heartbeatTimeoutTimer) {
      clearTimeout(ws._heartbeatTimeoutTimer);
      ws._heartbeatTimeoutTimer = null;
    }
  }

  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        clearHeartbeatTimeoutTimer(ws);
        if (typeof ws.terminate === "function") {
          ws.terminate();
        }
        return;
      }
      ws.isAlive = false;
      if (typeof ws.ping === "function") {
        ws.ping();
      }
      clearHeartbeatTimeoutTimer(ws);
      if (heartbeatTimeoutMs > 0) {
        ws._heartbeatTimeoutTimer = setTimeout(() => {
          ws._heartbeatTimeoutTimer = null;
          if (ws.isAlive === false && typeof ws.terminate === "function") {
            ws.terminate();
          }
        }, heartbeatTimeoutMs);
      }
    });
  }, heartbeatIntervalMs);

  if (typeof heartbeatTimer.unref === "function") {
    heartbeatTimer.unref();
  }

  // PubSub subscriber for cross-instance message routing
  const pubsubSub = redisClient ? redisClient.duplicate() : null;
  if (pubsubSub) {
    pubsubSub.subscribe("songbird:events");
    pubsubSub.on("message", (channel, message) => {
      if (channel === "songbird:events") {
        try {
          const { username, chatId, payload, broadcast, senderInstance } = JSON.parse(message);
          if (senderInstance === instanceId) return;
          if (broadcast) {
            broadcastLocal(payload);
          } else if (chatId && sseHub) {
            const rawMembers = sseHub.getCachedMembers(chatId);
            const processMembers = (members) => {
              (members || []).forEach((m) => {
                if (m?.username) sendToUsernameLocal(m.username, payload);
              });
            };
            if (rawMembers && typeof rawMembers.then === "function") {
              rawMembers.then(processMembers).catch(() => {});
            } else {
              processMembers(rawMembers);
            }
          } else if (username) {
            sendToUsernameLocal(username, payload);
          }
        } catch (_) {}
      }
    });
  }

  function broadcastLocal(payload) {
    const data = JSON.stringify(payload);
    clientsByUsername.forEach((clients) => {
      clients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(data);
          } catch (_) {}
        }
      });
    });
  }

  function sendToUsernameLocal(username, payload) {
    const key = String(username || "").toLowerCase();
    const clients = clientsByUsername.get(key);
    if (!clients?.size) return;
    const data = JSON.stringify(payload);
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (_) {}
      }
    });
  }

  function sendEvent(username, payload) {
    sendToUsernameLocal(username, payload);
    if (redisClient) {
      redisClient.publish(
        "songbird:events",
        JSON.stringify({ username, payload, senderInstance: instanceId }),
      );
    }
  }

  function sendChatEvent(chatId, payload) {
    if (sseHub) {
      const rawMembers = sseHub.getCachedMembers(chatId);
      const processMembers = (members) => {
        (members || []).forEach((member) => {
          if (member?.username) sendToUsernameLocal(member.username, payload);
        });
      };
      if (rawMembers && typeof rawMembers.then === "function") {
        rawMembers.then(processMembers).catch(() => {});
      } else {
        processMembers(rawMembers);
      }
    }
    if (redisClient) {
      redisClient.publish(
        "songbird:events",
        JSON.stringify({ chatId, payload, senderInstance: instanceId }),
      );
    }
  }

  let unsubscribeHub = null;
  if (sseHub && typeof sseHub.onChatEvent === "function") {
    unsubscribeHub = sseHub.onChatEvent((chatId, payload) => {
      sendChatEvent(chatId, payload);
    });
  }

  function broadcastAll(payload) {
    broadcastLocal(payload);
    if (redisClient) {
      redisClient.publish(
        "songbird:events",
        JSON.stringify({ broadcast: true, payload, senderInstance: instanceId }),
      );
    }
  }

  wss.on("connection", (ws, req, rawSession) => {
    ws.isAlive = true;
    if (wss.clients && typeof wss.clients.add === "function") {
      wss.clients.add(ws);
    }
    if (typeof ws.on === "function") {
      ws.on("pong", () => {
        ws.isAlive = true;
        clearHeartbeatTimeoutTimer(ws);
      });
    }

    const handleConnection = (session) => {
      const username = session?.username
        ? String(session.username).toLowerCase()
        : null;
      if (username) {
        const clients = clientsByUsername.get(username) || new Set();
        clients.add(ws);
        clientsByUsername.set(username, clients);
      }
      if (onUserConnected) onUserConnected(username, ws);

      if (typeof ws.on === "function") {
        ws.on("close", () => {
          clearHeartbeatTimeoutTimer(ws);
          if (wss.clients && typeof wss.clients.delete === "function") {
            wss.clients.delete(ws);
          }
          if (username) {
            const clients = clientsByUsername.get(username);
            if (clients) {
              clients.delete(ws);
              if (!clients.size) clientsByUsername.delete(username);
            }
          }
          if (onUserDisconnected) onUserDisconnected(username, ws);
        });
      }
    };

    if (rawSession && typeof rawSession.then === "function") {
      rawSession.then(handleConnection).catch(() => handleConnection(null));
    } else {
      handleConnection(rawSession);
    }

    if (typeof ws.on === "function") {
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "pong" || msg.type === "ping") {
            ws.isAlive = true;
            clearHeartbeatTimeoutTimer(ws);
          }
          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          }
        } catch (_) {}
      });
    }
  });

  if (server) {
    server.on("upgrade", (request, socket, head) => {
      const urlObj = new URL(
        request.url,
        `http://${request.headers.host || "localhost"}`,
      );
      const pathname = urlObj.pathname;
      if (pathname === "/ws" || pathname === "/api/ws") {
        let token = urlObj.searchParams.get("token") || urlObj.searchParams.get("sid");
        if (!token) {
          const cookieHeader = request.headers.cookie || "";
          const matches = cookieHeader.match(/sid=([^;]+)/);
          if (matches) token = decodeURIComponent(matches[1]);
        }

        const rawSession =
          token && getSessionFromToken ? getSessionFromToken(token) : null;

        const processSession = (session) => {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request, session);
          });
        };

        if (rawSession && typeof rawSession.then === "function") {
          rawSession.then(processSession).catch(() => {
            processSession(null);
          });
        } else {
          processSession(rawSession);
        }
      }
    });
  }

  return {
    wss,
    clientsByUsername,
    sendEvent,
    sendChatEvent,
    broadcastAll,
    close() {
      clearInterval(heartbeatTimer);
      if (wss.clients && typeof wss.clients.forEach === "function") {
        wss.clients.forEach((ws) => clearHeartbeatTimeoutTimer(ws));
      }
      if (unsubscribeHub) unsubscribeHub();
      if (pubsubSub) pubsubSub.quit();
      wss.close();
    },
  };
}

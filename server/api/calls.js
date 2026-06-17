// Voice & video call signaling over the existing SSE + HTTP infrastructure.
//
// WebRTC signaling is low-frequency (a handful of messages to set up a call),
// so plain `POST /api/calls/*` endpoints that push to the peer over the
// existing per-user SSE stream are sufficient. This avoids running a second
// real-time system (Socket.IO) alongside SSE.

// chatId -> { callerId, callerUsername, calleeId, calleeUsername, type, startedAt }
const activeCalls = new Map();

function registerCallRoutes(app, deps) {
  const {
    getSessionFromRequest,
    findUserById,
    findUserByUsername,
    isMember,
    emitSseEvent,
  } = deps;

  const TURN_STUN_URL =
    process.env.TURN_STUN_URL || "stun:stun.l.google.com:19302";
  const TURN_URL = process.env.TURN_URL || "";
  const TURN_USERNAME = process.env.TURN_USERNAME || "";
  const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || "";

  function getIceServers() {
    const servers = [{ urls: TURN_STUN_URL }];
    if (TURN_URL) {
      servers.push({
        urls: TURN_URL,
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      });
    }
    return servers;
  }

  const requireUser = (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    return session;
  };

  const peerUsernameOf = (call, username) =>
    username === call.callerUsername ? call.calleeUsername : call.callerUsername;

  const isParticipant = (call, username) =>
    Boolean(call) &&
    (username === call.callerUsername || username === call.calleeUsername);

  // Relay a WebRTC signaling payload (offer/answer/ICE candidate) to the peer.
  const relaySignal = (eventType, bodyKey) => (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const chatId = Number(req.body?.chatId);
    const call = activeCalls.get(chatId);
    if (!isParticipant(call, session.username)) {
      return res.status(404).json({ error: "No active call" });
    }
    emitSseEvent(peerUsernameOf(call, session.username), {
      type: eventType,
      chatId,
      [bodyKey]: req.body?.[bodyKey],
    });
    res.json({ ok: true });
  };

  app.get("/api/calls/ice-servers", (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    res.json({ iceServers: getIceServers() });
  });

  // Start a call — notify the callee.
  app.post("/api/calls/start", (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const chatId = Number(req.body?.chatId);
    const calleeUsername = String(req.body?.calleeUsername || "")
      .trim()
      .toLowerCase();
    const callType = req.body?.type === "video" ? "video" : "voice";
    if (!chatId || !calleeUsername) {
      return res.status(400).json({ error: "Invalid call request" });
    }
    if (!isMember(chatId, session.id)) {
      return res.status(403).json({ error: "Not a chat member" });
    }
    const calleeUser = findUserByUsername(calleeUsername);
    if (!calleeUser) {
      return res.status(404).json({ error: "Callee not found" });
    }
    if (calleeUser.id === session.id) {
      return res.status(400).json({ error: "Cannot call yourself" });
    }
    if (!isMember(chatId, calleeUser.id)) {
      return res.status(403).json({ error: "Callee is not in this chat" });
    }

    const caller = findUserById(session.id);
    activeCalls.set(chatId, {
      callerId: session.id,
      callerUsername: session.username,
      calleeId: calleeUser.id,
      calleeUsername: calleeUser.username,
      type: callType,
      startedAt: Date.now(),
    });

    const iceServers = getIceServers();
    emitSseEvent(calleeUser.username, {
      type: "call:incoming",
      chatId,
      callerUsername: session.username,
      callerNickname: caller?.nickname || session.username,
      callerAvatar: caller?.avatar_url || "",
      callType,
      iceServers,
    });

    res.json({ ok: true, iceServers });
  });

  // Callee accepted — notify the caller so they create the WebRTC offer.
  app.post("/api/calls/accept", (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const chatId = Number(req.body?.chatId);
    const call = activeCalls.get(chatId);
    if (!isParticipant(call, session.username)) {
      return res.status(404).json({ error: "No active call" });
    }
    emitSseEvent(call.callerUsername, { type: "call:accepted", chatId });
    res.json({ ok: true });
  });

  // Callee rejected — notify the caller and clear the call.
  app.post("/api/calls/reject", (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const chatId = Number(req.body?.chatId);
    const call = activeCalls.get(chatId);
    if (!isParticipant(call, session.username)) {
      return res.status(404).json({ error: "No active call" });
    }
    emitSseEvent(call.callerUsername, { type: "call:rejected", chatId });
    activeCalls.delete(chatId);
    res.json({ ok: true });
  });

  // Either party ended — notify both and clear the call.
  app.post("/api/calls/end", (req, res) => {
    const session = requireUser(req, res);
    if (!session) return;
    const chatId = Number(req.body?.chatId);
    const call = activeCalls.get(chatId);
    if (!isParticipant(call, session.username)) {
      return res.status(404).json({ error: "No active call" });
    }
    emitSseEvent(call.callerUsername, { type: "call:ended", chatId });
    emitSseEvent(call.calleeUsername, { type: "call:ended", chatId });
    activeCalls.delete(chatId);
    res.json({ ok: true });
  });

  app.post("/api/calls/offer", relaySignal("call:offer", "offer"));
  app.post("/api/calls/answer", relaySignal("call:answer", "answer"));
  app.post(
    "/api/calls/ice-candidate",
    relaySignal("call:ice-candidate", "candidate"),
  );
}

export { registerCallRoutes };

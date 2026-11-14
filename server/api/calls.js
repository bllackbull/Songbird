import { createCallManager } from "../lib/callManager.js";
import { validateUuidBody } from "../lib/uuidMiddleware.js";

/**
 * Register HTTP routes for WebRTC call setup and signaling fallback.
 */
export function registerCallRoutes(app, deps) {
  const {
    getSessionFromRequest,
    callManager: providedCallManager,
    listCallHistoryForUser,
    findMessageById,
    findChatById,
    isMember,
    hideMessageForUser,
    getSetting,
  } = deps;

  const callManager =
    providedCallManager ||
    createCallManager({
      ...deps,
      emitToUser: deps.emitToUser || deps.emitSseEvent,
    });

  const requireUser = async (req, res) => {
    if (typeof deps.requireSession === "function") {
      return await deps.requireSession(req, res);
    }
    const rawSession = getSessionFromRequest ? getSessionFromRequest(req) : null;
    const session =
      rawSession && typeof rawSession.then === "function"
        ? await rawSession
        : rawSession;
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    return session;
  };

  // GET /api/calls/ice-servers
  app.get("/api/calls/ice-servers", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    res.json(await callManager.resolveIceServers());
  });

  // Returns the still-ringing incoming call for the authenticated user.
  app.get("/api/calls/incoming", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const incoming = await callManager.getIncomingCallForUser(user.username);
    res.json({ call: incoming || null });
  });

  // Live-read so admin panel / env changes apply without touching the
  // in-memory callManager.
  const callsEnabled = () =>
    typeof getSetting === "function" ? Boolean(getSetting("CALL")) : true;
  const videoCallsEnabled = () =>
    typeof getSetting === "function" ? Boolean(getSetting("CALL_VIDEO")) : true;

  // POST /api/calls/start
  app.post("/api/calls/start", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId, type } = req.body || {};
    if (!callsEnabled()) {
      return res.status(403).json({ error: "Calls are disabled on this server" });
    }
    if (type === "video" && !videoCallsEnabled()) {
      return res.status(403).json({ error: "Video calls are disabled on this server" });
    }
    const result = await callManager.startCall({ user, chatId, type });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true, call: result.call });
  });

  // POST /api/calls/accept
  app.post("/api/calls/accept", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId } = req.body || {};
    const result = await callManager.acceptCall({ user, chatId });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true, call: result.call });
  });

  // POST /api/calls/reject
  app.post("/api/calls/reject", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId, reason } = req.body || {};
    const result = await callManager.rejectCall({ user, chatId, reason });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // POST /api/calls/end
  app.post("/api/calls/end", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId } = req.body || {};
    const result = await callManager.endCall({ user, chatId });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // POST /api/calls/offer
  app.post("/api/calls/offer", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId, sdp } = req.body || {};
    const result = await callManager.relaySignal({
      user,
      chatId,
      signalType: "offer",
      payload: { sdp },
    });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // POST /api/calls/answer
  app.post("/api/calls/answer", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId, sdp } = req.body || {};
    const result = await callManager.relaySignal({
      user,
      chatId,
      signalType: "answer",
      payload: { sdp },
    });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // POST /api/calls/ice-candidate
  app.post("/api/calls/ice-candidate", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId, candidate } = req.body || {};
    const result = await callManager.relaySignal({
      user,
      chatId,
      signalType: "ice-candidate",
      payload: { candidate },
    });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // POST /api/calls/camera-state
  app.post("/api/calls/camera-state", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId, cameraOff } = req.body || {};
    const result = await callManager.relaySignal({
      user,
      chatId,
      signalType: "camera-state",
      payload: { cameraOff: cameraOff !== false },
    });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // POST /api/calls/screen-share-state
  app.post("/api/calls/screen-share-state", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const { chatId, sharing } = req.body || {};
    const result = await callManager.relaySignal({
      user,
      chatId,
      signalType: "screen-share-state",
      payload: { sharing: sharing === true },
    });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // GET /api/calls/history — call-log entries across the user's DM chats.
  app.get("/api/calls/history", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    if (typeof listCallHistoryForUser !== "function") {
      return res.status(501).json({ error: "Not supported" });
    }
    const rows = await listCallHistoryForUser(user.id);
    res.json({ calls: rows || [] });
  });

  // POST /api/calls/history/delete — remove a call-log entry from own history.
  app.post(
    "/api/calls/history/delete",
    validateUuidBody([{ field: "messageId", required: true }]),
    async (req, res) => {
      const user = await requireUser(req, res);
      if (!user) return;
      const { messageId } = req.body || {};
      const awaiting = async (value) =>
        value && typeof value.then === "function" ? await value : value;

      const message = await awaiting(findMessageById?.(messageId));
      if (!message) {
        return res.status(404).json({ error: "Call not found" });
      }
      const rawChat = await awaiting(findChatById?.(message.chat_id));
      if (!rawChat || rawChat.type !== "dm") {
        return res.status(404).json({ error: "Call not found" });
      }
      const member = await awaiting(isMember?.(message.chat_id, user.id));
      if (!member) {
        return res.status(403).json({ error: "Not a member of this chat" });
      }
      if (!String(message.body || "").startsWith("[[call:")) {
        return res.status(400).json({ error: "Not a call entry" });
      }

      await awaiting(hideMessageForUser?.(message.id, user.id));
      res.json({ ok: true, id: message.id });
    },
  );
}

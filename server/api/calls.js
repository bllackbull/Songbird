import { createCallManager } from "../lib/callManager.js";

/**
 * Register HTTP routes for WebRTC call setup and signaling fallback.
 */
export function registerCallRoutes(app, deps) {
  const {
    getSessionFromRequest,
    callManager: providedCallManager,
  } = deps;

  const callManager =
    providedCallManager ||
    createCallManager({
      ...deps,
      emitToUser: deps.emitToUser || deps.emitSseEvent,
    });

  const requireUser = (req, res) => {
    const session = getSessionFromRequest ? getSessionFromRequest(req) : null;
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    return session;
  };

  // GET /api/calls/ice-servers
  app.get("/api/calls/ice-servers", (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    res.json(callManager.getIceServers());
  });

  // POST /api/calls/start
  app.post("/api/calls/start", async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const { chatId, type } = req.body || {};
    const result = await callManager.startCall({ user, chatId, type });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true, call: result.call });
  });

  // POST /api/calls/accept
  app.post("/api/calls/accept", async (req, res) => {
    const user = requireUser(req, res);
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
    const user = requireUser(req, res);
    if (!user) return;
    const { chatId } = req.body || {};
    const result = await callManager.rejectCall({ user, chatId });
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ ok: true });
  });

  // POST /api/calls/end
  app.post("/api/calls/end", async (req, res) => {
    const user = requireUser(req, res);
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
    const user = requireUser(req, res);
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
    const user = requireUser(req, res);
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
    const user = requireUser(req, res);
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
    const user = requireUser(req, res);
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
}

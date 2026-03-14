function registerHealthRoutes(app, deps) {
  const {
    addSseClient,
    findUserByUsername,
    removeSseClient,
    requireSession,
    requireSessionUsernameMatch,
    updateLastSeen,
  } = deps;

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/events", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const username = req.query.username?.toString()?.toLowerCase();
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;
    const user = findUserByUsername(username);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Hint reverse proxies (e.g., Nginx) not to buffer SSE chunks.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    addSseClient(username, res);
    updateLastSeen(user.id);

    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeSseClient(username, res);
    });
  });
}

export { registerHealthRoutes };

function registerPresenceRoutes(app, deps) {
  const {
    findUserByUsername,
    getUserPresence,
    requireSession,
    requireSessionUsernameMatch,
    updateLastSeen,
  } = deps;

  app.post("/api/presence", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const suppliedUsername = req.body?.username;
    if (!requireSessionUsernameMatch(res, session, suppliedUsername)) return;

    const user = findUserByUsername(String(session.username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    updateLastSeen(user.id);

    res.json({ ok: true });
  });

  app.get("/api/presence", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const username = req.query.username?.toString();
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    const user = getUserPresence(username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({
      username: user.username,
      status: user.status || "online",
      lastSeen: user.last_seen || null,
    });
  });
}

export { registerPresenceRoutes };

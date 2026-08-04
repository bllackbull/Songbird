function registerPresenceRoutes(app, deps) {
  const { getUserPresence, requireSession, requireSessionUsernameMatch, isConnected } = deps;

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

    const effectiveStatus =
      isConnected(user.username) && String(user.status || "").toLowerCase() === "online"
        ? "online"
        : "offline";

    res.json({
      username: user.username,
      status: effectiveStatus,
      rawStatus: String(user.status || "online").toLowerCase(),
      lastSeen: user.last_seen || null,
    });
  });
}

export { registerPresenceRoutes };

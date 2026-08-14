function registerPresenceRoutes(app, deps) {
  const { getUserPresence, requireSession, requireSessionUsernameMatch, isConnected } = deps;

  app.get("/api/presence", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const username = req.query.username?.toString();
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    const rawUser = getUserPresence(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const effectiveStatus =
      typeof isConnected === "function" && isConnected(user.username) && String(user.status || "online").toLowerCase() !== "invisible"
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

function registerPresenceRoutes(app, deps) {
  const {
    emitSseEvent,
    findUserByUsername,
    getUserPresence,
    listChatMembers,
    listChatsForUser,
    requireSession,
    requireSessionUsernameMatch,
    updateLastSeen,
  } = deps;

  const emitPresenceUpdate = (user) => {
    if (!user?.username) return;

    const normalizedUsername = String(user.username || "").toLowerCase();
    const payload = {
      type: "presence_update",
      username: normalizedUsername,
      status: String(user.status || "online").toLowerCase(),
      lastSeen: user.last_seen || new Date().toISOString(),
    };

    const targets = new Set([normalizedUsername]);
    const chats = listChatsForUser(Number(user.id || 0));
    chats.forEach((chat) => {
      const members = listChatMembers(Number(chat?.id || 0));
      members.forEach((member) => {
        const memberUsername = String(member?.username || "").toLowerCase();
        if (memberUsername) targets.add(memberUsername);
      });
    });

    targets.forEach((targetUsername) => {
      emitSseEvent(targetUsername, payload);
    });
  };

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
    const refreshedUser = getUserPresence(String(user.username || "").toLowerCase());
    if (refreshedUser) {
      emitPresenceUpdate(refreshedUser);
    }

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

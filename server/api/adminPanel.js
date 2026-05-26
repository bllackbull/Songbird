function registerAdminPanelRoutes(app, deps) {
  const {
    getSessionFromRequest,
    findUserById,
    isUserAdmin,
    getAdminStats,
    adminListUsers,
    adminListChats,
    adminBanUser,
    adminDeleteUser,
    adminDeleteChat,
    setUserRole,
  } = deps;

  // Admin auth middleware
  const requireAdmin = (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    if (!isUserAdmin(session.user_id)) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return session;
  };

  // Dashboard stats
  app.get("/api/admin/stats", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const stats = getAdminStats();
    res.json(stats);
  });

  // List users
  app.get("/api/admin/users", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const search = String(req.query.search || "").trim();
    const users = adminListUsers({ limit, offset, search });
    res.json({ users });
  });

  // Ban/unban user
  app.post("/api/admin/users/:id/ban", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    const { banned } = req.body || {};
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    adminBanUser(userId, Boolean(banned));
    res.json({ ok: true, banned: Boolean(banned) });
  });

  // Change user role
  app.post("/api/admin/users/:id/role", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    const { role } = req.body || {};
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    setUserRole(userId, role);
    res.json({ ok: true, role });
  });

  // Delete user
  app.delete("/api/admin/users/:id", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    if (userId === session.user_id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }
    adminDeleteUser(userId);
    res.json({ ok: true });
  });

  // List chats
  app.get("/api/admin/chats", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);
    const chats = adminListChats({ limit, offset });
    res.json({ chats });
  });

  // Delete chat
  app.delete("/api/admin/chats/:id", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = Number(req.params.id);
    if (!chatId) return res.status(400).json({ error: "Invalid chat ID" });
    adminDeleteChat(chatId);
    res.json({ ok: true });
  });
}

export { registerAdminPanelRoutes };

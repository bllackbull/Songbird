import { normalizeHexColor, normalizeGroupUsername, normalizeVisibility, normalizeChatType } from "../lib/dbToolHelpers.js";
import { createInviteToken } from "../lib/inviteTokens.js";
import { writeAdminLog, readAdminLog, clearAdminLog } from "../lib/adminLog.js";
import { readInstallerLog, readNginxLog, readServiceLog } from "../lib/systemLogs.js";
import os from "node:os";
import { execFile } from "node:child_process";

function registerAdminPanelRoutes(app, deps) {
  const {
    getSessionFromRequest,
    findUserById,
    findUserByUsername,
    findChatById,
    isUserAdmin,
    getAdminStats,
    adminListUsers,
    adminListChats,
    adminBanUser,
    adminDeleteUser,
    adminDeleteChat,
    removeStoredFileNames,
    setUserRole,
    // user creation / editing
    bcrypt,
    setUserColor,
    USERNAME_REGEX,
    USERNAME_MAX,
    NICKNAME_MAX,
    adminGetRow,
    adminRun,
    adminSave,
    // chat creation / editing
    crypto,
    createChat,
    addChatMember,
    removeChatMember,
    setChatMemberRole,
    listChatMembers,
    updateGroupChat,
    updateChannelChat,
    // emitting SSE on changes
    emitChatEvent,
    // maintenance
    vacuumDatabase,
    reloadDatabase,
    projectRootDir,
    path: nodePath,
    fs,
  } = deps;

  // ─── Auth middleware ─────────────────────────────────────────────────────────

  const requireAdmin = (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }
    if (!isUserAdmin(session.id)) {
      res.status(403).json({ error: "Admin access required" });
      return null;
    }
    return session;
  };

  // Helper to write an audit log entry (to logs/admin.log) tied to the acting admin.
  const log = (session, action, opts = {}) => {
    writeAdminLog({
      actorUserId:   session?.id ?? null,
      actorUsername: session?.username ?? null,
      action,
      targetType:    opts.targetType ?? null,
      targetLabel:   opts.targetLabel ?? null,
      details:       opts.details ?? null,
      status:        opts.status ?? "success",
    });
  };

  // ─── Dashboard ───────────────────────────────────────────────────────────────

  app.get("/api/admin/stats", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(getAdminStats());
  });

  app.get("/api/admin/system", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const mem = process.memoryUsage();
    const totalMem  = os.totalmem();
    const freeMem   = os.freemem();
    const usedMem   = totalMem - freeMem;
    const uptimeSec = Math.floor(process.uptime());
    const loadAvg   = os.loadavg();
    const cpuCount  = os.cpus().length;

    const { projectRootDir, path: nodePath, fs } = deps;

    // DB file size
    let dbSizeBytes = 0;
    try {
      if (nodePath && projectRootDir && fs) {
        const dbPath = nodePath.join(projectRootDir, "data", "songbird.db");
        if (fs.existsSync(dbPath)) dbSizeBytes = fs.statSync(dbPath).size;
      }
    } catch {}

    // Uploads folder size (recursive)
    let uploadsSizeBytes = 0;
    const getDirSize = (dirPath) => {
      try {
        if (!fs || !fs.existsSync(dirPath)) return 0;
        let total = 0;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const full = nodePath.join(dirPath, entry.name);
          if (entry.isDirectory()) total += getDirSize(full);
          else if (entry.isFile()) total += fs.statSync(full).size || 0;
        }
        return total;
      } catch { return 0; }
    };
    try {
      if (nodePath && projectRootDir) {
        uploadsSizeBytes = getDirSize(nodePath.join(projectRootDir, "data", "uploads"));
      }
    } catch {}

    // Disk / filesystem stats for the data directory
    let diskTotalBytes = 0;
    let diskFreeBytes  = 0;
    let diskUsedBytes  = 0;
    try {
      if (fs && typeof fs.statfsSync === "function" && projectRootDir) {
        const stat = fs.statfsSync(projectRootDir);
        diskTotalBytes = stat.blocks * stat.bsize;
        diskFreeBytes  = stat.bavail * stat.bsize;
        diskUsedBytes  = diskTotalBytes - diskFreeBytes;
      }
    } catch {}

    res.json({
      uptime: uptimeSec,
      loadAvg,
      cpuCount,
      memory: {
        heapUsed:    mem.heapUsed,
        heapTotal:   mem.heapTotal,
        rss:         mem.rss,
        systemTotal: totalMem,
        systemUsed:  usedMem,
        systemFree:  freeMem,
      },
      storage: {
        dbSizeBytes,
        uploadsSizeBytes,
        totalDataBytes: dbSizeBytes + uploadsSizeBytes,
        diskTotalBytes,
        diskUsedBytes,
        diskFreeBytes,
      },
    });
  });

  // ─── Users — list ────────────────────────────────────────────────────────────

  app.get("/api/admin/users", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit  = Number(req.query.limit  || 200);
    const offset = Number(req.query.offset || 0);
    const search = String(req.query.search || "").trim();
    const sortBy    = ["id", "username", "nickname", "created_at", "last_seen"].includes(req.query.sortBy)
      ? req.query.sortBy : "id";
    const sortDir   = req.query.sortDir === "asc" ? "ASC" : "DESC";
    const roleFilter = ["user", "admin", "owner"].includes(req.query.role) ? req.query.role : null;
    const statusFilter = ["online", "invisible", "banned"].includes(req.query.status) ? req.query.status : null;
    const users = adminListUsers({ limit, offset, search, sortBy, sortDir, roleFilter, statusFilter });
    res.json({ users });
  });

  // ─── Users — create ──────────────────────────────────────────────────────────

  app.post("/api/admin/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const rawUsername = String(req.body?.username || "").trim().toLowerCase();
    const nickname    = String(req.body?.nickname  || "").trim();
    const password    = String(req.body?.password  || "");
    const role        = ["user", "admin"].includes(req.body?.role) ? req.body.role : "user";

    if (!rawUsername || !nickname || !password) {
      return res.status(400).json({ error: "Username, nickname, and password are required." });
    }
    if (rawUsername.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters." });
    }
    if (USERNAME_MAX && rawUsername.length > USERNAME_MAX) {
      return res.status(400).json({ error: `Username must be at most ${USERNAME_MAX} characters.` });
    }
    if (NICKNAME_MAX && nickname.length > NICKNAME_MAX) {
      return res.status(400).json({ error: `Nickname must be at most ${NICKNAME_MAX} characters.` });
    }
    if (USERNAME_REGEX && !USERNAME_REGEX.test(rawUsername)) {
      return res.status(400).json({ error: "Invalid username. Use lowercase letters, numbers, . and _" });
    }
    if (adminGetRow("SELECT id FROM users WHERE username = ?", [rawUsername])?.id) {
      return res.status(409).json({ error: "Username already exists." });
    }
    if (adminGetRow("SELECT id FROM chats WHERE type IN ('group','channel') AND group_username = ?", [rawUsername])?.id) {
      return res.status(409).json({ error: "Username already exists." });
    }

    const passwordHash   = await bcrypt.hash(password, 10);
    const assignedColor  = setUserColor();
    adminRun(
      `INSERT INTO users (username, nickname, avatar_url, color, status, password_hash, created_at, last_seen)
       VALUES (?, ?, NULL, ?, 'online', ?, datetime('now'), datetime('now'))`,
      [rawUsername, nickname, assignedColor, passwordHash],
    );
    if (role !== "user") {
      const newUser = adminGetRow("SELECT id FROM users WHERE username = ?", [rawUsername]);
      if (newUser?.id) adminRun("UPDATE users SET role = ? WHERE id = ?", [role, Number(newUser.id)]);
    }
    adminSave();
    const row = adminGetRow("SELECT id, username, nickname, color, role FROM users WHERE username = ?", [rawUsername]);
    const session = getSessionFromRequest(req);
    log(session, "user.create", { targetType: "user", targetLabel: `@${rawUsername}`, details: `role=${role}` });
    res.status(201).json({ ok: true, user: row });
  });

  // ─── Users — edit ────────────────────────────────────────────────────────────

  app.patch("/api/admin/users/:id", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const b = req.body || {};
    const nextUsername = b.username !== undefined
      ? String(b.username || "").trim().toLowerCase()
      : String(user.username || "");
    const nextNickname = b.nickname !== undefined
      ? (String(b.nickname || "").trim() || null)
      : (user.nickname || null);
    const nextStatus = b.status !== undefined
      ? String(b.status || "").trim().toLowerCase()
      : String(user.status || "online");
    const nextColor = b.color !== undefined
      ? (normalizeHexColor(String(b.color || "")) || String(user.color || ""))
      : String(user.color || "");

    if (nextUsername.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters." });
    if (USERNAME_MAX && nextUsername.length > USERNAME_MAX) return res.status(400).json({ error: `Username must be at most ${USERNAME_MAX} characters.` });
    if (USERNAME_REGEX && !USERNAME_REGEX.test(nextUsername)) return res.status(400).json({ error: "Invalid username." });
    if (nextNickname && NICKNAME_MAX && nextNickname.length > NICKNAME_MAX) return res.status(400).json({ error: `Nickname too long.` });
    if (!["online", "invisible"].includes(nextStatus)) return res.status(400).json({ error: "Invalid status." });

    if (nextUsername !== String(user.username || "")) {
      if (adminGetRow("SELECT id FROM users WHERE username = ? AND id != ?", [nextUsername, userId])?.id) {
        return res.status(409).json({ error: "Username already exists." });
      }
      if (adminGetRow("SELECT id FROM chats WHERE type IN ('group','channel') AND group_username IN (?,?)", [nextUsername, `@${nextUsername}`])?.id) {
        return res.status(409).json({ error: "Username already exists." });
      }
    }

    adminRun(
      "UPDATE users SET username = ?, nickname = ?, status = ?, color = ? WHERE id = ?",
      [nextUsername, nextNickname, nextStatus, nextColor, userId],
    );
    adminSave();
    const updated = findUserById(userId);
    log(session, "user.edit", { targetType: "user", targetLabel: `@${updated.username}` });
    res.json({ ok: true, user: updated });
  });

  // ─── Users — ban/unban ───────────────────────────────────────────────────────

  app.post("/api/admin/users/:id/ban", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const banned = Boolean(req.body?.banned);
    adminBanUser(userId, banned);
    if (banned) adminRun("DELETE FROM sessions WHERE user_id = ?", [userId]);
    adminSave();
    log(session, banned ? "user.ban" : "user.unban", { targetType: "user", targetLabel: `@${user.username}` });
    res.json({ ok: true, banned });
  });

  // ─── Users — change role ─────────────────────────────────────────────────────

  app.post("/api/admin/users/:id/role", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    const { role } = req.body || {};
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    setUserRole(userId, role);
    adminSave();
    log(session, "user.role", { targetType: "user", targetLabel: `@${user.username}`, details: `role=${role}` });
    res.json({ ok: true, role });
  });

  // ─── Users — reset password ──────────────────────────────────────────────────

  app.post("/api/admin/users/:id/reset-password", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    const newPassword = String(req.body?.password || "").trim();
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const hash = await bcrypt.hash(newPassword, 10);
    adminRun("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
    adminRun("DELETE FROM sessions WHERE user_id = ?", [userId]);
    adminSave();
    log(session, "user.reset_password", { targetType: "user", targetLabel: `@${user.username}` });
    res.json({ ok: true });
  });

  // ─── Users — delete ──────────────────────────────────────────────────────────

  app.delete("/api/admin/users/:id", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    if (userId === session.id) return res.status(400).json({ error: "Cannot delete yourself" });
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const { storedNames } = adminDeleteUser(userId) || {};
    if (Array.isArray(storedNames) && storedNames.length > 0) removeStoredFileNames(storedNames);
    log(session, "user.delete", { targetType: "user", targetLabel: `@${user.username}` });
    res.json({ ok: true });
  });

  // ─── Chats — list ────────────────────────────────────────────────────────────

  app.get("/api/admin/chats", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit   = Number(req.query.limit  || 200);
    const offset  = Number(req.query.offset || 0);
    const search  = String(req.query.search || "").trim();
    const sortBy  = ["id", "name", "type", "created_at", "member_count", "message_count"].includes(req.query.sortBy)
      ? req.query.sortBy : "id";
    const sortDir = req.query.sortDir === "asc" ? "ASC" : "DESC";
    const typeFilter = ["dm", "group", "channel"].includes(req.query.type) ? req.query.type : null;
    const chats = adminListChats({ limit, offset, search, sortBy, sortDir, typeFilter });
    res.json({ chats });
  });

  // ─── Chats — create ──────────────────────────────────────────────────────────

  app.post("/api/admin/chats", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const b = req.body || {};
    const type       = normalizeChatType(b.type) || "group";
    const name       = String(b.name || "").trim();
    const username   = normalizeGroupUsername(b.username);
    const visibility = normalizeVisibility(b.visibility) || "public";
    const ownerIdOrUsername = String(b.owner || "").trim();

    if (!name || !username || !ownerIdOrUsername) {
      return res.status(400).json({ error: "Name, username, and owner are required." });
    }

    const owner = isNaN(Number(ownerIdOrUsername))
      ? findUserByUsername(ownerIdOrUsername.toLowerCase())
      : findUserById(Number(ownerIdOrUsername));
    if (!owner?.id) return res.status(404).json({ error: "Owner user not found." });

    if (adminGetRow("SELECT id FROM users WHERE username = ?", [username])?.id) {
      return res.status(409).json({ error: "Username already exists." });
    }
    if (adminGetRow("SELECT id FROM chats WHERE type IN ('group','channel') AND group_username IN (?,?)", [username, `@${username}`])?.id) {
      return res.status(409).json({ error: "Username already exists." });
    }

    const inviteToken  = createInviteToken(crypto);
    const groupColor   = String(adminGetRow("SELECT color FROM users WHERE id = ?", [Number(owner.id)])?.color || "") || "#10b981";
    const chatId       = createChat(name, type, {
      groupUsername:     username,
      groupVisibility:   visibility,
      inviteToken,
      createdByUserId:   Number(owner.id),
      groupColor,
    });

    if (!chatId) return res.status(500).json({ error: "Failed to create chat." });

    addChatMember(chatId, Number(owner.id), "owner");

    const memberIds = Array.isArray(b.memberIds) ? b.memberIds.map(Number).filter(Boolean) : [];
    memberIds.forEach((mid) => {
      if (mid !== Number(owner.id)) addChatMember(chatId, mid, "member");
    });

    adminSave();
    const created = findChatById(chatId);
    log(session, "chat.create", { targetType: "chat", targetLabel: name, details: `type=${type}` });
    res.status(201).json({ ok: true, chat: created });
  });

  // ─── Chats — edit ────────────────────────────────────────────────────────────

  app.patch("/api/admin/chats/:id", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = Number(req.params.id);
    if (!chatId) return res.status(400).json({ error: "Invalid chat ID" });
    const chat = findChatById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!["group", "channel"].includes(chat.type)) {
      return res.status(400).json({ error: "Only groups and channels can be edited." });
    }

    const b = req.body || {};
    const nextName       = b.name !== undefined ? String(b.name || "").trim() : (chat.name || "");
    const nextUsername   = b.username !== undefined ? normalizeGroupUsername(b.username) : (chat.group_username || "");
    const nextVisibility = b.visibility !== undefined ? normalizeVisibility(b.visibility) : (chat.group_visibility || "public");
    const nextColor      = b.color !== undefined ? (normalizeHexColor(String(b.color || "")) || null) : (chat.group_color || null);

    if (nextUsername && nextUsername !== (chat.group_username || "")) {
      if (adminGetRow("SELECT id FROM users WHERE username = ?", [nextUsername])?.id) {
        return res.status(409).json({ error: "Username already exists." });
      }
      if (adminGetRow("SELECT id FROM chats WHERE type IN ('group','channel') AND group_username IN (?,?) AND id != ?", [nextUsername, `@${nextUsername}`, chatId])?.id) {
        return res.status(409).json({ error: "Username already exists." });
      }
    }

    if (b.owner !== undefined) {
      const newOwner = isNaN(Number(b.owner))
        ? findUserByUsername(String(b.owner).toLowerCase())
        : findUserById(Number(b.owner));
      if (!newOwner?.id) return res.status(404).json({ error: "New owner not found." });
      adminRun("UPDATE chat_members SET role = 'member' WHERE chat_id = ? AND role = 'owner'", [chatId]);
      adminRun("INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'owner')", [chatId, Number(newOwner.id)]);
      adminRun("UPDATE chat_members SET role = 'owner' WHERE chat_id = ? AND user_id = ?", [chatId, Number(newOwner.id)]);
    }

    if (chat.type === "group") {
      updateGroupChat(chatId, { name: nextName, groupUsername: nextUsername, groupVisibility: nextVisibility });
    } else {
      updateChannelChat(chatId, { name: nextName, groupUsername: nextUsername, groupVisibility: nextVisibility });
    }

    if (nextColor) adminRun("UPDATE chats SET group_color = ? WHERE id = ?", [nextColor, chatId]);
    adminSave();

    emitChatEvent(chatId, { type: "chat_updated", chatId });
    const updated = findChatById(chatId);
    log(session, "chat.edit", { targetType: "chat", targetLabel: updated.name || `Chat #${chatId}` });
    res.json({ ok: true, chat: updated });
  });

  // ─── Chats — members list ────────────────────────────────────────────────────

  app.get("/api/admin/chats/:id/members", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const chatId = Number(req.params.id);
    if (!chatId) return res.status(400).json({ error: "Invalid chat ID" });
    const members = listChatMembers(chatId);
    res.json({ members });
  });

  // ─── Chats — add member ──────────────────────────────────────────────────────

  app.post("/api/admin/chats/:id/members", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = Number(req.params.id);
    const userId = Number(req.body?.userId);
    if (!chatId || !userId) return res.status(400).json({ error: "chatId and userId required" });
    const chat = findChatById(chatId);
    const user = findUserById(userId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!user) return res.status(404).json({ error: "User not found" });
    addChatMember(chatId, userId, "member");
    adminSave();
    log(session, "chat.member_add", { targetType: "chat", targetLabel: chat.name || `Chat #${chatId}`, details: `+@${user.username}` });
    res.json({ ok: true });
  });

  // ─── Chats — remove member ───────────────────────────────────────────────────

  app.delete("/api/admin/chats/:id/members/:userId", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = Number(req.params.id);
    const userId = Number(req.params.userId);
    if (!chatId || !userId) return res.status(400).json({ error: "Invalid IDs" });
    const chat = findChatById(chatId);
    const user = findUserById(userId);
    removeChatMember(chatId, userId);
    adminSave();
    log(session, "chat.member_remove", { targetType: "chat", targetLabel: chat?.name || `Chat #${chatId}`, details: user ? `-@${user.username}` : `-#${userId}` });
    res.json({ ok: true });
  });

  // ─── Chats — set member role ─────────────────────────────────────────────────

  app.patch("/api/admin/chats/:id/members/:userId", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = Number(req.params.id);
    const userId = Number(req.params.userId);
    const { role } = req.body || {};
    if (!chatId || !userId) return res.status(400).json({ error: "Invalid IDs" });
    if (!["owner", "admin", "member"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const chat = findChatById(chatId);
    const user = findUserById(userId);
    setChatMemberRole(chatId, userId, role);
    adminSave();
    log(session, "chat.member_role", { targetType: "chat", targetLabel: chat?.name || `Chat #${chatId}`, details: `@${user?.username || userId} → ${role}` });
    res.json({ ok: true, role });
  });

  // ─── Chats — delete ──────────────────────────────────────────────────────────

  app.delete("/api/admin/chats/:id", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = Number(req.params.id);
    if (!chatId) return res.status(400).json({ error: "Invalid chat ID" });
    const chat = findChatById(chatId);
    const { storedNames } = adminDeleteChat(chatId) || {};
    if (Array.isArray(storedNames) && storedNames.length > 0) removeStoredFileNames(storedNames);
    log(session, "chat.delete", { targetType: "chat", targetLabel: chat?.name || `Chat #${chatId}` });
    res.json({ ok: true });
  });

  // ─── Logs ──────────────────────────────────────────────────────────────────

  // ─── Logs ──────────────────────────────────────────────────────────────────

  // Admin panel audit log (from logs/admin.log)
  app.get("/api/admin/logs", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit  = Number(req.query.limit || 200);
    const search = String(req.query.search || "").trim();
    const logs = readAdminLog({ limit, search });
    res.json({ logs });
  });

  app.delete("/api/admin/logs", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    clearAdminLog();
    log(session, "logs.clear", { targetType: "system" });
    res.json({ ok: true });
  });

  // Installer / service / nginx logs
  app.get("/api/admin/logs/installer", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(readInstallerLog({ maxLines: 400 }));
  });

  app.get("/api/admin/logs/nginx", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(readNginxLog({ maxLines: 400 }));
  });

  app.get("/api/admin/logs/service", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = await readServiceLog({ maxLines: 400 });
    res.json(result);
  });

  // ─── Maintenance ─────────────────────────────────────────────────────────────

  app.post("/api/admin/maintenance/vacuum", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    try {
      vacuumDatabase();
      log(session, "db.vacuum", { targetType: "system" });
      res.json({ ok: true });
    } catch (err) {
      log(session, "db.vacuum", { targetType: "system", status: "error", details: String(err?.message || err) });
      res.status(500).json({ error: "Vacuum failed." });
    }
  });

  // List existing backups
  app.get("/api/admin/maintenance/backups", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const backupDir = nodePath.join(projectRootDir, "data", "backups");
      if (!fs.existsSync(backupDir)) return res.json({ backups: [] });
      const backups = fs.readdirSync(backupDir, { withFileTypes: true })
        .filter((e) => e.isFile() && /^songbird-backup-.*\.zip$/i.test(e.name))
        .map((e) => {
          const full = nodePath.join(backupDir, e.name);
          const st = fs.statSync(full);
          return { name: e.name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json({ backups });
    } catch {
      res.json({ backups: [] });
    }
  });

  // Create an encrypted backup zip (.env + data) using the `zip` binary
  app.post("/api/admin/maintenance/backup", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const password = String(req.body?.password || "").trim();
    if (!password) return res.status(400).json({ error: "A backup password is required." });

    const dataDir   = nodePath.join(projectRootDir, "data");
    const envPath   = nodePath.join(projectRootDir, ".env");
    const dbPath    = nodePath.join(dataDir, "songbird.db");
    const uploadsDir = nodePath.join(dataDir, "uploads");
    const backupDir = nodePath.join(dataDir, "backups");

    if (!fs.existsSync(dbPath) && !fs.existsSync(uploadsDir)) {
      return res.status(400).json({ error: "No data found to back up." });
    }
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupName = `songbird-backup-${stamp}.zip`;
    const backupPath = nodePath.join(backupDir, backupName);

    const includes = ["data/songbird.db", "data/uploads"];
    if (fs.existsSync(envPath)) includes.unshift(".env");

    execFile(
      process.env.ZIP_BIN || "zip",
      ["-r", "-q", "-P", password, backupPath, ...includes, "-x", "data/backups/*"],
      { cwd: projectRootDir },
      (err) => {
        if (err) {
          const msg = err.code === "ENOENT" ? "zip command not found on server." : "Backup failed.";
          log(session, "db.backup", { targetType: "system", status: "error", details: msg });
          return res.status(500).json({ error: msg });
        }
        let sizeBytes = 0;
        try { sizeBytes = fs.statSync(backupPath).size; } catch {}
        log(session, "db.backup", { targetType: "system", targetLabel: backupName, details: `${(sizeBytes / 1024 / 1024).toFixed(1)} MB` });
        res.json({ ok: true, backup: { name: backupName, sizeBytes, createdAt: new Date().toISOString() } });
      },
    );
  });

  // Restore from an existing backup in data/backups. Replaces the DB + uploads
  // and hot-reloads the in-memory database (no service restart). The .env in
  // the archive is intentionally NOT restored from the panel to avoid changing
  // ports/secrets out from under the running process.
  app.post("/api/admin/maintenance/restore", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const name     = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "").trim();

    // Strict filename validation — only allow our own backup files, no path traversal.
    if (!/^songbird-backup-[A-Za-z0-9._-]+\.zip$/.test(name)) {
      return res.status(400).json({ error: "Invalid backup name." });
    }

    const dataDir    = nodePath.join(projectRootDir, "data");
    const backupDir  = nodePath.join(dataDir, "backups");
    const backupPath = nodePath.join(backupDir, name);
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: "Backup file not found." });
    }

    const tmpDir = nodePath.join(dataDir, `.restore-${Date.now()}`);
    const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} };

    fs.mkdirSync(tmpDir, { recursive: true });

    // Extract using unzip (-P password works even for unencrypted archives).
    execFile(
      process.env.UNZIP_BIN || "unzip",
      ["-q", "-P", password || "-", "-o", backupPath, "-d", tmpDir],
      { timeout: 60000 },
      (err) => {
        if (err) {
          cleanup();
          const msg = err.code === "ENOENT"
            ? "unzip command not found on server."
            : "Failed to extract backup. The password may be incorrect.";
          log(session, "db.restore", { targetType: "system", targetLabel: name, status: "error", details: msg });
          return res.status(400).json({ error: msg });
        }

        try {
          // Support both current (data/songbird.db) and legacy (songbird.db) layouts.
          const candidates = [
            { db: nodePath.join(tmpDir, "data", "songbird.db"), uploads: nodePath.join(tmpDir, "data", "uploads") },
            { db: nodePath.join(tmpDir, "songbird.db"),         uploads: nodePath.join(tmpDir, "uploads") },
          ];
          const layout = candidates.find((c) => fs.existsSync(c.db));
          if (!layout) {
            cleanup();
            log(session, "db.restore", { targetType: "system", targetLabel: name, status: "error", details: "Archive missing songbird.db" });
            return res.status(400).json({ error: "Backup archive does not contain a database." });
          }

          const dbDest      = nodePath.join(dataDir, "songbird.db");
          const uploadsDest = nodePath.join(dataDir, "uploads");

          // Replace DB file.
          fs.copyFileSync(layout.db, dbDest);

          // Replace uploads directory if present in the archive.
          if (fs.existsSync(layout.uploads)) {
            fs.rmSync(uploadsDest, { recursive: true, force: true });
            fs.cpSync(layout.uploads, uploadsDest, { recursive: true });
          }

          cleanup();

          // Hot-reload the in-memory DB from the restored file.
          reloadDatabase();

          log(session, "db.restore", { targetType: "system", targetLabel: name });
          res.json({ ok: true });
        } catch (e) {
          cleanup();
          log(session, "db.restore", { targetType: "system", targetLabel: name, status: "error", details: String(e?.message || e) });
          res.status(500).json({ error: "Restore failed while replacing data." });
        }
      },
    );
  });
}

export { registerAdminPanelRoutes };

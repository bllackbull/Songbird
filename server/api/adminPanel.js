import { normalizeHexColor, normalizeGroupUsername, normalizeVisibility, normalizeChatType } from "../lib/dbToolHelpers.js";
import { createInviteToken } from "../lib/inviteTokens.js";
import { writeAdminLog, readAdminLog, clearAdminLog } from "../lib/adminLog.js";
import { readInstallerLog, readNginxLog, readServiceLog } from "../lib/systemLogs.js";
import os from "node:os";
import multer from "multer";
import { execFile } from "node:child_process";

function registerAdminPanelRoutes(app, deps) {
  const {
    getSessionFromRequest,
    findUserById,
    findUserByUsername,
    findChatById,
    isUserAdmin,
    isUserOwner,
    getOwnerUser,
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
    getSetting,
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
    // avatar upload
    uploadAvatar,
    avatarUploadRootDir,
    ALLOWED_AVATAR_MIME_TYPES,
    storageEncryption,
    removeUploadedFiles,
    removeAvatarByUrl,
    // maintenance
    vacuumDatabase,
    reloadDatabase,
    adminClearAllMessages,
    adminResetDatabase,
    projectRootDir,
    path: nodePath,
    fs,
  } = deps;

  // ─── Admin panel gate ────────────────────────────────────────────────────────
  // When ADMIN_PANEL=false is set in the environment, all /api/admin/* requests
  // get a 404. This is env-only — intentionally not in the admin settings UI so
  // the panel cannot be re-enabled from within itself.

  app.use("/api/admin", (req, res, next) => {
    const raw = String(process.env.ADMIN_PANEL ?? "true").trim().toLowerCase();
    const enabled = !["0", "false", "no", "n", "off"].includes(raw);
    if (!enabled) {
      return res.status(404).json({ error: "Not found" });
    }
    next();
  });

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

  // Returns true if the acting session belongs to the owner role.
  const actorIsOwner = (session) => isUserOwner(session?.id);

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
    const sortBy    = ["id", "username", "nickname", "role", "created_at", "last_seen"].includes(req.query.sortBy)
      ? req.query.sortBy : "id";
    const sortDir   = String(req.query.sortDir || "").toLowerCase() === "asc" ? "ASC" : "DESC";
    const roleFilter = ["user", "admin", "owner", "banned"].includes(req.query.role) ? req.query.role : null;
    const statusFilter = ["online", "offline"].includes(req.query.status) ? req.query.status : null;
    const users = adminListUsers({ limit, offset, search, sortBy, sortDir, roleFilter, statusFilter });
    res.json({ users });
  });

  // ─── Users — create ──────────────────────────────────────────────────────────

  app.post("/api/admin/users", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const rawUsername = String(req.body?.username || "").trim().toLowerCase();
    const nickname    = String(req.body?.nickname  || "").trim();
    const password    = String(req.body?.password  || "");
    const requestedRole = String(req.body?.role || "user");
    // Only owners can assign the owner role; admins can assign user/admin
    const allowedRoles = actorIsOwner(session) ? ["user", "admin", "owner"] : ["user", "admin"];
    const role = allowedRoles.includes(requestedRole) ? requestedRole : "user";

    if (!rawUsername || !nickname || !password) {
      return res.status(400).json({ error: "Username, nickname, and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    if (rawUsername.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters." });
    }
    if (getSetting("USERNAME_MAX_CHARS") && rawUsername.length > getSetting("USERNAME_MAX_CHARS")) {
      return res.status(400).json({ error: `Username must be at most ${getSetting("USERNAME_MAX_CHARS")} characters.` });
    }
    if (getSetting("NICKNAME_MAX_CHARS") && nickname.length > getSetting("NICKNAME_MAX_CHARS")) {
      return res.status(400).json({ error: `Nickname must be at most ${getSetting("NICKNAME_MAX_CHARS")} characters.` });
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
    // Only one owner is allowed at a time
    if (role === "owner" && getOwnerUser()) {
      return res.status(409).json({ error: "An owner already exists. Reassign the owner role first." });
    }

    const passwordHash   = await bcrypt.hash(password, 10);
    const suppliedColor  = normalizeHexColor(String(req.body?.color || ""));
    const assignedColor  = suppliedColor || setUserColor();
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

    // Non-owners cannot edit the owner account
    if (user.role === "owner" && !actorIsOwner(session)) {
      return res.status(403).json({ error: "Cannot edit the owner account." });
    }

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
    if (getSetting("USERNAME_MAX_CHARS") && nextUsername.length > getSetting("USERNAME_MAX_CHARS")) return res.status(400).json({ error: `Username must be at most ${getSetting("USERNAME_MAX_CHARS")} characters.` });
    if (USERNAME_REGEX && !USERNAME_REGEX.test(nextUsername)) return res.status(400).json({ error: "Invalid username." });
    if (nextNickname && getSetting("NICKNAME_MAX_CHARS") && nextNickname.length > getSetting("NICKNAME_MAX_CHARS")) return res.status(400).json({ error: `Nickname too long.` });
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

    // The owner cannot be banned
    if (user.role === "owner") {
      return res.status(403).json({ error: "Cannot ban the owner account." });
    }

    const banned = Boolean(req.body?.banned);
    adminBanUser(userId, banned);
    // Banning revokes any elevated role; unbanning restores the default user role.
    setUserRole(userId, "user");
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

    // Only the owner can assign/revoke the owner role; admins can only use user/admin
    const allowedRoles = actorIsOwner(session) ? ["user", "admin", "owner"] : ["user", "admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Non-owners cannot change the role of the owner
    if (user.role === "owner" && !actorIsOwner(session)) {
      return res.status(403).json({ error: "Cannot change the role of the owner." });
    }

    // Only one owner is allowed — block promoting if another owner already exists
    if (role === "owner" && user.role !== "owner") {
      const existing = getOwnerUser();
      if (existing && existing.id !== userId) {
        return res.status(409).json({ error: "An owner already exists. Demote them first." });
      }
    }

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

    // Non-owners cannot reset the owner's password
    if (user.role === "owner" && !actorIsOwner(session)) {
      return res.status(403).json({ error: "Cannot reset the owner's password." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    adminRun("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
    adminRun("DELETE FROM sessions WHERE user_id = ?", [userId]);
    adminSave();
    log(session, "user.reset_password", { targetType: "user", targetLabel: `@${user.username}` });
    res.json({ ok: true });
  });

  // ─── Users — avatar upload (admin, bypasses ownership check) ─────────────────

  app.post("/api/admin/users/:id/avatar", uploadAvatar.single("avatar"), (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session || !isUserAdmin(session.id)) {
      removeUploadedFiles(req.file ? [req.file] : [], avatarUploadRootDir);
      return res.status(session ? 403 : 401).json({ error: session ? "Admin access required" : "Not authenticated" });
    }
    const userId = Number(req.params.id);
    const file = req.file;
    if (!userId) {
      removeUploadedFiles(file ? [file] : [], avatarUploadRootDir);
      return res.status(400).json({ error: "Invalid user ID" });
    }
    if (!file) return res.status(400).json({ error: "Avatar file is required." });
    const mime = String(file.mimetype || "").toLowerCase();
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mime)) {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res.status(400).json({ error: "Avatar must be a JPEG, PNG, GIF, WEBP, or BMP image." });
    }
    const user = findUserById(userId);
    if (!user) {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res.status(404).json({ error: "User not found." });
    }
    const avatarUrl = `/api/uploads/avatars/${file.filename}`;
    try {
      storageEncryption.encryptFileInPlace(file.path);
    } catch {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res.status(500).json({ error: "Unable to store avatar securely." });
    }
    if (String(user.avatar_url || "").trim() && user.avatar_url !== avatarUrl) {
      removeAvatarByUrl(user.avatar_url);
    }
    adminRun("UPDATE users SET avatar_url = ? WHERE id = ?", [avatarUrl, userId]);
    adminSave();
    res.json({ ok: true, avatarUrl });
  });

  app.delete("/api/admin/users/:id/avatar", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ error: "Invalid user ID" });
    const user = findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (String(user.avatar_url || "").trim()) removeAvatarByUrl(user.avatar_url);
    adminRun("UPDATE users SET avatar_url = NULL WHERE id = ?", [userId]);
    adminSave();
    res.json({ ok: true, avatarUrl: null });
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

    // The owner cannot be deleted
    if (user.role === "owner") {
      return res.status(403).json({ error: "Cannot delete the owner account." });
    }

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
    const sortBy  = ["id", "name", "type", "group_visibility", "created_at", "member_count", "message_count"].includes(req.query.sortBy)
      ? req.query.sortBy : "id";
    const sortDir = String(req.query.sortDir || "").toLowerCase() === "asc" ? "ASC" : "DESC";
    const typeFilter = ["group", "channel"].includes(req.query.type) ? req.query.type : null;
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
    const ownerColor   = String(adminGetRow("SELECT color FROM users WHERE id = ?", [Number(owner.id)])?.color || "") || "#10b981";
    const groupColor   = normalizeHexColor(String(b.color || "")) || ownerColor;
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

  // ─── Chats — avatar upload (admin, bypasses owner check) ─────────────────────

  app.post("/api/admin/chats/:id/avatar", uploadAvatar.single("avatar"), (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session || !isUserAdmin(session.id)) {
      removeUploadedFiles(req.file ? [req.file] : [], avatarUploadRootDir);
      return res.status(session ? 403 : 401).json({ error: session ? "Admin access required" : "Not authenticated" });
    }
    const chatId = Number(req.params.id);
    const file = req.file;
    if (!chatId) {
      removeUploadedFiles(file ? [file] : [], avatarUploadRootDir);
      return res.status(400).json({ error: "Invalid chat ID" });
    }
    if (!file) return res.status(400).json({ error: "Avatar file is required." });

    const mime = String(file.mimetype || "").toLowerCase();
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mime)) {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res.status(400).json({ error: "Avatar must be a JPEG, PNG, GIF, WEBP, or BMP image." });
    }

    const chat = findChatById(chatId);
    if (!chat || (chat.type !== "group" && chat.type !== "channel")) {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res.status(404).json({ error: "Chat not found." });
    }

    const avatarUrl = `/api/uploads/avatars/${file.filename}`;
    try {
      storageEncryption.encryptFileInPlace(file.path);
    } catch {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res.status(500).json({ error: "Unable to store avatar securely." });
    }

    if (String(chat.group_avatar_url || "").trim() && chat.group_avatar_url !== avatarUrl) {
      removeAvatarByUrl(chat.group_avatar_url);
    }

    const updateFn = chat.type === "channel" ? updateChannelChat : updateGroupChat;
    updateFn(chatId, {
      name: chat.name,
      groupUsername: chat.group_username,
      groupVisibility: chat.group_visibility,
      allowMemberInvites: Boolean(Number(chat.allow_member_invites || 0)),
      groupAvatarUrl: avatarUrl,
    });
    adminSave();
    emitChatEvent(chatId, { type: "chat_updated", chatId });
    log(session, "chat.edit", { targetType: "chat", targetLabel: chat.name || `Chat #${chatId}`, details: "avatar updated" });
    res.json({ ok: true, avatarUrl });
  });

  app.delete("/api/admin/chats/:id/avatar", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = Number(req.params.id);
    if (!chatId) return res.status(400).json({ error: "Invalid chat ID" });
    const chat = findChatById(chatId);
    if (!chat || (chat.type !== "group" && chat.type !== "channel")) {
      return res.status(404).json({ error: "Chat not found." });
    }
    if (String(chat.group_avatar_url || "").trim()) {
      removeAvatarByUrl(chat.group_avatar_url);
    }
    const updateFn = chat.type === "channel" ? updateChannelChat : updateGroupChat;
    updateFn(chatId, {
      name: chat.name,
      groupUsername: chat.group_username,
      groupVisibility: chat.group_visibility,
      allowMemberInvites: Boolean(Number(chat.allow_member_invites || 0)),
      groupAvatarUrl: null,
    });
    adminSave();
    emitChatEvent(chatId, { type: "chat_updated", chatId });
    res.json({ ok: true, avatarUrl: null });
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
    if (!actorIsOwner(session)) {
      return res.status(403).json({ error: "Owner access required" });
    }
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

  // Danger zone — clear all messages & their files (keeps users and chats).
  app.post("/api/admin/maintenance/clear-messages", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    if (req.body?.confirm !== "clear messages") {
      return res.status(400).json({ error: "Confirmation phrase required." });
    }
    try {
      const { storedNames } = adminClearAllMessages() || {};
      if (Array.isArray(storedNames) && storedNames.length > 0) removeStoredFileNames(storedNames);
      log(session, "db.clear_messages", { targetType: "system", details: `${storedNames?.length || 0} files removed` });
      res.json({ ok: true });
    } catch (err) {
      log(session, "db.clear_messages", { targetType: "system", status: "error", details: String(err?.message || err) });
      res.status(500).json({ error: "Failed to clear messages." });
    }
  });

  // Danger zone — full reset: wipes users, chats, messages, sessions.
  app.post("/api/admin/maintenance/reset", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    if (req.body?.confirm !== "reset everything") {
      return res.status(400).json({ error: "Confirmation phrase required." });
    }
    try {
      const { storedNames } = adminResetDatabase() || {};
      if (Array.isArray(storedNames) && storedNames.length > 0) removeStoredFileNames(storedNames);
      log(session, "db.reset", { targetType: "system", details: `${storedNames?.length || 0} files removed` });
      res.json({ ok: true });
    } catch (err) {
      log(session, "db.reset", { targetType: "system", status: "error", details: String(err?.message || err) });
      res.status(500).json({ error: "Reset failed." });
    }
  });

  // ─── Service control ─────────────────────────────────────────────────────────

  const SERVICE_NAME = process.env.SONGBIRD_SERVICE_NAME || "songbird.service";

  // Runs `systemctl <action> <service>`, falling back to sudo -n if needed.
  const runSystemctl = (action) => new Promise((resolve) => {
    execFile("systemctl", [action, SERVICE_NAME], { timeout: 8000 }, (err) => {
      if (!err) return resolve({ ok: true });
      // Try non-interactive sudo as a fallback.
      execFile("sudo", ["-n", "systemctl", action, SERVICE_NAME], { timeout: 8000 }, (err2) => {
        if (!err2) return resolve({ ok: true });
        resolve({ ok: false, error: err2.code === "ENOENT" ? "systemctl not available." : "Insufficient permissions to control the service." });
      });
    });
  });

  app.post("/api/admin/service/restart", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    log(session, "service.restart", { targetType: "system", targetLabel: SERVICE_NAME });
    // Respond first — a successful restart kills this process before the command returns.
    res.json({ ok: true, pending: true });
    setTimeout(() => { runSystemctl("restart"); }, 250);
  });

  app.post("/api/admin/service/stop", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    log(session, "service.stop", { targetType: "system", targetLabel: SERVICE_NAME });
    res.json({ ok: true, pending: true });
    setTimeout(() => { runSystemctl("stop"); }, 250);
  });

  // ─── Nginx config update + reload ───────────────────────────────────────────
  //
  // Updates client_max_body_size in the nginx site config file to match the
  // current FILE_UPLOAD_MAX_TOTAL_SIZE_MB setting, then reloads nginx.
  // Only works for systemd-based deployments where nginx writes a site config.
  // Docker deployments must update nginx/nginx.conf and restart nginx manually.

  const NGINX_CONFIG_CANDIDATES = [
    "/etc/nginx/sites-available/songbird",
    "/etc/nginx/sites-enabled/songbird",
    "/etc/nginx/conf.d/songbird.conf",
    "/etc/nginx/conf.d/default.conf",
  ];

  const runNginxReload = () => new Promise((resolve) => {
    // Test config first, then reload.
    execFile("nginx", ["-t"], { timeout: 8000 }, (testErr) => {
      if (testErr) {
        // Try with sudo.
        execFile("sudo", ["-n", "nginx", "-t"], { timeout: 8000 }, (sudoTestErr) => {
          if (sudoTestErr) {
            return resolve({ ok: false, error: "nginx -t failed: " + (sudoTestErr.message || String(sudoTestErr)) });
          }
          execFile("sudo", ["-n", "systemctl", "reload", "nginx"], { timeout: 8000 }, (reloadErr) => {
            if (reloadErr) return resolve({ ok: false, error: "nginx reload failed: " + (reloadErr.message || String(reloadErr)) });
            resolve({ ok: true });
          });
        });
        return;
      }
      execFile("systemctl", ["reload", "nginx"], { timeout: 8000 }, (reloadErr) => {
        if (!reloadErr) return resolve({ ok: true });
        execFile("sudo", ["-n", "systemctl", "reload", "nginx"], { timeout: 8000 }, (sudoReloadErr) => {
          if (!sudoReloadErr) return resolve({ ok: true });
          resolve({ ok: false, error: sudoReloadErr.code === "ENOENT" ? "systemctl not available." : "Insufficient permissions to reload nginx." });
        });
      });
    });
  });

  app.post("/api/admin/nginx/reload", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;

    const maxTotalMb = getSetting("FILE_UPLOAD_MAX_TOTAL_SIZE_MB");

    // Find the first writable nginx config candidate.
    let configPath = null;
    for (const candidate of NGINX_CONFIG_CANDIDATES) {
      if (fs.existsSync(candidate)) {
        configPath = candidate;
        break;
      }
    }

    if (!configPath) {
      // Docker / custom deployment — no system nginx config found.
      return res.status(200).json({
        ok: false,
        dockerMode: true,
        message: `No nginx site config found on this host. If you are using Docker, update client_max_body_size in nginx/nginx.conf to ${maxTotalMb}m and restart the nginx container.`,
        currentValueMb: maxTotalMb,
      });
    }

    // Read and patch the config.
    let configContent;
    try {
      configContent = fs.readFileSync(configPath, "utf8");
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Could not read nginx config: " + String(e.message || e) });
    }

    const updated = configContent.replace(
      /client_max_body_size\s+\d+[mMkKgG]?;/g,
      `client_max_body_size ${maxTotalMb}m;`,
    );

    if (updated === configContent) {
      // No client_max_body_size found — append it.
      // This is a best-effort patch for non-standard configs.
    }

    try {
      fs.writeFileSync(configPath, updated, "utf8");
    } catch {
      // Try with sudo via a temp file approach.
      const tmpPath = nodePath.join(os.tmpdir(), `nginx-patch-${Date.now()}.conf`);
      try {
        fs.writeFileSync(tmpPath, updated, "utf8");
        await new Promise((resolve, reject) => {
          execFile("sudo", ["-n", "cp", tmpPath, configPath], { timeout: 5000 }, (err) => {
            if (err) reject(err); else resolve();
          });
        });
        fs.unlinkSync(tmpPath);
      } catch (e) {
        try { fs.unlinkSync(tmpPath); } catch {}
        return res.status(500).json({ ok: false, error: "Insufficient permissions to write nginx config." });
      }
    }

    const reloadResult = await runNginxReload();
    if (!reloadResult.ok) {
      return res.status(500).json({ ok: false, error: reloadResult.error });
    }

    log(session, "nginx.reload", {
      targetType: "system",
      targetLabel: configPath,
      details: `client_max_body_size set to ${maxTotalMb}m`,
    });
    res.json({ ok: true, configPath, updatedValueMb: maxTotalMb });
  });

  // Download the live database file directly to the admin's device.
  app.get("/api/admin/maintenance/download-db", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const dbPath = nodePath.join(projectRootDir, "data", "songbird.db");
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: "Database file not found." });
    }
    // Flush any pending in-memory writes so the downloaded file is current.
    try { vacuumDatabase(); } catch {}
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const downloadName = `songbird-backup-${stamp}.db`;
    log(session, "db.backup", { targetType: "system", targetLabel: downloadName });
    res.download(dbPath, downloadName, (err) => {
      if (err && !res.headersSent) res.status(500).end();
    });
  });

  // Restore by uploading a .db file from the admin's device. Replaces the live
  // database and hot-reloads it in memory — no service restart needed.
  const dbUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 512 * 1024 * 1024 }, // 512 MB ceiling
  });

  app.post(
    "/api/admin/maintenance/restore",
    // Gate auth before multer buffers the upload
    (req, res, next) => { if (!requireAdmin(req, res)) return; next(); },
    dbUpload.single("database"),
    (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;

    const file = req.file;
    if (!file || !file.buffer?.length) {
      return res.status(400).json({ error: "No database file uploaded." });
    }

    // Validate it's a real SQLite database: header is "SQLite format 3\0".
    const header = file.buffer.subarray(0, 16).toString("latin1");
    if (header !== "SQLite format 3\0") {
      log(session, "db.restore", { targetType: "system", status: "error", details: "Not a valid SQLite file" });
      return res.status(400).json({ error: "The uploaded file is not a valid SQLite database." });
    }

    const dataDir = nodePath.join(projectRootDir, "data");
    const dbPath  = nodePath.join(dataDir, "songbird.db");

    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      // Write atomically: temp file then rename over the live db.
      const tmpPath = nodePath.join(dataDir, `.restore-${Date.now()}.db`);
      fs.writeFileSync(tmpPath, file.buffer);
      fs.renameSync(tmpPath, dbPath);

      // Hot-reload the in-memory DB from the restored file.
      reloadDatabase();

      log(session, "db.restore", { targetType: "system", targetLabel: file.originalname || "uploaded.db" });
      res.json({ ok: true });
    } catch (e) {
      log(session, "db.restore", { targetType: "system", status: "error", details: String(e?.message || e) });
      res.status(500).json({ error: "Restore failed while replacing the database." });
    }
  });

  // ─── Settings ─────────────────────────────────────────────────────────────────

  const {
    getAllSettings,
    setSetting,
    setSettings,
    resetSetting,
    SETTING_DEFS,
    dbRun,
    dbSave,
  } = deps;

  // GET /api/admin/settings — return all settings with metadata
  app.get("/api/admin/settings", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    res.json({ settings: getAllSettings() });
  });

  // PUT /api/admin/settings — bulk update one or more settings
  app.put("/api/admin/settings", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;

    const updates = req.body?.settings;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return res.status(400).json({ error: "Expected { settings: { key: value, ... } }" });
    }

    const result = setSettings(updates, dbRun, dbSave);
    // Log one entry per changed key so the log reads the same as single updates.
    (result.saved || []).forEach((key) => {
      log(session, "settings.update", {
        targetType: "system",
        targetLabel: key,
        details: String(updates[key]),
      });
    });
    if (!result.ok) {
      return res.status(400).json({ errors: result.errors, saved: result.saved });
    }
    res.json({ ok: true, saved: result.saved, settings: getAllSettings() });
  });

  // PUT /api/admin/settings/:key — update a single setting
  app.put("/api/admin/settings/:key", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;

    const key = String(req.params.key || "").trim();
    const rawValue = req.body?.value;
    if (rawValue === undefined || rawValue === null) {
      return res.status(400).json({ error: "Missing 'value' in request body." });
    }

    const result = setSetting(key, String(rawValue), dbRun, dbSave);
    if (!result.ok) return res.status(400).json({ error: result.error });

    log(session, "settings.update", {
      targetType: "system",
      targetLabel: key,
      details: String(rawValue),
    });
    res.json({ ok: true, key, value: result.value, settings: getAllSettings() });
  });

  // DELETE /api/admin/settings/:key — reset a setting to its default
  app.delete("/api/admin/settings/:key", (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;

    const key = String(req.params.key || "").trim();
    const result = resetSetting(key, dbRun, dbSave);
    if (!result.ok) return res.status(400).json({ error: result.error });

    log(session, "settings.reset", {
      targetType: "system",
      targetLabel: key,
      details: `reset to default: ${result.value}`,
    });
    res.json({ ok: true, key, value: result.value, settings: getAllSettings() });
  });
}

export { registerAdminPanelRoutes };

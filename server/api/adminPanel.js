import { normalizeHexColor, normalizeGroupUsername, normalizeVisibility, normalizeChatType } from "../lib/dbToolHelpers.js";
import { createInviteToken } from "../lib/inviteTokens.js";
import { validateUuidParams } from "../lib/uuidMiddleware.js";
import { isValidUuid, generateUuid } from "../lib/uuidUtils.js";
import { writeAdminLog, readAdminLog, clearAdminLog } from "../lib/adminLog.js";
import { readInstallerLog, readNginxLog, readServiceLog, probeLogSources } from "../lib/systemLogs.js";
import { userEvents } from "../lib/workers/autoAddWorker.js";
import { dbKnex } from "../db/knex.js";
import os from "node:os";
import crypto from "node:crypto";
import multer from "multer";
import { execFile } from "node:child_process";

// Recursive uploads sizing is expensive; serve a short-lived cache so dashboard
// gauges (and bursty admin traffic) do not walk the tree on every request.
const UPLOADS_SIZE_CACHE_TTL_MS = 60_000;
let uploadsSizeCache = { bytes: 0, fetchedAt: 0 };

// A short TTL cache to collapse concurrent hits on getAdminStats into 
// a single query burst, bounded to once per interval.
const STATS_CACHE_TTL_MS = 10_000;
let statsCache = { data: null, fetchedAt: 0 };

function getCachedAdminStats(getAdminStats) {
  const now = Date.now();
  if (statsCache.data && now - statsCache.fetchedAt < STATS_CACHE_TTL_MS) {
    return Promise.resolve(statsCache.data);
  }
  const result = getAdminStats();
  if (result && typeof result.then === "function") {
    return result.then((data) => {
      statsCache = { data, fetchedAt: now };
      return data;
    });
  }
  statsCache = { data: result, fetchedAt: now };
  return Promise.resolve(result);
}

function getCachedUploadsSizeBytes(fs, nodePath, uploadsRoot) {
  const now = Date.now();
  if (now - uploadsSizeCache.fetchedAt < UPLOADS_SIZE_CACHE_TTL_MS) {
    return uploadsSizeCache.bytes;
  }
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
    } catch {
      return 0;
    }
  };
  let bytes = 0;
  try {
    bytes = getDirSize(uploadsRoot);
  } catch {
    bytes = uploadsSizeCache.bytes;
  }
  uploadsSizeCache = { bytes, fetchedAt: now };
  return bytes;
}

function registerAdminPanelRoutes(app, deps) {
  const {
    getSessionFromRequest,
    findUserById,
    findUserByUsername,
    findChatById,
    isConnected,
    getConnectedUsernames,
    isUserAdmin,
    isUserOwner,
    isLoopbackRequest,
    getOwnerUser,
    getAdminStats,
    getOnlineCount,
    adminListUsers,
    adminListChats,
    adminCountUsers,
    adminCountChats,
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
    createMessage,
    addChatMember,
    addAllEligibleChatMembers,
    removeChatMember,
    setChatMemberRole,
    listChatMembers,
    updateGroupChat,
    updateChannelChat,
    // emitting SSE on changes
    emitChatEvent,
    emitSseEvent,
    broadcastAll,
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
    dbConfig,
    postgresMaintenance,
    projectRootDir,
    dataDir: adminDataDir,
    path: nodePath,
    fs,
  } = deps;

  const resolveMaybePromise = async (value) =>
    value && typeof value.then === "function" ? await value : value;

  function toSql(builder, p = []) {
    if (builder && typeof builder.toSQL === "function") {
      const c = builder.toSQL();
      return { sql: c.sql, params: c.bindings || [] };
    }
    return { sql: builder, params: p };
  }

  const callAdminGetRow = (builder, p) => {
    const { sql, params } = toSql(builder, p);
    return adminGetRow(sql, params);
  };
  const callAdminGetAll = (builder, p) => {
    const { sql, params } = toSql(builder, p);
    return adminGetAll(sql, params);
  };
  const callAdminRun = (builder, p) => {
    const { sql, params } = toSql(builder, p);
    return adminRun(sql, params);
  };

  // ─── Admin panel gate ────────────────────────────────────────────────────────
  // When ADMIN_PANEL=false is set in the environment, all /api/admin/* requests
  // get a 404. This is env-only — intentionally not in the admin settings UI so
  // the panel cannot be re-enabled from within itself.

  app.use("/api/admin", (req, res, next) => {
    // The CLI database-tools endpoint authenticates with its loopback check and
    // ADMIN_API_TOKEN, not a browser session. Let its own route handle auth.
    if (req.path === "/db-tools") return next();
    const raw = String(process.env.ADMIN_PANEL ?? "true").trim().toLowerCase();
    const enabled = !["0", "false", "no", "n", "off"].includes(raw);
    if (!enabled) {
      return res.status(404).json({ error: "Not found" });
    }
    next();
  });

  // ─── Emergency Admin Claim ───────────────────────────────────────────────────

  app.post("/api/admin/claim", async (req, res) => {
    try {
      // 1. HTTPS / Local loopback check
      const proto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
      const isLoopback = typeof isLoopbackRequest === "function" ? isLoopbackRequest(req) : (req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1");
      const isHttps = proto === "https" || req.secure;
      if (!isLoopback && !isHttps) {
        return res.status(403).json({ error: "HTTPS connection required." });
      }

      // 2. Session check
      const rawSession = getSessionFromRequest(req);
      const session = rawSession && typeof rawSession.then === "function" ? await rawSession : rawSession;
      if (!session || !session.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // 3. Token validation
      const providedToken = String(req.body?.token || "");
      const expectedToken = String(process.env.ADMIN_API_TOKEN || "");
      const providedBuf = Buffer.from(providedToken);
      const expectedBuf = Buffer.from(expectedToken);

      const isValid = expectedToken.length > 0 &&
        providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf);

      if (!isValid) {
        log(session, "admin.claim_failed", { details: "Invalid admin token submitted", status: "failure" });
        return res.status(401).json({ error: "Invalid admin token" });
      }

      // 4. Role determination (owner vs admin)
      const getRow = deps.getRow || deps.adminGetRow || adminGetRow;
      const existingOwner = await resolveMaybePromise(getRow("SELECT id FROM users WHERE role = 'owner' LIMIT 1"));
      const targetRole = existingOwner ? "admin" : "owner";

      // 5. Apply role change
      await resolveMaybePromise(setUserRole(session.id, targetRole));

      log(session, "admin.claim_success", { details: `User promoted to ${targetRole} via admin API token`, targetType: "user", targetLabel: session.username, status: "success" });

      return res.json({ ok: true, role: targetRole });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Failed to claim admin privileges" });
    }
  });

  // ─── Auth middleware ─────────────────────────────────────────────────────────

  app.use("/api/admin", async (req, res, next) => {
    if (req.path === "/db-tools" || req.path === "/claim") return next();
    try {
      const rawSession = getSessionFromRequest(req);
      const session = rawSession && typeof rawSession.then === "function"
        ? await rawSession
        : rawSession;
      if (!session) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const rawIsAdmin = isUserAdmin(session.id);
      const isAdmin = rawIsAdmin && typeof rawIsAdmin.then === "function"
        ? await rawIsAdmin
        : rawIsAdmin;
      if (!isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }
      req.adminSession = session;
      next();
    } catch (error) {
      next(error);
    }
  });

  const requireAdmin = (req, res) => {
    const session = req.adminSession || getSessionFromRequest(req);
    if (!session || typeof session.then === "function") {
      if (session && typeof session.then === "function") {
        res.status(500).json({ error: "Admin authentication must be awaited." });
      } else {
        res.status(401).json({ error: "Not authenticated" });
      }
      return null;
    }
    if (req.adminSession || isUserAdmin(session.id) === true) return session;
    res.status(403).json({ error: "Admin access required" });
    return null;
  };

  // Returns true if the acting session belongs to the owner role.
  const actorIsOwner = async (session) =>
    Boolean(await resolveMaybePromise(isUserOwner(session?.id)));

  const emitGroupJoinMessage = async (chat, chatId, session, member) => {
    if (chat.type !== "group") return;
    const body = `[[system:joined:${member.nickname || member.username}]]`;
    await resolveMaybePromise(createMessage(
      chatId,
      session.id,
      body,
      null,
      null,
      null,
      { allowPlaintextSystemMessage: true },
    ));
    emitChatEvent(chatId, {
      type: "chat_message",
      chatId,
          username: session.username,
          userId: session.id,
          body,
    });
  };

  // Helper to write an audit log entry (to logs/admin.log) tied to the acting admin.
  const log = (session, action, opts = {}) => {
    const writeLog = deps.writeAdminLog || writeAdminLog;
    writeLog({
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

  app.get("/api/admin/stats", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const stats = (await getCachedAdminStats(getAdminStats)) || {};
    stats.onlineUsers = await getOnlineCount();
    res.json(stats);
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
    const effectiveDataDir = adminDataDir || nodePath.join(projectRootDir, "data");

    // DB file size
    let dbSizeBytes = 0;
    try {
      if (nodePath && fs) {
        const dbPath = nodePath.join(effectiveDataDir, "songbird.db");
        if (fs.existsSync(dbPath)) dbSizeBytes = fs.statSync(dbPath).size;
      }
    } catch {}

    // Uploads folder size (recursive, TTL-cached — see getCachedUploadsSizeBytes)
    let uploadsSizeBytes = 0;
    try {
      if (nodePath && fs) {
        uploadsSizeBytes = getCachedUploadsSizeBytes(
          fs,
          nodePath,
          nodePath.join(effectiveDataDir, "uploads"),
        );
      }
    } catch {}

    // Disk / filesystem stats for the data directory
    let diskTotalBytes = 0;
    let diskFreeBytes  = 0;
    let diskUsedBytes  = 0;
    try {
      if (fs && typeof fs.statfsSync === "function") {
        const stat = fs.statfsSync(effectiveDataDir);
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

  app.get("/api/admin/users", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit  = Number(req.query.limit  || 200);
    const offset = Number(req.query.offset || 0);
    const search = String(req.query.search || "").trim();
    const sortBy    = ["id", "username", "nickname", "role", "created_at", "last_seen"].includes(req.query.sortBy)
      ? req.query.sortBy : "id";
    const sortDir   = String(req.query.sortDir || "").toLowerCase() === "asc" ? "ASC" : "DESC";
    const roleFilter = ["user", "admin", "owner", "banned"].includes(req.query.role) ? req.query.role : null;
    const statusFilter = ["online", "offline"].includes(req.query.status) ? req.query.status : null;
    const verifiedFilter = ["1", "0", "true", "false"].includes(req.query.verified) ? req.query.verified : null;
    const connectedUsernames = typeof getConnectedUsernames === "function" ? getConnectedUsernames() : null;
    const rawResult = adminListUsers({ limit, offset, search, sortBy, sortDir, roleFilter, statusFilter, verifiedFilter, connectedUsernames });
    const { users, total } = (rawResult && typeof rawResult.then === "function" ? await rawResult : rawResult) || { users: [], total: 0 };
    users.forEach((u) => {
      u.online =
        typeof isConnected === "function" && isConnected(u.username) && String(u.status || "online").toLowerCase() !== "invisible" ? 1 : 0;
    });
    res.json({ users, total, limit, offset });
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
    const allowedRoles = (await actorIsOwner(session)) ? ["user", "admin", "owner"] : ["user", "admin"];
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
    if ((await callAdminGetRow(dbKnex("users").select("id").where("username", rawUsername).first()))?.id) {
      return res.status(409).json({ error: "Username already exists." });
    }
    if ((await callAdminGetRow(dbKnex("chats").select("id").whereIn("type", ["group", "channel"]).where("group_username", rawUsername).first()))?.id) {
      return res.status(409).json({ error: "Username already exists." });
    }
    // Only one owner is allowed at a time
    if (role === "owner" && await resolveMaybePromise(getOwnerUser())) {
      return res.status(409).json({ error: "An owner already exists. Reassign the owner role first." });
    }

    const passwordHash   = await bcrypt.hash(password, 10);
    const suppliedColor  = normalizeHexColor(String(req.body?.color || ""));
    const assignedColor  = suppliedColor || setUserColor();
    const verified       = req.body?.verified !== undefined ? (req.body.verified ? 1 : 0) : 0;
    const newUserId = generateUuid();
    await resolveMaybePromise(callAdminRun(
      dbKnex("users").insert({
        id: newUserId,
        username: rawUsername,
        nickname,
        avatar_url: null,
        color: assignedColor,
        status: "online",
        password_hash: passwordHash,
        created_at: dbKnex.raw("datetime('now')"),
        last_seen: dbKnex.raw("datetime('now')"),
        verified,
      }),
    ));
    if (role !== "user") {
      const newUser = await callAdminGetRow(dbKnex("users").select("id").where("username", rawUsername).first());
      if (newUser?.id) await resolveMaybePromise(callAdminRun(dbKnex("users").where("id", newUser.id).update({ role })));
    }
    adminSave();
    const row = await callAdminGetRow(dbKnex("users").select("id", "username", "nickname", "color", "role", "verified").where("username", rawUsername).first());
    log(session, "user.create", { targetType: "user", targetLabel: `@${rawUsername}`, details: `role=${role}` });
    userEvents.emit("user:created", { userId: newUserId });
    res.status(201).json({ ok: true, user: row });
  });

  // ─── Users — edit ────────────────────────────────────────────────────────────

  app.patch("/api/admin/users/:id", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = req.params.id;
    const user = await resolveMaybePromise(findUserById(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    // Non-owners cannot edit the owner account
    if (user.role === "owner" && !(await actorIsOwner(session))) {
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
      if ((await callAdminGetRow(dbKnex("users").select("id").where("username", nextUsername).where("id", "!=", userId).first()))?.id) {
        return res.status(409).json({ error: "Username already exists." });
      }
      if ((await callAdminGetRow(dbKnex("chats").select("id").whereIn("type", ["group", "channel"]).whereIn("group_username", [nextUsername, `@${nextUsername}`]).first()))?.id) {
        return res.status(409).json({ error: "Username already exists." });
      }
    }

    const nextVerified = b.verified !== undefined ? (b.verified ? 1 : 0) : (user.verified ? 1 : 0);

    await resolveMaybePromise(callAdminRun(
      dbKnex("users")
        .where("id", userId)
        .update({
          username: nextUsername,
          nickname: nextNickname,
          status: nextStatus,
          color: nextColor,
          verified: nextVerified,
        }),
    ));
    adminSave();
    const updated = await resolveMaybePromise(findUserById(userId));
    log(session, "user.edit", { targetType: "user", targetLabel: `@${updated.username}` });
    res.json({ ok: true, user: updated });
  });

  // ─── Users — ban/unban ───────────────────────────────────────────────────────

  app.post("/api/admin/users/:id/ban", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = req.params.id;
    const user = await resolveMaybePromise(findUserById(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    // The owner cannot be banned
    if (user.role === "owner") {
      return res.status(403).json({ error: "Cannot ban the owner account." });
    }

    const banned = Boolean(req.body?.banned);
    await resolveMaybePromise(adminBanUser(userId, banned));
    // Banning revokes any elevated role; unbanning restores the default user role.
    await resolveMaybePromise(setUserRole(userId, "user"));
    if (banned) await resolveMaybePromise(callAdminRun(dbKnex("sessions").where("user_id", userId).del()));
    adminSave();
    log(session, banned ? "user.ban" : "user.unban", { targetType: "user", targetLabel: `@${user.username}` });
    res.json({ ok: true, banned });
  });

  // ─── Users — change role ─────────────────────────────────────────────────────

  app.post("/api/admin/users/:id/role", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = req.params.id;
    const { role } = req.body || {};

    // Only the owner can assign/revoke the owner role; admins can only use user/admin
    const allowedRoles = (await actorIsOwner(session)) ? ["user", "admin", "owner"] : ["user", "admin"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const user = await resolveMaybePromise(findUserById(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    // Non-owners cannot change the role of the owner
    if (user.role === "owner" && !(await actorIsOwner(session))) {
      return res.status(403).json({ error: "Cannot change the role of the owner." });
    }

    // Only one owner is allowed — block promoting if another owner already exists
    if (role === "owner" && user.role !== "owner") {
      const existing = await resolveMaybePromise(getOwnerUser());
      if (existing && existing.id !== userId) {
        return res.status(409).json({ error: "An owner already exists. Demote them first." });
      }
    }

    await resolveMaybePromise(setUserRole(userId, role));
    adminSave();
    log(session, "user.role", { targetType: "user", targetLabel: `@${user.username}`, details: `role=${role}` });
    res.json({ ok: true, role });
  });

  // ─── Users — reset password ──────────────────────────────────────────────────

  app.post("/api/admin/users/:id/reset-password", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = req.params.id;
    const newPassword = String(req.body?.password || "").trim();
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    const user = await resolveMaybePromise(findUserById(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    // Non-owners cannot reset the owner's password
    if (user.role === "owner" && !(await actorIsOwner(session))) {
      return res.status(403).json({ error: "Cannot reset the owner's password." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await resolveMaybePromise(callAdminRun(dbKnex("users").where("id", userId).update({ password_hash: hash })));
    await resolveMaybePromise(callAdminRun(dbKnex("sessions").where("user_id", userId).del()));
    adminSave();
    log(session, "user.reset_password", { targetType: "user", targetLabel: `@${user.username}` });
    res.json({ ok: true });
  });

  // ─── Users — avatar upload (admin, bypasses ownership check) ─────────────────

  app.post("/api/admin/users/:id/avatar", validateUuidParams("id"), uploadAvatar.single("avatar"), async (req, res) => {
    const session = await resolveMaybePromise(getSessionFromRequest(req));
    const isAdmin = session ? await resolveMaybePromise(isUserAdmin(session.id)) : false;
    if (!session || !isAdmin) {
      removeUploadedFiles(req.file ? [req.file] : [], avatarUploadRootDir);
      return res.status(session ? 403 : 401).json({ error: session ? "Admin access required" : "Not authenticated" });
    }
    const userId = req.params.id;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Avatar file is required." });
    const mime = String(file.mimetype || "").toLowerCase();
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mime)) {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res.status(400).json({ error: "Avatar must be a JPEG, PNG, GIF, WEBP, or BMP image." });
    }
    const user = await resolveMaybePromise(findUserById(userId));
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
    await resolveMaybePromise(callAdminRun(dbKnex("users").where("id", userId).update({ avatar_url: avatarUrl })));
    adminSave();
    res.json({ ok: true, avatarUrl });
  });

  app.delete("/api/admin/users/:id/avatar", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = req.params.id;
    const user = await resolveMaybePromise(findUserById(userId));
    if (!user) return res.status(404).json({ error: "User not found." });
    if (String(user.avatar_url || "").trim()) removeAvatarByUrl(user.avatar_url);
    await resolveMaybePromise(callAdminRun(dbKnex("users").where("id", userId).update({ avatar_url: null })));
    adminSave();
    res.json({ ok: true, avatarUrl: null });
  });

  // ─── Users — delete ──────────────────────────────────────────────────────────

  app.delete("/api/admin/users/:id", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const userId = req.params.id;
    if (userId === session.id) return res.status(400).json({ error: "Cannot delete yourself" });
    const user = await resolveMaybePromise(findUserById(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    // The owner cannot be deleted
    if (user.role === "owner") {
      return res.status(403).json({ error: "Cannot delete the owner account." });
    }

    const rawDeletion = adminDeleteUser(userId);
    const { storedNames } = rawDeletion && typeof rawDeletion.then === "function"
      ? await rawDeletion
      : rawDeletion || {};
    if (Array.isArray(storedNames) && storedNames.length > 0) removeStoredFileNames(storedNames);
    log(session, "user.delete", { targetType: "user", targetLabel: `@${user.username}` });
    res.json({ ok: true });
  });

  // ─── Chats — list ────────────────────────────────────────────────────────────

  app.get("/api/admin/chats", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit   = Number(req.query.limit  || 200);
    const offset  = Number(req.query.offset || 0);
    const search  = String(req.query.search || "").trim();
    const sortBy  = ["id", "name", "type", "group_visibility", "created_at", "member_count", "message_count"].includes(req.query.sortBy)
      ? req.query.sortBy : "id";
    const sortDir = String(req.query.sortDir || "").toLowerCase() === "asc" ? "ASC" : "DESC";
    const typeFilter = ["group", "channel"].includes(req.query.type) ? req.query.type : null;
    const visibilityFilter = ["public", "private"].includes(req.query.visibility) ? req.query.visibility : null;
    const verifiedFilter = ["1", "0", "true", "false"].includes(req.query.verified) ? req.query.verified : null;
    const autoAddFilter = ["1", "0", "true", "false"].includes(req.query.auto_add) ? req.query.auto_add : null;
    const remoteFilter = ["active", "paused", "disabled", "none"].includes(req.query.remote) ? req.query.remote : null;
    const rawResult = adminListChats({ limit, offset, search, sortBy, sortDir, typeFilter, visibilityFilter, verifiedFilter, autoAddFilter, remoteFilter });
    const { chats, total } = (rawResult && typeof rawResult.then === "function"
      ? await rawResult
      : rawResult) || { chats: [], total: 0 };
    res.json({ chats, total, limit, offset });
  });

  // ─── Chats — create ──────────────────────────────────────────────────────────

  app.post("/api/admin/chats", async (req, res) => {
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

    const owner = isValidUuid(ownerIdOrUsername)
      ? await resolveMaybePromise(findUserById(ownerIdOrUsername))
      : await resolveMaybePromise(findUserByUsername(ownerIdOrUsername.toLowerCase()));
    if (!owner?.id) return res.status(404).json({ error: "Owner user not found." });

    if ((await adminGetRow(dbKnex("users").select("id").where("username", username).first()))?.id) {
      return res.status(409).json({ error: "Username already exists." });
    }
    if ((await adminGetRow(dbKnex("chats").select("id").whereIn("type", ["group", "channel"]).whereIn("group_username", [username, `@${username}`]).first()))?.id) {
      return res.status(409).json({ error: "Username already exists." });
    }

    const inviteToken  = createInviteToken(crypto);
    const ownerColor   = String((await adminGetRow(dbKnex("users").select("color").where("id", owner.id).first()))?.color || "") || "#10b981";
    const groupColor   = normalizeHexColor(String(b.color || "")) || ownerColor;
    const autoAddNewUsers = (visibility === "public" && Boolean(b.autoAddNewUsers || b.auto_add_new_users)) ? 1 : 0;
    const chatId = await resolveMaybePromise(createChat(name, type, {
      groupUsername:     username,
      groupVisibility:   visibility,
      inviteToken,
      createdByUserId:   owner.id,
      groupColor,
      verified:          Boolean(b.verified),
      autoAddNewUsers,
      auto_add_new_users: autoAddNewUsers,
    }));

    if (!chatId) return res.status(500).json({ error: "Failed to create chat." });

    await resolveMaybePromise(addChatMember(chatId, owner.id, "owner"));

    const memberIds = Array.isArray(b.memberIds) ? b.memberIds.filter(Boolean) : [];
    const addAllEligibleMembers = Boolean(b.addAllEligibleMembers);
    for (const mid of memberIds) {
      if (mid !== owner.id) await resolveMaybePromise(addChatMember(chatId, mid, "member"));
    }
    const bulkMembers = addAllEligibleMembers
      ? (await resolveMaybePromise(addAllEligibleChatMembers(chatId))) || { addedUsers: [], skippedLeftCount: 0 }
      : { addedUsers: [], skippedLeftCount: 0 };

    if (b.verified) await resolveMaybePromise(adminRun(dbKnex("chats").where("id", chatId).update({ verified: 1 })));

    adminSave();
    const created = await resolveMaybePromise(findChatById(chatId));
    // Notify the owner so the new chat appears in their sidebar immediately.
    emitSseEvent(String(owner.username || ""), { type: "chat_list_changed" });
    // Also notify any additional members.
    for (const mid of memberIds) {
      if (mid === owner.id) continue;
      const member = await resolveMaybePromise(findUserById(mid));
      if (member?.username) emitSseEvent(String(member.username), { type: "chat_list_changed" });
    }
    for (const member of bulkMembers.addedUsers) {
      if (member.id !== owner.id) {
        emitSseEvent(String(member.username), { type: "chat_list_changed" });
      }
    }
    log(session, "chat.create", { targetType: "chat", targetLabel: name, details: `type=${type} added_all=${bulkMembers.addedUsers.length} skipped_left=${bulkMembers.skippedLeftCount}` });
    res.status(201).json({
      ok: true,
      chat: created,
      addedAllCount: bulkMembers.addedUsers.length,
      skippedLeftCount: bulkMembers.skippedLeftCount,
    });
  });

  // ─── Chats — edit ────────────────────────────────────────────────────────────

  app.patch("/api/admin/chats/:id", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = req.params.id;
    const chat = await resolveMaybePromise(findChatById(chatId));
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
      if ((await adminGetRow(dbKnex("users").select("id").where("username", nextUsername).first()))?.id) {
        return res.status(409).json({ error: "Username already exists." });
      }
      if ((await adminGetRow(dbKnex("chats").select("id").whereIn("type", ["group", "channel"]).whereIn("group_username", [nextUsername, `@${nextUsername}`]).where("id", "!=", chatId).first()))?.id) {
        return res.status(409).json({ error: "Username already exists." });
      }
    }

    let newOwnerUsername = null;
    if (b.owner !== undefined) {
      const newOwner = isValidUuid(String(b.owner))
        ? await resolveMaybePromise(findUserById(b.owner))
        : await resolveMaybePromise(findUserByUsername(String(b.owner).toLowerCase()));
      if (!newOwner?.id) return res.status(404).json({ error: "New owner not found." });
      await resolveMaybePromise(adminRun(dbKnex("chat_members").where("chat_id", chatId).where("role", "owner").update({ role: "member" })));
      await resolveMaybePromise(adminRun(dbKnex("chat_members").insert({ chat_id: chatId, user_id: newOwner.id, role: "owner" }).onConflict(["chat_id", "user_id"]).ignore()));
      await resolveMaybePromise(adminRun(dbKnex("chat_members").where({ chat_id: chatId, user_id: newOwner.id }).update({ role: "owner" })));
      newOwnerUsername = String(newOwner.username || "");
    }

    let auto_add_new_users;
    if (nextVisibility === "private") {
      auto_add_new_users = 0;
    } else if (b.autoAddNewUsers !== undefined) {
      auto_add_new_users = b.autoAddNewUsers ? 1 : 0;
    } else if (b.auto_add_new_users !== undefined) {
      auto_add_new_users = b.auto_add_new_users ? 1 : 0;
    }

    const patchPayload = {
      name: nextName,
      groupUsername: nextUsername,
      groupVisibility: nextVisibility,
    };
    if (auto_add_new_users !== undefined) {
      patchPayload.auto_add_new_users = auto_add_new_users;
      patchPayload.autoAddNewUsers = auto_add_new_users;
    }

    if (chat.type === "group") {
      await resolveMaybePromise(updateGroupChat(chatId, patchPayload));
    } else {
      await resolveMaybePromise(updateChannelChat(chatId, patchPayload));
    }

    if (nextColor) await resolveMaybePromise(adminRun(dbKnex("chats").where("id", chatId).update({ group_color: nextColor })));
    if (b.verified !== undefined) await resolveMaybePromise(adminRun(dbKnex("chats").where("id", chatId).update({ verified: b.verified ? 1 : 0 })));
    adminSave();

    emitChatEvent(chatId, { type: "chat_updated", chatId });
    // If ownership was transferred, the new owner may not have been in the
    // member list before (INSERT OR IGNORE just added them). emitChatEvent only
    // reaches existing members cached before this request, so emit directly.
    if (newOwnerUsername) {
      emitSseEvent(newOwnerUsername, { type: "chat_list_changed" });
    }
    const updated = await resolveMaybePromise(findChatById(chatId));
    log(session, "chat.edit", { targetType: "chat", targetLabel: updated.name || `Chat #${chatId}` });
    res.json({ ok: true, chat: updated });
  });

  // ─── Chats — avatar upload (admin, bypasses owner check) ─────────────────────

  app.post("/api/admin/chats/:id/avatar", validateUuidParams("id"), uploadAvatar.single("avatar"), async (req, res) => {
    const session = await resolveMaybePromise(getSessionFromRequest(req));
    const isAdmin = session ? await resolveMaybePromise(isUserAdmin(session.id)) : false;
    if (!session || !isAdmin) {
      removeUploadedFiles(req.file ? [req.file] : [], avatarUploadRootDir);
      return res.status(session ? 403 : 401).json({ error: session ? "Admin access required" : "Not authenticated" });
    }
    const chatId = req.params.id;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Avatar file is required." });

    const mime = String(file.mimetype || "").toLowerCase();
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mime)) {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res.status(400).json({ error: "Avatar must be a JPEG, PNG, GIF, WEBP, or BMP image." });
    }

    const chat = await resolveMaybePromise(findChatById(chatId));
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
    await resolveMaybePromise(updateFn(chatId, {
      name: chat.name,
      groupUsername: chat.group_username,
      groupVisibility: chat.group_visibility,
      allowMemberInvites: Boolean(Number(chat.allow_member_invites || 0)),
      groupAvatarUrl: avatarUrl,
    }));
    adminSave();
    emitChatEvent(chatId, { type: "chat_updated", chatId });
    log(session, "chat.edit", { targetType: "chat", targetLabel: chat.name || `Chat #${chatId}`, details: "avatar updated" });
    res.json({ ok: true, avatarUrl });
  });

  app.delete("/api/admin/chats/:id/avatar", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = req.params.id;
    const chat = await resolveMaybePromise(findChatById(chatId));
    if (!chat || (chat.type !== "group" && chat.type !== "channel")) {
      return res.status(404).json({ error: "Chat not found." });
    }
    if (String(chat.group_avatar_url || "").trim()) {
      removeAvatarByUrl(chat.group_avatar_url);
    }
    const updateFn = chat.type === "channel" ? updateChannelChat : updateGroupChat;
    await resolveMaybePromise(updateFn(chatId, {
      name: chat.name,
      groupUsername: chat.group_username,
      groupVisibility: chat.group_visibility,
      allowMemberInvites: Boolean(Number(chat.allow_member_invites || 0)),
      groupAvatarUrl: null,
    }));
    adminSave();
    emitChatEvent(chatId, { type: "chat_updated", chatId });
    res.json({ ok: true, avatarUrl: null });
  });

  // ─── Chats — members list ────────────────────────────────────────────────────

  app.get("/api/admin/chats/:id/members", validateUuidParams("id"), async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const chatId = req.params.id;
    const members = (await resolveMaybePromise(listChatMembers(chatId))) || [];
    res.json({ members });
  });

  // ─── Chats — add member ──────────────────────────────────────────────────────

  app.post("/api/admin/chats/:id/members", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = req.params.id;
    const chat = await resolveMaybePromise(findChatById(chatId));
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!["group", "channel"].includes(chat.type)) {
      return res.status(400).json({ error: "Only groups and channels can have members." });
    }

    if (req.body?.all) {
      const result = (await resolveMaybePromise(addAllEligibleChatMembers(chatId))) || { addedUsers: [], skippedLeftCount: 0 };
      adminSave();
      for (const user of result.addedUsers) {
        emitSseEvent(String(user.username), { type: "chat_list_changed" });
        await emitGroupJoinMessage(chat, chatId, session, user);
      }
      if (result.addedUsers.length > 0) {
        emitChatEvent(chatId, { type: "chat_updated", chatId });
      }
      log(session, "chat.member_add", {
        targetType: "chat",
        targetLabel: chat.name || `Chat #${chatId}`,
        details: `all added=${result.addedUsers.length} skipped_left=${result.skippedLeftCount}`,
      });
      return res.json({
        ok: true,
        addedCount: result.addedUsers.length,
        skippedLeftCount: result.skippedLeftCount,
      });
    }

    const userId = req.body?.userId;
    if (!userId) return res.status(400).json({ error: "userId required" });
    if (!isValidUuid(userId)) return res.status(400).json({ error: "Field 'userId' is not a valid UUID." });
    const user = await resolveMaybePromise(findUserById(userId));
    if (!user) return res.status(404).json({ error: "User not found" });
    const added = (await resolveMaybePromise(addChatMember(chatId, userId, "member"))) > 0;
    adminSave();
    if (added) {
      await emitGroupJoinMessage(chat, chatId, session, user);
    }
    // Notify the added user so the chat appears in their sidebar immediately.
    emitSseEvent(String(user.username), { type: "chat_list_changed" });
    // Notify existing members that the member list changed.
    emitChatEvent(chatId, { type: "chat_updated", chatId });
    log(session, "chat.member_add", { targetType: "chat", targetLabel: chat.name || `Chat #${chatId}`, details: `+@${user.username}` });
    res.json({ ok: true });
  });

  // ─── Chats — remove member ───────────────────────────────────────────────────

  app.delete("/api/admin/chats/:id/members/:userId", validateUuidParams("id", "userId"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = req.params.id;
    const userId = req.params.userId;
    const chat = await resolveMaybePromise(findChatById(chatId));
    const user = await resolveMaybePromise(findUserById(userId));
    await resolveMaybePromise(removeChatMember(chatId, userId));
    adminSave();
    // Notify the removed user so the chat disappears from their sidebar.
    if (user?.username) emitSseEvent(String(user.username), { type: "chat_list_changed" });
    // Notify remaining members that the member list changed.
    emitChatEvent(chatId, { type: "chat_updated", chatId });
    log(session, "chat.member_remove", { targetType: "chat", targetLabel: chat?.name || `Chat #${chatId}`, details: user ? `-@${user.username}` : `-${userId}` });
    res.json({ ok: true });
  });

  // ─── Chats — set member role ─────────────────────────────────────────────────

  app.patch("/api/admin/chats/:id/members/:userId", validateUuidParams("id", "userId"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = req.params.id;
    const userId = req.params.userId;
    const { role } = req.body || {};
    if (!["owner", "admin", "member"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const chat = await resolveMaybePromise(findChatById(chatId));
    const user = await resolveMaybePromise(findUserById(userId));
    await resolveMaybePromise(setChatMemberRole(chatId, userId, role));
    adminSave();
    // Notify the affected user and all other members of the role change.
    emitChatEvent(chatId, { type: "chat_updated", chatId });
    log(session, "chat.member_role", { targetType: "chat", targetLabel: chat?.name || `Chat #${chatId}`, details: `@${user?.username || userId} → ${role}` });
    res.json({ ok: true, role });
  });

  // ─── Chats — delete ──────────────────────────────────────────────────────────

  app.delete("/api/admin/chats/:id", validateUuidParams("id"), async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const chatId = req.params.id;
    const chat = await resolveMaybePromise(findChatById(chatId));
    const deletion = await resolveMaybePromise(adminDeleteChat(chatId));
    const { storedNames } = deletion || {};
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
    const offset = Number(req.query.offset || 0);
    const search = String(req.query.search || "").trim();
    const { entries, total } = readAdminLog({ limit, offset, search });
    res.json({ logs: entries, total, limit, offset });
  });

  app.delete("/api/admin/logs", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    if (!(await actorIsOwner(session))) {
      return res.status(403).json({ error: "Owner access required" });
    }
    clearAdminLog();
    log(session, "logs.clear", { targetType: "system" });
    res.json({ ok: true });
  });

  // Installer / service / nginx logs
  app.get("/api/admin/logs/sources", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const sources = await probeLogSources();
    res.json({ sources });
  });

  app.get("/api/admin/logs/installer", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(readInstallerLog({ maxLines: 400 }));
  });

  app.get("/api/admin/logs/nginx", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = await readNginxLog({ maxLines: 400 });
    res.json(result);
  });

  app.get("/api/admin/logs/service", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const result = await readServiceLog({ maxLines: 400 });
    res.json(result);
  });

  // ─── Maintenance ─────────────────────────────────────────────────────────────

  app.get("/api/admin/maintenance/info", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const postgres = dbConfig?.client === "postgres";
    res.json({
      engine: postgres ? "postgres" : "sqlite",
      backupExtension: postgres ? ".dump" : ".db",
      restoreAccept: postgres ? ".dump,application/octet-stream" : ".db,application/x-sqlite3,application/vnd.sqlite3",
      deleteAvailable: postgres,
      offlineRestoreRequired: postgres,
      offlineDeleteRequired: postgres,
    });
  });

  app.post("/api/admin/maintenance/vacuum", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    try {
      if (dbConfig?.client === "postgres") await postgresMaintenance.vacuum();
      else await resolveMaybePromise(vacuumDatabase());
      log(session, "db.vacuum", { targetType: "system" });
      res.json({ ok: true });
    } catch (err) {
      log(session, "db.vacuum", { targetType: "system", status: "error", details: "maintenance command failed" });
      res.status(500).json({ error: "Vacuum failed." });
    }
  });

  // Danger zone — clear all messages & their files (keeps users and chats).
  app.post("/api/admin/maintenance/clear-messages", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    if (req.body?.confirm !== "clear messages") {
      return res.status(400).json({ error: "Confirmation phrase required." });
    }
    try {
      const { storedNames } = (await resolveMaybePromise(adminClearAllMessages())) || {};
      if (Array.isArray(storedNames) && storedNames.length > 0) removeStoredFileNames(storedNames);
      log(session, "db.clear_messages", { targetType: "system", details: `${storedNames?.length || 0} files removed` });
      // Notify all connected clients so chat windows refresh their message list.
      broadcastAll({ type: "chat_list_changed" });
      res.json({ ok: true });
    } catch (err) {
      log(session, "db.clear_messages", { targetType: "system", status: "error", details: "maintenance command failed" });
      res.status(500).json({ error: "Failed to clear messages." });
    }
  });

  // Danger zone — full reset: wipes users, chats, messages, sessions.
  app.post("/api/admin/maintenance/reset", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    if (req.body?.confirm !== "reset everything") {
      return res.status(400).json({ error: "Confirmation phrase required." });
    }
    try {
      const { storedNames } = (await resolveMaybePromise(adminResetDatabase())) || {};
      if (Array.isArray(storedNames) && storedNames.length > 0) removeStoredFileNames(storedNames);
      log(session, "db.reset", { targetType: "system", details: `${storedNames?.length || 0} files removed` });
      broadcastAll({ type: "session_revoked" });
      res.json({ ok: true });
    } catch (err) {
      log(session, "db.reset", { targetType: "system", status: "error", details: "maintenance command failed" });
      res.status(500).json({ error: "Reset failed." });
    }
  });

  app.post("/api/admin/maintenance/delete", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    if (dbConfig?.client !== "postgres") {
      return res.status(400).json({ error: "Database deletion is only available in PostgreSQL mode." });
    }
    // dropdb --force terminates this server's own pool. Run it only after the
    // process has stopped, using the CLI command that enforces that condition.
    return res.status(409).json({
      error: "Stop Songbird, then run npm run db:delete -- -y to delete a PostgreSQL database.",
    });
  });

  // ─── Service control ─────────────────────────────────────────────────────────

  const SERVICE_NAME = process.env.SONGBIRD_SERVICE_NAME || "songbird";

  // Sends a POST request to the Docker Engine API via the Unix socket to
  // restart or stop this container. The container name / ID is read from the
  // HOSTNAME env var, which Docker sets to the container ID by default, and
  // can be overridden with SONGBIRD_CONTAINER_NAME for named containers.
  const runDockerAction = (action) => new Promise((resolve) => {
    const container = process.env.SONGBIRD_CONTAINER_NAME || process.env.HOSTNAME || "songbird";
    const socketPath = "/var/run/docker.sock";
    // action is "restart" or "stop" — both are POST endpoints in the Docker API.
    const path = `/containers/${container}/${action}`;
    // Use the built-in http module to talk to the socket directly, avoiding any
    // extra dependency. t=5 gives the container 5 s to stop gracefully.
    const http = deps.http;
    if (!http) return resolve({ ok: false, error: "http module not available." });
    const req = http.request({ socketPath, path: `${path}?t=5`, method: "POST" }, (res) => {
      // 204 = success for both restart and stop; 304 = already stopped (not an error).
      resolve(res.statusCode === 204 || res.statusCode === 304
        ? { ok: true }
        : { ok: false, error: `Docker API returned HTTP ${res.statusCode}` });
      res.resume(); // drain response body
    });
    req.on("error", (err) => resolve({ ok: false, error: `Docker socket error: ${err.message}` }));
    req.end();
  });

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

  // Docker mode and its service-control capability are fixed for a running
  // process, so detect and probe them once while routes are registered.
  const dockerMode = (() => {
    try { return fs?.existsSync("/.dockerenv") ?? false; } catch { return false; }
  })();

  const probeDockerServiceControl = () => new Promise((resolve) => {
    try {
      const http = deps.http;
      if (!http) return resolve(false);
      const r = http.request(
        { socketPath: "/var/run/docker.sock", path: "/info", method: "GET" },
        (resp) => { resp.resume(); resolve(resp.statusCode < 500); },
      );
      r.on("error", () => resolve(false));
      r.setTimeout(2000, () => { r.destroy(); resolve(false); });
      r.end();
    } catch { resolve(false); }
  });

  const probeSystemctlServiceControl = () => new Promise((resolve) => {
    execFile("systemctl", ["--version"], { timeout: 2000 }, (err) => {
      if (!err) return resolve(true);
      execFile("sudo", ["-n", "systemctl", "--version"], { timeout: 2000 }, (err2) => resolve(!err2));
    });
  });

  const serviceControlStatus = typeof deps.getServiceControlStatus === "function"
    ? Promise.resolve(deps.getServiceControlStatus({ dockerMode }))
    : (dockerMode
      ? probeDockerServiceControl()
      : probeSystemctlServiceControl()
    ).then((available) => ({
      available,
      reason: available
        ? null
        : dockerMode ? "Docker socket not mounted." : "systemctl not available.",
    }));

  // Dispatches to the mechanism selected once during startup.
  const runServiceAction = (action) =>
    dockerMode ? runDockerAction(action) : runSystemctl(action);

  app.get("/api/admin/service/available", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(await serviceControlStatus);
  });

  app.post("/api/admin/service/restart", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    log(session, "service.restart", { targetType: "system", targetLabel: SERVICE_NAME });
    // Respond first — a successful restart kills this process before the command returns.
    res.json({ ok: true, pending: true });
    setTimeout(() => { runServiceAction("restart"); }, 250);
  });

  app.post("/api/admin/service/stop", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    log(session, "service.stop", { targetType: "system", targetLabel: SERVICE_NAME });
    res.json({ ok: true, pending: true });
    setTimeout(() => { runServiceAction("stop"); }, 250);
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
  app.get("/api/admin/maintenance/download-db", async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (dbConfig?.client === "postgres") {
      const effectiveDataDir = adminDataDir || nodePath.join(projectRootDir, "data");
      const backupDir = nodePath.join(effectiveDataDir, "backups");
      const backupPath = nodePath.join(backupDir, `songbird-backup-${stamp}.dump`);
      try {
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        await postgresMaintenance.backup(backupPath);
        log(session, "db.backup", { targetType: "system", targetLabel: nodePath.basename(backupPath) });
        res.download(backupPath, nodePath.basename(backupPath), () => {
          try { fs.rmSync(backupPath, { force: true }); } catch {}
        });
      } catch (error) {
        try { fs.rmSync(backupPath, { force: true }); } catch {}
        log(session, "db.backup", { targetType: "system", status: "error", details: error?.message || "maintenance command failed" });
        if (!res.headersSent) res.status(500).json({ error: error?.message || "Backup failed." });
      }
      return;
    }

    const effectiveDataDir = adminDataDir || nodePath.join(projectRootDir, "data");
    const dbPath = nodePath.join(effectiveDataDir, "songbird.db");
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: "Database file not found." });
    }
    try { await resolveMaybePromise(vacuumDatabase()); } catch {}
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
    // Gate auth before multer buffers the upload.
    (req, res, next) => {
      if (!requireAdmin(req, res)) return;
      // pg_restore --clean cannot safely run through the process that owns live
      // database connections. The offline CLI detects a running server first.
      if (dbConfig?.client === "postgres") {
        return res.status(409).json({
          error: "Stop Songbird, then run npm run db:restore -- -y --file <backup.dump>.",
        });
      }
      next();
    },
    dbUpload.single("database"),
    async (req, res) => {
    const session = requireAdmin(req, res);
    if (!session) return;

    const file = req.file;
    if (!file || !file.buffer?.length) {
      return res.status(400).json({ error: "No database file uploaded." });
    }

    const header = file.buffer.subarray(0, 16).toString("latin1");
    if (header !== "SQLite format 3\0") {
      log(session, "db.restore", { targetType: "system", status: "error", details: "Not a valid SQLite file" });
      return res.status(400).json({ error: "The uploaded file is not a valid SQLite database." });
    }

    const dataDir = adminDataDir || nodePath.join(projectRootDir, "data");
    const dbPath  = nodePath.join(dataDir, "songbird.db");

    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const tmpPath = nodePath.join(dataDir, `.restore-${Date.now()}.db`);
      fs.writeFileSync(tmpPath, file.buffer);
      fs.renameSync(tmpPath, dbPath);
      reloadDatabase();
      broadcastAll({ type: "session_revoked" });
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

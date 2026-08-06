function registerProfileRoutes(app, deps) {
  const {
    ALLOWED_AVATAR_MIME_TYPES,
    AVATAR_FILE_LIMITS,
    createMessage,
    emitChatEvent,
    emitSseEvent,
    getSetting,
    broadcastPresence,
    listChatMembers,
    listChatsForUser,
    USER_COLORS,
    USERNAME_REGEX,
    bcrypt,
    ensureAvatarExists,
    findChatByGroupUsername,
    findUserById,
    findUserByUsername,
    deleteUserById,
    hasEnoughFreeDiskSpace,
    avatarUploadRootDir,
    clearSessionCookie,
    removeAvatarByUrl,
    removeStoredFileNames,
    removeUploadedFiles,
    requireSession,
    requireSessionUsernameMatch,
    storageEncryption,
    updateUserPassword,
    updateUserProfile,
    updateUserStatus,
    uploadAvatar,
  } = deps;

  const emitProfileUpdate = async (user, options = {}) => {
    if (!user?.id) return;
    const currentUsername = String(user.username || "").toLowerCase();
    const previousUsername = String(options.previousUsername || "")
      .trim()
      .toLowerCase();
    const payload = {
      type: "profile_updated",
      userId: Number(user.id || 0) || null,
      username: currentUsername,
      previousUsername: previousUsername || null,
      nickname: user.nickname || null,
      avatarUrl: ensureAvatarExists(user.id, user.avatar_url) || null,
      color: user.color || USER_COLORS[0],
      status: user.status || "online",
    };
    const targets = new Set();
    if (currentUsername) targets.add(currentUsername);
    if (previousUsername) targets.add(previousUsername);
    const rawChats = listChatsForUser(Number(user.id || 0));
    const chats = (rawChats && typeof rawChats.then === "function" ? await rawChats : rawChats) || [];
    for (const chat of chats) {
      const rawMembers = listChatMembers(Number(chat?.id || 0));
      const members = (rawMembers && typeof rawMembers.then === "function" ? await rawMembers : rawMembers) || [];
      members.forEach((member) => {
        const memberUsername = String(member?.username || "").toLowerCase();
        if (memberUsername) targets.add(memberUsername);
      });
    }
    targets.forEach((targetUsername) => {
      emitSseEvent(targetUsername, payload);
    });
  };

  app.get("/api/profile", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const username = req.query.username?.toString();
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({
      id: user.id,
      username: user.username,
      nickname: user.nickname || null,
      avatarUrl: ensureAvatarExists(user.id, user.avatar_url) || null,
      color: user.color || USER_COLORS[0],
      status: user.status || "online",
      role: user.role || "user",
      verified: Boolean(user.verified),
    });
  });

  app.put("/api/profile", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { currentUsername, username, nickname, avatarUrl } = req.body || {};
    if (!currentUsername || !username) {
      return res
        .status(400)
        .json({ error: "Current username and new username are required." });
    }

    const rawCurrentUser = findUserByUsername(currentUsername.toLowerCase());
    const currentUser = rawCurrentUser && typeof rawCurrentUser.then === "function" ? await rawCurrentUser : rawCurrentUser;
    if (!currentUser) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!requireSessionUsernameMatch(res, session, currentUsername)) return;

    const trimmed = username.trim().toLowerCase();
    const usernameMax = getSetting("USERNAME_MAX_CHARS");
    const nicknameMax = getSetting("NICKNAME_MAX_CHARS");

    if (trimmed.length < 3) {
      return res
        .status(400)
        .json({ error: "Username must be at least 3 characters." });
    }
    if (usernameMax && trimmed.length > usernameMax) {
      return res.status(400).json({
        error: `Username must be at most ${usernameMax} characters.`,
      });
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      return res.status(400).json({
        error:
          "Username can only include english letters, numbers, dot (.), and underscore (_).",
      });
    }
    if (nickname && String(nickname).trim().length > (nicknameMax || 0)) {
      return res.status(400).json({
        error: `Nickname must be at most ${nicknameMax} characters.`,
      });
    }

    if (trimmed !== currentUser.username) {
      const rawExisting = findUserByUsername(trimmed);
      const existing = rawExisting && typeof rawExisting.then === "function" ? await rawExisting : rawExisting;
      if (existing) {
        return res.status(409).json({ error: "Username already exists." });
      }
      if (findChatByGroupUsername) {
        const rawGroup = findChatByGroupUsername(trimmed);
        const group = rawGroup && typeof rawGroup.then === "function" ? await rawGroup : rawGroup;
        if (group) {
          return res.status(409).json({ error: "Username already exists." });
        }
      }
    }

    const nextAvatarUrl = String(avatarUrl || "").trim() || null;
    const currentAvatarUrl = String(currentUser.avatar_url || "").trim() || null;
    if (currentAvatarUrl && currentAvatarUrl !== nextAvatarUrl) {
      removeAvatarByUrl(currentAvatarUrl);
    }

    await updateUserProfile(
      currentUser.id,
      trimmed,
      nickname?.trim() || null,
      nextAvatarUrl,
    );

    const rawUpdated = findUserById(currentUser.id);
    const updated = rawUpdated && typeof rawUpdated.then === "function" ? await rawUpdated : rawUpdated;
    emitProfileUpdate(updated, {
      previousUsername: currentUser.username,
    });

    res.json({
      id: updated.id,
      username: updated.username,
      nickname: updated.nickname || null,
      avatarUrl: ensureAvatarExists(updated.id, updated.avatar_url) || null,
      color: updated.color || USER_COLORS[0],
      status: updated.status || "online",
    });
  });

  app.post("/api/profile/avatar", uploadAvatar.single("avatar"), async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) {
      removeUploadedFiles(req.file ? [req.file] : [], avatarUploadRootDir);
      return;
    }

    const currentUsername = String(req.body?.currentUsername || "")
      .trim()
      .toLowerCase();
    const file = req.file;

    if (!getSetting("FILE_UPLOAD")) {
      removeUploadedFiles(file ? [file] : [], avatarUploadRootDir);
      return res
        .status(503)
        .json({ error: "File uploads are disabled on this server." });
    }

    if (!currentUsername) {
      removeUploadedFiles(file ? [file] : [], avatarUploadRootDir);
      return res.status(400).json({ error: "Current username is required." });
    }

    if (!requireSessionUsernameMatch(res, session, currentUsername)) {
      removeUploadedFiles(file ? [file] : [], avatarUploadRootDir);
      return;
    }

    const rawUser = findUserByUsername(currentUsername);
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      removeUploadedFiles(file ? [file] : [], avatarUploadRootDir);
      return res.status(404).json({ error: "User not found." });
    }

    if (!file) {
      return res.status(400).json({ error: "Avatar file is required." });
    }

    const avatarMime = String(file.mimetype || "").toLowerCase();
    if (!ALLOWED_AVATAR_MIME_TYPES.has(avatarMime)) {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res
        .status(400)
        .json({ error: "Avatar must be a JPEG, PNG, GIF, WEBP, or BMP image." });
    }

    if (!hasEnoughFreeDiskSpace(Number(file.size || 0))) {
      removeUploadedFiles([file], avatarUploadRootDir);

      return res
        .status(400)
        .json({ error: "Not enough free storage space on server." });
    }

    const avatarUrl = `/api/uploads/avatars/${file.filename}`;
    try {
      storageEncryption.encryptFileInPlace(file.path);
    } catch {
      removeUploadedFiles([file], avatarUploadRootDir);
      return res
        .status(500)
        .json({ error: "Unable to store avatar securely." });
    }

    if (String(user.avatar_url || "").trim() && user.avatar_url !== avatarUrl) {
      removeAvatarByUrl(user.avatar_url);
    }

    await updateUserProfile(
      user.id,
      user.username,
      user.nickname || null,
      avatarUrl,
    );

    const rawUpdated = findUserById(user.id);
    const updated = rawUpdated && typeof rawUpdated.then === "function" ? await rawUpdated : rawUpdated;
    emitProfileUpdate(updated, {
      previousUsername: user.username,
    });

    return res.json({
      avatarUrl: ensureAvatarExists(updated.id, updated.avatar_url) || avatarUrl,
      sizeBytes: Number(file.size || 0),
      maxFileSizeBytes: AVATAR_FILE_LIMITS.maxFileSizeBytes,
    });
  });

  app.put("/api/password", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { username, currentPassword, newPassword } = req.body || {};
    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Username, current password, and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters." });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user || !user.password_hash || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    await updateUserPassword(user.id, passwordHash);

    res.json({ ok: true });
  });

  app.put("/api/status", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { username, status } = req.body || {};
    if (!username || !status) {
      return res.status(400).json({ error: "Username and status are required." });
    }

    const allowed = new Set(["online", "invisible"]);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await updateUserStatus(user.id, status);
    broadcastPresence(String(user.username || "").toLowerCase());

    res.json({ ok: true, status });
  });

  app.post("/api/profile/delete", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(String(username || "").toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user || !user.password_hash || !bcrypt.compareSync(String(password || ""), user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (user.avatar_url) {
      removeAvatarByUrl(user.avatar_url);
    }

    const rawChats = listChatsForUser(Number(user.id || 0));
    const memberChats = Array.isArray(rawChats) ? rawChats : (await rawChats) || [];
    for (const chat of memberChats) {
      const chatId = Number(chat?.id || 0);
      if (!chatId) continue;
      const label = user.nickname || user.username;
      if (String(chat?.type || "").toLowerCase() === "group") {
        await createMessage(
          chatId,
          user.id,
          `[[system:left:${label}]]`,
          null,
          null,
          null,
          { allowPlaintextSystemMessage: true },
        );
        emitChatEvent(chatId, {
          type: "chat_message",
          chatId,
          username: user.username,
          body: `[[system:left:${label}]]`,
        });
      }
      const rawMembers = listChatMembers(chatId);
      const members = Array.isArray(rawMembers) ? rawMembers : (await rawMembers) || [];
      members.forEach((member) => {
        const memberUsername = String(member?.username || "").toLowerCase();
        if (!memberUsername || memberUsername === String(user.username || "").toLowerCase())
          return;
        try {
          emitSseEvent(memberUsername, { type: "chat_list_changed", chatId });
        } catch {
          // ignore realtime list errors
        }
      });
    }

    const rawDel = deleteUserById(Number(user.id));
    const { storedNames } = rawDel && typeof rawDel.then === "function" ? await rawDel : rawDel;
    if (Array.isArray(storedNames) && storedNames.length) {
      removeStoredFileNames(storedNames);
    }

    clearSessionCookie(req, res);
    return res.json({ ok: true });
  });
}

export { registerProfileRoutes };

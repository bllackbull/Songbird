function registerProfileRoutes(app, deps) {
  const {
    ALLOWED_AVATAR_MIME_TYPES,
    AVATAR_FILE_LIMITS,
    FILE_UPLOAD,
    USER_COLORS,
    USERNAME_REGEX,
    bcrypt,
    ensureAvatarExists,
    findUserById,
    findUserByUsername,
    hasEnoughFreeDiskSpace,
    avatarUploadRootDir,
    removeAvatarByUrl,
    removeUploadedFiles,
    requireSession,
    requireSessionUsernameMatch,
    updateUserPassword,
    updateUserProfile,
    updateUserStatus,
    uploadAvatar,
  } = deps;

  app.get("/api/profile", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const username = req.query.username?.toString();
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }

    const user = findUserByUsername(username.toLowerCase());
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
    });
  });

  app.put("/api/profile", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const { currentUsername, username, nickname, avatarUrl } = req.body || {};
    if (!currentUsername || !username) {
      return res
        .status(400)
        .json({ error: "Current username and new username are required." });
    }

    const currentUser = findUserByUsername(currentUsername.toLowerCase());
    if (!currentUser) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!requireSessionUsernameMatch(res, session, currentUsername)) return;

    const trimmed = username.trim().toLowerCase();

    if (trimmed.length < 3) {
      return res
        .status(400)
        .json({ error: "Username must be at least 3 characters." });
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      return res.status(400).json({
        error:
          "Username can only include english letters, numbers, dot (.), underscore (_), and dash (-).",
      });
    }

    if (trimmed !== currentUser.username) {
      const existing = findUserByUsername(trimmed);
      if (existing) {
        return res.status(409).json({ error: "Username already exists." });
      }
    }

    const nextAvatarUrl = String(avatarUrl || "").trim() || null;
    const currentAvatarUrl = String(currentUser.avatar_url || "").trim() || null;
    if (currentAvatarUrl && currentAvatarUrl !== nextAvatarUrl) {
      removeAvatarByUrl(currentAvatarUrl);
    }

    updateUserProfile(
      currentUser.id,
      trimmed,
      nickname?.trim() || null,
      nextAvatarUrl,
    );

    const updated = findUserById(currentUser.id);

    res.json({
      id: updated.id,
      username: updated.username,
      nickname: updated.nickname || null,
      avatarUrl: ensureAvatarExists(updated.id, updated.avatar_url) || null,
      color: updated.color || USER_COLORS[0],
      status: updated.status || "online",
    });
  });

  app.post("/api/profile/avatar", uploadAvatar.single("avatar"), (req, res) => {
    const session = requireSession(req, res);
    if (!session) {
      removeUploadedFiles(req.file ? [req.file] : [], avatarUploadRootDir);
      return;
    }

    const currentUsername = String(req.body?.currentUsername || "")
      .trim()
      .toLowerCase();
    const file = req.file;

    if (!FILE_UPLOAD) {
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

    const user = findUserByUsername(currentUsername);
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
    if (String(user.avatar_url || "").trim() && user.avatar_url !== avatarUrl) {
      removeAvatarByUrl(user.avatar_url);
    }

    return res.json({
      avatarUrl,
      sizeBytes: Number(file.size || 0),
      maxFileSizeBytes: AVATAR_FILE_LIMITS.maxFileSizeBytes,
    });
  });

  app.put("/api/password", (req, res) => {
    const session = requireSession(req, res);
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

    const user = findUserByUsername(username.toLowerCase());
    if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const passwordHash = bcrypt.hashSync(newPassword, 10);
    updateUserPassword(user.id, passwordHash);

    res.json({ ok: true });
  });

  app.put("/api/status", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const { username, status } = req.body || {};
    if (!username || !status) {
      return res.status(400).json({ error: "Username and status are required." });
    }

    const allowed = new Set(["online", "idle", "invisible"]);
    if (!allowed.has(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    updateUserStatus(user.id, status);

    res.json({ ok: true, status });
  });
}

export { registerProfileRoutes };

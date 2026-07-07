function registerAuthRoutes(app, deps) {
  const {
    USER_COLORS,
    USERNAME_REGEX,
    getSetting,
    bcrypt,
    clearSessionCookie,
    createSession,
    createUser,
    crypto,
    deleteSession,
    ensureAvatarExists,
    findChatByGroupUsername,
    findUserByUsername,
    parseCookies,
    setSessionCookie,
    setUserColor,
    updateLastSeen,
    getSessionFromRequest,
  } = deps;

  app.post("/api/register", (req, res) => {
    if (!getSetting("SIGN_UP")) {
      return res.status(403).json({ error: "Account creation is disabled." });
    }
    const { username, password, nickname, avatarUrl } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required." });
    }

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

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters." });
    }

    const existing = findUserByUsername(trimmed);
    if (existing) {
      return res.status(409).json({ error: "Username already exists." });
    }
    if (findChatByGroupUsername && findChatByGroupUsername(trimmed)) {
      return res.status(409).json({ error: "Username already exists." });
    }

    const assignedColor = setUserColor();
    const passwordHash = bcrypt.hashSync(password, 10);

    const id = createUser(
      trimmed,
      passwordHash,
      nickname?.trim() || null,
      avatarUrl?.trim() || null,
      assignedColor,
    );

    const token = crypto.randomBytes(24).toString("hex");

    createSession(id, token);
    setSessionCookie(req, res, token);

    return res.json({
      id,
      username: trimmed,
      nickname: nickname?.trim() || null,
      avatarUrl: ensureAvatarExists(id, avatarUrl?.trim()) || null,
      color: assignedColor,
      status: "online",
    });
  });

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required." });
    }

    const trimmed = username.trim().toLowerCase();
    const user = findUserByUsername(trimmed);

    if (user?.banned) {
      return res.status(403).json({ error: "Account is banned." });
    }

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    updateLastSeen(user.id);

    const token = crypto.randomBytes(24).toString("hex");

    createSession(user.id, token);
    setSessionCookie(req, res, token);

    return res.json({
      id: user.id,
      username: user.username,
      nickname: user.nickname || null,
      avatarUrl: ensureAvatarExists(user.id, user.avatar_url) || null,
      color: user.color || USER_COLORS[0],
      status: user.status || "online",
    });
  });

  app.get("/api/me", (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: "Not authenticated." });
    }

    res.json({
      id: session.id,
      username: session.username,
      nickname: session.nickname || null,
      avatarUrl: ensureAvatarExists(session.id, session.avatar_url) || null,
      color: session.color || USER_COLORS[0],
      status: session.status || "online",
      role: session.role || "user",
    });
  });

  app.post("/api/logout", (req, res) => {
    const cookies = parseCookies(req);

    if (cookies.sid) {
      deleteSession(cookies.sid);
    }

    clearSessionCookie(req, res);

    res.json({ ok: true });
  });
}

export { registerAuthRoutes };

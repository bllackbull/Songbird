function registerChatRoutes(app, deps) {
  const {
    addChatMember,
    cleanupMissingMessageFiles,
    createChat,
    ensureAvatarExists,
    findDmChat,
    findUserByUsername,
    hideChatsForUser,
    hydrateMissingVideoMetadata,
    isVideoFileProcessing,
    listChatMembers,
    listChatsForUser,
    listMessageFilesByMessageIds,
    listUsers,
    requireSession,
    requireSessionUsernameMatch,
    searchUsers,
    unhideChat,
  } = deps;

  app.get("/api/chats", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const username = req.query.username?.toString();
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    let chats = listChatsForUser(user.id).map((conv) => {
      const members = listChatMembers(conv.id).map((member) => ({
        ...member,
        avatar_url: ensureAvatarExists(member.id, member.avatar_url),
      }));

      return { ...conv, members };
    });

    const initialLastMessageIds = chats
      .map((chat) => Number(chat.last_message_id || 0))
      .filter(Boolean);
    const cleanup = cleanupMissingMessageFiles(initialLastMessageIds);

    if (cleanup.changed) {
      chats = listChatsForUser(user.id).map((conv) => {
        const members = listChatMembers(conv.id).map((member) => ({
          ...member,
          avatar_url: ensureAvatarExists(member.id, member.avatar_url),
        }));

        return { ...conv, members };
      });
    }

    const lastMessageIds = chats
      .map((chat) => Number(chat.last_message_id || 0))
      .filter(Boolean);
    const lastFiles = await hydrateMissingVideoMetadata(
      listMessageFilesByMessageIds(lastMessageIds),
    );

    const filesByMessageId = lastFiles.reduce((acc, file) => {
      const messageId = Number(file.message_id);

      if (!acc[messageId]) acc[messageId] = [];

      acc[messageId].push({
        id: Number(file.id),
        kind: file.kind,
        name: file.original_name,
        mimeType: file.mime_type,
        processing: isVideoFileProcessing(file),
        sizeBytes: Number(file.size_bytes || 0),
        width: Number.isFinite(Number(file.width_px))
          ? Number(file.width_px)
          : null,
        height: Number.isFinite(Number(file.height_px))
          ? Number(file.height_px)
          : null,
        durationSeconds: Number.isFinite(Number(file.duration_seconds))
          ? Number(file.duration_seconds)
          : null,
        expiresAt: file.expires_at || null,
        url: `/api/uploads/messages/${file.stored_name}`,
      });

      return acc;
    }, {});

    const enrichedChats = chats.map((chat) => ({
      ...chat,
      last_message_files:
        filesByMessageId[Number(chat.last_message_id || 0)] || [],
    }));

    res.json({ chats: enrichedChats });
  });

  app.post("/api/chats/dm", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const { from, to } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: "Both users are required." });
    }

    if (!requireSessionUsernameMatch(res, session, from)) return;

    const fromUser = findUserByUsername(from.toLowerCase());
    const toUser = findUserByUsername(to.toLowerCase());
    if (!fromUser || !toUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const existingId = findDmChat(fromUser.id, toUser.id);
    if (existingId) {
      // Unhide the chat for both users (in case it was previously deleted)
      unhideChat(fromUser.id, existingId);
      unhideChat(toUser.id, existingId);

      return res.json({ id: existingId });
    }

    const chatId = createChat(null, "dm");
    if (!chatId) {
      return res.status(500).json({ error: "Failed to create chat." });
    }

    addChatMember(chatId, fromUser.id, "owner");
    addChatMember(chatId, toUser.id, "member");

    res.json({ id: chatId });
  });

  app.post("/api/chats", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const { name, type, members = [], creator } = req.body || {};
    if (!creator) {
      return res.status(400).json({ error: "Creator is required." });
    }

    if (!requireSessionUsernameMatch(res, session, creator)) return;

    const creatorUser = findUserByUsername(creator.toLowerCase());
    if (!creatorUser) {
      return res.status(404).json({ error: "Creator not found." });
    }

    const normalizedType = type === "channel" ? "channel" : "group";
    const chatId = createChat(name || "Untitled", normalizedType);

    addChatMember(chatId, creatorUser.id, "owner");

    const memberSet = new Set(
      members.map((value) => value.toString().toLowerCase()),
    );
    memberSet.delete(creatorUser.username);

    memberSet.forEach((username) => {
      const member = findUserByUsername(username);
      if (member) {
        addChatMember(chatId, member.id, "member");
      }
    });

    res.json({ id: chatId });
  });

  app.post("/api/chats/hide", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const { username, chatIds = [] } = req.body || {};
    if (!username || !Array.isArray(chatIds) || !chatIds.length) {
      return res
        .status(400)
        .json({ error: "Username and chatIds are required." });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    hideChatsForUser(user.id, chatIds.map((id) => Number(id)).filter(Boolean));

    res.json({ ok: true });
  });

  app.get("/api/users", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const exclude = req.query.exclude?.toString();
    const query = req.query.query?.toString();
    if (exclude && !requireSessionUsernameMatch(res, session, exclude)) return;

    const users = query
      ? searchUsers(query.toLowerCase(), exclude)
      : listUsers(exclude);

    res.json({
      users: users.map((item) => ({
        ...item,
        avatar_url: ensureAvatarExists(item.id, item.avatar_url),
      })),
    });
  });
}

export { registerChatRoutes };

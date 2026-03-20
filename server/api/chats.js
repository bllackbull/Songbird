function registerChatRoutes(app, deps) {
  const {
    USERNAME_REGEX,
    addChatMember,
    ALLOWED_AVATAR_MIME_TYPES,
    AVATAR_FILE_LIMITS,
    avatarUploadRootDir,
    cleanupMissingMessageFiles,
    crypto,
    createChat,
    createMessage,
    emitChatEvent,
    ensureAvatarExists,
    findChatById,
    findChatByGroupUsername,
    findChatByInviteToken,
    findDmChat,
    findUserByUsername,
    hideChatsForUser,
    hydrateMissingVideoMetadata,
    isGroupMemberRemoved,
    isMember,
    isVideoFileProcessing,
    listChatMembers,
    listChatsForUser,
    listMessageFilesByMessageIds,
    listUsers,
    removeAvatarByUrl,
    clearGroupMemberRemoved,
    markGroupMemberRemoved,
    removeChatMember,
    regenerateGroupInviteToken,
    removeUploadedFiles,
    requireSession,
    requireSessionUsernameMatch,
    searchUsers,
    searchPublicGroups,
    setChatMuted,
    updateGroupChat,
    unhideChat,
    uploadAvatar,
  } = deps;

  const resolveClientBaseOrigin = (req) => {
    const referer = String(req.headers?.referer || "").trim();
    let refererOrigin = "";
    if (referer) {
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        refererOrigin = "";
      }
    }

    const originHeader = String(req.headers?.origin || "").trim();
    const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim();
    const forwardedHost = String(req.headers?.["x-forwarded-host"] || "")
      .split(",")[0]
      .trim();
    const fallbackOrigin = `${forwardedProto || req.protocol}://${forwardedHost || req.get("host")}`;
    return (refererOrigin || originHeader || fallbackOrigin).replace(/\/+$/, "");
  };

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

  app.post("/api/chats/group", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const {
      creator,
      nickname,
      username,
      visibility,
      allowMemberInvites = true,
      members = [],
    } = req.body || {};

    if (!creator) {
      return res.status(400).json({ error: "Creator is required." });
    }
    if (!requireSessionUsernameMatch(res, session, creator)) return;

    const creatorUser = findUserByUsername(String(creator).toLowerCase());
    if (!creatorUser) {
      return res.status(404).json({ error: "Creator not found." });
    }

    const groupNickname = String(nickname || "").trim();
    const groupUsername = String(username || "")
      .trim()
      .toLowerCase();
    if (!groupNickname) {
      return res.status(400).json({ error: "Group nickname is required." });
    }
    if (!groupUsername) {
      return res.status(400).json({ error: "Group username is required." });
    }
    if (groupUsername.length < 3) {
      return res
        .status(400)
        .json({ error: "Group username must be at least 3 characters." });
    }
    if (!USERNAME_REGEX.test(groupUsername)) {
      return res.status(400).json({
        error:
          "Group username can only include english letters, numbers, dot (.), and underscore (_).",
      });
    }

    if (findChatByGroupUsername(groupUsername)) {
      return res.status(409).json({ error: "Group username already exists." });
    }

    const normalizedVisibility =
      String(visibility || "").toLowerCase() === "private"
        ? "private"
        : "public";
    const inviteToken = crypto.randomBytes(24).toString("hex");
    const chatId = createChat(groupNickname, "group", {
      groupUsername,
      groupVisibility: normalizedVisibility,
      inviteToken,
      createdByUserId: creatorUser.id,
      allowMemberInvites: Boolean(allowMemberInvites),
    });

    if (!chatId) {
      return res.status(500).json({ error: "Failed to create group." });
    }

    addChatMember(chatId, creatorUser.id, "owner");
    const memberSet = new Set(
      (Array.isArray(members) ? members : [])
        .map((value) => String(value || "").toLowerCase())
        .filter(Boolean),
    );
    memberSet.delete(String(creatorUser.username || "").toLowerCase());
    memberSet.forEach((memberUsername) => {
      const member = findUserByUsername(memberUsername);
      if (member) addChatMember(chatId, member.id, "member");
    });

    const baseOrigin = resolveClientBaseOrigin(req);
    const inviteLink = `${baseOrigin}/invite/${inviteToken}`;
    return res.json({
      id: Number(chatId),
      inviteToken,
      inviteLink,
      visibility: normalizedVisibility,
    });
  });

  app.get("/api/groups/invite/:token", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const token = String(req.params?.token || "").trim();
    if (!token) {
      return res.status(400).json({ error: "Invite token is required." });
    }

    const chat = findChatByInviteToken(token);
    if (!chat) {
      return res.status(404).json({ error: "Invite link is invalid." });
    }

    const user = findUserByUsername(String(session.username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const members = listChatMembers(Number(chat.id)).map((member) => ({
      ...member,
      avatar_url: ensureAvatarExists(member.id, member.avatar_url),
    }));

    return res.json({
      group: {
        id: Number(chat.id),
        name: chat.name || "Group",
        username: chat.group_username || "",
        color: chat.group_color || "#10b981",
        avatarUrl: chat.group_avatar_url || null,
        visibility: chat.group_visibility || "public",
        allowMemberInvites: Boolean(Number(chat.allow_member_invites || 0)),
        membersCount: members.length,
      },
      alreadyMember: isMember(Number(chat.id), Number(user.id)),
    });
  });

  app.post("/api/groups/invite/:token/join", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const token = String(req.params?.token || "").trim();
    const suppliedUsername = req.body?.username?.toString();
    if (suppliedUsername && !requireSessionUsernameMatch(res, session, suppliedUsername)) {
      return;
    }
    if (!token) {
      return res.status(400).json({ error: "Invite token is required." });
    }

    const chat = findChatByInviteToken(token);
    if (!chat) {
      return res.status(404).json({ error: "Invite link is invalid." });
    }

    const user = findUserByUsername(String(session.username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const chatId = Number(chat.id);
    // Re-show chats that were previously hidden from this user's list.
    unhideChat(user.id, chatId);
    if (isGroupMemberRemoved(chatId, user.id)) {
      return res.status(403).json({
        error: "You were removed from this group. Only the owner can re-add you.",
      });
    }
    const wasMember = isMember(chatId, user.id);
    if (!wasMember) {
      addChatMember(chatId, user.id, "member");
      createMessage(chatId, user.id, `[[system:joined:${user.nickname || user.username}]]`);
      try {
        emitChatEvent(chatId, {
          type: "chat_message",
          chatId,
          username: user.username,
          body: `[[system:joined:${user.nickname || user.username}]]`,
        });
      } catch {
        // Joining should not fail due to transient event broadcast issues.
      }
    }
    unhideChat(user.id, chatId);

    return res.json({
      ok: true,
      id: chatId,
      alreadyMember: wasMember,
    });
  });

  app.get("/api/chats/group/:chatId/invite-link", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params?.chatId || 0);
    if (!chatId) {
      return res.status(400).json({ error: "Group chat id is required." });
    }

    const chat = findChatById(chatId);
    if (!chat || chat.type !== "group") {
      return res.status(404).json({ error: "Group not found." });
    }

    const user = findUserByUsername(String(session.username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (!isMember(chatId, user.id)) {
      return res.status(403).json({ error: "Not a member of this group." });
    }

    const members = listChatMembers(chatId);
    const isOwner = members.some(
      (member) =>
        Number(member.id) === Number(user.id) &&
        String(member.role || "").toLowerCase() === "owner",
    );
    const allowMemberInvites = Boolean(Number(chat.allow_member_invites || 0));
    if (!isOwner && !allowMemberInvites) {
      return res.status(403).json({ error: "Only group owner can share invite link." });
    }

    const baseOrigin = resolveClientBaseOrigin(req);

    return res.json({
      inviteToken: chat.invite_token || "",
      inviteLink: `${baseOrigin}/invite/${chat.invite_token}`,
      allowMemberInvites,
      isOwner,
    });
  });

  app.post("/api/chats/group/:chatId/regenerate-invite", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params?.chatId || 0);
    const username = req.body?.username?.toString();
    if (!chatId || !username) {
      return res.status(400).json({ error: "Group chat id and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const chat = findChatById(chatId);
    if (!chat || chat.type !== "group") {
      return res.status(404).json({ error: "Group not found." });
    }
    const members = listChatMembers(chatId);
    const isOwner = members.some(
      (member) =>
        Number(member.id) === Number(user.id) &&
        String(member.role || "").toLowerCase() === "owner",
    );
    if (!isOwner) {
      return res.status(403).json({ error: "Only group owner can regenerate invite link." });
    }

    const inviteToken = crypto.randomBytes(24).toString("hex");
    regenerateGroupInviteToken(chatId, inviteToken);
    const baseOrigin = resolveClientBaseOrigin(req);
    return res.json({
      ok: true,
      inviteToken,
      inviteLink: `${baseOrigin}/invite/${inviteToken}`,
    });
  });

  app.put("/api/chats/group/:chatId", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params?.chatId || 0);
    if (!chatId) {
      return res.status(400).json({ error: "Group chat id is required." });
    }

    const {
      username,
      nickname,
      groupUsername,
      visibility,
      allowMemberInvites = true,
      members: memberUsernames = [],
    } = req.body || {};
    if (!username) {
      return res.status(400).json({ error: "Username is required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const chat = findChatById(chatId);
    if (!chat || chat.type !== "group") {
      return res.status(404).json({ error: "Group not found." });
    }

    const chatMembers = listChatMembers(chatId);
    const isOwner = chatMembers.some(
      (member) =>
        Number(member.id) === Number(user.id) &&
        String(member.role || "").toLowerCase() === "owner",
    );
    if (!isOwner) {
      return res.status(403).json({ error: "Only group owner can edit this group." });
    }

    const normalizedNickname = String(nickname || "").trim();
    const normalizedGroupUsername = String(groupUsername || "")
      .trim()
      .toLowerCase();
    if (!normalizedNickname) {
      return res.status(400).json({ error: "Group nickname is required." });
    }
    if (normalizedGroupUsername.length < 3) {
      return res.status(400).json({ error: "Group username must be at least 3 characters." });
    }
    if (!USERNAME_REGEX.test(normalizedGroupUsername)) {
      return res.status(400).json({
        error:
          "Group username can only include english letters, numbers, dot (.), and underscore (_).",
      });
    }

    const existing = findChatByGroupUsername(normalizedGroupUsername);
    if (existing && Number(existing.id) !== chatId) {
      return res.status(409).json({ error: "Group username already exists." });
    }

    updateGroupChat(chatId, {
      name: normalizedNickname,
      groupUsername: normalizedGroupUsername,
      groupVisibility: visibility,
      allowMemberInvites: Boolean(allowMemberInvites),
    });

    const nextMembers = new Set(
      (Array.isArray(memberUsernames) ? memberUsernames : [])
        .map((item) => String(item || "").toLowerCase())
        .filter(Boolean),
    );
    nextMembers.delete(String(user.username || "").toLowerCase());
    nextMembers.forEach((memberUsername) => {
      const member = findUserByUsername(memberUsername);
      if (!member) return;
      if (isMember(chatId, member.id)) return;
      clearGroupMemberRemoved(chatId, member.id);
      addChatMember(chatId, member.id, "member");
      createMessage(
        chatId,
        user.id,
        `[[system:joined:${member.nickname || member.username}]]`,
      );
      emitChatEvent(chatId, {
        type: "chat_message",
        chatId,
        username: user.username,
        body: `[[system:joined:${member.nickname || member.username}]]`,
      });
    });

    const updated = findChatById(chatId);
    return res.json({
      ok: true,
      group: updated,
    });
  });

  app.post("/api/chats/group/:chatId/leave", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params?.chatId || 0);
    const username = req.body?.username?.toString();
    if (!chatId || !username) {
      return res.status(400).json({ error: "Group chat id and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const chat = findChatById(chatId);
    if (!chat || chat.type !== "group") {
      return res.status(404).json({ error: "Group not found." });
    }
    if (!isMember(chatId, user.id)) {
      return res.status(400).json({ error: "You are not a member of this group." });
    }

    removeChatMember(chatId, user.id);
    createMessage(chatId, user.id, `[[system:left:${user.nickname || user.username}]]`);
    emitChatEvent(chatId, {
      type: "chat_message",
      chatId,
      username: user.username,
      body: `[[system:left:${user.nickname || user.username}]]`,
    });
    return res.json({ ok: true });
  });

  app.post("/api/chats/group/:chatId/remove-member", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params?.chatId || 0);
    const username = req.body?.username?.toString();
    const targetUsername = req.body?.targetUsername?.toString();
    if (!chatId || !username || !targetUsername) {
      return res.status(400).json({
        error: "Group chat id, username, and targetUsername are required.",
      });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const actor = findUserByUsername(String(username || "").toLowerCase());
    const target = findUserByUsername(String(targetUsername || "").toLowerCase());
    if (!actor || !target) {
      return res.status(404).json({ error: "User not found." });
    }
    const chat = findChatById(chatId);
    if (!chat || chat.type !== "group") {
      return res.status(404).json({ error: "Group not found." });
    }

    const members = listChatMembers(chatId);
    const actorMember = members.find((member) => Number(member.id) === Number(actor.id));
    if (!actorMember || String(actorMember.role || "").toLowerCase() !== "owner") {
      return res.status(403).json({ error: "Only group owner can remove members." });
    }
    const targetMember = members.find((member) => Number(member.id) === Number(target.id));
    if (!targetMember) {
      return res.status(400).json({ error: "Target user is not a group member." });
    }
    if (String(targetMember.role || "").toLowerCase() === "owner") {
      return res.status(400).json({ error: "Owner cannot be removed." });
    }

    removeChatMember(chatId, target.id);
    markGroupMemberRemoved(chatId, target.id, actor.id);
    createMessage(
      chatId,
      actor.id,
      `[[system:removed:${target.nickname || target.username}]]`,
    );
    emitChatEvent(chatId, {
      type: "chat_message",
      chatId,
      username: actor.username,
      body: `[[system:removed:${target.nickname || target.username}]]`,
    });
    return res.json({ ok: true });
  });

  app.post(
    "/api/chats/group/:chatId/avatar",
    uploadAvatar.single("avatar"),
    (req, res) => {
      const session = requireSession(req, res);
      if (!session) {
        removeUploadedFiles(req.file ? [req.file] : [], avatarUploadRootDir);
        return;
      }

      const chatId = Number(req.params?.chatId || 0);
      const username = req.body?.username?.toString();
      const file = req.file;
      if (!chatId || !username) {
        removeUploadedFiles(file ? [file] : [], avatarUploadRootDir);
        return res
          .status(400)
          .json({ error: "Group chat id and username are required." });
      }
      if (!requireSessionUsernameMatch(res, session, username)) {
        removeUploadedFiles(file ? [file] : [], avatarUploadRootDir);
        return;
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

      const chat = findChatById(chatId);
      if (!chat || chat.type !== "group") {
        removeUploadedFiles([file], avatarUploadRootDir);
        return res.status(404).json({ error: "Group not found." });
      }
      const user = findUserByUsername(String(username || "").toLowerCase());
      if (!user) {
        removeUploadedFiles([file], avatarUploadRootDir);
        return res.status(404).json({ error: "User not found." });
      }
      const members = listChatMembers(chatId);
      const isOwner = members.some(
        (member) =>
          Number(member.id) === Number(user.id) &&
          String(member.role || "").toLowerCase() === "owner",
      );
      if (!isOwner) {
        removeUploadedFiles([file], avatarUploadRootDir);
        return res
          .status(403)
          .json({ error: "Only group owner can update group avatar." });
      }

      const avatarUrl = `/api/uploads/avatars/${file.filename}`;
      if (String(chat.group_avatar_url || "").trim() && chat.group_avatar_url !== avatarUrl) {
        removeAvatarByUrl(chat.group_avatar_url);
      }

      updateGroupChat(chatId, {
        name: chat.name,
        groupUsername: chat.group_username,
        groupVisibility: chat.group_visibility,
        allowMemberInvites: Boolean(Number(chat.allow_member_invites || 0)),
        groupAvatarUrl: avatarUrl,
      });

      return res.json({
        ok: true,
        avatarUrl,
        maxFileSizeBytes: AVATAR_FILE_LIMITS.maxFileSizeBytes,
      });
    },
  );

  app.put("/api/chats/:chatId/mute", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params?.chatId || 0);
    const username = req.body?.username?.toString();
    const muted = Boolean(req.body?.muted);
    if (!chatId || !username) {
      return res.status(400).json({ error: "Chat id and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const chat = findChatById(chatId);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }
    if (!isMember(chatId, user.id)) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    setChatMuted(user.id, chatId, muted);
    return res.json({ ok: true, chatId, muted });
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

  app.post("/api/chats/group/:chatId/join-public", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params?.chatId || 0);
    const username = req.body?.username?.toString();
    if (!chatId || !username) {
      return res.status(400).json({ error: "Group chat id and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const chat = findChatById(chatId);
    if (!chat || chat.type !== "group") {
      return res.status(404).json({ error: "Group not found." });
    }
    if (String(chat.group_visibility || "").toLowerCase() !== "public") {
      return res.status(403).json({ error: "This group is private." });
    }
    if (isGroupMemberRemoved(chatId, user.id)) {
      return res.status(403).json({
        error: "You were removed from this group. Only the owner can re-add you.",
      });
    }

    unhideChat(user.id, chatId);
    const alreadyMember = isMember(chatId, user.id);
    if (!alreadyMember) {
      addChatMember(chatId, user.id, "member");
      createMessage(chatId, user.id, `[[system:joined:${user.nickname || user.username}]]`);
      emitChatEvent(chatId, {
        type: "chat_message",
        chatId,
        username: user.username,
        body: `[[system:joined:${user.nickname || user.username}]]`,
      });
    }

    return res.json({
      ok: true,
      id: chatId,
      alreadyMember,
    });
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

  app.get("/api/discover", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const username = req.query.username?.toString();
    const query = String(req.query.query || "").trim();
    if (!username || !query) {
      return res.status(400).json({ error: "Username and query are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const users = searchUsers(query.toLowerCase(), username)
      .map((item) => ({
        ...item,
        avatar_url: ensureAvatarExists(item.id, item.avatar_url),
      }))
      .slice(0, 20);

    const groups = searchPublicGroups(query.toLowerCase(), user.id, 20).map((group) => ({
      id: Number(group.id),
      name: group.name || "Group",
      username: group.group_username || "",
      color: group.group_color || "#10b981",
      avatarUrl: group.group_avatar_url || null,
      inviteToken: group.invite_token || "",
      membersCount: Number(group.members_count || 0),
      isMember: Boolean(Number(group.is_member || 0)),
    }));

    return res.json({ users, groups });
  });
}

export { registerChatRoutes };

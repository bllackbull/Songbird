import rateLimit from "express-rate-limit";
import { createMessagePublicationService } from "../lib/services/messagePublicationService.js";

function registerMessageRoutes(app, deps) {
  const {
    MESSAGE_FILE_LIMITS,
    getSetting,
    cleanupMissingMessageFiles,
    computeExpiryIso,
    crypto,
    createMessage,
    createOrReuseMessage,
    createMessageFiles,
    editMessage,
    debugLog,
    decodeOriginalFilename,
    emitChatEvent,
    emitSseEvent,
    ensureAvatarExists,
    ensureFfmpegAvailable,
    fs,
    findChatById,
    findMessageIdByClientRequestId,
    findMessageById,
    findUserById,
    findUserByUsername,
    getMessages,
    getFirstUnreadMessage,
    hideMessageForEveryone,
    hideMessageForUser,
    getMessageReadCounts,
    getMessageAuthors,
    getMessageReadByUser,
    getUploadKind,
    hasEnoughFreeDiskSpace,
    hydrateMissingVideoMetadata,
    inferMimeFromFilename,
    isDangerousUploadFile,
    isMember,
    isVideoFileProcessing,
    getChatMemberRole,
    listChatMembers,
    listMutedUserIdsForChat,
    sendPushNotificationToUsers,
    isUserConnected,
    listMessageFilesByMessageIds,
    parseUploadFileMetadata,
    path,
    probeVideoMetadata,
    removeUploadedFiles,
    requireSession,
    requireSessionUsernameMatch,
    sanitizeDurationSeconds,
    sanitizePositiveInt,
    setMessageExpiresAt,
    setMessageForwardOrigin,
    storageEncryption,
    unhideChat,
    uploadFiles,
    uploadRootDir,
    enqueueVideoTranscodeJob,
    markMessagesRead,
    markMessageRead,
  } = deps;

  const messagePubService = createMessagePublicationService({
    createOrReuseMessage,
    createMessageFiles,
    editMessage,
    findChatById,
    findMessageById,
    listChatMembers,
    listMutedUserIdsForChat,
    markMessageRead,
    setMessageExpiresAt,
    setMessageForwardOrigin,
  });

  const computeTextExpiryIso = (createdAt) => {
    const textRetentionDays = Number(getSetting("MESSAGE_TEXT_RETENTION") || 0);
    if (textRetentionDays <= 0) return null;
    const base = new Date(createdAt || Date.now());
    const baseMs = base.getTime();
    if (!Number.isFinite(baseMs)) return null;
    return new Date(
      baseMs + textRetentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
  };

  const canUserPostInChat = async (chatId, userId, chat = null) => {
    const rawChat = chat || findChatById(Number(chatId));
    const resolvedChat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (!resolvedChat) return false;
    if (resolvedChat.type !== "channel") return true;
    const rawRole = getChatMemberRole(Number(chatId), Number(userId));
    const role = String(rawRole && typeof rawRole.then === "function" ? await rawRole : rawRole).toLowerCase();
    return role === "owner";
  };

  const messageRateLimitHandler = (_req, res) =>
    res.status(429).json({
      error: "Too many message requests. Please try again later.",
    });

  const messageUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: messageRateLimitHandler,
  });

  const messageEditLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: messageRateLimitHandler,
  });

  const isRemoteChannelMessage = (message) =>
    /^remote:/i.test(
      String(message?.client_request_id || message?.clientRequestId || "").trim(),
    );

  const isMessageAuthoredByUser = (message, userId) =>
    Number(message?.user_id || 0) === Number(userId) &&
    !isRemoteChannelMessage(message);

  const normalizeForwardOriginAvatarUrl = (userId, avatarUrl) => {
    const normalized = ensureAvatarExists(userId, avatarUrl);
    return String(normalized || "").trim() || null;
  };

  const deriveForwardOrigin = (sourceMessage, sourceChat) => {
    if (String(sourceChat?.type || "").toLowerCase() === "channel") {
      const label =
        String(sourceChat?.name || "").trim() ||
        String(sourceChat?.group_username || "").trim() ||
        "Channel";
      return {
        sourceChatId: Number(sourceChat?.id || 0) || null,
        label,
        sourceUserId: null,
        sourceUsername: null,
        sourceAvatarUrl: null,
        sourceColor: null,
      };
    }

    const sourceUser = findUserById(Number(sourceMessage?.user_id || 0));
    const sourceUserId = Number(sourceUser?.id || sourceMessage?.user_id || 0) || null;
    const sourceUsername = String(sourceUser?.username || "").trim() || null;
    const label =
      String(sourceUser?.nickname || "").trim() ||
      String(sourceUser?.username || "").trim() ||
      "Deleted user";

    return {
      sourceChatId: null,
      label,
      sourceUserId,
      sourceUsername,
      sourceAvatarUrl: sourceUser
        ? normalizeForwardOriginAvatarUrl(sourceUser.id, sourceUser.avatar_url)
        : null,
      sourceColor: String(sourceUser?.color || "").trim() || null,
    };
  };

  const reuseMessageFilesForForward = (sourceMessageId, targetMessageId) => {
    const sourceFiles = listMessageFilesByMessageIds([Number(sourceMessageId)]);
    if (!sourceFiles.length) return [];

    const reusedFiles = sourceFiles.flatMap((file) => {
      const storedName = path.basename(String(file?.stored_name || "").trim());
      if (!storedName) return [];
      const sourcePath = path.join(uploadRootDir, storedName);
      if (!fs.existsSync(sourcePath)) return [];

      return [
        {
          kind: file.kind,
          originalName: file.original_name,
          storedName,
          mimeType: file.mime_type,
          sizeBytes: Number(file.size_bytes || 0),
          widthPx: Number.isFinite(Number(file.width_px)) ? Number(file.width_px) : null,
          heightPx: Number.isFinite(Number(file.height_px)) ? Number(file.height_px) : null,
          durationSeconds: Number.isFinite(Number(file.duration_seconds))
            ? Number(file.duration_seconds)
            : null,
          expiresAt: file.expires_at || null,
        },
      ];
    });

    if (reusedFiles.length) {
      createMessageFiles(Number(targetMessageId), reusedFiles);
    }

    return reusedFiles;
  };

  app.get("/api/messages", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.query.chatId);
    const username = req.query.username?.toString();
    const beforeId = Number(req.query.beforeId || 0);
    const beforeCreatedAt = req.query.beforeCreatedAt?.toString() || "";
    const afterId = Number(req.query.afterId || 0);
    const afterCreatedAt = req.query.afterCreatedAt?.toString() || "";
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(10000, limitRaw))
      : 50;

    if (!chatId || !username) {
      return res.status(400).json({ error: "Chat and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const rawIsMember = isMember(chatId, user.id);
    const memberCheck = rawIsMember && typeof rawIsMember.then === "function" ? await rawIsMember : rawIsMember;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const rawMsgData = getMessages(chatId, {
      beforeId: beforeId > 0 ? beforeId : null,
      beforeCreatedAt: beforeCreatedAt || null,
      afterId: afterId > 0 ? afterId : null,
      afterCreatedAt: afterCreatedAt || null,
      limit,
      viewerUserId: user.id,
    });
    let { messages, hasMore } = (rawMsgData && typeof rawMsgData.then === "function" ? await rawMsgData : rawMsgData) || { messages: [], hasMore: false };

    // Run the missing-file cleanup in the background so it doesn't block the
    // response. If files are found missing the next fetch will reflect the
    // deletion via the SSE chat_message_deleted event emitted by the cleanup.
    setImmediate(() => {
      try {
        const cleanup = cleanupMissingMessageFiles(
          messages.map((message) => Number(message.id)).filter(Boolean),
        );
        if (cleanup.changed && cleanup.deletedByChat?.size) {
          cleanup.deletedByChat.forEach((messageIds, deletedChatId) => {
            emitChatEvent(Number(deletedChatId), {
              type: "chat_message_deleted",
              chatId: Number(deletedChatId),
              messageIds,
            });
          });
        }
      } catch (_) {
        // best-effort background cleanup — never crash the server
      }
    });

    const normalizedMessages = messages.map((message) => ({
      ...message,
      avatar_url: ensureAvatarExists(message.user_id, message.avatar_url),
      replyTo:
        Number(message?.reply_id || 0) > 0
          ? {
              id: Number(message.reply_id),
              body: message.reply_body || "",
              created_at: message.reply_created_at || null,
              username: message.reply_username || "",
              nickname: message.reply_nickname || "",
              color: message.reply_user_color || null,
              verified: Boolean(message.reply_user_verified),
              role: message.reply_user_role || "user",
              avatar_url: ensureAvatarExists(
                message.reply_user_id || null,
                message.reply_avatar_url,
              ),
            }
          : null,
    }));

    const messageIds = normalizedMessages
      .map((message) => Number(message.id))
      .filter(Boolean);
    const rawReadRows = getMessageReadByUser(messageIds, user.id);
    const readRows = (rawReadRows && typeof rawReadRows.then === "function" ? await rawReadRows : rawReadRows) || [];
    const readByMe = new Set(
      readRows.map((row) => Number(row?.message_id || 0)).filter(Boolean),
    );
    const rawFiles = listMessageFilesByMessageIds(messageIds);
    const resolvedFiles = (rawFiles && typeof rawFiles.then === "function" ? await rawFiles : rawFiles) || [];
    const files = await hydrateMissingVideoMetadata(resolvedFiles);

    const filesByMessageId = files.reduce((acc, file) => {
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

    const enriched = normalizedMessages
      .map((message) => ({
        ...message,
        clientRequestId: message.client_request_id || null,
        read_by_me:
          isMessageAuthoredByUser(message, user.id) ||
          readByMe.has(Number(message.id)),
        files: filesByMessageId[Number(message.id)] || [],
        expiresAt: null,
      }))
      .map((message) => ({
        ...message,
        expiresAt:
          Array.isArray(message.files) && message.files.length === 0
            ? message.expires_at || null
            : null,
      }))
      .filter((message) => {
        const isFromOther = !isMessageAuthoredByUser(message, user.id);
        if (!isFromOther) return true;

        const hasPendingVideo = (message.files || []).some(
          (file) =>
            String(file?.mimeType || "")
              .toLowerCase()
              .startsWith("video/") && Boolean(file?.processing),
        );

        return !hasPendingVideo;
      });

    if (getSetting("APP_DEBUG")) {
      const processingRows = [];

      enriched.forEach((message) => {
        const files = Array.isArray(message?.files) ? message.files : [];

        files.forEach((file) => {
          processingRows.push({
            messageId: Number(message?.id || 0),
            fileId: Number(file?.id || 0),
            mimeType: String(file?.mimeType || ""),
            url: String(file?.url || ""),
            processing: Boolean(file?.processing),
          });
        });
      });

      debugLog("api:messages:files", {
        chatId,
        username: user.username,
        files: processingRows,
      });
    }

    const rawChat = findChatById(chatId);
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (chat?.type === "channel" && messageIds.length) {
      const rawCountRows = getMessageReadCounts(messageIds);
      const countRows = (rawCountRows && typeof rawCountRows.then === "function" ? await rawCountRows : rawCountRows) || [];
      const counts = countRows.reduce((acc, row) => {
        const id = Number(row?.message_id || 0);
        if (!id) return acc;
        acc[id] = Number(row?.count || 0);
        return acc;
      }, {});
      
      // For regular messages (not remote), add +1 for the author
      // For remote messages, don't add the author count (starts at 0)
      enriched.forEach((msg) => {
        const id = Number(msg?.id || 0);
        if (!id) return;
        const isRemote = isRemoteChannelMessage(msg);
        if (!isRemote) {
          counts[id] = Number(counts[id] || 0) + 1;
        }
      });
      
      enriched.forEach((msg) => {
        const id = Number(msg?.id || 0);
        if (!id) return;
        // Remote messages start at 0 views, regular messages start at 1
        const isRemote = isRemoteChannelMessage(msg);
        const defaultCount = isRemote ? 0 : 1;
        msg.seenCount = Number(counts[id] || defaultCount);
      });
    }

    debugLog("api:messages", {
      chatId,
      username: user.username,
      messageCount: enriched.length,
      fileCount: files.length,
      hasMore,
    });

    res.json({ chatId, messages: enriched, hasMore });
  });

  app.get("/api/messages/first-unread", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.query.chatId);
    const username = req.query.username?.toString();

    if (!chatId || !username) {
      return res.status(400).json({ error: "Chat and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const rawIsMem = isMember(chatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const rawFirstUnread = getFirstUnreadMessage(chatId, user.id);
    const firstUnread = rawFirstUnread && typeof rawFirstUnread.then === "function" ? await rawFirstUnread : rawFirstUnread;
    res.json({ firstUnread: firstUnread || null });
  });

  app.post("/api/messages/read", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { chatId, username } = req.body || {};
    if (!chatId || !username) {
      return res.status(400).json({ error: "Chat and username are required." });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const rawIsMem = isMember(Number(chatId), user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const m = markMessagesRead(Number(chatId), user.id);
    if (m && typeof m.then === "function") await m;

    emitChatEvent(Number(chatId), {
      type: "chat_read",
      chatId: Number(chatId),
      username: user.username,
    });

    res.json({ ok: true });
  });

  app.post("/api/messages/read-one", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { chatId, username, messageId } = req.body || {};
    if (!chatId || !username || !messageId) {
      return res.status(400).json({
        error: "Chat id, username, and messageId are required.",
      });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const rawIsMem = isMember(Number(chatId), user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const rawMessage = findMessageById(Number(messageId));
    const message = rawMessage && typeof rawMessage.then === "function" ? await rawMessage : rawMessage;
    if (!message || Number(message.chat_id) !== Number(chatId)) {
      return res.status(404).json({ error: "Message not found in this chat." });
    }

    const m = markMessageRead(Number(messageId), user.id);
    if (m && typeof m.then === "function") await m;

    emitChatEvent(Number(chatId), {
      type: "chat_read",
      chatId: Number(chatId),
      messageId: Number(messageId),
      username: user.username,
    });

    res.json({ ok: true });
  });

  app.post("/api/messages/read-counts", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { chatId, username, messageIds = [] } = req.body || {};
    if (!chatId || !username || !Array.isArray(messageIds)) {
      return res.status(400).json({
        error: "Chat id, username, and messageIds are required.",
      });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const rawIsMem = isMember(Number(chatId), user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const authors = getMessageAuthors(messageIds);
    const messages = authors.reduce((acc, row) => {
      const id = Number(row?.id || 0);
      if (!id) return acc;
      acc[id] = row;
      return acc;
    }, {});
    
    const rows = getMessageReadCounts(messageIds);
    const counts = rows.reduce((acc, row) => {
      const id = Number(row?.message_id || 0);
      if (!id) return acc;
      acc[id] = Number(row?.count || 0);
      return acc;
    }, {});
    
    // For regular messages (not remote), add +1 for the author
    // For remote messages, don't add the author count (starts at 0)
    Object.keys(messages).forEach((key) => {
      const id = Number(key);
      if (!id) return;
      const msg = messages[id];
      const isRemote = isRemoteChannelMessage(msg);
      if (!isRemote) {
        counts[id] = Number(counts[id] || 0) + 1;
      }
    });

    res.json({ ok: true, counts });
  });

  app.post("/api/messages/typing", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { chatId, username, isTyping } = req.body || {};
    if (!chatId || !username || typeof isTyping !== "boolean") {
      return res.status(400).json({
        error: "Chat id, username, and isTyping are required.",
      });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(String(username || "").toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const numericChatId = Number(chatId);
    if (!isMember(numericChatId, user.id)) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const chat = findChatById(numericChatId);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }
    if (String(chat.type || "").toLowerCase() === "channel") {
      return res.json({ ok: true, skipped: true });
    }

    // Invisible users should not broadcast typing start state.
    if (
      Boolean(isTyping) &&
      String(user.status || "").toLowerCase() === "invisible"
    ) {
      return res.json({ ok: true, skipped: true });
    }

    emitChatEvent(numericChatId, {
      type: "chat_typing",
      chatId: numericChatId,
      username: user.username,
      nickname: user.nickname || user.username,
      isTyping: Boolean(isTyping),
      createdAt: new Date().toISOString(),
    });

    return res.json({ ok: true });
  });

  app.post(
    "/api/messages/upload",
    messageUploadLimiter,
    uploadFiles.array("files", MESSAGE_FILE_LIMITS.maxFiles),
    async (req, res) => {
      const session = await requireSession(req, res);
      if (!session) {
        removeUploadedFiles(req.files || []);
        return;
      }

      if (!Array.isArray(req.files)) {
        return res.status(400).json({ error: "Invalid files payload." });
      }

      const uploadedFiles = req.files;

      try {
        if (!getSetting("FILE_UPLOAD")) {
          removeUploadedFiles(uploadedFiles);
          return res
            .status(503)
            .json({ error: "File uploads are disabled on this server." });
        }

        const chatId = Number(req.body?.chatId);
        const username = req.body?.username?.toString();
        const uploadType = req.body?.uploadType?.toString();
        const fileMeta = parseUploadFileMetadata(req.body?.fileMeta);
        const body = req.body?.body?.toString() || "";
        const trimmedBody = body.trim();
        const replyToMessageId = Number(req.body?.replyToMessageId || 0) || null;
        const editMessageId = Number(req.body?.editMessageId || 0) || null;
        const clientRequestIdRaw = String(
          req.body?.clientRequestId || "",
        ).trim();
        const clientRequestId = clientRequestIdRaw
          ? clientRequestIdRaw.slice(0, 120)
          : null;
        const maxMessageChars = Math.max(1, Number(getSetting("MESSAGE_MAX_CHARS") || 4000));
        if (body.length > maxMessageChars) {
          removeUploadedFiles(uploadedFiles);
          return res.status(400).json({
            error: `Message must be at most ${maxMessageChars} characters.`,
          });
        }

        if (!chatId || !username) {
          removeUploadedFiles(uploadedFiles);

          return res
            .status(400)
            .json({ error: "Chat and username are required." });
        }

        if (!requireSessionUsernameMatch(res, session, username)) {
          removeUploadedFiles(uploadedFiles);
          return;
        }

        if (!uploadedFiles.length) {
          return res
            .status(400)
            .json({ error: "At least one file is required." });
        }

        if (uploadedFiles.length > MESSAGE_FILE_LIMITS.maxFiles) {
          removeUploadedFiles(uploadedFiles);

          return res.status(400).json({
            error: `Maximum ${MESSAGE_FILE_LIMITS.maxFiles} files per message.`,
          });
        }

        const rawUser = findUserByUsername(username.toLowerCase());
        const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;

        if (!user) {
          removeUploadedFiles(uploadedFiles);

          return res.status(404).json({ error: "User not found." });
        }

        const rawIsMember = isMember(chatId, user.id);
        const memberCheck = rawIsMember && typeof rawIsMember.then === "function" ? await rawIsMember : rawIsMember;
        if (!memberCheck) {
          removeUploadedFiles(uploadedFiles);

          return res.status(403).json({ error: "Not a member of this chat." });
        }
        const rawChat = findChatById(chatId);
        const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
        if (!chat) {
          removeUploadedFiles(uploadedFiles);
          return res.status(404).json({ error: "Chat not found." });
        }
        if (chat.type === "channel") {
          const rawRole = getChatMemberRole(chatId, user.id);
          const role = String(rawRole && typeof rawRole.then === "function" ? await rawRole : rawRole).toLowerCase();
          if (role !== "owner") {
            removeUploadedFiles(uploadedFiles);
            return res
              .status(403)
              .json({ error: "Only channel owner can send messages." });
          }
        }
        if (replyToMessageId && editMessageId) {
          removeUploadedFiles(uploadedFiles);
          return res.status(400).json({
            error: "A message cannot be edited and replied to at the same time.",
          });
        }
        if (replyToMessageId) {
          const replyTarget = findMessageById(replyToMessageId);
          if (!replyTarget || Number(replyTarget.chat_id) !== Number(chatId)) {
            removeUploadedFiles(uploadedFiles);
            return res
              .status(400)
              .json({ error: "Reply target is not available in this chat." });
          }
        }
        let editTarget = null;
        if (editMessageId) {
          editTarget = findMessageById(editMessageId);
          if (!editTarget || Number(editTarget.chat_id) !== Number(chatId)) {
            removeUploadedFiles(uploadedFiles);
            return res.status(400).json({
              error: "Edit target is not available in this chat.",
            });
          }
          if (!isMessageAuthoredByUser(editTarget, user.id)) {
            removeUploadedFiles(uploadedFiles);
            return res.status(403).json({
              error: "Only the message author can edit this message.",
            });
          }
        }

        const totalBytes = uploadedFiles.reduce(
          (sum, file) => sum + Number(file.size || 0),
          0,
        );

        if (totalBytes > MESSAGE_FILE_LIMITS.maxTotalBytes) {
          removeUploadedFiles(uploadedFiles);

          return res.status(400).json({
            error: `Total upload size cannot exceed ${Math.round(MESSAGE_FILE_LIMITS.maxTotalBytes / (1024 * 1024))} MB.`,
          });
        }

        if (!hasEnoughFreeDiskSpace(totalBytes)) {
          removeUploadedFiles(uploadedFiles);

          return res.status(400).json({
            error: "Not enough free storage space on server.",
          });
        }

        if (!editMessageId && clientRequestId) {
          const existingId = findMessageIdByClientRequestId(
            chatId,
            user.id,
            clientRequestId,
          );
          if (existingId) {
            removeUploadedFiles(uploadedFiles);
            return res.json({ id: Number(existingId), deduped: true });
          }
        }

        const createdAtIso = new Date().toISOString();
        const expiresAtIso = computeExpiryIso(
          createdAtIso,
          getSetting("MESSAGE_FILE_RETENTION"),
        );

        const normalizedFiles = uploadedFiles.map((file, index) => {
          const originalName = decodeOriginalFilename(
            file.originalname || "file",
          );
          const inferredMime = inferMimeFromFilename(originalName);
          const mimeType = (
            file.mimetype ||
            inferredMime ||
            "application/octet-stream"
          ).toLowerCase();

          if (isDangerousUploadFile(originalName, mimeType)) {
            throw new Error(
              "This file type is not allowed for security reasons.",
            );
          }

          const kind = getUploadKind(uploadType, mimeType);
          if (!kind) {
            throw new Error("Invalid file type for selected upload option.");
          }

          const meta = fileMeta[index] || {};

          return {
            kind,
            originalName,
            storedName: path.basename(file.filename),
            mimeType,
            sizeBytes: Number(file.size || 0),
            widthPx: sanitizePositiveInt(meta.width),
            heightPx: sanitizePositiveInt(meta.height),
            durationSeconds: sanitizeDurationSeconds(meta.durationSeconds),
            expiresAt: expiresAtIso,
          };
        });

        const hasVideoFiles = normalizedFiles.some((file) =>
          String(file.mimeType || "")
            .toLowerCase()
            .startsWith("video/"),
        );
        const shouldTranscodeVideos =
          getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS") &&
          String(uploadType || "").toLowerCase() === "media";

        debugLog("api:messages/upload:start", {
          chatId,
          username: String(username || "").toLowerCase(),
          fileCount: normalizedFiles.length,
          hasVideoFiles,
          transcodeEnabled: shouldTranscodeVideos,
          uploadType,
        });

        if (shouldTranscodeVideos && hasVideoFiles) {
          await ensureFfmpegAvailable();
        }

        if (hasVideoFiles && String(uploadType || "").toLowerCase() === "media") {
          await Promise.all(
            normalizedFiles.map(async (file) => {
              const mimeType = String(file?.mimeType || "").toLowerCase();
              if (!mimeType.startsWith("video/")) return;
              if (file.widthPx && file.heightPx && file.durationSeconds !== null)
                return;

              const storedName = path.basename(
                String(file?.storedName || "").trim(),
              );
              if (!storedName) return;

              const inputPath = path.join(uploadRootDir, storedName);
              const metadata = await probeVideoMetadata(inputPath);

              if (!file.widthPx && metadata.widthPx) {
                file.widthPx = metadata.widthPx;
              }
              if (!file.heightPx && metadata.heightPx) {
                file.heightPx = metadata.heightPx;
              }
              if (
                file.durationSeconds === null &&
                metadata.durationSeconds !== null
              ) {
                file.durationSeconds = metadata.durationSeconds;
              }
            }),
          );
        }

        normalizedFiles.forEach((file) => {
          const storedName = path.basename(String(file?.storedName || "").trim());
          if (!storedName) return;

          const inputPath = path.join(uploadRootDir, storedName);
          storageEncryption.encryptFileInPlace(inputPath);
        });

        const summarizeFiles = (files) => {
          if (!Array.isArray(files) || files.length === 0) return "";
          const videoCount = files.filter((file) =>
            String(file.mimeType || "").toLowerCase().startsWith("video/"),
          ).length;
          const imageCount = files.filter((file) =>
            String(file.mimeType || "").toLowerCase().startsWith("image/"),
          ).length;
          const audioCount = files.filter((file) =>
            String(file.mimeType || "").toLowerCase().startsWith("audio/"),
          ).length;
          const docCount = Math.max(0, files.length - videoCount - imageCount - audioCount);
          if (files.length === 1) {
            if (videoCount === 1) return "Sent a video";
            if (imageCount === 1) return "Sent a photo";
            if (audioCount === 1) return "Sent a voice message";
            return "Sent a document";
          }
          if (audioCount > 0 && videoCount === 0 && imageCount === 0 && docCount === 0) {
            return `Sent ${audioCount} voice message${audioCount > 1 ? "s" : ""}`;
          }
          if (videoCount > 0 && imageCount === 0 && docCount === 0) {
            return `Sent ${videoCount} video${videoCount > 1 ? "s" : ""}`;
          }
          if (imageCount > 0 && videoCount === 0 && docCount === 0) {
            return `Sent ${imageCount} photo${imageCount > 1 ? "s" : ""}`;
          }
          if (docCount > 0 && imageCount === 0 && videoCount === 0) {
            return `Sent ${docCount} document${docCount > 1 ? "s" : ""}`;
          }
          return `Sent ${files.length} files`;
        };

        const fileSummaryText = summarizeFiles(normalizedFiles);
        const fallbackBody =
          trimmedBody ||
          (normalizedFiles.length === 1
            ? `Sent ${normalizedFiles[0].kind === "media" ? "a media file" : "a document"}`
            : `Sent ${normalizedFiles.length} files`);
        let messageId = Number(editMessageId || 0);
        let dedupedMessage = false;
        if (editTarget) {
          const editBody =
            trimmedBody ||
            editTarget.edited_body ||
            editTarget.body ||
            fallbackBody;
          editMessage(messageId, editBody);
          setMessageExpiresAt(messageId, null);
          createMessageFiles(messageId, normalizedFiles);
        } else {
          const rawCreated = createOrReuseMessage(
            chatId,
            user.id,
            fallbackBody,
            replyToMessageId,
            null,
            clientRequestId,
          );
          const created = rawCreated && typeof rawCreated.then === "function" ? await rawCreated : rawCreated;
          messageId = Number(created?.id || 0);
          dedupedMessage = Boolean(created?.deduped);
          if (!messageId) {
            throw new Error("Unable to create message.");
          }
          if (dedupedMessage) {
            removeUploadedFiles(uploadedFiles);
            return res.json({ id: Number(messageId), deduped: true });
          }
          createMessageFiles(messageId, normalizedFiles);
          if (chat.type === "saved") {
            markMessageRead(messageId, user.id);
          }
        }

        let transcodeJobsQueued = 0;

        if (shouldTranscodeVideos && hasVideoFiles) {
          const insertedRows = listMessageFilesByMessageIds([Number(messageId)]);
          const insertedByStoredName = new Map();

          insertedRows.forEach((row) => {
            const key = path.basename(String(row?.stored_name || "").trim());
            if (!key) return;

            insertedByStoredName.set(key, Number(row.id));
          });

          normalizedFiles.forEach((file) => {
            const mimeType = String(file?.mimeType || "").toLowerCase();
            if (!mimeType.startsWith("video/")) return;

            const storedName = path.basename(
              String(file?.storedName || "").trim(),
            );
            if (!storedName) return;

            const fileId = Number(insertedByStoredName.get(storedName) || 0);
            if (!fileId) return;

            enqueueVideoTranscodeJob({
              fileId,
              storedName,
              chatId,
              messageId: Number(messageId),
              username: user.username,
            });

            transcodeJobsQueued += 1;
          });
        }

        if (editTarget) {
          emitChatEvent(chatId, {
            type: "chat_message_updated",
            chatId,
            messageId: Number(messageId),
            username: user.username,
          });
        } else if (shouldTranscodeVideos && hasVideoFiles && transcodeJobsQueued > 0) {
          // Only show pending-conversion videos to the uploader.
          emitSseEvent(user.username, {
            type: "chat_message",
            chatId,
            messageId: Number(messageId),
            username: user.username,
            body: fallbackBody,
            summaryText: fileSummaryText,
            replyToMessageId,
          });
        } else {
          emitChatEvent(chatId, {
            type: "chat_message",
            chatId,
            messageId: Number(messageId),
            username: user.username,
            body: fallbackBody,
            summaryText: fileSummaryText,
            replyToMessageId,
          });
        }

        debugLog("api:messages/upload:done", {
          chatId,
          messageId: Number(messageId),
          fileCount: normalizedFiles.length,
        });

        res.json({ id: Number(messageId), deduped: dedupedMessage });

        if (!editTarget) {
          void (async () => {
            try {
              const rawMembers = listChatMembers(Number(chatId));
              const members = (rawMembers && typeof rawMembers.then === "function" ? await rawMembers : rawMembers) || [];
              const rawMuted = listMutedUserIdsForChat(Number(chatId));
              const mutedRows = (rawMuted && typeof rawMuted.then === "function" ? await rawMuted : rawMuted) || [];
              const mutedIds = new Set(
                mutedRows.map((row) => Number(row?.user_id || 0)).filter(Boolean),
              );
              const recipientIds = members
                .filter((member) => Number(member.id) !== Number(user.id))
                .filter((member) => !isUserConnected(member.username))
                .map((member) => Number(member.id))
                .filter(
                  (memberId) =>
                    Number.isFinite(memberId) &&
                    memberId > 0 &&
                    !mutedIds.has(Number(memberId)),
                );
              if (recipientIds.length) {
                const title =
                  chat.type === "dm"
                    ? user.nickname || user.username
                    : chat.name || (chat.type === "channel" ? "Channel" : "Group");
                const notifyBody =
                  trimmedBody || fileSummaryText || "New message";
                await sendPushNotificationToUsers(recipientIds, {
                  title,
                  body: notifyBody,
                  data: { url: "/", chatId },
                });
              }
            } catch {
              // ignore push failures
            }
          })();
        }

        return;
      } catch (error) {
        console.error("POST /api/messages ERROR:", error);
        removeUploadedFiles(uploadedFiles);

        debugLog("api:messages/upload:error", {
          error: String(error?.message || error),
        });

        return res
          .status(400)
          .json({ error: error.message || "Unable to upload files." });
      }
    },
  );

  app.post("/api/messages", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { chatId, username, body, replyToMessageId } = req.body || {};
    const clientRequestIdRaw = String(req.body?.clientRequestId || "").trim();
    const clientRequestId = clientRequestIdRaw
      ? clientRequestIdRaw.slice(0, 120)
      : null;
    if (!chatId || !username || !body) {
      return res.status(400).json({
        error: "Chat, username, and message body are required.",
      });
    }
    const bodyText = String(body || "");
    if (bodyText === "[object Object]") {
      return res.status(400).json({
        error: "Invalid message body.",
      });
    }
    const maxMessageChars = Math.max(1, Number(getSetting("MESSAGE_MAX_CHARS") || 4000));
    if (bodyText.length > maxMessageChars) {
      return res.status(400).json({
        error: `Message must be at most ${maxMessageChars} characters.`,
      });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const rawIsMem = isMember(Number(chatId), user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const rawChat = findChatById(Number(chatId));
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }
    if (chat.type === "channel") {
      const rawRole = getChatMemberRole(Number(chatId), user.id);
      const role = String(rawRole && typeof rawRole.then === "function" ? await rawRole : rawRole).toLowerCase();
      if (role !== "owner") {
        return res
          .status(403)
          .json({ error: "Only channel owner can send messages." });
      }
    }

    if (replyToMessageId) {
      const rawReplyTarget = findMessageById(Number(replyToMessageId));
      const replyTarget = rawReplyTarget && typeof rawReplyTarget.then === "function" ? await rawReplyTarget : rawReplyTarget;
      if (!replyTarget || Number(replyTarget.chat_id) !== Number(chatId)) {
        return res
          .status(400)
          .json({ error: "Reply target is not available in this chat." });
      }
    }

    const createdAtIso = new Date().toISOString();
    const expiresAt = computeTextExpiryIso(createdAtIso);
    
    const rawResult = messagePubService.publishTextMessage({
      chatId: Number(chatId),
      userId: user.id,
      body: bodyText,
      replyToMessageId,
      expiresAt,
      clientRequestId,
      username: user.username,
      isUserConnectedFn: isUserConnected,
    });
    const result = rawResult && typeof rawResult.then === "function" ? await rawResult : rawResult;

    const id = result.messageId;

    debugLog("api:messages/send", {
      chatId: Number(chatId),
      username: user.username,
      messageId: Number(id),
      bodyLength: String(body || "").length,
    });

    res.json({
      id,
      expiresAt,
      deduped: result.deduped,
    });

    result.sseEvents.forEach((ev) => {
      emitChatEvent(ev.chatId, ev.payload);
    });

    if (result.deduped) {
      return;
    }

    if (result.pushRecipients.length) {
      void (async () => {
        try {
          const title =
            chat.type === "dm"
              ? user.nickname || user.username
              : chat.name || (chat.type === "channel" ? "Channel" : "Group");
          const trimmedBody = String(body || "").trim();
          const notifyBody = trimmedBody || "New message";
          await sendPushNotificationToUsers(result.pushRecipients, {
            title,
            body: notifyBody,
            data: { chatId: Number(chatId) },
          });
        } catch (_) {}
      })();
    }
  });

  app.post("/api/messages/edit", messageEditLimiter, async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { chatId, username, messageId, body } = req.body || {};
    if (!chatId || !username || !messageId) {
      return res.status(400).json({
        error: "Chat, username, and message id are required.",
      });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const bodyText = String(body || "");
    if (bodyText === "[object Object]") {
      return res.status(400).json({ error: "Invalid message body." });
    }
    const trimmedBody = bodyText.trim();
    if (!trimmedBody) {
      return res.status(400).json({ error: "Edited message cannot be empty." });
    }
    const maxMessageChars = Math.max(1, Number(getSetting("MESSAGE_MAX_CHARS") || 4000));
    if (bodyText.length > maxMessageChars) {
      return res.status(400).json({
        error: `Message must be at most ${maxMessageChars} characters.`,
      });
    }

    const rawUser = findUserByUsername(String(username || "").toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const numericChatId = Number(chatId);
    const rawIsMem = isMember(numericChatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }
    const rawMessage = findMessageById(Number(messageId));
    const message = rawMessage && typeof rawMessage.then === "function" ? await rawMessage : rawMessage;
    if (!message || Number(message.chat_id) !== numericChatId) {
      return res.status(404).json({ error: "Message not found." });
    }
    const rawChat = findChatById(numericChatId);
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }
    const rawCanPost = canUserPostInChat(numericChatId, user.id, chat);
    const canPost = rawCanPost && typeof rawCanPost.then === "function" ? await rawCanPost : rawCanPost;
    if (!canPost) {
      return res
        .status(403)
        .json({ error: "Only channel owner can send messages." });
    }
    if (!isMessageAuthoredByUser(message, user.id)) {
      return res.status(403).json({ error: "Only the author can edit this message." });
    }

    const editRes = editMessage(messageId, trimmedBody);
    if (editRes && typeof editRes.then === "function") await editRes;

    emitChatEvent(numericChatId, {
      type: "chat_message_updated",
      chatId: numericChatId,
      messageId: Number(messageId),
      username: user.username,
    });

    res.json({ ok: true, id: Number(messageId) });
  });

  app.post("/api/messages/delete", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { chatId, username, messageId, scope } = req.body || {};
    if (!chatId || !username || !messageId) {
      return res.status(400).json({
        error: "Chat, username, and message id are required.",
      });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(String(username || "").toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const numericChatId = Number(chatId);
    const rawIsMem = isMember(numericChatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }
    const rawMessage = findMessageById(Number(messageId));
    const message = rawMessage && typeof rawMessage.then === "function" ? await rawMessage : rawMessage;
    if (!message || Number(message.chat_id) !== numericChatId) {
      return res.status(404).json({ error: "Message not found." });
    }

    const deleteScope = String(scope || "").toLowerCase() === "everyone"
      ? "everyone"
      : "self";

    if (deleteScope === "everyone") {
      const rawChat = findChatById(numericChatId);
      const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
      if (!chat) {
        return res.status(404).json({ error: "Chat not found." });
      }
      const rawRole = getChatMemberRole(numericChatId, user.id);
      const role = String(rawRole && typeof rawRole.then === "function" ? await rawRole : rawRole).toLowerCase();
      const rawCanPost = canUserPostInChat(numericChatId, user.id, chat);
      const canPost = rawCanPost && typeof rawCanPost.then === "function" ? await rawCanPost : rawCanPost;
      const canDeleteForEveryone =
        canPost &&
        (Number(message.user_id || 0) === Number(user.id) || role === "owner");
      if (!canDeleteForEveryone) {
        return res.status(403).json({
          error: "You cannot delete this message for everyone.",
        });
      }
      const h = hideMessageForEveryone(message.id);
      if (h && typeof h.then === "function") await h;
      emitChatEvent(numericChatId, {
        type: "chat_message_deleted",
        chatId: numericChatId,
        messageIds: [Number(message.id)],
      });
      return res.json({ ok: true, scope: "everyone", id: Number(message.id) });
    }

    const hSelf = hideMessageForUser(message.id, user.id);
    if (hSelf && typeof hSelf.then === "function") await hSelf;
    return res.json({ ok: true, scope: "self", id: Number(message.id) });
  });

  app.post("/api/messages/forward", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const {
      username,
      sourceMessageId,
      targetChatIds = [],
      body,
    } = req.body || {};
    if (!username || !sourceMessageId || !Array.isArray(targetChatIds) || !targetChatIds.length) {
      return res.status(400).json({
        error: "Username, source message, and target chats are required.",
      });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(String(username || "").toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const rawSourceMessage = findMessageById(Number(sourceMessageId));
    const sourceMessage = rawSourceMessage && typeof rawSourceMessage.then === "function" ? await rawSourceMessage : rawSourceMessage;
    if (!sourceMessage) {
      return res.status(404).json({ error: "Source message not found." });
    }
    if (sourceMessage.hidden_everyone_at) {
      return res.status(410).json({ error: "Source message is no longer available." });
    }
    const rawIsMem = isMember(Number(sourceMessage.chat_id), user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "You cannot forward from this chat." });
    }
    const sourceChat = findChatById(Number(sourceMessage.chat_id));
    if (!sourceChat) {
      return res.status(404).json({ error: "Source chat not found." });
    }
    const forwardOrigin = deriveForwardOrigin(sourceMessage, sourceChat);

    const forwardBody = String(body || "");
    if (!forwardBody.trim()) {
      return res.status(400).json({ error: "Forwarded message body is required." });
    }

    const uniqueTargetChatIds = Array.from(
      new Set(
        targetChatIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    if (!uniqueTargetChatIds.length) {
      return res.status(400).json({ error: "Choose at least one target chat." });
    }

    const sourceFiles = listMessageFilesByMessageIds([Number(sourceMessage.id)]);
    const forwardExpiresAt = sourceFiles.length
      ? null
      : computeTextExpiryIso(new Date().toISOString());

    const forwardedIds = [];
    for (const targetChatId of uniqueTargetChatIds) {
      if (!isMember(targetChatId, user.id)) {
        return res.status(403).json({ error: "Cannot send to one or more selected chats." });
      }
      const targetChat = findChatById(targetChatId);
      if (!targetChat) {
        return res.status(404).json({ error: "One of the selected chats was not found." });
      }
      if (String(targetChat.type || "").toLowerCase() === "channel") {
        const rawRole = getChatMemberRole(targetChatId, user.id);
        const role = String(rawRole && typeof rawRole.then === "function" ? await rawRole : rawRole).toLowerCase();
        if (role !== "owner") {
          return res.status(403).json({
            error: "You can only forward to channels you own.",
          });
        }
      }

      const nextMessageId = createMessage(
        targetChatId,
        user.id,
        forwardBody,
        null,
        forwardExpiresAt,
      );
      if (!nextMessageId) {
        return res.status(500).json({ error: "Unable to forward message." });
      }
      setMessageForwardOrigin(nextMessageId, {
        sourceChatId: forwardOrigin.sourceChatId,
        label: forwardOrigin.label,
        sourceUserId: forwardOrigin.sourceUserId,
        sourceUsername: forwardOrigin.sourceUsername,
        sourceAvatarUrl: forwardOrigin.sourceAvatarUrl,
        sourceColor: forwardOrigin.sourceColor,
      });
      reuseMessageFilesForForward(sourceMessage.id, nextMessageId);
      if (String(targetChat.type || "").toLowerCase() === "saved") {
        markMessageRead(nextMessageId, user.id);
        unhideChat(user.id, targetChatId);
      }

      emitChatEvent(targetChatId, {
        type: "chat_message",
        chatId: targetChatId,
        messageId: Number(nextMessageId),
        username: user.username,
        body: forwardBody,
        replyToMessageId: null,
      });
      forwardedIds.push(Number(nextMessageId));
    }

    return res.json({ ok: true, ids: forwardedIds });
  });
}

export { registerMessageRoutes };

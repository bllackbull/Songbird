import rateLimit from "express-rate-limit";
import { validateUuidParams, validateUuidBody } from "../lib/uuidMiddleware.js";
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
    removePendingPresignedUploads,
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

  const safeBasename = (p) => {
    if (path && typeof path.basename === "function") return path.basename(p);
    return String(p || "").split("/").pop().split("\\").pop();
  };
  const safeInferMime =
    typeof inferMimeFromFilename === "function"
      ? inferMimeFromFilename
      : () => null;
  const safeDecodeFilename =
    typeof decodeOriginalFilename === "function"
      ? decodeOriginalFilename
      : (n) => n;
  const safeIsDangerousUploadFile =
    typeof isDangerousUploadFile === "function"
      ? isDangerousUploadFile
      : () => false;
  const safeGetUploadKind =
    typeof getUploadKind === "function"
      ? getUploadKind
      : (_uploadType, mimeType) => {
          const m = String(mimeType || "").toLowerCase();
          if (m.startsWith("image/")) return "image";
          if (m.startsWith("video/")) return "video";
          if (m.startsWith("audio/")) return "audio";
          return "document";
        };
  const safeSanitizePositiveInt =
    typeof sanitizePositiveInt === "function"
      ? sanitizePositiveInt
      : (val) => {
          const num = Number(val);
          return Number.isFinite(num) && num > 0 ? Math.round(num) : null;
        };
  const safeSanitizeDurationSeconds =
    typeof sanitizeDurationSeconds === "function"
      ? sanitizeDurationSeconds
      : (val) => {
          const num = Number(val);
          return Number.isFinite(num) && num >= 0 ? num : null;
        };

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
    const rawChat = chat || findChatById(chatId);
    const resolvedChat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (!resolvedChat) return false;
    if (resolvedChat.type !== "channel") return true;
    const rawRole = getChatMemberRole(chatId, userId);
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
    String(message?.user_id || "") === String(userId) &&
    !isRemoteChannelMessage(message);

  const normalizeForwardOriginAvatarUrl = (userId, avatarUrl) => {
    const normalized = ensureAvatarExists(userId, avatarUrl);
    return String(normalized || "").trim() || null;
  };

  const deriveForwardOrigin = async (sourceMessage, sourceChat) => {
    if (String(sourceChat?.type || "").toLowerCase() === "channel") {
      const label =
        String(sourceChat?.name || "").trim() ||
        String(sourceChat?.group_username || "").trim() ||
        "Channel";
      return {
        sourceChatId: sourceChat?.id || null,
        label,
        sourceUserId: null,
        sourceUsername: null,
        sourceAvatarUrl: null,
        sourceColor: null,
      };
    }

    const sourceUserRaw = findUserById(sourceMessage?.user_id);
    const sourceUser = sourceUserRaw && typeof sourceUserRaw.then === "function"
      ? await sourceUserRaw
      : sourceUserRaw;
    const sourceUserId = sourceUser?.id || sourceMessage?.user_id || null;
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

  const reuseMessageFilesForForward = async (sourceMessageId, targetMessageId) => {
    const rawSourceFiles = listMessageFilesByMessageIds([sourceMessageId]);
    const sourceFiles = rawSourceFiles && typeof rawSourceFiles.then === "function"
      ? await rawSourceFiles
      : rawSourceFiles;
    if (!sourceFiles?.length) return [];

    const reusedFiles = sourceFiles.flatMap((file) => {
      const storedName = safeBasename(String(file?.stored_name || "").trim());
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
      const rawCreatedFiles = createMessageFiles(targetMessageId, reusedFiles);
      if (rawCreatedFiles && typeof rawCreatedFiles.then === "function") {
        await rawCreatedFiles;
      }
    }

    return reusedFiles;
  };

  app.get("/api/messages", async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const chatId = req.query.chatId?.toString() || "";
    const username = req.query.username?.toString();
    const beforeId = req.query.beforeId?.toString() || "";
    const beforeCreatedAt = req.query.beforeCreatedAt?.toString() || "";
    const afterId = req.query.afterId?.toString() || "";
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
      beforeId: beforeId || null,
      beforeCreatedAt: beforeCreatedAt || null,
      afterId: afterId || null,
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
          messages.map((message) => message.id).filter(Boolean),
        );
        if (cleanup.changed && cleanup.deletedByChat?.size) {
          cleanup.deletedByChat.forEach((messageIds, deletedChatId) => {
            emitChatEvent(deletedChatId, {
              type: "chat_message_deleted",
              chatId: deletedChatId,
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
        message?.reply_id
          ? {
              id: message.reply_id,
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
      .map((message) => message.id)
      .filter(Boolean);
    const rawReadRows = getMessageReadByUser(messageIds, user.id);
    const readRows = (rawReadRows && typeof rawReadRows.then === "function" ? await rawReadRows : rawReadRows) || [];
    const readByMe = new Set(
      readRows.map((row) => row?.message_id).filter(Boolean),
    );
    const rawFiles = listMessageFilesByMessageIds(messageIds);
    const resolvedFiles = (rawFiles && typeof rawFiles.then === "function" ? await rawFiles : rawFiles) || [];
    const files = await hydrateMissingVideoMetadata(resolvedFiles);

    const filesByMessageId = {};
    for (const file of files) {
      const messageId = file.message_id;
      if (!filesByMessageId[messageId]) filesByMessageId[messageId] = [];

      let fileUrl = `/api/uploads/messages/${file.stored_name}`;
      const driver = file.storage_driver;
      const storageKey = file.storage_key;
      if (
        (driver === "remote" || driver === "s3") &&
        storageKey &&
        deps.storageProvider &&
        typeof deps.storageProvider.getDownloadUrl === "function"
      ) {
        try {
          fileUrl = await deps.storageProvider.getDownloadUrl(storageKey);
        } catch (_) {}
      }

      filesByMessageId[messageId].push({
        id: file.id,
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
        url: fileUrl,
      });
    }

    const enriched = normalizedMessages
      .map((message) => ({
        ...message,
        clientRequestId: message.client_request_id || null,
        read_by_me:
          isMessageAuthoredByUser(message, user.id) ||
          readByMe.has(message.id),
        files: filesByMessageId[message.id] || [],
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
            messageId: message?.id || null,
            fileId: file?.id || null,
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
        const id = row?.message_id;
        if (!id) return acc;
        acc[id] = Number(row?.count || 0);
        return acc;
      }, {});
      
      // For regular messages (not remote), add +1 for the author
      // For remote messages, don't add the author count (starts at 0)
      enriched.forEach((msg) => {
        const id = msg?.id;
        if (!id) return;
        const isRemote = isRemoteChannelMessage(msg);
        if (!isRemote) {
          counts[id] = Number(counts[id] || 0) + 1;
        }
      });
      
      enriched.forEach((msg) => {
        const id = msg?.id;
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

    const chatId = req.query.chatId?.toString() || "";
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

  app.post("/api/messages/read", validateUuidBody([{ field: "chatId", required: true }]), async (req, res) => {
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

    const rawIsMem = isMember(chatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const m = markMessagesRead(chatId, user.id);
    if (m && typeof m.then === "function") await m;

    emitChatEvent(chatId, {
      type: "chat_read",
      chatId,
      username: user.username,
    });

    res.json({ ok: true });
  });

  app.post("/api/messages/read-one", validateUuidBody([{ field: "chatId", required: true }, { field: "messageId", required: true }]), async (req, res) => {
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

    const rawIsMem = isMember(chatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const rawMessage = findMessageById(messageId);
    const message = rawMessage && typeof rawMessage.then === "function" ? await rawMessage : rawMessage;
    if (!message || message.chat_id !== chatId) {
      return res.status(404).json({ error: "Message not found in this chat." });
    }

    const m = markMessageRead(messageId, user.id);
    if (m && typeof m.then === "function") await m;

    emitChatEvent(chatId, {
      type: "chat_read",
      chatId,
      messageId,
      username: user.username,
    });

    res.json({ ok: true });
  });

  app.post("/api/messages/read-counts", validateUuidBody([{ field: "chatId", required: true }]), async (req, res) => {
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
    const rawIsMem = isMember(chatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const rawAuthors = getMessageAuthors(messageIds);
    const authors = (rawAuthors && typeof rawAuthors.then === "function" ? await rawAuthors : rawAuthors) || [];
    const messages = authors.reduce((acc, row) => {
      const id = row?.id;
      if (!id) return acc;
      acc[id] = row;
      return acc;
    }, {});
    
    const rawRows = getMessageReadCounts(messageIds);
    const rows = (rawRows && typeof rawRows.then === "function" ? await rawRows : rawRows) || [];
    const counts = rows.reduce((acc, row) => {
      const id = row?.message_id;
      if (!id) return acc;
      acc[id] = Number(row?.count || 0);
      return acc;
    }, {});
    
    // For regular messages (not remote), add +1 for the author
    // For remote messages, don't add the author count (starts at 0)
    Object.keys(messages).forEach((key) => {
      const id = key;
      if (!id) return;
      const msg = messages[id];
      const isRemote = isRemoteChannelMessage(msg);
      if (!isRemote) {
        counts[id] = Number(counts[id] || 0) + 1;
      }
    });

    res.json({ ok: true, counts });
  });

  app.post("/api/messages/typing", validateUuidBody([{ field: "chatId", required: true }]), async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return;

    const { chatId, username, isTyping } = req.body || {};
    if (!chatId || !username || typeof isTyping !== "boolean") {
      return res.status(400).json({
        error: "Chat id, username, and isTyping are required.",
      });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(String(username || "").toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const rawMember = isMember(chatId, user.id);
    const isMem = rawMember && typeof rawMember.then === "function" ? await rawMember : rawMember;
    if (!isMem) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const rawChat = findChatById(chatId);
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
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

    emitChatEvent(chatId, {
      type: "chat_typing",
      chatId,
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

      const uploadedFiles = Array.isArray(req.files) ? req.files : [];

      try {
        if (!getSetting("FILE_UPLOAD")) {
          removeUploadedFiles(uploadedFiles);
          return res
            .status(503)
            .json({ error: "File uploads are disabled on this server." });
        }

        const chatId = req.body?.chatId?.toString() || "";
        const username = req.body?.username?.toString();
        const uploadType = req.body?.uploadType?.toString();
        const fileMeta = parseUploadFileMetadata(req.body?.fileMeta);

        let rawStorageKeys =
          req.body?.storageKeys ??
          req.body?.storageKey ??
          req.body?.presignedFiles;
        let presignedFiles = [];

        if (rawStorageKeys !== undefined && rawStorageKeys !== null) {
          if (typeof rawStorageKeys === "string") {
            const trimmed = rawStorageKeys.trim();
            if (trimmed) {
              try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                  presignedFiles = parsed;
                } else if (parsed && typeof parsed === "object") {
                  presignedFiles = [parsed];
                } else if (typeof parsed === "string" && parsed.trim()) {
                  presignedFiles = [parsed.trim()];
                }
              } catch (_) {
                presignedFiles = [trimmed];
              }
            }
          } else if (Array.isArray(rawStorageKeys)) {
            presignedFiles = rawStorageKeys;
          } else if (typeof rawStorageKeys === "object") {
            presignedFiles = [rawStorageKeys];
          }
        }

        const body = req.body?.body?.toString() || "";
        const trimmedBody = body.trim();
        const replyToMessageId = req.body?.replyToMessageId?.toString() || null;
        const editMessageId = req.body?.editMessageId?.toString() || null;
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

        const totalFilesCount = uploadedFiles.length + presignedFiles.length;

        if (!totalFilesCount) {
          return res
            .status(400)
            .json({ error: "At least one file is required." });
        }

        if (totalFilesCount > MESSAGE_FILE_LIMITS.maxFiles) {
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
          if (!replyTarget || replyTarget.chat_id !== chatId) {
            removeUploadedFiles(uploadedFiles);
            return res
              .status(400)
              .json({ error: "Reply target is not available in this chat." });
          }
        }
        let editTarget = null;
        if (editMessageId) {
          editTarget = findMessageById(editMessageId);
          if (!editTarget || editTarget.chat_id !== chatId) {
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

        const localBytes = uploadedFiles.reduce(
          (sum, file) => sum + Number(file.size || 0),
          0,
        );

        const presignedBytes = presignedFiles.reduce((sum, item, index) => {
          const meta =
            fileMeta[uploadedFiles.length + index] || fileMeta[index] || {};
          const sz = Number(
            (typeof item === "object" && item !== null
              ? (item.sizeBytes ??
                item.size_bytes ??
                item.fileSize ??
                item.file_size ??
                item.size)
              : null) ??
              meta.sizeBytes ??
              meta.size_bytes ??
              meta.fileSize ??
              meta.file_size ??
              meta.size ??
              0,
          );
          return sum + (Number.isFinite(sz) && sz > 0 ? sz : 0);
        }, 0);

        const totalBytes = localBytes + presignedBytes;

        if (totalBytes > MESSAGE_FILE_LIMITS.maxTotalBytes) {
          removeUploadedFiles(uploadedFiles);

          return res.status(400).json({
            error: `Total upload size cannot exceed ${Math.round(MESSAGE_FILE_LIMITS.maxTotalBytes / (1024 * 1024))} MB.`,
          });
        }

        if (localBytes > 0 && !hasEnoughFreeDiskSpace(localBytes)) {
          removeUploadedFiles(uploadedFiles);

          return res.status(400).json({
            error: "Not enough free storage space on server.",
          });
        }

        if (!editMessageId && clientRequestId) {
          const rawExistingId = findMessageIdByClientRequestId(
            chatId,
            user.id,
            clientRequestId,
          );
          const existingId = rawExistingId && typeof rawExistingId.then === "function" ? await rawExistingId : rawExistingId;
          if (existingId) {
            removeUploadedFiles(uploadedFiles);
            return res.json({ id: existingId, deduped: true });
          }
        }

        const createdAtIso = new Date().toISOString();
        const expiresAtIso = computeExpiryIso(
          createdAtIso,
          getSetting("MESSAGE_FILE_RETENTION"),
        );

        const normalizedLocalFiles = uploadedFiles.map((file, index) => {
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

          const isVideo = mimeType.startsWith("video/") || (inferredMime && String(inferredMime).toLowerCase().startsWith("video/"));
          const kind = isVideo ? "media" : getUploadKind(uploadType, mimeType);
          if (!kind) {
            throw new Error("Invalid file type for selected upload option.");
          }

          const meta = fileMeta[index] || {};

          return {
            kind,
            originalName,
            storedName: safeBasename(file.filename),
            mimeType,
            sizeBytes: Number(file.size || 0),
            widthPx: sanitizePositiveInt(meta.width),
            heightPx: sanitizePositiveInt(meta.height),
            durationSeconds: sanitizeDurationSeconds(meta.durationSeconds),
            expiresAt: expiresAtIso,
            storageDriver: "local",
          };
        });

        const normalizedPresignedFiles = presignedFiles.map((item, index) => {
          const meta =
            fileMeta[uploadedFiles.length + index] || fileMeta[index] || {};
          const key =
            typeof item === "string"
              ? item
              : (item?.storageKey || item?.storage_key || item?.key || "");
          if (!key) {
            throw new Error("Invalid storage key for file.");
          }

          const rawName =
            (typeof item === "object" && item !== null
              ? (item.originalName || item.original_name || item.name || item.filename)
              : null) ||
            meta.originalName ||
            meta.original_name ||
            meta.name ||
            meta.filename ||
            safeBasename(key) ||
            "file";
          const originalName = safeDecodeFilename(rawName);
          const inferredMime = safeInferMime(originalName);

          const rawMime =
            (typeof item === "object" && item !== null
              ? (item.mimeType || item.mime_type || item.contentType || item.content_type || item.type)
              : null) ||
            meta.mimeType ||
            meta.mime_type ||
            meta.contentType ||
            meta.content_type ||
            meta.type ||
            inferredMime ||
            "application/octet-stream";
          const mimeType = String(rawMime).toLowerCase();

          if (safeIsDangerousUploadFile(originalName, mimeType)) {
            throw new Error(
              "This file type is not allowed for security reasons.",
            );
          }

          const kind = safeGetUploadKind(uploadType, mimeType);
          if (!kind) {
            throw new Error("Invalid file type for selected upload option.");
          }

          const sizeBytes = Number(
            (typeof item === "object" && item !== null
              ? (item.sizeBytes ?? item.size_bytes ?? item.fileSize ?? item.file_size ?? item.size)
              : null) ??
              meta.sizeBytes ??
              meta.size_bytes ??
              meta.fileSize ??
              meta.file_size ??
              meta.size ??
              0,
          );

          const widthPx = safeSanitizePositiveInt(
            (typeof item === "object" && item !== null
              ? (item.widthPx ?? item.width_px ?? item.width)
              : null) ??
              meta.widthPx ??
              meta.width_px ??
              meta.width,
          );

          const heightPx = safeSanitizePositiveInt(
            (typeof item === "object" && item !== null
              ? (item.heightPx ?? item.height_px ?? item.height)
              : null) ??
              meta.heightPx ??
              meta.height_px ??
              meta.height,
          );

          const durationSeconds = safeSanitizeDurationSeconds(
            (typeof item === "object" && item !== null
              ? (item.durationSeconds ?? item.duration_seconds ?? item.duration)
              : null) ??
              meta.durationSeconds ??
              meta.duration_seconds ??
              meta.duration,
          );

          const blurhash =
            (typeof item === "object" && item !== null ? item.blurhash : null) ||
            meta.blurhash ||
            null;

          const rawWaveform =
            (typeof item === "object" && item !== null ? item.waveform : null) ||
            meta.waveform ||
            null;
          const waveform = rawWaveform
            ? typeof rawWaveform === "string"
              ? rawWaveform
              : JSON.stringify(rawWaveform)
            : null;

          const thumbStorageKey =
            (typeof item === "object" && item !== null
              ? (item.thumbStorageKey || item.thumb_storage_key)
              : null) ||
            meta.thumbStorageKey ||
            meta.thumb_storage_key ||
            null;

          const storageDriver =
            (typeof item === "object" && item !== null
              ? (item.storageDriver || item.storage_driver)
              : null) ||
            meta.storageDriver ||
            meta.storage_driver ||
            (deps.storageProvider?.type || "remote");

          const encryptionType =
            (typeof item === "object" && item !== null
              ? (item.encryptionType || item.encryption_type)
              : null) ||
            meta.encryptionType ||
            meta.encryption_type ||
            "none";

          const storageProcessingMode = String(
            deps.storageProcessingMode || process.env.STORAGE_PROCESSING_MODE || "sync",
          ).toLowerCase();
          const isLocalTranscodeMode =
            storageProcessingMode === "local" ||
            storageProcessingMode === "auto" ||
            storageProcessingMode === "sync";
          const isVideo =
            mimeType.startsWith("video/") ||
            (inferredMime && String(inferredMime).toLowerCase().startsWith("video/"));
          const isAlreadyTranscoded = safeBasename(key).toLowerCase().includes("-h264-");
          const shouldTranscodeThisFile =
            isVideo &&
            !isAlreadyTranscoded &&
            isLocalTranscodeMode &&
            Boolean(getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS"));

          const effectiveKind = isVideo ? "media" : kind;
          const effectiveMime = isVideo && !mimeType.startsWith("video/") && inferredMime ? inferredMime : mimeType;

          return {
            kind: effectiveKind,
            originalName,
            storedName: safeBasename(key),
            mimeType: effectiveMime,
            sizeBytes,
            widthPx,
            heightPx,
            durationSeconds,
            expiresAt: expiresAtIso,
            storageDriver,
            storageKey: key,
            processingStatus:
              (typeof item === "object" && item !== null
                ? (item.processingStatus || item.processing_status)
                : null) || (shouldTranscodeThisFile ? "pending" : "ready"),
            blurhash,
            waveform,
            thumbStorageKey,
            encryptionType,
          };
        });

        const normalizedFiles = [
          ...normalizedLocalFiles,
          ...normalizedPresignedFiles,
        ];

        const storageProcessingMode = String(
          deps.storageProcessingMode || process.env.STORAGE_PROCESSING_MODE || "sync",
        ).toLowerCase();
        const isLocalTranscodeMode =
          storageProcessingMode === "local" ||
          storageProcessingMode === "auto" ||
          storageProcessingMode === "sync";

        const hasVideoFiles = normalizedFiles.some((file) => {
          const m = String(file.mimeType || "").toLowerCase();
          const s = String(file.storedName || "").toLowerCase();
          return (m.startsWith("video/") || file.kind === "media") && !s.includes("-h264-");
        });
        const shouldTranscodeVideos =
          Boolean(getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS")) &&
          isLocalTranscodeMode &&
          hasVideoFiles;

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

              const storedName = safeBasename(
                String(file?.storedName || "").trim(),
              );
              if (!storedName) return;

              const inputPath = path.join(uploadRootDir, storedName);
              if (fs.existsSync && fs.existsSync(inputPath)) {
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
              }
            }),
          );
        }

          normalizedFiles.forEach((file) => {
            if (file.storageKey) return;
            const storedName = safeBasename(String(file?.storedName || "").trim());
          if (!storedName) return;

          const inputPath = path.join(uploadRootDir, storedName);
          if (fs.existsSync && fs.existsSync(inputPath)) {
            storageEncryption.encryptFileInPlace(inputPath);
          }
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

        if (
          deps.storageProvider &&
          (deps.storageProvider.type === "remote" ||
            deps.storageProvider.type === "s3") &&
          typeof deps.storageProvider.uploadBuffer === "function"
        ) {
          await Promise.all(
            uploadedFiles.map(async (file, index) => {
              const norm = normalizedFiles[index];
              if (!norm) return;

              const isVideo = String(norm.mimeType || "").toLowerCase().startsWith("video/");
              const isQueuedForLocalTranscode =
                isVideo &&
                shouldTranscodeVideos &&
                !String(norm.storedName || "").toLowerCase().includes("-h264-");

              if (isQueuedForLocalTranscode) {
                norm.storageDriver = "local";
                return;
              }

              const fileKey = `uploads/${file.filename}`;
              const fileBuf = await fs.promises.readFile(file.path);
              const uploadBuf = storageEncryption.decryptBuffer(fileBuf);
              await deps.storageProvider.uploadBuffer(
                fileKey,
                uploadBuf,
                norm.mimeType || "application/octet-stream",
              );
              norm.storageDriver = deps.storageProvider.type || "s3";
              norm.storageKey = fileKey;
              await fs.promises.unlink(file.path).catch(() => {});
            }),
          );
        }

        let messageId = editMessageId || null;
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
          messageId = created?.id || null;
          dedupedMessage = Boolean(created?.deduped);
          if (!messageId) {
            throw new Error("Unable to create message.");
          }
          if (dedupedMessage) {
            removeUploadedFiles(uploadedFiles);
            return res.json({ id: messageId, deduped: true });
          }
          createMessageFiles(messageId, normalizedFiles);
          if (chat.type === "saved") {
            markMessageRead(messageId, user.id);
          }
        }

        const usedStorageKeys = (normalizedFiles || [])
          .map((f) => f.storageKey || f.storage_key)
          .filter(Boolean);
        if (usedStorageKeys.length > 0) {
          if (typeof removePendingPresignedUploads === "function") {
            removePendingPresignedUploads(usedStorageKeys);
          }
        }

        let transcodeJobsQueued = 0;

        if (shouldTranscodeVideos && hasVideoFiles) {
          const rawInsertedRows = listMessageFilesByMessageIds([messageId]);
          const insertedRows = (rawInsertedRows && typeof rawInsertedRows.then === "function" ? await rawInsertedRows : rawInsertedRows) || [];
          const insertedByStoredName = new Map();

          insertedRows.forEach((row) => {
            const nameKey = safeBasename(String(row?.stored_name || row?.storedName || "").trim());
            const storageKey = String(row?.storage_key || row?.storageKey || "").trim();
            if (nameKey) insertedByStoredName.set(nameKey, row.id);
            if (storageKey) insertedByStoredName.set(storageKey, row.id);
          });

          normalizedFiles.forEach((file) => {
            const mimeType = String(file?.mimeType || "").toLowerCase();
            if (!mimeType.startsWith("video/")) return;

            const storedName = safeBasename(
              String(file?.storedName || "").trim(),
            );

            const fileId =
              insertedByStoredName.get(file.storageKey || file.storage_key) ||
              insertedByStoredName.get(storedName) ||
              file?.id;
            if (!fileId) return;

            enqueueVideoTranscodeJob({
              fileId,
              storedName,
              storageKey: file.storageKey || file.storage_key,
              storageDriver: file.storageDriver || file.storage_driver,
              chatId,
              messageId,
              username: user.username,
            });

            transcodeJobsQueued += 1;
          });
        }

        const rawInsertedFiles = listMessageFilesByMessageIds([messageId]);
        const insertedFiles = (rawInsertedFiles && typeof rawInsertedFiles.then === "function" ? await rawInsertedFiles : rawInsertedFiles) || [];
        const hydratedFiles = typeof hydrateMissingVideoMetadata === "function"
          ? await hydrateMissingVideoMetadata(insertedFiles)
          : insertedFiles;
        const sourceFilesForResponse = hydratedFiles.length ? hydratedFiles : normalizedFiles;

        const resolveFileUrl = async (file) => {
          const storedName = file.stored_name || file.storedName || "";
          const driver = file.storage_driver || file.storageDriver;
          const storageKey = file.storage_key || file.storageKey;
          if (
            (driver === "remote" || driver === "s3") &&
            storageKey &&
            deps.storageProvider &&
            typeof deps.storageProvider.getDownloadUrl === "function"
          ) {
            try {
              return await deps.storageProvider.getDownloadUrl(storageKey);
            } catch (_) {}
          }
          return storedName ? `/api/uploads/messages/${storedName}` : null;
        };

        const responseFiles = await Promise.all(
          sourceFilesForResponse.map(async (file, idx) => {
            const storedName = file.stored_name || file.storedName || "";
            const expiresAtVal = file.expires_at || file.expiresAt || expiresAtIso || null;
            const resolvedUrl = await resolveFileUrl(file);
            return {
              id: file.id || (idx + 1),
              kind: file.kind,
              name: file.original_name || file.originalName || "",
              mimeType: file.mime_type || file.mimeType || "",
              processing:
                (file.storage_driver === "remote" || file.storage_driver === "s3" || file.storageDriver === "remote" || file.storageDriver === "s3")
                  ? (file.processing_status || file.processingStatus) === "pending"
                  : (typeof isVideoFileProcessing === "function" ? isVideoFileProcessing(file) : false),
              sizeBytes: Number(file.size_bytes || file.sizeBytes || 0),
              width: Number.isFinite(Number(file.width_px ?? file.widthPx))
                ? Number(file.width_px ?? file.widthPx)
                : null,
              height: Number.isFinite(Number(file.height_px ?? file.heightPx))
                ? Number(file.height_px ?? file.heightPx)
                : null,
              durationSeconds: Number.isFinite(Number(file.duration_seconds ?? file.durationSeconds))
                ? Number(file.duration_seconds ?? file.durationSeconds)
                : null,
              expiresAt: expiresAtVal,
              expires_at: expiresAtVal,
              url: resolvedUrl,
            };
          }),
        );
        const fileExpiresAt = responseFiles.find((f) => f.expiresAt)?.expiresAt || null;

        if (editTarget) {
          emitChatEvent(chatId, {
            type: "chat_message_updated",
            chatId,
            messageId,
            username: user.username,
            files: responseFiles,
            expiresAt: fileExpiresAt,
            expires_at: fileExpiresAt,
          });
        } else if (shouldTranscodeVideos && hasVideoFiles && transcodeJobsQueued > 0) {
          // Only show pending-conversion videos to the uploader.
          emitSseEvent(user.username, {
            type: "chat_message",
            chatId,
            messageId,
            username: user.username,
            userId: user.id,
            body: fallbackBody,
            summaryText: fileSummaryText,
            replyToMessageId,
            files: responseFiles,
            expiresAt: fileExpiresAt,
            expires_at: fileExpiresAt,
          });
        } else {
          emitChatEvent(chatId, {
            type: "chat_message",
            chatId,
            messageId,
            username: user.username,
            userId: user.id,
            body: fallbackBody,
            summaryText: fileSummaryText,
            replyToMessageId,
            files: responseFiles,
            expiresAt: fileExpiresAt,
            expires_at: fileExpiresAt,
          });
        }

        debugLog("api:messages/upload:done", {
          chatId,
          messageId,
          fileCount: normalizedFiles.length,
        });

        res.json({
          id: messageId,
          deduped: dedupedMessage,
          expiresAt: fileExpiresAt,
          files: responseFiles,
        });

        if (!editTarget) {
          void (async () => {
            try {
              const rawMembers = listChatMembers(chatId);
              const members = (rawMembers && typeof rawMembers.then === "function" ? await rawMembers : rawMembers) || [];
              const rawMuted = listMutedUserIdsForChat(chatId);
              const mutedRows = (rawMuted && typeof rawMuted.then === "function" ? await rawMuted : rawMuted) || [];
              const mutedIds = new Set(
                mutedRows.map((row) => row?.user_id).filter(Boolean),
              );
              const recipientIds = members
                .filter((member) => member.id !== user.id)
                .filter((member) => !isUserConnected(member.username))
                .map((member) => member.id)
                .filter(
                  (memberId) =>
                    memberId && !mutedIds.has(memberId),
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

  app.post("/api/messages", validateUuidBody([{ field: "chatId", required: true }, { field: "replyToMessageId", required: false }]), async (req, res) => {
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

    const rawIsMem = isMember(chatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const rawChat = findChatById(chatId);
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }
    if (chat.type === "channel") {
      const rawRole = getChatMemberRole(chatId, user.id);
      const role = String(rawRole && typeof rawRole.then === "function" ? await rawRole : rawRole).toLowerCase();
      if (role !== "owner") {
        return res
          .status(403)
          .json({ error: "Only channel owner can send messages." });
      }
    }

    if (replyToMessageId) {
      const rawReplyTarget = findMessageById(replyToMessageId);
      const replyTarget = rawReplyTarget && typeof rawReplyTarget.then === "function" ? await rawReplyTarget : rawReplyTarget;
      if (!replyTarget || replyTarget.chat_id !== chatId) {
        return res
          .status(400)
          .json({ error: "Reply target is not available in this chat." });
      }
    }

    const createdAtIso = new Date().toISOString();
    const expiresAt = computeTextExpiryIso(createdAtIso);
    
    const rawResult = messagePubService.publishTextMessage({
      chatId,
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
      chatId,
      username: user.username,
      messageId: id,
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
            data: { chatId },
          });
        } catch (_) {}
      })();
    }
  });

  app.post("/api/messages/edit", messageEditLimiter, validateUuidBody([{ field: "chatId", required: true }, { field: "messageId", required: true }]), async (req, res) => {
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
    const rawIsMem = isMember(chatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }
    const rawMessage = findMessageById(messageId);
    const message = rawMessage && typeof rawMessage.then === "function" ? await rawMessage : rawMessage;
    if (!message || message.chat_id !== chatId) {
      return res.status(404).json({ error: "Message not found." });
    }
    const rawChat = findChatById(chatId);
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }
    const rawCanPost = canUserPostInChat(chatId, user.id, chat);
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

    emitChatEvent(chatId, {
      type: "chat_message_updated",
      chatId,
      messageId,
      username: user.username,
      body: trimmedBody,
      summaryText: trimmedBody,
    });

    res.json({ ok: true, id: messageId });
  });

  app.post("/api/messages/delete", validateUuidBody([{ field: "chatId", required: true }, { field: "messageId", required: true }]), async (req, res) => {
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
    const rawIsMem = isMember(chatId, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }
    const rawMessage = findMessageById(messageId);
    const message = rawMessage && typeof rawMessage.then === "function" ? await rawMessage : rawMessage;
    if (!message || message.chat_id !== chatId) {
      return res.status(404).json({ error: "Message not found." });
    }

    const deleteScope = String(scope || "").toLowerCase() === "everyone"
      ? "everyone"
      : "self";

    if (deleteScope === "everyone") {
      const rawChat = findChatById(chatId);
      const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
      if (!chat) {
        return res.status(404).json({ error: "Chat not found." });
      }
      const rawRole = getChatMemberRole(chatId, user.id);
      const role = String(rawRole && typeof rawRole.then === "function" ? await rawRole : rawRole).toLowerCase();
      const rawCanPost = canUserPostInChat(chatId, user.id, chat);
      const canPost = rawCanPost && typeof rawCanPost.then === "function" ? await rawCanPost : rawCanPost;
      const canDeleteForEveryone =
        canPost &&
        (message.user_id === user.id || role === "owner");
      if (!canDeleteForEveryone) {
        return res.status(403).json({
          error: "You cannot delete this message for everyone.",
        });
      }
      const h = hideMessageForEveryone(message.id);
      if (h && typeof h.then === "function") await h;
      emitChatEvent(chatId, {
        type: "chat_message_deleted",
        chatId,
        messageIds: [message.id],
      });
      return res.json({ ok: true, scope: "everyone", id: message.id });
    }

    const hSelf = hideMessageForUser(message.id, user.id);
    if (hSelf && typeof hSelf.then === "function") await hSelf;
    return res.json({ ok: true, scope: "self", id: message.id });
  });

  app.post("/api/messages/forward", validateUuidBody([{ field: "sourceMessageId", required: true }]), async (req, res) => {
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

    const rawSourceMessage = findMessageById(sourceMessageId);
    const sourceMessage = rawSourceMessage && typeof rawSourceMessage.then === "function" ? await rawSourceMessage : rawSourceMessage;
    if (!sourceMessage) {
      return res.status(404).json({ error: "Source message not found." });
    }
    if (sourceMessage.hidden_everyone_at) {
      return res.status(410).json({ error: "Source message is no longer available." });
    }
    const rawIsMem = isMember(sourceMessage.chat_id, user.id);
    const memberCheck = rawIsMem && typeof rawIsMem.then === "function" ? await rawIsMem : rawIsMem;
    if (!memberCheck) {
      return res.status(403).json({ error: "You cannot forward from this chat." });
    }
    const rawSourceChat = findChatById(sourceMessage.chat_id);
    const sourceChat = rawSourceChat && typeof rawSourceChat.then === "function"
      ? await rawSourceChat
      : rawSourceChat;
    if (!sourceChat) {
      return res.status(404).json({ error: "Source chat not found." });
    }
    const forwardOrigin = await deriveForwardOrigin(sourceMessage, sourceChat);

    const forwardBody = String(body || "");
    if (!forwardBody.trim()) {
      return res.status(400).json({ error: "Forwarded message body is required." });
    }

    const uniqueTargetChatIds = Array.from(
      new Set(
        targetChatIds
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    );
    if (!uniqueTargetChatIds.length) {
      return res.status(400).json({ error: "Choose at least one target chat." });
    }

    const rawSourceFiles = listMessageFilesByMessageIds([sourceMessage.id]);
    const sourceFiles = rawSourceFiles && typeof rawSourceFiles.then === "function"
      ? await rawSourceFiles
      : rawSourceFiles;
    const forwardExpiresAt = sourceFiles?.length
      ? null
      : computeTextExpiryIso(new Date().toISOString());

    const forwardedIds = [];
    for (const targetChatId of uniqueTargetChatIds) {
      const rawMemberCheck = isMember(targetChatId, user.id);
      const targetMemberCheck = rawMemberCheck && typeof rawMemberCheck.then === "function"
        ? await rawMemberCheck
        : rawMemberCheck;
      if (!targetMemberCheck) {
        return res.status(403).json({ error: "Cannot send to one or more selected chats." });
      }
      const rawTargetChat = findChatById(targetChatId);
      const targetChat = rawTargetChat && typeof rawTargetChat.then === "function"
        ? await rawTargetChat
        : rawTargetChat;
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

      const rawNextMessageId = createMessage(
        targetChatId,
        user.id,
        forwardBody,
        null,
        forwardExpiresAt,
      );
      const nextMessageId = rawNextMessageId && typeof rawNextMessageId.then === "function"
        ? await rawNextMessageId
        : rawNextMessageId;
      if (!nextMessageId) {
        return res.status(500).json({ error: "Unable to forward message." });
      }
      await setMessageForwardOrigin(nextMessageId, {
        sourceChatId: forwardOrigin.sourceChatId,
        label: forwardOrigin.label,
        sourceUserId: forwardOrigin.sourceUserId,
        sourceUsername: forwardOrigin.sourceUsername,
        sourceAvatarUrl: forwardOrigin.sourceAvatarUrl,
        sourceColor: forwardOrigin.sourceColor,
      });
      await reuseMessageFilesForForward(sourceMessage.id, nextMessageId);
      if (String(targetChat.type || "").toLowerCase() === "saved") {
        const rawRead = markMessageRead(nextMessageId, user.id);
        if (rawRead && typeof rawRead.then === "function") await rawRead;
        const rawUnhide = unhideChat(user.id, targetChatId);
        if (rawUnhide && typeof rawUnhide.then === "function") await rawUnhide;
      }

      emitChatEvent(targetChatId, {
        type: "chat_message",
        chatId: targetChatId,
        messageId: nextMessageId,
        username: user.username,
        userId: user.id,
        body: forwardBody,
        replyToMessageId: null,
      });
      forwardedIds.push(nextMessageId);
    }

    return res.json({ ok: true, ids: forwardedIds });
  });
}

export { registerMessageRoutes };

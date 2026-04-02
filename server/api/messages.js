function registerMessageRoutes(app, deps) {
  const {
    APP_DEBUG,
    FILE_UPLOAD,
    MESSAGE_FILE_LIMITS,
    MESSAGE_FILE_RETENTION_DAYS,
    MESSAGE_MAX_CHARS,
    TRANSCODE_VIDEOS_TO_H264,
    cleanupMissingMessageFiles,
    computeExpiryIso,
    createMessage,
    createMessageFiles,
    debugLog,
    decodeOriginalFilename,
    emitChatEvent,
    emitSseEvent,
    ensureAvatarExists,
    ensureFfmpegAvailable,
    findChatById,
    findMessageById,
    findUserByUsername,
    getMessages,
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
    listMessageFilesByMessageIds,
    parseUploadFileMetadata,
    path,
    probeVideoMetadata,
    removeUploadedFiles,
    requireSession,
    requireSessionUsernameMatch,
    sanitizeDurationSeconds,
    sanitizePositiveInt,
    uploadFiles,
    uploadRootDir,
    enqueueVideoTranscodeJob,
    markMessagesRead,
    markMessageRead,
  } = deps;

  app.get("/api/messages", async (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.query.chatId);
    const username = req.query.username?.toString();
    const beforeId = Number(req.query.beforeId || 0);
    const beforeCreatedAt = req.query.beforeCreatedAt?.toString() || "";
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(10000, limitRaw))
      : 50;

    if (!chatId || !username) {
      return res.status(400).json({ error: "Chat and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!isMember(chatId, user.id)) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    let { messages, hasMore, totalCount } = getMessages(chatId, {
      beforeId: beforeId > 0 ? beforeId : null,
      beforeCreatedAt: beforeCreatedAt || null,
      limit,
    });

    const cleanup = cleanupMissingMessageFiles(
      messages.map((message) => Number(message.id)).filter(Boolean),
    );

    if (cleanup.changed) {
      if (cleanup.deletedByChat && cleanup.deletedByChat.size) {
        cleanup.deletedByChat.forEach((messageIds, chatId) => {
          emitChatEvent(Number(chatId), {
            type: "chat_message_deleted",
            chatId: Number(chatId),
            messageIds,
          });
        });
      }
      const refreshed = getMessages(chatId, {
        beforeId: beforeId > 0 ? beforeId : null,
        beforeCreatedAt: beforeCreatedAt || null,
        limit,
      });
      messages = refreshed.messages;
      hasMore = refreshed.hasMore;
      totalCount = refreshed.totalCount;
    }

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
    const readRows = getMessageReadByUser(messageIds, user.id);
    const readByMe = new Set(
      readRows.map((row) => Number(row?.message_id || 0)).filter(Boolean),
    );
    const files = await hydrateMissingVideoMetadata(
      listMessageFilesByMessageIds(messageIds),
    );

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
        read_by_me:
          Number(message?.user_id || 0) === Number(user.id) ||
          readByMe.has(Number(message.id)),
        files: filesByMessageId[Number(message.id)] || [],
      }))
      .filter((message) => {
        const isFromOther = Number(message?.user_id || 0) !== Number(user.id);
        if (!isFromOther) return true;

        const hasPendingVideo = (message.files || []).some(
          (file) =>
            String(file?.mimeType || "")
              .toLowerCase()
              .startsWith("video/") && Boolean(file?.processing),
        );

        return !hasPendingVideo;
      });

    if (APP_DEBUG) {
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

    const chat = findChatById(chatId);
    if (chat?.type === "channel" && messageIds.length) {
      const countRows = getMessageReadCounts(messageIds);
      const counts = countRows.reduce((acc, row) => {
        const id = Number(row?.message_id || 0);
        if (!id) return acc;
        acc[id] = Number(row?.count || 0);
        return acc;
      }, {});
      const authorRows = getMessageAuthors(messageIds);
      authorRows.forEach((row) => {
        const id = Number(row?.id || 0);
        if (!id) return;
        counts[id] = Number(counts[id] || 0) + 1;
      });
      enriched.forEach((msg) => {
        const id = Number(msg?.id || 0);
        if (!id) return;
        msg.seenCount = Number(counts[id] || 1);
      });
    }

    debugLog("api:messages", {
      chatId,
      username: user.username,
      messageCount: enriched.length,
      fileCount: files.length,
      hasMore,
    });

    res.json({ chatId, messages: enriched, hasMore, totalCount });
  });

  app.post("/api/messages/read", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const { chatId, username } = req.body || {};
    if (!chatId || !username) {
      return res.status(400).json({ error: "Chat and username are required." });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!isMember(Number(chatId), user.id)) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    markMessagesRead(Number(chatId), user.id);

    emitChatEvent(Number(chatId), {
      type: "chat_read",
      chatId: Number(chatId),
      username: user.username,
    });

    res.json({ ok: true });
  });

  app.post("/api/messages/read-counts", (req, res) => {
    const session = requireSession(req, res);
    if (!session) return;

    const { chatId, username, messageIds = [] } = req.body || {};
    if (!chatId || !username || !Array.isArray(messageIds)) {
      return res.status(400).json({
        error: "Chat id, username, and messageIds are required.",
      });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (!isMember(Number(chatId), user.id)) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const authors = getMessageAuthors(messageIds);
    const authorByMessageId = authors.reduce((acc, row) => {
      const id = Number(row?.id || 0);
      if (!id) return acc;
      acc[id] = Number(row?.user_id || 0);
      return acc;
    }, {});
    const rows = getMessageReadCounts(messageIds);
    const counts = rows.reduce((acc, row) => {
      const id = Number(row?.message_id || 0);
      if (!id) return acc;
      acc[id] = Number(row?.count || 0);
      return acc;
    }, {});
    Object.keys(authorByMessageId).forEach((key) => {
      const id = Number(key);
      if (!id) return;
      counts[id] = Number(counts[id] || 0) + 1;
    });

    res.json({ ok: true, counts });
  });

  app.post(
    "/api/messages/upload",
    uploadFiles.array("files", MESSAGE_FILE_LIMITS.maxFiles),
    async (req, res) => {
      const session = requireSession(req, res);
      if (!session) {
        removeUploadedFiles(req.files || []);
        return;
      }

      if (!Array.isArray(req.files)) {
        return res.status(400).json({ error: "Invalid files payload." });
      }

      const uploadedFiles = req.files;

      try {
        if (!FILE_UPLOAD) {
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
        const maxMessageChars = Math.max(1, Number(MESSAGE_MAX_CHARS || 4000));
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

        const user = findUserByUsername(username.toLowerCase());

        if (!user) {
          removeUploadedFiles(uploadedFiles);

          return res.status(404).json({ error: "User not found." });
        }

        if (!isMember(chatId, user.id)) {
          removeUploadedFiles(uploadedFiles);

          return res.status(403).json({ error: "Not a member of this chat." });
        }
        const chat = findChatById(chatId);
        if (!chat) {
          removeUploadedFiles(uploadedFiles);
          return res.status(404).json({ error: "Chat not found." });
        }
        if (chat.type === "channel") {
          const role = String(getChatMemberRole(chatId, user.id)).toLowerCase();
          if (role !== "owner") {
            removeUploadedFiles(uploadedFiles);
            return res
              .status(403)
              .json({ error: "Only channel owner can send messages." });
          }
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

        const createdAtIso = new Date().toISOString();
        const expiresAtIso = computeExpiryIso(
          createdAtIso,
          MESSAGE_FILE_RETENTION_DAYS,
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
          TRANSCODE_VIDEOS_TO_H264 &&
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

        const messageId = createMessage(
          chatId,
          user.id,
          fallbackBody,
          replyToMessageId,
        );
        if (!messageId) {
          throw new Error("Unable to create message.");
        }

        createMessageFiles(messageId, normalizedFiles);
        if (chat.type === "saved") {
          markMessageRead(messageId, user.id);
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

        if (shouldTranscodeVideos && hasVideoFiles && transcodeJobsQueued > 0) {
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

        return res.json({ id: Number(messageId) });
      } catch (error) {
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
    const session = requireSession(req, res);
    if (!session) return;

    const { chatId, username, body, replyToMessageId } = req.body || {};
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
    const maxMessageChars = Math.max(1, Number(MESSAGE_MAX_CHARS || 4000));
    if (bodyText.length > maxMessageChars) {
      return res.status(400).json({
        error: `Message must be at most ${maxMessageChars} characters.`,
      });
    }

    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!isMember(Number(chatId), user.id)) {
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const chat = findChatById(Number(chatId));
    if (!chat) {
      return res.status(404).json({ error: "Chat not found." });
    }
    if (chat.type === "channel") {
      const role = String(getChatMemberRole(Number(chatId), user.id)).toLowerCase();
      if (role !== "owner") {
        return res
          .status(403)
          .json({ error: "Only channel owner can send messages." });
      }
    }

    if (replyToMessageId) {
      const replyTarget = findMessageById(Number(replyToMessageId));
      if (!replyTarget || Number(replyTarget.chat_id) !== Number(chatId)) {
        return res
          .status(400)
          .json({ error: "Reply target is not available in this chat." });
      }
    }

    const id = createMessage(Number(chatId), user.id, bodyText, replyToMessageId);
    if (!id) {
      return res.status(500).json({ error: "Unable to create message." });
    }
    if (chat.type === "saved") {
      markMessageRead(id, user.id);
    }

    debugLog("api:messages/send", {
      chatId: Number(chatId),
      username: user.username,
      messageId: Number(id),
      bodyLength: String(body || "").length,
    });

    emitChatEvent(Number(chatId), {
      type: "chat_message",
      chatId: Number(chatId),
      messageId: Number(id),
      username: user.username,
      body,
      replyToMessageId,
    });

    try {
      const members = listChatMembers(Number(chatId));
      const mutedRows = listMutedUserIdsForChat(Number(chatId));
      const mutedIds = new Set(
        mutedRows.map((row) => Number(row?.user_id || 0)).filter(Boolean),
      );
      const recipientIds = members
        .filter((member) => Number(member.id) !== Number(user.id))
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
        const trimmedBody = String(body || "").trim();
        const notifyBody = trimmedBody || "New message";
        await sendPushNotificationToUsers(recipientIds, {
          title,
          body: notifyBody,
          data: { url: "/" },
        });
      }
    } catch {
      // ignore push failures
    }

    res.json({ id });
  });
}

export { registerMessageRoutes };

import { normalizeSongbirdSource, normalizeTelegramSource, resolveSongbirdSource } from "../lib/remoteChannels.js";
import { validateUuidParams } from "../lib/uuidMiddleware.js";

function registerRemoteChannelRoutes(app, deps) {
  const {
    getSetting,
    REMOTE_CHANNELS,
    findChatById,
    findUserByUsername,
    getRemoteChannelQueueSummary,
    getRemoteChannelSourceByChatId,
    isMember,
    listChatMembers,
    remoteChannelManager,
    requireSession,
    requireSessionUsernameMatch,
    skipAllRemoteChannelQueueItems,
    skipCurrentRemoteChannelQueueItem,
    updateRemoteChannelSourcePaused,
    upsertRemoteChannelSource,
  } = deps;

  // Telegram requires API credentials; Songbird just needs the feature enabled.
  const isTelegramAvailable = () =>
    Boolean(REMOTE_CHANNELS?.enabled && REMOTE_CHANNELS?.telegramConfigured);
  const isSongbirdAvailable = () =>
    Boolean(REMOTE_CHANNELS?.enabled);
  const isRemoteChannelAvailable = () =>
    isTelegramAvailable() || isSongbirdAvailable();

  const requireChannelOwner = async (req, res) => {
    const session = await requireSession(req, res);
    if (!session) return null;

    const chatId = req.params?.chatId;
    const username = String(
      req.body?.username || req.query?.username || session.username || "",
    ).trim();

    if (!chatId || !username) {
      res.status(400).json({ error: "Channel id and username are required." });
      return null;
    }
    if (!requireSessionUsernameMatch(res, session, username)) return null;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return null;
    }

    const rawChat = findChatById(chatId);
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (!chat || String(chat.type || "").toLowerCase() !== "channel") {
      res.status(404).json({ error: "Channel not found." });
      return null;
    }

    const rawIsMem = isMember(chatId, user.id);
    const isMem = typeof rawIsMem?.then === "function" ? await rawIsMem : rawIsMem;
    if (!isMem) {
      res.status(403).json({ error: "Not a member of this channel." });
      return null;
    }

    const rawMembers = listChatMembers(chatId);
    const members = Array.isArray(rawMembers) ? rawMembers : (await rawMembers) || [];
    const isOwner = members.some(
      (member) =>
        member.id === user.id &&
        String(member.role || "").toLowerCase() === "owner",
    );

    if (!isOwner) {
      res
        .status(403)
        .json({ error: "Only channel owner can manage Remote Channel." });
      return null;
    }

    return { chat, chatId, user };
  };

  const serializeSource = (source) => {
    if (!source?.id) return null;

    return {
      id: Number(source.id),
      enabled: Boolean(Number(source.enabled || 0)),
      paused: Boolean(Number(source.paused || 0)),
      provider: source.provider || "telegram",
      sourceRaw: source.source_raw || "",
      sourceChatId: source.source_chat_id || "",
      sourceUsername: source.source_username || "",
      sourceUrl: source.source_url || "",
      sourceTitle: source.source_title || "",
      sourceAvatarUrl: source.source_avatar_url || "",
      lastRemoteMessageId: Number(source.last_remote_message_id || 0) || null,
      syncMetadata: Boolean(Number(source.sync_metadata || 0)),
      streamMedia: Boolean(getSetting("FILE_UPLOAD") && Number(source.stream_media || 0)),
      lastError: source.last_error || "",
      lastSeenAt: source.last_seen_at || null,
      queue: getRemoteChannelQueueSummary(source.id),
      updatedAt: source.updated_at || null,
    };
  };

  app.get("/api/chats/:chatId/remote-channel", validateUuidParams('chatId'), async (req, res) => {
    // Any channel member can view the connection status.
    // Queue details are only included for the channel owner.
    const session = await requireSession(req, res);
    if (!session) return;

    const chatId = req.params.chatId;
    const username = String(req.query?.username || session.username || "").trim();

    if (!chatId || !username) {
      return res.status(400).json({ error: "Channel id and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const rawUser = findUserByUsername(username.toLowerCase());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) return res.status(404).json({ error: "User not found." });

    const rawChat = findChatById(chatId);
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    if (!chat || String(chat.type || "").toLowerCase() !== "channel") {
      return res.status(404).json({ error: "Channel not found." });
    }

    const rawIsMem = isMember(chatId, user.id);
    const isMem = typeof rawIsMem?.then === "function" ? await rawIsMem : rawIsMem;
    if (!isMem) {
      return res.status(403).json({ error: "Not a member of this channel." });
    }

    const rawMembers = listChatMembers(chatId);
    const members = Array.isArray(rawMembers) ? rawMembers : (await rawMembers) || [];
    const isOwner = members.some(
      (member) =>
        member.id === user.id &&
        String(member.role || "").toLowerCase() === "owner",
    );

    const rawSource = getRemoteChannelSourceByChatId(chatId);
    const source = rawSource && typeof rawSource.then === "function" ? await rawSource : rawSource;
    const serialized = serializeSource(source);

    // Strip queue details for non-owners
    if (serialized && !isOwner) {
      delete serialized.queue;
    }

    return res.json({
      available: isRemoteChannelAvailable(),
      telegramConfigured: Boolean(REMOTE_CHANNELS?.telegramConfigured),
      songbirdConfigured: isSongbirdAvailable(),
      proxyConfigured: Boolean(REMOTE_CHANNELS?.proxyConfigured),
      source: serialized,
    });
  });

  app.put("/api/chats/:chatId/remote-channel", validateUuidParams('chatId'), async (req, res) => {
    const context = await requireChannelOwner(req, res);
    if (!context) return;

    if (!isRemoteChannelAvailable()) {
      return res.status(503).json({
        error: "Remote Channel is not configured on this server.",
      });
    }

    const enabled = Boolean(req.body?.enabled);
    const syncMetadata = Boolean(req.body?.syncMetadata);
    const streamMedia = Boolean(getSetting("FILE_UPLOAD") && req.body?.streamMedia);
    const provider = String(req.body?.provider || "telegram").toLowerCase();

    if (provider !== "telegram" && provider !== "songbird") {
      return res.status(400).json({ error: "Remote Channel provider is invalid." });
    }

    if (provider === "telegram" && !isTelegramAvailable()) {
      return res.status(503).json({
        error: "Telegram Remote Channel is not configured on this server.",
      });
    }

    const rawSource = String(
      req.body?.source || req.body?.sourceRaw || "",
    ).trim();

    let normalized = {
      ok: true,
      sourceRaw: rawSource,
      sourceChatId: "",
      sourceUsername: "",
      sourceUrl: "",
    };

    if (provider === "telegram") {
      if (enabled) {
        normalized = normalizeTelegramSource(rawSource);
        if (!normalized.ok) {
          return res.status(400).json({ error: normalized.error });
        }
      } else if (rawSource) {
        const optionalNormalized = normalizeTelegramSource(rawSource);
        if (optionalNormalized.ok) normalized = optionalNormalized;
      }
      if (enabled && !normalized.sourceChatId && !normalized.sourceUsername) {
        return res.status(400).json({ error: "Telegram source is required." });
      }
    } else {
      // provider === "songbird"
      if (enabled) {
        normalized = normalizeSongbirdSource(rawSource);
        if (!normalized.ok) {
          return res.status(400).json({ error: normalized.error });
        }
        // Resolve the actual channel username from the target server.
        // This also validates the server is public and the channel exists.
        const resolved = await resolveSongbirdSource(
          normalized.sourceUrl,
          normalized.inviteTarget,
        );
        if (!resolved.ok) {
          return res.status(400).json({ error: resolved.error });
        }
        normalized = { ...normalized, sourceUsername: resolved.sourceUsername };
      } else if (rawSource) {
        const optionalNormalized = normalizeSongbirdSource(rawSource);
        if (optionalNormalized.ok) normalized = optionalNormalized;
      }
      if (enabled && !normalized.sourceUrl) {
        return res.status(400).json({ error: "Songbird source URL is required." });
      }
    }

    let source = upsertRemoteChannelSource({
      chatId: context.chatId,
      provider,
      sourceRaw: normalized.sourceRaw,
      sourceChatId: normalized.sourceChatId || "",
      sourceUsername: normalized.sourceUsername || "",
      sourceUrl: normalized.sourceUrl || "",
      syncMetadata,
      streamMedia,
      enabled,
    });

    if (
      enabled &&
      syncMetadata &&
      typeof remoteChannelManager?.syncSourceMetadata === "function"
    ) {
      // Run metadata sync in the background — works for both Telegram and Songbird.
      const sourceId = source.id;
      remoteChannelManager.syncSourceMetadata(sourceId).catch(() => {
        // Errors are recorded on the source record by syncSourceMetadata itself.
      });
    }

    return res.json({
      ok: true,
      available: true,
      source: serializeSource(source),
    });
  });

  // Pause remote channel mirroring
  app.post("/api/chats/:chatId/remote-channel/pause", validateUuidParams('chatId'), async (req, res) => {
    const context = await requireChannelOwner(req, res);
    if (!context) return;

    const rawSource = getRemoteChannelSourceByChatId(context.chatId);
    const source = rawSource && typeof rawSource.then === "function" ? await rawSource : rawSource;
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    await updateRemoteChannelSourcePaused(source.id, true);

    return res.json({
      ok: true,
      message: "Remote channel paused successfully.",
    });
  });

  // Resume remote channel mirroring
  app.post("/api/chats/:chatId/remote-channel/resume", validateUuidParams('chatId'), async (req, res) => {
    const context = await requireChannelOwner(req, res);
    if (!context) return;

    const rawSource = getRemoteChannelSourceByChatId(context.chatId);
    const source = rawSource && typeof rawSource.then === "function" ? await rawSource : rawSource;
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    await updateRemoteChannelSourcePaused(source.id, false);

    return res.json({
      ok: true,
      message: "Remote channel resumed successfully.",
    });
  });

  // Skip current queue item
  app.post("/api/chats/:chatId/remote-channel/skip", validateUuidParams('chatId'), async (req, res) => {
    const context = await requireChannelOwner(req, res);
    if (!context) return;

    const rawSource = getRemoteChannelSourceByChatId(context.chatId);
    const source = rawSource && typeof rawSource.then === "function" ? await rawSource : rawSource;
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    // Use the manager's abort path so in-flight (processing) items are also
    // interrupted via the in-memory abort set.
    const skipped =
      typeof remoteChannelManager?.abortQueueItem === "function"
        ? await remoteChannelManager.abortQueueItem(source.id)
        : await skipCurrentRemoteChannelQueueItem(source.id);

    return res.json({
      ok: true,
      message: skipped > 0 ? "Queue item skipped." : "No items to skip.",
      skipped,
    });
  });

  // Skip all queue items
  app.post("/api/chats/:chatId/remote-channel/skip-all", validateUuidParams('chatId'), async (req, res) => {
    const context = await requireChannelOwner(req, res);
    if (!context) return;

    const rawSource = getRemoteChannelSourceByChatId(context.chatId);
    const source = rawSource && typeof rawSource.then === "function" ? await rawSource : rawSource;
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    // Use the manager's abort path so in-flight (processing) items are also
    // interrupted via the in-memory abort set.
    const skipped =
      typeof remoteChannelManager?.abortAllQueueItems === "function"
        ? await remoteChannelManager.abortAllQueueItems(source.id)
        : await skipAllRemoteChannelQueueItems(source.id);

    return res.json({
      ok: true,
      message: `${skipped} queue items skipped.`,
      skipped,
    });
  });

  // Test connection to remote channel
  app.post("/api/chats/:chatId/remote-channel/test", validateUuidParams('chatId'), async (req, res) => {
    const context = await requireChannelOwner(req, res);
    if (!context) return;

    const rawSource = getRemoteChannelSourceByChatId(context.chatId);
    const source = rawSource && typeof rawSource.then === "function" ? await rawSource : rawSource;
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    if (!source.enabled) {
      return res.status(400).json({ error: "Remote channel is disabled." });
    }

    try {
      if (typeof remoteChannelManager?.testConnection === "function") {
        await remoteChannelManager.testConnection(source.id);
        return res.json({
          ok: true,
          message: "Connection test successful!",
        });
      }
      return res.status(501).json({ error: "Test connection not implemented." });
    } catch (error) {
      return res.status(400).json({
        error: `Connection test failed: ${error?.message || "Unknown error"}`,
      });
    }
  });
}

export { registerRemoteChannelRoutes };

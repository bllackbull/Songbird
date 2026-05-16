import { normalizeTelegramSource } from "../lib/remoteChannels.js";

function registerRemoteChannelRoutes(app, deps) {
  const {
    FILE_UPLOAD,
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

  const isRemoteChannelAvailable = () =>
    Boolean(REMOTE_CHANNELS?.enabled && REMOTE_CHANNELS?.telegramConfigured);

  const requireChannelOwner = (req, res) => {
    const session = requireSession(req, res);
    if (!session) return null;

    const chatId = Number(req.params?.chatId || 0);
    const username = String(
      req.body?.username || req.query?.username || session.username || "",
    ).trim();

    if (!chatId || !username) {
      res.status(400).json({ error: "Channel id and username are required." });
      return null;
    }
    if (!requireSessionUsernameMatch(res, session, username)) return null;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return null;
    }

    const chat = findChatById(chatId);
    if (!chat || String(chat.type || "").toLowerCase() !== "channel") {
      res.status(404).json({ error: "Channel not found." });
      return null;
    }

    if (!isMember(chatId, user.id)) {
      res.status(403).json({ error: "Not a member of this channel." });
      return null;
    }

    const isOwner = listChatMembers(chatId).some(
      (member) =>
        Number(member.id) === Number(user.id) &&
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
      sourceTitle: source.source_title || "",
      sourceAvatarUrl: source.source_avatar_url || "",
      lastRemoteMessageId: Number(source.last_remote_message_id || 0) || null,
      syncMetadata: Boolean(Number(source.sync_metadata || 0)),
      streamMedia: Boolean(FILE_UPLOAD && Number(source.stream_media || 0)),
      lastError: source.last_error || "",
      lastSeenAt: source.last_seen_at || null,
      queue: getRemoteChannelQueueSummary(source.id),
      updatedAt: source.updated_at || null,
    };
  };

  app.get("/api/chats/:chatId/remote-channel", (req, res) => {
    // Any channel member can view the connection status.
    // Queue details are only included for the channel owner.
    const session = requireSession(req, res);
    if (!session) return;

    const chatId = Number(req.params?.chatId || 0);
    const username = String(req.query?.username || session.username || "").trim();

    if (!chatId || !username) {
      return res.status(400).json({ error: "Channel id and username are required." });
    }
    if (!requireSessionUsernameMatch(res, session, username)) return;

    const user = findUserByUsername(username.toLowerCase());
    if (!user) return res.status(404).json({ error: "User not found." });

    const chat = findChatById(chatId);
    if (!chat || String(chat.type || "").toLowerCase() !== "channel") {
      return res.status(404).json({ error: "Channel not found." });
    }

    if (!isMember(chatId, user.id)) {
      return res.status(403).json({ error: "Not a member of this channel." });
    }

    const isOwner = listChatMembers(chatId).some(
      (member) =>
        Number(member.id) === Number(user.id) &&
        String(member.role || "").toLowerCase() === "owner",
    );

    const source = getRemoteChannelSourceByChatId(chatId);
    const serialized = serializeSource(source);

    // Strip queue details for non-owners
    if (serialized && !isOwner) {
      delete serialized.queue;
    }

    return res.json({
      available: isRemoteChannelAvailable(),
      telegramConfigured: Boolean(REMOTE_CHANNELS?.telegramConfigured),
      proxyConfigured: Boolean(REMOTE_CHANNELS?.proxyConfigured),
      source: serialized,
    });
  });

  app.put("/api/chats/:chatId/remote-channel", async (req, res) => {
    const context = requireChannelOwner(req, res);
    if (!context) return;

    if (!isRemoteChannelAvailable()) {
      return res.status(503).json({
        error: "Remote Channel is not configured on this server.",
      });
    }

    const enabled = Boolean(req.body?.enabled);
    const syncMetadata = Boolean(req.body?.syncMetadata);
    const streamMedia = Boolean(FILE_UPLOAD && req.body?.streamMedia);
    const provider = String(req.body?.provider || "telegram").toLowerCase();
    if (provider !== "telegram") {
      return res.status(400).json({ error: "Remote Channel source is invalid." });
    }
    const rawSource = String(
      req.body?.source || req.body?.sourceRaw || "",
    ).trim();

    let normalized = {
      ok: true,
      sourceRaw: rawSource,
      sourceChatId: "",
      sourceUsername: "",
    };

    if (enabled) {
      normalized = normalizeTelegramSource(rawSource);
      if (!normalized.ok) {
        return res.status(400).json({ error: normalized.error });
      }
    } else if (rawSource) {
      const optionalNormalized = normalizeTelegramSource(rawSource);
      if (optionalNormalized.ok) {
        normalized = optionalNormalized;
      }
    }

    if (enabled && !normalized.sourceChatId && !normalized.sourceUsername) {
      return res.status(400).json({ error: "Telegram source is required." });
    }

    let source = upsertRemoteChannelSource({
      chatId: context.chatId,
      sourceRaw: normalized.sourceRaw,
      sourceChatId: normalized.sourceChatId,
      sourceUsername: normalized.sourceUsername,
      syncMetadata,
      streamMedia,
      enabled,
    });

    if (
      enabled &&
      syncMetadata &&
      typeof remoteChannelManager?.syncSourceMetadata === "function"
    ) {
      // Run metadata sync in the background so the response is not blocked by
      // Telegram network round-trips (getEntity + downloadProfilePhoto).
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
  app.post("/api/chats/:chatId/remote-channel/pause", (req, res) => {
    const context = requireChannelOwner(req, res);
    if (!context) return;

    const source = getRemoteChannelSourceByChatId(context.chatId);
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    updateRemoteChannelSourcePaused(source.id, true);

    return res.json({
      ok: true,
      message: "Remote channel paused successfully.",
    });
  });

  // Resume remote channel mirroring
  app.post("/api/chats/:chatId/remote-channel/resume", (req, res) => {
    const context = requireChannelOwner(req, res);
    if (!context) return;

    const source = getRemoteChannelSourceByChatId(context.chatId);
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    updateRemoteChannelSourcePaused(source.id, false);

    return res.json({
      ok: true,
      message: "Remote channel resumed successfully.",
    });
  });

  // Skip current queue item
  app.post("/api/chats/:chatId/remote-channel/skip", (req, res) => {
    const context = requireChannelOwner(req, res);
    if (!context) return;

    const source = getRemoteChannelSourceByChatId(context.chatId);
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    // Use the manager's abort path so in-flight (processing) items are also
    // interrupted via the in-memory abort set.
    const skipped =
      typeof remoteChannelManager?.abortQueueItem === "function"
        ? remoteChannelManager.abortQueueItem(source.id)
        : skipCurrentRemoteChannelQueueItem(source.id);

    return res.json({
      ok: true,
      message: skipped > 0 ? "Queue item skipped." : "No items to skip.",
      skipped,
    });
  });

  // Skip all queue items
  app.post("/api/chats/:chatId/remote-channel/skip-all", (req, res) => {
    const context = requireChannelOwner(req, res);
    if (!context) return;

    const source = getRemoteChannelSourceByChatId(context.chatId);
    if (!source) {
      return res.status(404).json({ error: "Remote channel not found." });
    }

    // Use the manager's abort path so in-flight (processing) items are also
    // interrupted via the in-memory abort set.
    const skipped =
      typeof remoteChannelManager?.abortAllQueueItems === "function"
        ? remoteChannelManager.abortAllQueueItems(source.id)
        : skipAllRemoteChannelQueueItems(source.id);

    return res.json({
      ok: true,
      message: `${skipped} queue items skipped.`,
      skipped,
    });
  });

  // Test connection to remote channel
  app.post("/api/chats/:chatId/remote-channel/test", async (req, res) => {
    const context = requireChannelOwner(req, res);
    if (!context) return;

    const source = getRemoteChannelSourceByChatId(context.chatId);
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

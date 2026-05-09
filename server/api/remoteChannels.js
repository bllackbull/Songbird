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
    const context = requireChannelOwner(req, res);
    if (!context) return;

    const source = getRemoteChannelSourceByChatId(context.chatId);

    return res.json({
      available: isRemoteChannelAvailable(),
      telegramConfigured: Boolean(REMOTE_CHANNELS?.telegramConfigured),
      proxyConfigured: Boolean(REMOTE_CHANNELS?.proxyConfigured),
      source: serializeSource(source),
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
      try {
        await remoteChannelManager.syncSourceMetadata(source.id);
        source = getRemoteChannelSourceByChatId(context.chatId) || source;
      } catch (error) {
        return res.status(400).json({
          error: `Unable to sync Telegram metadata: ${
            error?.message || "Unknown error"
          }`,
        });
      }
    }

    return res.json({
      ok: true,
      available: true,
      source: serializeSource(source),
    });
  });
}

export { registerRemoteChannelRoutes };

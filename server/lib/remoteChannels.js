import net from "node:net";
import tls from "node:tls";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

function normalizeTelegramSource(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { ok: false, error: "Telegram source is required." };
  }

  const numericSource = raw.match(/^-?\d{5,}$/);
  if (numericSource) {
    return {
      ok: true,
      sourceRaw: raw,
      sourceChatId: raw,
      sourceUsername: "",
      displayName: raw,
    };
  }

  let candidate = raw;
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (!["t.me", "telegram.me"].includes(host)) {
        return {
          ok: false,
          error: "Telegram source must be a t.me channel link or username.",
        };
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "s") parts.shift();
      candidate = parts[0] || "";
    } catch {
      return { ok: false, error: "Telegram source URL is invalid." };
    }
  }

  candidate = candidate.replace(/^@+/, "").trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(candidate)) {
    return {
      ok: false,
      error:
        "Telegram source must be a public channel username or t.me channel link.",
    };
  }

  const sourceUsername = candidate.toLowerCase();
  return {
    ok: true,
    sourceRaw: raw,
    sourceChatId: "",
    sourceUsername,
    displayName: `@${sourceUsername}`,
  };
}

function errorMessage(error) {
  return String(error?.message || error || "Unknown error")
    .replace(/session[=:]\s*["']?[^"',\s]+/gi, "session=<redacted>")
    .slice(0, 1000);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

class PromisedHttpProxySockets {
  constructor(proxy) {
    this.proxy = proxy;
    this.client = null;
    this.closed = true;
    this.stream = Buffer.alloc(0);
    this.canRead = Promise.resolve(false);
    this.resolveRead = null;
  }

  async readExactly(number) {
    let readData = Buffer.alloc(0);
    while (true) {
      const chunk = await this.read(number);
      readData = Buffer.concat([readData, chunk]);
      number -= chunk.length;
      if (!number || number === -437) return readData;
    }
  }

  async read(number) {
    if (this.closed) throw new Error("NetSocket was closed");
    await this.canRead;
    if (this.closed) throw new Error("NetSocket was closed");
    const toReturn = this.stream.slice(0, number);
    this.stream = this.stream.slice(number);
    if (this.stream.length === 0) {
      this.canRead = new Promise((resolve) => {
        this.resolveRead = resolve;
      });
    }
    return toReturn;
  }

  async readAll() {
    if (this.closed) throw new Error("NetSocket was closed");
    await this.canRead;
    if (this.closed) throw new Error("NetSocket was closed");
    const toReturn = this.stream;
    this.stream = Buffer.alloc(0);
    this.canRead = new Promise((resolve) => {
      this.resolveRead = resolve;
    });
    return toReturn;
  }

  async connect(port, ip) {
    if (!this.proxy?.httpProxy) {
      throw new Error("HTTP proxy socket requires an HTTP proxy config.");
    }

    this.stream = Buffer.alloc(0);
    this.canRead = new Promise((resolve) => {
      this.resolveRead = resolve;
    });
    this.closed = false;

    this.client = await this.openProxySocket();
    await this.openTunnel(ip, port);
    this.receive();
    return this;
  }

  openProxySocket() {
    const connectOptions = {
      host: this.proxy.ip,
      port: this.proxy.port,
      timeout: (this.proxy.timeout || 10) * 1000,
    };

    return new Promise((resolve, reject) => {
      const socket =
        this.proxy.protocol === "https:"
          ? tls.connect(connectOptions)
          : net.connect(connectOptions);
      const cleanup = () => {
        socket.removeListener("connect", onConnect);
        socket.removeListener("secureConnect", onConnect);
        socket.removeListener("error", onError);
        socket.removeListener("timeout", onTimeout);
      };
      const onConnect = () => {
        cleanup();
        resolve(socket);
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        socket.destroy();
        reject(new Error("HTTP proxy connection timed out."));
      };
      socket.once(
        this.proxy.protocol === "https:" ? "secureConnect" : "connect",
        onConnect,
      );
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
    });
  }

  openTunnel(ip, port) {
    const auth =
      this.proxy.username || this.proxy.password
        ? `Proxy-Authorization: Basic ${Buffer.from(
            `${this.proxy.username || ""}:${this.proxy.password || ""}`,
          ).toString("base64")}\r\n`
        : "";
    const target = `${ip}:${port}`;
    const request =
      `CONNECT ${target} HTTP/1.1\r\n` +
      `Host: ${target}\r\n` +
      auth +
      "Proxy-Connection: Keep-Alive\r\n\r\n";

    return new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const socket = this.client;
      const cleanup = () => {
        socket.removeListener("data", onData);
        socket.removeListener("error", onError);
        socket.removeListener("timeout", onTimeout);
      };
      const onData = (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        const header = buffer.slice(0, headerEnd).toString("latin1");
        const firstLine = header.split("\r\n")[0] || "";
        if (!/^HTTP\/\d(?:\.\d)?\s+2\d\d\b/i.test(firstLine)) {
          cleanup();
          reject(new Error(`HTTP proxy CONNECT failed: ${firstLine}`));
          return;
        }
        const rest = buffer.slice(headerEnd + 4);
        if (rest.length) {
          this.stream = Buffer.concat([this.stream, rest]);
          this.resolveRead?.(true);
        }
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onTimeout = () => {
        cleanup();
        socket.destroy();
        reject(new Error("HTTP proxy CONNECT timed out."));
      };
      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("timeout", onTimeout);
      socket.write(request);
    });
  }

  write(data) {
    if (this.closed) throw new Error("NetSocket was closed");
    this.client?.write(data);
  }

  async close() {
    this.client?.destroy();
    this.client?.unref?.();
    this.closed = true;
    this.resolveRead?.(false);
  }

  receive() {
    this.client?.on("data", (message) => {
      this.stream = Buffer.concat([this.stream, message]);
      this.resolveRead?.(true);
    });
    this.client?.on("close", () => {
      this.closed = true;
      this.resolveRead?.(false);
    });
  }

  toString() {
    return "PromisedHttpProxySocket";
  }
}

function toPlainId(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value || "").trim();
}

function resolveTelegramSourceRef(source) {
  const username = String(source?.source_username || "")
    .trim()
    .replace(/^@+/, "");
  if (username) return `@${username}`;

  const raw = String(source?.source_chat_id || source?.source_raw || "").trim();
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function resolveEntityTitle(entity, source) {
  const title =
    String(entity?.title || entity?.firstName || entity?.username || "").trim() ||
    String(source?.source_title || "").trim();
  if (title) return title;
  const username = String(source?.source_username || "").trim();
  if (username) return `@${username.replace(/^@+/, "")}`;
  return "Telegram channel";
}

function resolveEntityUsername(entity, source) {
  return (
    String(entity?.username || "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase() ||
    String(source?.source_username || "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase()
  );
}

function resolveEntityChatId(entity, source) {
  return (
    toPlainId(entity?.id) ||
    String(source?.source_chat_id || source?.source_raw || "").trim()
  );
}

function extractTelegramPostText(message) {
  return String(message?.message || message?.text || "").trim();
}

function truncateBody(body, maxChars) {
  const text = String(body || "");
  const limit = Math.max(1, Number(maxChars || 4000));
  if (text.length <= limit) return text;
  if (limit <= 3) return text.slice(0, limit);
  return `${text.slice(0, limit - 3)}...`;
}

function buildTelegramOriginLabel(source = {}) {
  const title = String(source?.title || source?.source_title || "").trim();
  if (title) return `Telegram: ${title}`;
  const username = String(source?.username || source?.source_username || "")
    .trim()
    .replace(/^@+/, "");
  if (username) return `Telegram: @${username}`;
  return "Telegram channel";
}

function computeTextExpiryIso(retentionDays) {
  const days = Number(retentionDays || 0);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseTelegramProxy(proxyUrl, logger = null) {
  const raw = String(proxyUrl || "").trim();
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const protocol = url.protocol.toLowerCase();
    const port = Number(url.port || 0);
    if (!url.hostname || !port) {
      logger?.("[remote-channel] Telegram proxy URL must include host and port.");
      return undefined;
    }
    if (protocol === "socks5:" || protocol === "socks4:") {
      return {
        ip: url.hostname,
        port,
        socksType: protocol === "socks5:" ? 5 : 4,
        username: decodeURIComponent(url.username || "") || undefined,
        password: decodeURIComponent(url.password || "") || undefined,
        timeout: 10,
      };
    }
    if (protocol === "http:" || protocol === "https:") {
      return {
        httpProxy: true,
        protocol,
        ip: url.hostname,
        port,
        username: decodeURIComponent(url.username || "") || undefined,
        password: decodeURIComponent(url.password || "") || undefined,
        timeout: 10,
      };
    }
    if (protocol === "mtproxy:") {
      const secret =
        decodeURIComponent(url.password || "") ||
        decodeURIComponent(url.username || "") ||
        String(url.pathname || "").replace(/^\/+/, "");
      if (!secret) {
        logger?.("[remote-channel] MTProxy URL must include a secret.");
        return undefined;
      }
      return {
        MTProxy: true,
        ip: url.hostname,
        port,
        secret,
        timeout: 10,
      };
    }
    logger?.(
      "[remote-channel] Telegram MTProto mode supports http://, https://, socks4://, socks5://, or mtproxy:// proxy URLs.",
    );
  } catch (error) {
    logger?.(`[remote-channel] invalid Telegram proxy URL: ${errorMessage(error)}`);
  }

  return undefined;
}

function getTelegramClientConnectionOptions(proxyUrl, logger = null) {
  const proxy = parseTelegramProxy(proxyUrl, logger);
  if (!proxy) return {};
  if (proxy.httpProxy) {
    return { proxy, networkSocket: PromisedHttpProxySockets };
  }
  return { proxy };
}

function serializeTelegramMessage(message) {
  return {
    id: Number(message?.id || 0) || 0,
    message: String(message?.message || message?.text || ""),
    date: Number(message?.date || 0) || null,
    groupedId: toPlainId(message?.groupedId) || null,
    hasMedia: Boolean(message?.media),
    post: Boolean(message?.post),
  };
}

function createRemoteChannelManager(deps = {}) {
  const {
    config = {},
    createOrReuseMessage,
    debugLog = () => {},
    emitChatEvent,
    emitSseEvent,
    findChatById,
    findUserById,
    fs,
    getRemoteChannelProviderState,
    listEnabledRemoteChannelSources,
    listChatMembers,
    listMutedUserIdsForChat,
    enqueueRemoteChannelQueueItem,
    releaseStaleRemoteChannelQueueItems,
    claimNextRemoteChannelQueueItem,
    markRemoteChannelQueueItemDone,
    markRemoteChannelQueueItemRetry,
    markRemoteChannelQueueItemSkipped,
    path,
    sendPushNotificationToUsers,
    setMessageForwardOrigin,
    setRemoteChannelProviderState,
    storageEncryption,
    updateChannelChat,
    updateRemoteChannelSourceError,
    updateRemoteChannelSourceSeen,
  } = deps;

  const apiId = Number(config.telegramApiId || 0);
  const apiHash = String(config.telegramApiHash || "").trim();
  const sessionString = String(config.telegramSessionString || "").trim();
  const enabled = Boolean(config.enabled && apiId && apiHash && sessionString);
  const pollIntervalMs = Math.max(1000, Number(config.pollIntervalMs || 5000));
  const pollLimit = Math.max(1, Math.min(100, Number(config.telegramPollLimit || 50)));
  const queueIntervalMs = Math.max(250, Number(config.queueIntervalMs || 1000));
  const maxAttempts = Math.max(1, Number(config.queueMaxAttempts || 10));
  const staleLockMs = Math.max(10_000, Number(config.queueStaleLockMs || 5 * 60_000));
  const queueBatchSize = Math.max(1, Math.min(50, Number(config.queueBatchSize || 10)));
  const messageTextRetentionDays = Number(config.messageTextRetentionDays || 0);
  const messageMaxChars = Math.max(1, Number(config.messageMaxChars || 4000));
  const avatarUploadRootDir = String(config.avatarUploadRootDir || "").trim();
  const lockOwner = `songbird-${process.pid}`;
  const entityCache = new Map();
  const connectionOptions = getTelegramClientConnectionOptions(config.proxyUrl, (message) =>
    console.warn(message),
  );

  let stopped = true;
  let pollLoopRunning = false;
  let queueLoopRunning = false;
  let queueTimer = null;
  let client = null;

  const log = (...args) => debugLog("remote-channel", ...args);

  function createClient() {
    return new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 10,
      reconnectRetries: 10,
      retryDelay: 2000,
      autoReconnect: true,
      ...connectionOptions,
      deviceModel: "Songbird",
      systemVersion: "Songbird Server",
      appVersion: "1.0",
    });
  }

  async function ensureClient() {
    if (!client) {
      client = createClient();
    }
    if (!client.connected) {
      await client.connect();
    }
    const authorized =
      typeof client.isUserAuthorized === "function"
        ? await client.isUserAuthorized()
        : Boolean(await client.getMe().catch(() => null));
    if (!authorized) {
      throw new Error("Telegram session is not authorized.");
    }
    return client;
  }

  async function cacheSourceAvatar(activeClient, source, entity) {
    if (!fs || !path || !avatarUploadRootDir) return source?.source_avatar_url || "";
    const photoId = toPlainId(entity?.photo?.photoId || entity?.photo?.id);
    if (
      photoId &&
      String(source?.source_avatar_url || "").includes(`-${photoId}.jpg`)
    ) {
      return source.source_avatar_url;
    }

    let buffer = null;
    try {
      const result = await activeClient.downloadProfilePhoto(entity, { isBig: false });
      if (Buffer.isBuffer(result) && result.length) {
        buffer = result;
      }
    } catch {
      return source?.source_avatar_url || "";
    }
    if (!buffer) return "";

    const safePhotoId = (photoId || Date.now().toString()).replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = `telegram-source-${Number(source.id)}-${safePhotoId}.jpg`;
    const filePath = path.join(avatarUploadRootDir, fileName);
    try {
      fs.mkdirSync(avatarUploadRootDir, { recursive: true });
      fs.writeFileSync(filePath, buffer);
      storageEncryption?.encryptFileInPlace?.(filePath);
      return `/api/uploads/avatars/${fileName}`;
    } catch {
      return source?.source_avatar_url || "";
    }
  }

  async function resolveSource(activeClient, source) {
    const ref = resolveTelegramSourceRef(source);
    if (!ref) throw new Error("Telegram source is not configured.");

    const cacheKey = `${source.id}:${String(source.source_raw || ref)}`;
    let entity = entityCache.get(cacheKey);
    if (!entity) {
      entity = await activeClient.getEntity(ref);
      entityCache.set(cacheKey, entity);
    }

    const title = resolveEntityTitle(entity, source);
    const username = resolveEntityUsername(entity, source);
    const sourceChatId = resolveEntityChatId(entity, source);
    const avatarUrl = await cacheSourceAvatar(activeClient, source, entity);

    return { entity, title, username, sourceChatId, avatarUrl };
  }

  async function pollSource(activeClient, source) {
    const resolved = await resolveSource(activeClient, source);
    const targetChat = findChatById(Number(source.chat_id || 0));
    if (
      targetChat &&
      Boolean(Number(source.sync_metadata || 0)) &&
      typeof updateChannelChat === "function"
    ) {
      const nextName = resolved.title || targetChat.name;
      const nextAvatarUrl = resolved.avatarUrl || null;
      const metadataChanged =
        String(nextName || "") !== String(targetChat.name || "") ||
        String(nextAvatarUrl || "") !== String(targetChat.group_avatar_url || "");
      if (metadataChanged) {
        updateChannelChat(Number(targetChat.id), {
          name: nextName,
          groupUsername: targetChat.group_username,
          groupVisibility: targetChat.group_visibility,
          allowMemberInvites: Boolean(
            Number(targetChat.allow_member_invites || 0),
          ),
          groupAvatarUrl: nextAvatarUrl,
        });
        listChatMembers(Number(targetChat.id))
          .map((member) => String(member?.username || "").toLowerCase())
          .filter(Boolean)
          .forEach((memberUsername) => {
            try {
              emitSseEvent?.(memberUsername, {
                type: "chat_list_changed",
                chatId: Number(targetChat.id),
              });
            } catch {
              // ignore realtime list errors
            }
          });
      }
    }
    const lastMessageId = Number(source?.last_remote_message_id || 0) || 0;
    if (!lastMessageId) {
      const latest = await activeClient.getMessages(resolved.entity, { limit: 1 });
      const latestMessageId = Number(latest?.[0]?.id || 0) || 0;
      updateRemoteChannelSourceSeen(source.id, {
        sourceChatId: resolved.sourceChatId,
        sourceUsername: resolved.username,
        sourceTitle: resolved.title,
        sourceAvatarUrl: resolved.avatarUrl,
        lastRemoteMessageId: latestMessageId,
      });
      return { queued: 0, initialized: true };
    }

    const messages = await activeClient.getMessages(resolved.entity, {
      limit: pollLimit,
      minId: lastMessageId,
      reverse: true,
    });
    const ordered = Array.from(messages || [])
      .filter((message) => Number(message?.id || 0) > lastMessageId)
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));

    let queued = 0;
    let maxSeenId = lastMessageId;
    for (const message of ordered) {
      const telegramMessageId = Number(message?.id || 0) || 0;
      if (!telegramMessageId) continue;
      maxSeenId = Math.max(maxSeenId, telegramMessageId);
      const payloadJson = JSON.stringify({
        message: serializeTelegramMessage(message),
        source: {
          title: resolved.title,
          username: resolved.username,
          sourceChatId: resolved.sourceChatId,
          avatarUrl: resolved.avatarUrl,
        },
        receivedAt: new Date().toISOString(),
      });
      const row = enqueueRemoteChannelQueueItem({
        sourceId: source.id,
        telegramMessageId,
        payloadJson,
      });
      if (row?.id) queued += 1;
    }

    updateRemoteChannelSourceSeen(source.id, {
      sourceChatId: resolved.sourceChatId,
      sourceUsername: resolved.username,
      sourceTitle: resolved.title,
      sourceAvatarUrl: resolved.avatarUrl,
      lastRemoteMessageId: maxSeenId,
    });

    return { queued, initialized: false };
  }

  async function pollTelegramOnce() {
    const sources = listEnabledRemoteChannelSources("telegram");
    if (!sources.length) {
      await sleep(pollIntervalMs);
      return;
    }

    const activeClient = await ensureClient();
    for (const source of sources) {
      if (stopped) return;
      try {
        await pollSource(activeClient, source);
        updateRemoteChannelSourceError(source.id, "");
      } catch (error) {
        const message = errorMessage(error);
        updateRemoteChannelSourceError(source.id, message);
        log("poll-source:error", { sourceId: Number(source.id), error: message });
      }
    }

    const state = getRemoteChannelProviderState("telegram") || {};
    setRemoteChannelProviderState("telegram", {
      nextUpdateOffset: Number(state.next_update_offset || 0) || null,
      lastError: null,
      lastPolledAt: new Date().toISOString(),
    });
  }

  async function runPollLoop() {
    if (pollLoopRunning || !enabled) return;
    pollLoopRunning = true;
    try {
      while (!stopped) {
        try {
          await pollTelegramOnce();
        } catch (error) {
          const message = errorMessage(error);
          const state = getRemoteChannelProviderState("telegram") || {};
          setRemoteChannelProviderState("telegram", {
            nextUpdateOffset: Number(state.next_update_offset || 0) || null,
            lastError: message,
            lastPolledAt: new Date().toISOString(),
          });
          log("poll:error", { error: message });
        }
        await sleep(pollIntervalMs);
      }
    } finally {
      pollLoopRunning = false;
    }
  }

  function resolveAuthorUserId(chat) {
    const createdByUserId = Number(chat?.created_by_user_id || 0);
    if (createdByUserId > 0) return createdByUserId;
    const owner = listChatMembers(Number(chat?.id || 0)).find(
      (member) => String(member?.role || "").toLowerCase() === "owner",
    );
    return Number(owner?.id || 0) || null;
  }

  async function sendPushForMirroredPost({ chat, authorId, body }) {
    try {
      const members = listChatMembers(Number(chat.id));
      const mutedRows = listMutedUserIdsForChat(Number(chat.id));
      const mutedIds = new Set(
        mutedRows.map((row) => Number(row?.user_id || 0)).filter(Boolean),
      );
      const recipientIds = members
        .map((member) => Number(member?.id || 0))
        .filter(
          (memberId) =>
            memberId > 0 &&
            Number(memberId) !== Number(authorId) &&
            !mutedIds.has(memberId),
        );
      if (!recipientIds.length) return;
      await sendPushNotificationToUsers(recipientIds, {
        title: chat.name || "Channel",
        body: String(body || "").trim() || "New message",
        data: { url: "/", chatId: Number(chat.id) },
      });
    } catch {
      // Push should never block queue progress.
    }
  }

  async function processQueueItem(item) {
    let envelope = null;
    try {
      envelope = JSON.parse(String(item?.payload_json || "{}"));
    } catch {
      markRemoteChannelQueueItemSkipped(item.id, "Invalid Telegram payload.");
      return;
    }

    const remoteMessage = envelope?.message || {};
    const body = truncateBody(extractTelegramPostText(remoteMessage), messageMaxChars);
    if (!body) {
      markRemoteChannelQueueItemSkipped(
        item.id,
        "Telegram post has no text or caption to mirror yet.",
      );
      return;
    }

    const chat = findChatById(Number(item.chat_id));
    if (!chat || String(chat.type || "").toLowerCase() !== "channel") {
      throw new Error("Target channel is no longer available.");
    }

    const authorId = resolveAuthorUserId(chat);
    if (!authorId) {
      throw new Error("Target channel has no owner to author remote posts.");
    }
    const author = findUserById(authorId);
    if (!author) {
      throw new Error("Target channel owner no longer exists.");
    }

    const telegramMessageId =
      Number(item.telegram_message_id || remoteMessage?.id || 0) || 0;
    const clientRequestId = `remote:tg:${Number(item.source_id)}:${telegramMessageId}`.slice(
      0,
      120,
    );
    const expiresAt = computeTextExpiryIso(messageTextRetentionDays);
    const created = createOrReuseMessage(
      Number(chat.id),
      authorId,
      body,
      null,
      expiresAt,
      clientRequestId,
    );
    const messageId = Number(created?.id || 0);
    if (!messageId) throw new Error("Unable to create mirrored message.");

    if (!created?.deduped) {
      const source = {
        title: envelope?.source?.title || item.source_title || "",
        username: envelope?.source?.username || item.source_username || "",
        source_title: item.source_title || "",
        source_username: item.source_username || "",
      };
      setMessageForwardOrigin(messageId, {
        label: buildTelegramOriginLabel(source),
        sourceChatId: null,
        sourceUserId: null,
        sourceUsername: null,
        sourceAvatarUrl:
          envelope?.source?.avatarUrl || item.source_avatar_url || null,
        sourceColor: "#10b981",
      });
      emitChatEvent(Number(chat.id), {
        type: "chat_message",
        chatId: Number(chat.id),
        messageId,
        username: author.username,
        body,
        replyToMessageId: null,
      });
      await sendPushForMirroredPost({ chat, authorId, body });
    }

    markRemoteChannelQueueItemDone(item.id, messageId);
    updateRemoteChannelSourceError(item.source_id, "");
  }

  function computeBackoffMs(attempts) {
    const safeAttempts = Math.max(0, Number(attempts || 0));
    const seconds = Math.min(15 * 60, 2 ** safeAttempts);
    return seconds * 1000;
  }

  async function processClaimedItem(item) {
    try {
      await processQueueItem(item);
    } catch (error) {
      const attempts = Number(item?.attempts || 0) + 1;
      const failed = attempts >= maxAttempts;
      const message = errorMessage(error);
      markRemoteChannelQueueItemRetry(item.id, {
        failed,
        nextAttemptAt: new Date(Date.now() + computeBackoffMs(attempts)).toISOString(),
        error: message,
      });
      updateRemoteChannelSourceError(item.source_id, message);
      log("queue:error", { id: Number(item.id), failed, error: message });
    }
  }

  async function runQueueOnce() {
    const staleBefore = new Date(Date.now() - staleLockMs).toISOString();
    releaseStaleRemoteChannelQueueItems(staleBefore);
    for (let index = 0; index < queueBatchSize; index += 1) {
      if (stopped) return;
      const item = claimNextRemoteChannelQueueItem(
        lockOwner,
        new Date().toISOString(),
      );
      if (!item?.id) return;
      await processClaimedItem(item);
    }
  }

  async function runQueueLoop() {
    if (queueLoopRunning || !enabled) return;
    queueLoopRunning = true;
    try {
      await runQueueOnce();
    } finally {
      queueLoopRunning = false;
    }
  }

  function start() {
    if (!enabled) {
      log("disabled");
      return;
    }
    if (!stopped) return;
    stopped = false;
    log("starting", {
      pollIntervalMs,
      pollLimit,
      proxy: Boolean(connectionOptions.proxy),
    });
    void runPollLoop();
    queueTimer = setInterval(() => {
      void runQueueLoop();
    }, queueIntervalMs);
    if (typeof queueTimer.unref === "function") queueTimer.unref();
    void runQueueLoop();
  }

  function stop() {
    stopped = true;
    if (queueTimer) {
      clearInterval(queueTimer);
      queueTimer = null;
    }
    if (client) {
      void client.disconnect().catch(() => {});
    }
  }

  return {
    start,
    stop,
    isEnabled: () => enabled,
  };
}

export {
  createRemoteChannelManager,
  getTelegramClientConnectionOptions,
  normalizeTelegramSource,
  parseTelegramProxy,
};

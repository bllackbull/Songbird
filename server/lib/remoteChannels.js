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

/**
 * Normalize a Songbird remote channel source value.
 *
 * Accepts a Songbird invite link in the form:
 *   https://example.com/invite/<username>
 *   https://example.com/invite/<token>
 *
 * Returns { ok, sourceRaw, sourceUrl, sourceUsername, displayName }
 * where sourceUrl is the base origin of the target server and
 * sourceUsername is the channel username (if resolvable from the URL).
 */
function normalizeSongbirdSource(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { ok: false, error: "Songbird source is required." };
  }

  if (!/^https?:\/\//i.test(raw)) {
    return {
      ok: false,
      error: "Songbird source must be a full invite URL (https://...).",
    };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Songbird source URL is invalid." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Songbird source URL must use http or https." };
  }

  const parts = url.pathname.split("/").filter(Boolean);
  // Expect /invite/<username-or-token>
  if (parts[0] !== "invite" || !parts[1]) {
    return {
      ok: false,
      error:
        "Songbird source must be a channel invite link (e.g. https://example.com/invite/channelname).",
    };
  }

  const inviteTarget = parts[1];
  const sourceUrl = url.origin; // base URL of the target server

  // We can't reliably distinguish a username from a token at parse time —
  // the actual channel username is resolved by calling the target server.
  // Store the inviteTarget as a hint; resolveSongbirdSource() will fill in
  // sourceUsername after a network call.
  const looksLikeUsername = /^[a-z0-9._]{3,}$/i.test(inviteTarget);
  const sourceUsername = looksLikeUsername ? inviteTarget.toLowerCase() : "";

  return {
    ok: true,
    sourceRaw: raw,
    sourceUrl,
    sourceUsername,
    inviteTarget,
    displayName: sourceUsername ? `@${sourceUsername}` : inviteTarget,
  };
}

/**
 * Returns true if the hostname is a private/loopback/link-local address that
 * should never be the target of a server-side outbound request.
 * Blocks SSRF against internal services and cloud metadata endpoints.
 */
function isPrivateHost(hostname) {
  const h = String(hostname || "").toLowerCase().trim();

  // Loopback
  if (h === "localhost" || h === "::1" || /^127\./.test(h)) return true;

  // Cloud metadata endpoints (AWS, GCP, Azure, Oracle, DigitalOcean, etc.)
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;

  // IPv4 private ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;

  // Link-local (169.254.x.x covers AWS/GCP metadata; block the whole range)
  if (/^169\.254\./.test(h)) return true;

  // IPv6 private / link-local (fe80::, fc00::, fd00::)
  if (/^fe[89ab][0-9a-f]:/i.test(h) || /^fc[0-9a-f]{2}:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) return true;

  // Unspecified / broadcast
  if (h === "0.0.0.0" || h === "255.255.255.255") return true;

  return false;
}

/**
 * Resolve a Songbird invite link against the target server to get the
 * real channel username. Verifies the server is public and the channel exists.
 *
 * Public channel invite links use the channel username as the path segment
 * (see buildGroupInviteLink), so the inviteTarget IS the username. We validate
 * it against the public /api/channels/:username/meta endpoint, which only
 * exists on public servers and only returns public channels.
 *
 * Returns { ok, sourceUsername, channelName, avatarUrl, color, error }
 */
async function resolveSongbirdSource(sourceUrl, inviteTarget) {
  const candidateUsername = String(inviteTarget || "").trim().toLowerCase().replace(/^@+/, "");
  if (!candidateUsername) {
    return { ok: false, error: "Songbird source channel username could not be determined from the invite link." };
  }

  // SSRF protection: reject requests to private/internal hosts.
  try {
    const parsedSourceUrl = new URL(sourceUrl);
    if (isPrivateHost(parsedSourceUrl.hostname)) {
      return { ok: false, error: "Songbird source URL must point to a public server." };
    }
  } catch {
    return { ok: false, error: "Songbird source URL is invalid." };
  }

  const metaUrl = `${sourceUrl}/api/channels/${encodeURIComponent(candidateUsername)}/meta`;
  let metaRes;
  try {
    metaRes = await fetch(metaUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return { ok: false, error: `Cannot reach target server: ${String(error?.message || error)}` };
  }

  if (metaRes.status === 403) {
    return { ok: false, error: "The target server is private (sign-up disabled). Only public servers can be used as a Songbird remote source." };
  }
  if (metaRes.status === 404) {
    return { ok: false, error: "Channel not found on target server. Use a public channel invite link (e.g. https://server/invite/channelusername)." };
  }

  // A 200 response that is not JSON means the endpoint does not exist on the
  // target server (the SPA catch-all served index.html) — i.e. the target is
  // running an older Songbird version without Songbird remote channel support.
  const contentType = String(metaRes.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return { ok: false, error: "The target server does not support Songbird remote channels. It may be running an older version of Songbird." };
  }

  if (!metaRes.ok) {
    const body = await metaRes.json().catch(() => ({}));
    return { ok: false, error: body?.error || `Target server returned ${metaRes.status}.` };
  }

  const metaData = await metaRes.json().catch(() => null);
  if (!metaData || !metaData.username) {
    return { ok: false, error: "Target server returned an unexpected response." };
  }

  return {
    ok: true,
    sourceUsername: String(metaData.username || candidateUsername).toLowerCase(),
    channelName: String(metaData.name || "").trim(),
    avatarUrl: metaData.avatarUrl || null,
    color: metaData.color || "#10b981",
  };
}

async function fetchSongbirdJson(url, timeoutMs = 15_000) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    // Non-JSON 200 means the endpoint doesn't exist (SPA catch-all served HTML)
    // — the target server is running an older Songbird version.
    throw new Error(
      "Target server does not support Songbird remote channels (outdated version).",
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Target server returned ${res.status}.`);
  }
  return res.json();
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

function buildSongbirdOriginLabel(source = {}) {
  const title = String(source?.title || source?.source_title || "").trim();
  if (title) return `Songbird: ${title}`;
  const username = String(source?.username || source?.source_username || "")
    .trim()
    .replace(/^@+/, "");
  if (username) return `Songbird: @${username}`;
  const sourceUrl = String(source?.source_url || "").trim();
  if (sourceUrl) {
    try {
      return `Songbird: ${new URL(sourceUrl).hostname}`;
    } catch {
      return `Songbird: ${sourceUrl}`;
    }
  }
  return "Songbird channel";
}

function computeTextExpiryIso(retentionDays) {
  const days = Number(retentionDays || 0);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  if (typeof value === "object") {
    if (typeof value.toJSNumber === "function") {
      try {
        const asNumber = value.toJSNumber();
        return Number.isFinite(asNumber) ? asNumber : null;
      } catch {
        return null;
      }
    }
    if (typeof value.valueOf === "function") {
      const primitive = value.valueOf();
      if (primitive !== value) return toFiniteNumber(primitive);
    }
  }
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : null;
}

function normalizeMessageId(value) {
  const number = toFiniteNumber(value);
  return number && number > 0 ? Math.trunc(number) : 0;
}

function firstTextFromMessages(messages = []) {
  for (const message of messages) {
    const text = extractTelegramPostText(message);
    if (text) return text;
  }
  return "";
}

function buildTelegramMediaIds(messages = []) {
  return Array.from(
    new Set(
      messages
        .filter((message) => Boolean(message?.hasMedia || message?.media))
        .map((message) => normalizeMessageId(message?.id))
        .filter(Boolean),
    ),
  );
}

function extensionForMimeType(mimeType = "") {
  const type = String(mimeType || "").toLowerCase();
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/bmp": ".bmp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-matroska": ".mkv",
    "video/x-msvideo": ".avi",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/x-7z-compressed": ".7z",
    "application/x-rar-compressed": ".rar",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ".pptx",
    "text/plain": ".txt",
  };
  return map[type] || "";
}

function summarizeMediaFiles(files = []) {
  if (!Array.isArray(files) || !files.length) return "";
  const videoCount = files.filter((file) =>
    String(file?.mimeType || "").toLowerCase().startsWith("video/"),
  ).length;
  const imageCount = files.filter((file) =>
    String(file?.mimeType || "").toLowerCase().startsWith("image/"),
  ).length;
  const audioCount = files.filter((file) =>
    String(file?.mimeType || "").toLowerCase().startsWith("audio/"),
  ).length;
  const docCount = Math.max(0, files.length - videoCount - imageCount - audioCount);
  if (files.length === 1) {
    if (videoCount === 1) return "Sent a video";
    if (imageCount === 1) return "Sent a photo";
    if (audioCount === 1) return "Sent a voice message";
    if (docCount === 1) return "Sent a document";
    return "Sent a media file";
  }
  if (videoCount === files.length) return `Sent ${videoCount} videos`;
  if (imageCount === files.length) return `Sent ${imageCount} photos`;
  if (audioCount === files.length) return `Sent ${audioCount} voice messages`;
  if (docCount === files.length) return `Sent ${docCount} documents`;
  return `Sent ${files.length} media files`;
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

function groupTelegramMessagesForQueue(messages = []) {
  const groups = [];
  const albumGroups = new Map();

  messages.forEach((message) => {
    const groupedId = toPlainId(message?.groupedId) || "";
    if (!groupedId) {
      groups.push([message]);
      return;
    }

    let group = albumGroups.get(groupedId);
    if (!group) {
      group = [];
      albumGroups.set(groupedId, group);
      groups.push(group);
    }
    group.push(message);
  });

  return groups;
}

function createRemoteChannelManager(deps = {}) {
  const {
    config = {},
    computeExpiryIso,
    createMessageFiles,
    createOrReuseMessage,
    crypto,
    debugLog = () => {},
    emitChatEvent,
    emitSseEvent,
    enqueueVideoTranscodeJob,
    ensureFfmpegAvailable,
    findChatById,
    findUserById,
    fs,
    getRemoteChannelProviderState,
    getRemoteChannelSourceById,
    getUploadKind,
    hasEnoughFreeDiskSpace,
    isDangerousUploadFile,
    listEnabledRemoteChannelSources,
    listChatMembers,
    listMessageFilesByMessageIds,
    listMutedUserIdsForChat,
    enqueueRemoteChannelQueueItem,
    releaseStaleRemoteChannelQueueItems,
    claimNextRemoteChannelQueueItem,
    markRemoteChannelQueueItemDone,
    markRemoteChannelQueueItemRetry,
    markRemoteChannelQueueItemSkipped,
    skipAllRemoteChannelQueueItems: skipAllRemoteChannelQueueItemsDb,
    skipCurrentRemoteChannelQueueItem: skipCurrentRemoteChannelQueueItemDb,
    getCurrentRemoteChannelQueueItemId,
    path,
    probeVideoMetadata,
    sanitizeDurationSeconds,
    sanitizePositiveInt,
    sendPushNotificationToUsers,
    isUserConnected,
    setMessageExpiresAt,
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
  // The manager is enabled if the feature is on — Songbird sources work without
  // Telegram credentials. Telegram sources additionally require apiId/hash/session.
  const enabled = Boolean(config.enabled);
  const pollIntervalMs = Math.max(1000, Number(config.pollIntervalMs || 5000));
  const pollLimit = Math.max(1, Math.min(100, Number(config.telegramPollLimit || 50)));
  // Sync metadata once every 60 poll cycles (e.g., every 5 minutes if polling every 5s)
  const metadataSyncIntervalMs = pollIntervalMs * 60;
  const queueIntervalMs = Math.max(250, Number(config.queueIntervalMs || 1000));
  const maxAttempts = Math.max(1, Number(config.queueMaxAttempts || 10));
  const staleLockMs = Math.max(10_000, Number(config.queueStaleLockMs || 5 * 60_000));
  const queueBatchSize = Math.max(1, Math.min(50, Number(config.queueBatchSize || 10)));
  const queueConcurrency = Math.max(1, Math.min(50, Number(config.queueConcurrency || 3)));
  const providerStateHeartbeatMs = Math.max(
    pollIntervalMs,
    Number(config.providerStateHeartbeatMs || 60_000),
  );
  const messageTextRetentionDays = Number(config.messageTextRetentionDays || 0);
  const messageFileRetentionDays = Number(config.messageFileRetentionDays || 0);
  const messageMaxChars = Math.max(1, Number(config.messageMaxChars || 4000));
  const fileUploadEnabled = Boolean(config.fileUploadEnabled);
  const messageFileLimits = config.messageFileLimits || {};
  const maxMediaFilesPerMessage = Math.max(
    1,
    Number(messageFileLimits.maxFiles || 10),
  );
  const maxMediaFileSizeBytes = Math.max(
    1,
    Number(messageFileLimits.maxFileSizeBytes || 25 * 1024 * 1024),
  );
  const maxMediaTotalBytes = Math.max(
    1,
    Number(messageFileLimits.maxTotalBytes || 75 * 1024 * 1024),
  );
  const transcodeVideosToH264 = Boolean(config.transcodeVideosToH264);
  const uploadRootDir = String(config.uploadRootDir || "").trim();
  const avatarUploadRootDir = String(config.avatarUploadRootDir || "").trim();
  const lockOwner = `songbird-${process.pid}`;
  // Entity cache: keyed by "sourceId:sourceRef". Cap at 200 entries with LRU
  // eviction to avoid unbounded growth from Telegram entity objects.
  const ENTITY_CACHE_MAX = 200;
  const entityCache = new Map();
  const metadataSyncTimestamps = new Map(); // sourceId → lastSyncTimestamp
  const connectionOptions = getTelegramClientConnectionOptions(config.proxyUrl, (message) =>
    console.warn(message),
  );

  let stopped = true;
  let pollLoopRunning = false;
  let queueLoopRunning = false;
  let queueTimer = null;
  let client = null;
  let clientConnectPromise = null;
  let clientResetRequired = false;
  let clientResetReason = "";
  let lastProviderStateSavedAt = 0;

  // Set of queue item IDs that have been aborted while in-flight. The worker
  // checks this at each async yield point and stops processing the item early.
  const abortedItemIds = new Set();
  // Set of source IDs for which ALL active items should be aborted.
  const abortedSourceIds = new Set();

  const log = (...args) => debugLog("remote-channel", ...args);

  function createClient() {
    const telegramClient = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
      connectionRetries: 10,
      reconnectRetries: 10,
      retryDelay: 2000,
      autoReconnect: true,
      ...connectionOptions,
      deviceModel: "Songbird",
      systemVersion: "Songbird Server",
      appVersion: "1.0",
    });
    telegramClient.onError = async (error) => {
      if (telegramClient !== client) return;
      markTelegramClientForReset(error, "client:error");
    };
    return telegramClient;
  }

  function isTelegramConnectionError(error) {
    const message = errorMessage(error).toLowerCase();
    const code = String(error?.code || "").toLowerCase();
    return (
      [
        "timeout",
        "cannot send requests while disconnected",
        "please reconnect",
        "maximum reconnection retries",
        "connection closed",
        "connection reset",
        "connection refused",
        "not connected",
        "netsocket was closed",
        "socket closed",
        "econnreset",
        "econnrefused",
        "etimedout",
        "enotfound",
        "ehostunreach",
        "enetunreach",
      ].some((needle) => message.includes(needle) || code.includes(needle))
    );
  }

  function telegramClientStatus(activeClient = client) {
    const sender = activeClient?._sender;
    return {
      connected: Boolean(activeClient?.connected),
      reconnecting: Boolean(sender?.isReconnecting),
      userDisconnected: Boolean(sender?.userDisconnected),
      transportConnected:
        typeof sender?._transportConnected === "function"
          ? Boolean(sender._transportConnected())
          : Boolean(activeClient?.connected),
    };
  }

  function shouldResetTelegramClient(activeClient = client) {
    if (!activeClient) return false;
    if (clientResetRequired) return true;
    const status = telegramClientStatus(activeClient);
    if (status.userDisconnected) return true;
    if (status.connected && !status.reconnecting && !status.transportConnected) {
      return true;
    }
    return false;
  }

  function markTelegramClientForReset(error, context = "client") {
    if (!isTelegramConnectionError(error)) return false;
    const message = errorMessage(error);
    clientResetRequired = true;
    clientResetReason = `${context}: ${message}`;
    log("client:reset-marked", {
      context,
      error: message,
      status: telegramClientStatus(),
    });
    return true;
  }

  async function destroyTelegramClient(activeClient, reason = "reset") {
    if (!activeClient) return;
    try {
      const disconnect =
        typeof activeClient.destroy === "function"
          ? () => activeClient.destroy()
          : () => activeClient.disconnect();
      await disconnect();
    } catch (error) {
      log("client:destroy-error", {
        reason,
        error: errorMessage(error),
      });
    }
  }

  async function resetTelegramClient(reason = "reset") {
    const staleClient = client;
    client = null;
    clientResetRequired = false;
    clientResetReason = "";
    // Entity cache is intentionally preserved across client resets: the resolved
    // Telegram entities (channel IDs, usernames) remain valid after a reconnect,
    // so clearing the cache would only add unnecessary getEntity() round-trips on
    // the first poll cycle after every reconnection.
    if (staleClient) {
      log("client:reset", { reason });
      await destroyTelegramClient(staleClient, reason);
    }
  }

  async function connectTelegramClient() {
    if (!client) {
      client = createClient();
    }

    if (shouldResetTelegramClient(client)) {
      await resetTelegramClient(clientResetReason || "unhealthy client state");
      client = createClient();
    }

    if (!client.connected) {
      await client.connect();
    }

    if (shouldResetTelegramClient(client)) {
      await resetTelegramClient(clientResetReason || "disconnected after connect");
      client = createClient();
      await client.connect();
    }

    const authorized =
      typeof client.isUserAuthorized === "function"
        ? await client.isUserAuthorized()
        : Boolean(await client.getMe().catch(() => null));
    if (!authorized) {
      throw new Error("Telegram session is not authorized.");
    }
    if (shouldResetTelegramClient(client)) {
      throw new Error(
        clientResetReason || "Telegram connection needs reconnect. Please reconnect.",
      );
    }
    return client;
  }

  async function ensureClient() {
    if (!clientConnectPromise) {
      clientConnectPromise = (async () => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            return await connectTelegramClient();
          } catch (error) {
            if (!isTelegramConnectionError(error) || attempt > 0) {
              throw error;
            }
            await resetTelegramClient(`connect failed: ${errorMessage(error)}`);
          }
        }
        throw new Error("Unable to connect to Telegram.");
      })().finally(() => {
        clientConnectPromise = null;
      });
    }
    return clientConnectPromise;
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

  async function resolveSource(activeClient, source, options = {}) {
    const ref = resolveTelegramSourceRef(source);
    if (!ref) throw new Error("Telegram source is not configured.");

    const cacheKey = `${source.id}:${String(source.source_raw || ref)}`;
    let entity = options.forceRefresh ? null : entityCache.get(cacheKey);
    if (!entity) {
      entity = await activeClient.getEntity(ref);
      // Enforce a maximum cache size using simple LRU eviction: delete the
      // oldest entry (first inserted) when the cap is reached.
      if (entityCache.size >= ENTITY_CACHE_MAX) {
        entityCache.delete(entityCache.keys().next().value);
      }
      entityCache.set(cacheKey, entity);
    }

    const title = resolveEntityTitle(entity, source);
    const username = resolveEntityUsername(entity, source);
    const sourceChatId = resolveEntityChatId(entity, source);
    // Skip avatar download when file uploads are disabled — only sync the name.
    const avatarUrl = fileUploadEnabled
      ? await cacheSourceAvatar(activeClient, source, entity)
      : source?.source_avatar_url || "";

    return { entity, title, username, sourceChatId, avatarUrl };
  }

  async function syncResolvedSourceMetadata(
    activeClient,
    source,
    resolved = null,
    options = {},
  ) {
    const nextResolved =
      resolved || await resolveSource(activeClient, source, { forceRefresh: true });
    const targetChat = findChatById(Number(source.chat_id || 0));
    if (
      targetChat &&
      Boolean(Number(source.sync_metadata || 0)) &&
      typeof updateChannelChat === "function"
    ) {
      const nextName = nextResolved.title || targetChat.name;
      const nextAvatarUrl = nextResolved.avatarUrl || null;
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
    updateRemoteChannelSourceSeen(source.id, {
      sourceChatId: nextResolved.sourceChatId,
      sourceUsername: nextResolved.username,
      sourceTitle: nextResolved.title,
      sourceAvatarUrl: nextResolved.avatarUrl,
      touch: options.touch,
      clearError: options.clearError,
    });
    return nextResolved;
  }

  async function syncSourceMetadata(sourceId) {
    const source =
      typeof getRemoteChannelSourceById === "function"
        ? getRemoteChannelSourceById(sourceId)
        : null;
    if (!source?.id) throw new Error("Remote Channel source is not configured.");
    if (!Number(source.enabled || 0)) {
      throw new Error("Remote Channel source is disabled.");
    }

    // Dispatch to the correct provider implementation.
    if (source.provider === "songbird") {
      return syncSongbirdSourceMetadata(source);
    }

    const activeClient = await ensureClient();
    try {
      const resolved = await syncResolvedSourceMetadata(
        activeClient,
        source,
        await resolveSource(activeClient, source, { forceRefresh: true }),
      );
      updateRemoteChannelSourceError(source.id, "");
      return resolved;
    } catch (error) {
      const message = errorMessage(error);
      updateRemoteChannelSourceError(source.id, message);
      markTelegramClientForReset(error, "sync-source-metadata");
      throw error;
    }
  }

  /**
   * Fetch channel name and avatar from a remote Songbird server's public
   * metadata endpoint and apply them to the local channel if sync_metadata
   * is enabled — mirrors what syncResolvedSourceMetadata does for Telegram.
   */
  async function syncSongbirdSourceMetadata(source) {
    const sourceUrl = String(source.source_url || "").trim();
    const channelUsername = String(source.source_username || "").trim();
    if (!sourceUrl || !channelUsername) {
      throw new Error(
        "Songbird source URL or channel username is not configured.",
      );
    }

    const metaUrl = `${sourceUrl}/api/channels/${encodeURIComponent(channelUsername)}/meta`;
    let data;
    try {
      const res = await fetch(metaUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("application/json")) {
        throw new Error(
          "Target server does not support Songbird remote channels (outdated version).",
        );
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || `Target server returned ${res.status}.`,
        );
      }
      data = await res.json();
    } catch (error) {
      const message = errorMessage(error);
      updateRemoteChannelSourceError(source.id, message);
      throw new Error(`Songbird metadata sync failed: ${message}`);
    }

    const title = String(data?.name || "").trim();
    const remoteAvatarUrl = String(data?.avatarUrl || "").trim();

    // Download and cache the avatar locally if file uploads are enabled.
    let localAvatarUrl = source.source_avatar_url || "";
    if (fileUploadEnabled && remoteAvatarUrl && fs && path && avatarUploadRootDir) {
      try {
        const avatarRes = await fetch(`${sourceUrl}${remoteAvatarUrl}`, {
          signal: AbortSignal.timeout(15_000),
        });
        if (avatarRes.ok) {
          const buffer = Buffer.from(await avatarRes.arrayBuffer());
          if (buffer.length > 0) {
            const safeUsername = channelUsername.replace(/[^a-zA-Z0-9_-]/g, "");
            const stamp = Date.now();
            const fileName = `songbird-source-${Number(source.id)}-${safeUsername}-${stamp}.jpg`;
            const filePath = path.join(avatarUploadRootDir, fileName);
            fs.mkdirSync(avatarUploadRootDir, { recursive: true });
            fs.writeFileSync(filePath, buffer);
            storageEncryption?.encryptFileInPlace?.(filePath);
            localAvatarUrl = `/api/uploads/avatars/${fileName}`;
          }
        }
      } catch {
        // Avatar download failure is non-fatal — keep existing avatar.
      }
    }

    // Apply to the local channel if sync_metadata is enabled.
    const targetChat = findChatById(Number(source.chat_id || 0));
    if (
      targetChat &&
      Boolean(Number(source.sync_metadata || 0)) &&
      typeof updateChannelChat === "function"
    ) {
      const nextName = title || targetChat.name;
      const nextAvatarUrl = localAvatarUrl || null;
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

    updateRemoteChannelSourceSeen(source.id, {
      sourceUsername: channelUsername,
      sourceTitle: title,
      sourceAvatarUrl: localAvatarUrl,
      touch: true,
      clearError: true,
    });

    return { title, username: channelUsername, avatarUrl: localAvatarUrl };
  }

  async function pollSource(activeClient, source) {
    const syncMetadata = Boolean(Number(source.sync_metadata || 0));
    const sourceId = Number(source.id);
    const now = Date.now();
    const lastMetadataSync = metadataSyncTimestamps.get(sourceId) || 0;
    const shouldForceRefresh =
      syncMetadata && now - lastMetadataSync >= metadataSyncIntervalMs;

    const resolved = await syncResolvedSourceMetadata(
      activeClient,
      source,
      await resolveSource(activeClient, source, {
        forceRefresh: shouldForceRefresh,
      }),
      { touch: false },
    );

    if (shouldForceRefresh) {
      metadataSyncTimestamps.set(sourceId, now);
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
        touch: true,
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
    for (const group of groupTelegramMessagesForQueue(ordered)) {
      const validMessages = group.filter((message) =>
        Boolean(normalizeMessageId(message?.id)),
      );
      if (!validMessages.length) continue;
      const serializedMessages = validMessages.map((message) =>
        serializeTelegramMessage(message),
      );
      const firstMessage = serializedMessages[0];
      const primaryMessage =
        serializedMessages.find((message) => extractTelegramPostText(message)) ||
        firstMessage;
      const telegramMessageId = normalizeMessageId(firstMessage?.id);
      if (!telegramMessageId) continue;
      maxSeenId = Math.max(
        maxSeenId,
        ...serializedMessages.map((message) => normalizeMessageId(message?.id)),
      );
      const payloadJson = JSON.stringify({
        message: primaryMessage,
        messages: serializedMessages,
        mediaMessageIds: buildTelegramMediaIds(serializedMessages),
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
        sourceVersion: source.source_version,
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
      touch: maxSeenId > lastMessageId,
    });

    return { queued, initialized: false };
  }

  async function pollSongbirdSource(source) {
    const sourceUrl = String(source.source_url || "").trim();
    const channelUsername = String(source.source_username || "").trim();
    if (!sourceUrl || !channelUsername) {
      throw new Error("Songbird source URL or channel username is not configured.");
    }

    const lastMessageId = Number(source.last_remote_message_id || 0) || 0;
    const pollLimitSb = Math.max(1, Math.min(100, pollLimit));

    // On first poll, just record the latest message ID without mirroring history.
    if (!lastMessageId) {
      const initUrl = `${sourceUrl}/api/channels/${encodeURIComponent(channelUsername)}/messages?limit=1`;
      const data = await fetchSongbirdJson(initUrl);
      const latestId = Number(data?.messages?.[0]?.id || 0) || 0;
      updateRemoteChannelSourceSeen(source.id, {
        sourceUsername: channelUsername,
        lastRemoteMessageId: latestId,
        touch: true,
      });
      return { queued: 0, initialized: true };
    }

    const pollUrl =
      `${sourceUrl}/api/channels/${encodeURIComponent(channelUsername)}/messages` +
      `?afterId=${lastMessageId}&limit=${pollLimitSb}`;

    const data = await fetchSongbirdJson(pollUrl);
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    const ordered = messages
      .filter((msg) => Number(msg?.id || 0) > lastMessageId)
      .sort((a, b) => Number(a.id) - Number(b.id));

    let queued = 0;
    let maxSeenId = lastMessageId;

    for (const msg of ordered) {
      const msgId = Number(msg?.id || 0);
      if (!msgId) continue;
      maxSeenId = Math.max(maxSeenId, msgId);

      const body = truncateBody(String(msg.body || "").trim(), messageMaxChars);
      // Skip messages with no text body (file-only messages from a Songbird
      // source are not yet supported — media streaming is Telegram-specific).
      if (!body) continue;

      const payloadJson = JSON.stringify({
        message: { id: msgId, body, createdAt: msg.createdAt || null },
        source: {
          title: source.source_title || "",
          username: channelUsername,
          sourceUrl,
        },
        receivedAt: new Date().toISOString(),
      });

      const row = enqueueRemoteChannelQueueItem({
        sourceId: source.id,
        provider: "songbird",
        sourceVersion: source.source_version,
        // Reuse the telegram_message_id column for the remote message ID.
        telegramMessageId: msgId,
        payloadJson,
      });
      if (row?.id) queued += 1;
    }

    if (maxSeenId > lastMessageId) {
      updateRemoteChannelSourceSeen(source.id, {
        sourceUsername: channelUsername,
        lastRemoteMessageId: maxSeenId,
        touch: true,
      });
    }

    return { queued, initialized: false };
  }

  async function pollSongbirdOnce() {
    const sources = listEnabledRemoteChannelSources("songbird");
    if (!sources.length) {
      await sleep(pollIntervalMs);
      return;
    }

    for (let i = 0; i < sources.length; i += queueConcurrency) {
      if (stopped) return;
      const batch = sources.slice(i, i + queueConcurrency);
      await Promise.all(
        batch.map(async (source) => {
          if (stopped) return;
          try {
            await pollSongbirdSource(source);
            if (source.last_error) updateRemoteChannelSourceError(source.id, "");
          } catch (error) {
            const message = errorMessage(error);
            updateRemoteChannelSourceError(source.id, message);
            log("poll-songbird:error", { sourceId: Number(source.id), error: message });
          }
        }),
      );
    }
  }

  async function runSongbirdPollLoop() {
    // Songbird polling doesn't need a Telegram client — it's always runnable
    // as long as the feature is enabled.
    try {
      while (!stopped) {
        try {
          await pollSongbirdOnce();
        } catch (error) {
          log("poll-songbird:loop-error", { error: errorMessage(error) });
        }
        await sleep(pollIntervalMs);
      }
    } finally {
      // no state to clean up
    }
  }

  async function pollTelegramOnce() {
    const sources = listEnabledRemoteChannelSources("telegram");
    if (!sources.length) {
      await sleep(pollIntervalMs);
      return;
    }

    const activeClient = await ensureClient();

    // Poll all sources concurrently (up to queueConcurrency at a time) so that
    // a slow or large source does not delay all subsequent sources.
    let clientResetNeeded = false;
    for (let i = 0; i < sources.length; i += queueConcurrency) {
      if (stopped) return;
      const batch = sources.slice(i, i + queueConcurrency);
      await Promise.all(
        batch.map(async (source) => {
          if (stopped) return;
          try {
            await pollSource(activeClient, source);
            if (source.last_error) {
              updateRemoteChannelSourceError(source.id, "");
            }
          } catch (error) {
            const message = errorMessage(error);
            updateRemoteChannelSourceError(source.id, message);
            log("poll-source:error", { sourceId: Number(source.id), error: message });
            if (markTelegramClientForReset(error, "poll-source")) {
              clientResetNeeded = true;
            }
          }
        }),
      );
      // If any source triggered a client reset, propagate the error so the
      // poll loop can reconnect before attempting the next batch.
      if (clientResetNeeded) {
        throw new Error(clientResetReason || "Telegram client needs reconnect.");
      }
    }

    const state = getRemoteChannelProviderState("telegram") || {};
    const now = Date.now();
    if (
      state.last_error ||
      now - lastProviderStateSavedAt >= providerStateHeartbeatMs
    ) {
      setRemoteChannelProviderState("telegram", {
        nextUpdateOffset: Number(state.next_update_offset || 0) || null,
        lastError: null,
        lastPolledAt: new Date(now).toISOString(),
      });
      lastProviderStateSavedAt = now;
    }
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
          lastProviderStateSavedAt = Date.now();
          log("poll:error", { error: message });
          
          // If this is a connection error and the client is marked for reset,
          // force a client reset before the next poll attempt to avoid getting
          // stuck in a loop where ensureClient() keeps failing.
          if (isTelegramConnectionError(error) && (clientResetRequired || shouldResetTelegramClient(client))) {
            log("poll:forcing-client-reset", { reason: clientResetReason || message });
            await resetTelegramClient(clientResetReason || `poll error: ${message}`);
          }
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
        )
        .filter((memberId) => {
          const member = members.find((m) => Number(m?.id || 0) === memberId);
          return !isUserConnected(member?.username);
        });
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

  function mediaStreamingIsAvailable() {
    return Boolean(
      fileUploadEnabled &&
        fs &&
        path &&
        uploadRootDir &&
        typeof createMessageFiles === "function" &&
        typeof getUploadKind === "function",
    );
  }

  function safeUnlink(filePath) {
    try {
      if (filePath && fs?.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // best effort cleanup
    }
  }

  function buildStoredMediaName(originalName, mimeType) {
    const ext =
      path.extname(String(originalName || "")).toLowerCase() ||
      extensionForMimeType(mimeType) ||
      ".bin";
    const random =
      typeof crypto?.randomBytes === "function"
        ? crypto.randomBytes(8).toString("hex")
        : Math.random().toString(16).slice(2, 18);
  return `${Date.now()}-${random}${ext}`;
  }

  function getTelegramDocument(message) {
    return message?.document || message?.media?.document || null;
  }

  function getTelegramPhoto(message) {
    return message?.photo || message?.media?.photo || null;
  }

  function listTelegramDocumentAttributes(message) {
    const attrs = getTelegramDocument(message)?.attributes;
    return Array.isArray(attrs) ? attrs : [];
  }

  function getTelegramDocumentAttribute(message, names = []) {
    const wanted = new Set(
      (Array.isArray(names) ? names : [names]).map((name) => String(name || "")),
    );
    return listTelegramDocumentAttributes(message).find((attr) =>
      wanted.has(String(attr?.className || "")),
    );
  }

  function getTelegramDocumentFilename(message) {
    const attr = getTelegramDocumentAttribute(message, "DocumentAttributeFilename");
    return String(attr?.fileName || "").trim();
  }

  function getTelegramMediaDimensions(message) {
    const attr = getTelegramDocumentAttribute(message, [
      "DocumentAttributeVideo",
      "DocumentAttributeImageSize",
    ]);
    if (attr?.w > 0 && attr?.h > 0) {
      return { width: attr.w, height: attr.h };
    }

    // For Telegram photos
    const photo = getTelegramPhoto(message);
    const sizes = photo?.sizes;
    if (Array.isArray(sizes) && sizes.length > 0) {
      // Pick the largest size entry that has explicit pixel dimensions
      const best = sizes
        .filter((s) => s?.w > 0 && s?.h > 0)
        .reduce((largest, s) => {
          const area = s.w * s.h;
          return area > (largest?.w || 0) * (largest?.h || 0) ? s : largest;
        }, null);
      if (best) return { width: best.w, height: best.h };
    }

    return { width: undefined, height: undefined };
  }

  function getTelegramMediaDuration(message) {
    const attr = getTelegramDocumentAttribute(message, [
      "DocumentAttributeVideo",
      "DocumentAttributeAudio",
    ]);
    return attr?.duration;
  }

  function getTelegramPhotoDeclaredSize(message) {
    const sizes = [
      ...(getTelegramPhoto(message)?.sizes || []),
      ...(getTelegramPhoto(message)?.videoSizes || []),
    ];
    return sizes.reduce((largest, size) => {
      const directSize = toFiniteNumber(size?.size);
      const progressiveSize = Array.isArray(size?.sizes)
        ? Math.max(
            0,
            ...size.sizes
              .map((entry) => toFiniteNumber(entry))
              .filter((entry) => entry !== null),
          )
        : null;
      return Math.max(largest, directSize || progressiveSize || 0);
    }, 0) || null;
  }

  function buildTelegramOriginalName(message, mimeType, index) {
    const messageId = normalizeMessageId(message?.id) || index + 1;
    const ext = extensionForMimeType(mimeType) || ".bin";
    const rawName =
      getTelegramDocumentFilename(message) ||
      `media-${messageId}${ext}`;
    const safeName =
      rawName
        .replace(/[\r\n"]/g, "")
        .replace(/[\\/:*?<>|%]/g, "_")
        .trim() || `media-${messageId}${ext}`;
    const withExtension = path.extname(safeName) ? safeName : `${safeName}${ext}`;
    return `telegram-${messageId}-${withExtension}`;
  }

  function getTelegramMediaDescriptor(message, index) {
    if (!message?.media) return null;
    const document = getTelegramDocument(message);
    const photo = getTelegramPhoto(message);
    const mimeType = String(
      document?.mimeType || (photo ? "image/jpeg" : ""),
    ).toLowerCase();
    if (!mimeType) return null;

    const kind =
      getUploadKind("media", mimeType) ||
      (document ? getUploadKind("document", mimeType) : null);
    if (!kind) return null;

    const originalName = buildTelegramOriginalName(message, mimeType, index);
    if (typeof isDangerousUploadFile === "function") {
      if (isDangerousUploadFile(originalName, mimeType)) return null;
    }

    const declaredSize = toFiniteNumber(
      document?.size || getTelegramPhotoDeclaredSize(message),
    );
    const dimensions = getTelegramMediaDimensions(message);
    const widthPx =
      typeof sanitizePositiveInt === "function"
        ? sanitizePositiveInt(dimensions.width)
        : toFiniteNumber(dimensions.width);
    const heightPx =
      typeof sanitizePositiveInt === "function"
        ? sanitizePositiveInt(dimensions.height)
        : toFiniteNumber(dimensions.height);
    const durationSeconds =
      typeof sanitizeDurationSeconds === "function"
        ? sanitizeDurationSeconds(getTelegramMediaDuration(message))
        : toFiniteNumber(getTelegramMediaDuration(message));

    return {
      kind,
      originalName,
      mimeType,
      declaredSize,
      widthPx,
      heightPx,
      durationSeconds,
    };
  }

  function readExistingMessageFileStats(messageId) {
    if (typeof listMessageFilesByMessageIds !== "function" || !messageId) {
      return { count: 0, totalBytes: 0, names: new Set() };
    }
    const rows = listMessageFilesByMessageIds([Number(messageId)]);
    return rows.reduce(
      (stats, row) => {
        stats.count += 1;
        stats.totalBytes += Number(row?.size_bytes || 0) || 0;
        const name = String(row?.original_name || "").trim();
        if (name) stats.names.add(name);
        return stats;
      },
      { count: 0, totalBytes: 0, names: new Set() },
    );
  }

  async function downloadTelegramMediaFile(activeClient, message, index, stats) {
    const descriptor = getTelegramMediaDescriptor(message, index);
    if (!descriptor) return null;
    if (
      descriptor.declaredSize !== null &&
      descriptor.declaredSize > maxMediaFileSizeBytes
    ) {
      return null;
    }
    if (
      descriptor.declaredSize !== null &&
      Number(stats.totalBytes || 0) + descriptor.declaredSize > maxMediaTotalBytes
    ) {
      return null;
    }
    if (
      descriptor.declaredSize !== null &&
      typeof hasEnoughFreeDiskSpace === "function" &&
      !hasEnoughFreeDiskSpace(descriptor.declaredSize)
    ) {
      return null;
    }

    fs.mkdirSync(uploadRootDir, { recursive: true });
    const storedName = buildStoredMediaName(
      descriptor.originalName,
      descriptor.mimeType,
    );
    const filePath = path.join(uploadRootDir, storedName);

    try {
      const result = await activeClient.downloadMedia(message, {
        outputFile: filePath,
      });
      if (Buffer.isBuffer(result)) {
        fs.writeFileSync(filePath, result);
      }

      if (!fs.existsSync(filePath)) return null;
      const actualSize = Number(fs.statSync(filePath).size || 0);
      if (
        actualSize <= 0 ||
        actualSize > maxMediaFileSizeBytes ||
        Number(stats.totalBytes || 0) + actualSize > maxMediaTotalBytes
      ) {
        safeUnlink(filePath);
        return null;
      }
      if (
        typeof hasEnoughFreeDiskSpace === "function" &&
        !hasEnoughFreeDiskSpace(actualSize)
      ) {
        safeUnlink(filePath);
        return null;
      }

      const normalized = {
        kind: descriptor.kind,
        originalName: descriptor.originalName,
        storedName,
        mimeType: descriptor.mimeType,
        sizeBytes: actualSize,
        widthPx: descriptor.widthPx,
        heightPx: descriptor.heightPx,
        durationSeconds: descriptor.durationSeconds,
        expiresAt:
          typeof computeExpiryIso === "function"
            ? computeExpiryIso(new Date().toISOString(), messageFileRetentionDays)
            : null,
      };

      if (
        String(normalized.mimeType || "").startsWith("video/") &&
        (!normalized.widthPx || !normalized.heightPx || normalized.durationSeconds === null) &&
        typeof probeVideoMetadata === "function"
      ) {
        const metadata = await probeVideoMetadata(filePath);
        normalized.widthPx = normalized.widthPx || metadata.widthPx || null;
        normalized.heightPx = normalized.heightPx || metadata.heightPx || null;
        if (
          normalized.durationSeconds === null &&
          metadata.durationSeconds !== null
        ) {
          normalized.durationSeconds = metadata.durationSeconds;
        }
      }

      storageEncryption?.encryptFileInPlace?.(filePath);
      return { file: normalized, filePath };
    } catch (error) {
      safeUnlink(filePath);
      if (isTelegramConnectionError(error)) {
        throw error;
      }
      log("media:skip", {
        messageId: normalizeMessageId(message?.id),
        error: errorMessage(error),
      });
      return null;
    }
  }

  async function maybeEnqueueRemoteVideoTranscode({ chat, messageId, author, file }) {
    if (
      !transcodeVideosToH264 ||
      typeof enqueueVideoTranscodeJob !== "function" ||
      typeof listMessageFilesByMessageIds !== "function" ||
      !String(file?.mimeType || "").toLowerCase().startsWith("video/")
    ) {
      return;
    }
    if (typeof ensureFfmpegAvailable === "function") {
      try {
        await ensureFfmpegAvailable();
      } catch (error) {
        log("media:transcode-skip", {
          messageId: Number(messageId),
          error: errorMessage(error),
        });
        return;
      }
    }

    const rows = listMessageFilesByMessageIds([Number(messageId)]);
    const inserted = rows.find(
      (row) => path.basename(String(row?.stored_name || "")) === file.storedName,
    );
    const fileId = Number(inserted?.id || 0);
    if (!fileId) return;

    enqueueVideoTranscodeJob({
      fileId,
      storedName: file.storedName,
      chatId: Number(chat.id),
      messageId: Number(messageId),
      username: author.username,
    });
  }

  async function fetchTelegramMediaMessages(activeClient, entity, ids) {
    const requestedIds = Array.from(
      new Set((ids || []).map((id) => normalizeMessageId(id)).filter(Boolean)),
    );
    if (!requestedIds.length) return [];
    const messages = await activeClient.getMessages(entity, { ids: requestedIds });
    const byId = new Map();
    Array.from(messages || []).forEach((message) => {
      const id = normalizeMessageId(message?.id);
      if (id) byId.set(id, message);
    });
    return requestedIds.map((id) => byId.get(id)).filter(Boolean);
  }

  async function streamTelegramMediaFiles({
    activeClient,
    entity,
    mediaMessageIds,
    chat,
    author,
    ensureMessage,
  }) {
    if (!mediaStreamingIsAvailable() || !mediaMessageIds.length) return 0;

    const mediaMessages = await fetchTelegramMediaMessages(
      activeClient,
      entity,
      mediaMessageIds,
    );
    let attached = 0;

    for (let index = 0; index < mediaMessages.length; index += 1) {
      const currentMessageId = ensureMessage.peekMessageId();
      const stats = readExistingMessageFileStats(currentMessageId);
      if (stats.count >= maxMediaFilesPerMessage) break;

      const descriptor = getTelegramMediaDescriptor(mediaMessages[index], index);
      if (!descriptor || stats.names.has(descriptor.originalName)) continue;

      const downloaded = await downloadTelegramMediaFile(
        activeClient,
        mediaMessages[index],
        index,
        stats,
      );
      if (!downloaded?.file) continue;

      let targetMessageId = 0;
      try {
        const summaryText = summarizeMediaFiles([downloaded.file]);
        targetMessageId = ensureMessage(summaryText || "Sent a media file", {
          hasMedia: true,
          summaryText,
        });
        const latestStats = readExistingMessageFileStats(targetMessageId);
        if (
          latestStats.count >= maxMediaFilesPerMessage ||
          latestStats.names.has(downloaded.file.originalName) ||
          latestStats.totalBytes + downloaded.file.sizeBytes > maxMediaTotalBytes
        ) {
          safeUnlink(downloaded.filePath);
          continue;
        }

        createMessageFiles(Number(targetMessageId), [downloaded.file]);
        setMessageExpiresAt?.(Number(targetMessageId), null);
        attached += 1;

        await maybeEnqueueRemoteVideoTranscode({
          chat,
          messageId: Number(targetMessageId),
          author,
          file: downloaded.file,
        });

        emitChatEvent(Number(chat.id), {
          type: "chat_message_updated",
          chatId: Number(chat.id),
          messageId: Number(targetMessageId),
          username: author.username,
        });
      } catch (error) {
        safeUnlink(downloaded.filePath);
        throw error;
      }
    }

    return attached;
  }

  async function processQueueItem(item) {
    const throwIfAborted = () => {
      if (
        abortedItemIds.has(Number(item.id)) ||
        abortedSourceIds.has(Number(item.source_id))
      ) {
        throw Object.assign(new Error("Queue item was manually skipped."), { isAbort: true });
      }
    };

    throwIfAborted();
    const currentSource =
      typeof getRemoteChannelSourceById === "function"
        ? getRemoteChannelSourceById(item.source_id)
        : null;
    if (!currentSource || !Number(currentSource.enabled || 0)) {
      markRemoteChannelQueueItemSkipped(
        item.id,
        "Remote Channel was disabled before this item was mirrored.",
      );
      return;
    }
    if (
      Number(currentSource.source_version || 1) !==
      Number(item.source_version || 1)
    ) {
      markRemoteChannelQueueItemSkipped(
        item.id,
        "Remote source changed before this item was mirrored.",
      );
      return;
    }

    let envelope = null;
    try {
      envelope = JSON.parse(String(item?.payload_json || "{}"));
    } catch {
      markRemoteChannelQueueItemSkipped(item.id, "Invalid payload.");
      return;
    }

    // --- Songbird provider: text-only, no Telegram client needed ---
    if (currentSource.provider === "songbird") {
      const remoteMessage = envelope?.message || {};
      const body = truncateBody(String(remoteMessage?.body || "").trim(), messageMaxChars);
      if (!body) {
        markRemoteChannelQueueItemSkipped(item.id, "Songbird post has no text to mirror.");
        return;
      }

      const chat = findChatById(Number(item.chat_id));
      if (!chat || String(chat.type || "").toLowerCase() !== "channel") {
        throw new Error("Target channel is no longer available.");
      }
      const authorId = resolveAuthorUserId(chat);
      if (!authorId) throw new Error("Target channel has no owner to author remote posts.");
      const author = findUserById(authorId);
      if (!author) throw new Error("Target channel owner no longer exists.");

      const remoteMessageId = Number(item.telegram_message_id || remoteMessage?.id || 0) || 0;
      const clientRequestId = `remote:sb:${Number(item.source_id)}:${remoteMessageId}`.slice(0, 120);
      const source = {
        title: envelope?.source?.title || item.source_title || "",
        username: envelope?.source?.username || item.source_username || "",
        source_url: envelope?.source?.sourceUrl || currentSource.source_url || "",
        source_title: item.source_title || "",
        source_username: item.source_username || "",
      };

      const expiresAt = computeTextExpiryIso(messageTextRetentionDays);
      const created = createOrReuseMessage(Number(chat.id), authorId, body, null, expiresAt, clientRequestId);
      const msgId = Number(created?.id || 0);
      if (!msgId) throw new Error("Unable to create mirrored message.");

      if (!created?.deduped) {
        setMessageForwardOrigin(msgId, {
          label: buildSongbirdOriginLabel(source),
          sourceChatId: null,
          sourceUserId: null,
          sourceUsername: null,
          sourceAvatarUrl: currentSource.source_avatar_url || null,
          sourceColor: "#10b981",
        });
        emitChatEvent(Number(chat.id), {
          type: "chat_message",
          chatId: Number(chat.id),
          messageId: msgId,
          username: author.username,
          clientRequestId,
          client_request_id: clientRequestId,
          isRemoteChannelMessage: true,
          body,
        });
        await sendPushForMirroredPost({ chat, authorId, body });
      }

      markRemoteChannelQueueItemDone(item.id, msgId);
      updateRemoteChannelSourceError(item.source_id, "");
      return;
    }

    // --- Telegram provider ---
    const remoteMessages = Array.isArray(envelope?.messages)
      ? envelope.messages.filter(Boolean)
      : [envelope?.message || {}];
    const remoteMessage = envelope?.message || remoteMessages[0] || {};
    const body = truncateBody(firstTextFromMessages(remoteMessages), messageMaxChars);
    const mediaMessageIds = buildTelegramMediaIds(
      Array.isArray(envelope?.mediaMessageIds) && envelope.mediaMessageIds.length
        ? envelope.mediaMessageIds.map((id) => ({ id, hasMedia: true }))
        : remoteMessages,
    );
    const shouldStreamMedia =
      mediaStreamingIsAvailable() &&
      Boolean(Number(currentSource.stream_media || item.stream_media || 0)) &&
      mediaMessageIds.length > 0;

    if (!body && !shouldStreamMedia) {
      markRemoteChannelQueueItemSkipped(
        item.id,
        "Telegram post has no text, caption, or streamable media to mirror.",
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
    const source = {
      title: envelope?.source?.title || item.source_title || "",
      username: envelope?.source?.username || item.source_username || "",
      source_title: item.source_title || "",
      source_username: item.source_username || "",
    };
    let messageId = 0;
    let messageBody = "";
    let initialMessageDeduped = false;
    let initialMessageEmitted = false;
    let pushSent = false;

    const ensureMessage = (fallbackBody = "", options = {}) => {
      if (messageId) return messageId;
      // Check abort before creating the message — once it's created and the
      // SSE event is emitted, the message is already visible in the channel.
      throwIfAborted();
      messageBody =
        body ||
        String(fallbackBody || "").trim() ||
        (options.hasMedia ? "Sent a media file" : "");
      if (!messageBody) {
        throw new Error("Telegram post has no text, caption, or streamable media to mirror.");
      }
      const expiresAt = options.hasMedia
        ? null
        : computeTextExpiryIso(messageTextRetentionDays);
      const created = createOrReuseMessage(
        Number(chat.id),
        authorId,
        messageBody,
        null,
        expiresAt,
        clientRequestId,
      );
      messageId = Number(created?.id || 0);
      initialMessageDeduped = Boolean(created?.deduped);
      if (!messageId) throw new Error("Unable to create mirrored message.");

      if (!created?.deduped) {
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
          clientRequestId,
          client_request_id: clientRequestId,
          isRemoteChannelMessage: true,
          body: messageBody,
          summaryText: options.summaryText || undefined,
          replyToMessageId: null,
        });
        initialMessageEmitted = true;
      }

      return messageId;
    };
    ensureMessage.peekMessageId = () => messageId;

    if (body) {
      ensureMessage(body);
      if (!initialMessageDeduped && initialMessageEmitted) {
        await sendPushForMirroredPost({
          chat,
          authorId,
          body: messageBody,
        });
        pushSent = true;
      }
    }

    if (shouldStreamMedia) {
      throwIfAborted();
      const activeClient = await ensureClient();
      const resolved = await resolveSource(activeClient, currentSource);
      await streamTelegramMediaFiles({
        activeClient,
        entity: resolved.entity,
        mediaMessageIds,
        chat,
        author,
        ensureMessage,
      });
    }

    if (!messageId) {
      markRemoteChannelQueueItemSkipped(
        item.id,
        "Telegram post has no text, caption, or streamable media to mirror.",
      );
      return;
    }

    if (!pushSent && !initialMessageDeduped && initialMessageEmitted) {
      await sendPushForMirroredPost({
        chat,
        authorId,
        body: messageBody,
      });
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
      if (error?.isAbort) {
        // Item was manually skipped while in-flight. The DB row was already
        // marked skipped by the abort call; just clean up the in-memory set.
        abortedItemIds.delete(Number(item.id));
        markRemoteChannelQueueItemSkipped(item.id, "Manually skipped.");
        log("queue:aborted", { id: Number(item.id) });
        return;
      }
      const attempts = Number(item?.attempts || 0) + 1;
      const failed = attempts >= maxAttempts;
      const message = errorMessage(error);
      markRemoteChannelQueueItemRetry(item.id, {
        failed,
        nextAttemptAt: new Date(Date.now() + computeBackoffMs(attempts)).toISOString(),
        error: message,
      });
      updateRemoteChannelSourceError(item.source_id, message);
      markTelegramClientForReset(error, "queue");
      log("queue:error", { id: Number(item.id), failed, error: message });
    }
  }

  async function runQueueOnce() {
    // Only release stale locks once per minute to avoid a DB write on every
    // queue tick (which fires as often as every second).
    const now = Date.now();
    const staleReleaseIntervalMs = Math.max(60_000, staleLockMs / 5);
    if (
      !runQueueOnce._lastStaleReleaseAt ||
      now - runQueueOnce._lastStaleReleaseAt >= staleReleaseIntervalMs
    ) {
      const staleBefore = new Date(now - staleLockMs).toISOString();
      releaseStaleRemoteChannelQueueItems(staleBefore);
      runQueueOnce._lastStaleReleaseAt = now;
    }

    // Claim the full batch up-front, then process items concurrently across
    // different sources. Items from the same source are processed sequentially
    // to preserve chronological mirroring order.
    const items = [];
    for (let index = 0; index < queueBatchSize; index += 1) {
      if (stopped) break;
      const item = claimNextRemoteChannelQueueItem(
        lockOwner,
        new Date().toISOString(),
      );
      if (!item?.id) break;
      items.push(item);
    }
    if (!items.length) return;

    // Group by source_id so each source's items run in order.
    const bySource = new Map();
    for (const item of items) {
      const key = Number(item.source_id);
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key).push(item);
    }

    // Run each source's chain concurrently with other sources.
    await Promise.all(
      [...bySource.values()].map((sourceItems) =>
        sourceItems.reduce(
          (chain, item) => chain.then(() => processClaimedItem(item)),
          Promise.resolve(),
        ),
      ),
    );
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
    // Run Telegram poll loop only when Telegram credentials are configured.
    if (apiId && apiHash && sessionString) {
      void runPollLoop();
    }
    // Songbird poll loop runs independently — no credentials needed.
    void runSongbirdPollLoop();
    queueTimer = setInterval(() => {
      void runQueueLoop();
    }, queueIntervalMs);
    if (typeof queueTimer.unref === "function") queueTimer.unref();
    void runQueueLoop();
  }

  function stop() {
    stopped = true;
    clientResetRequired = false;
    clientResetReason = "";
    if (queueTimer) {
      clearInterval(queueTimer);
      queueTimer = null;
    }
    if (client) {
      const staleClient = client;
      client = null;
      void destroyTelegramClient(staleClient, "stop");
    }
  }

  async function testConnection(sourceId) {
    const source = getRemoteChannelSourceById(sourceId);
    if (!source?.id) {
      throw new Error("Remote channel source not found.");
    }

    if (!source.enabled) {
      throw new Error("Remote channel is disabled.");
    }

    if (source.provider === "songbird") {
      const sourceUrl = String(source.source_url || source.source_raw || "").trim();
      if (!sourceUrl) {
        throw new Error("Songbird source URL is not configured.");
      }
      const channelUsername = String(source.source_username || "").trim();
      if (!channelUsername) {
        throw new Error("Songbird source channel username is not resolved yet. Try saving the settings again.");
      }
      // Verify the target server is reachable and the channel is still public.
      const metaUrl = `${sourceUrl}/api/channels/${encodeURIComponent(channelUsername)}/meta`;
      const response = await fetch(metaUrl, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 403) {
        throw new Error("Target server is private. Only public servers can be used as a Songbird remote source.");
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || `Target server returned ${response.status}.`);
      }
      const data = await response.json();
      return {
        success: true,
        channelTitle: data?.name || channelUsername,
        hasAccess: true,
      };
    }

    if (source.provider !== "telegram") {
      throw new Error(`Unsupported provider: ${source.provider}`);
    }

    // Ensure we have a connected client
    await ensureClient();
    
    try {
      // Try to get the channel entity
      const entity = await client.getEntity(
        source.source_username || source.source_chat_id
      );
      
      if (!entity) {
        throw new Error("Unable to find the target channel.");
      }

      // Try to get the latest message to verify we have access
      const messages = await client.getMessages(entity, { limit: 1 });
      
      return {
        success: true,
        channelTitle: entity.title || source.source_username,
        channelId: entity.id?.toString(),
        hasAccess: true,
        latestMessageId: messages?.[0]?.id || null,
      };
    } catch (error) {
      throw new Error(
        `Connection test failed: ${error?.message || "Unable to access channel"}`
      );
    }
  }

  function abortQueueItem(sourceId) {
    const id = Number(sourceId || 0);
    if (!id) return 0;
    const itemId = getCurrentRemoteChannelQueueItemId(id);
    // Mark the lowest active item in the DB as skipped.
    const count = skipCurrentRemoteChannelQueueItemDb(id);
    // Signal abort for the specific in-flight item only.
    if (itemId) {
      abortedItemIds.add(itemId);
      setTimeout(() => abortedItemIds.delete(itemId), queueIntervalMs * 2 + staleLockMs);
    }
    return count;
  }

  function abortAllQueueItems(sourceId) {
    const id = Number(sourceId || 0);
    if (!id) return 0;
    // Signal all in-flight items for this source to stop at the next yield.
    abortedSourceIds.add(id);
    // Clear the source-level abort flag after a window long enough to cover
    // any currently in-flight batch.
    setTimeout(() => abortedSourceIds.delete(id), staleLockMs);
    // Mark all pending/retry/processing DB rows as skipped.
    return skipAllRemoteChannelQueueItemsDb(id);
  }

  return {
    start,
    stop,
    isEnabled: () => enabled,
    syncSourceMetadata,
    testConnection,
    abortQueueItem,
    abortAllQueueItems,
  };
}

export {
  createRemoteChannelManager,
  getTelegramClientConnectionOptions,
  normalizeSongbirdSource,
  normalizeTelegramSource,
  parseTelegramProxy,
  resolveSongbirdSource,
};

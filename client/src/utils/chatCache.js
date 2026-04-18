import { CHAT_PAGE_CONFIG } from "../settings/chatPageConfig.js";
import {
  CACHE_STORES,
  idbDelete,
  idbGet,
  idbSet,
  isIdbAvailable,
} from "./cacheDb.js";

export const CHAT_CACHE_VERSION = 2;
export const CHAT_LIST_CACHE_KEY = "songbird-chat-list-cache";
export const CHAT_MESSAGES_CACHE_KEY = "songbird-chat-messages-cache";
export const CHAT_MESSAGES_INDEX_KEY = "songbird-chat-messages-index";
export const CHAT_MESSAGES_INDEX_LIMIT = 25;
export const MEDIA_THUMB_CACHE_KEY = "chat-media-thumbs-v2";
export const MEDIA_POSTER_CACHE_KEY = "chat-video-posters-v3";
export const VOICE_WAVEFORM_CACHE_KEY = "voice-waveform-cache-v1";
export const CHANNEL_SEEN_CACHE_KEY = "songbird-channel-seen";
export const MESSAGE_CACHE_MAX = Math.max(
  50,
  Math.min(200, CHAT_PAGE_CONFIG.messageFetchLimit),
);

export const safeParseJson = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const normalizeMessageBody = (value) => {
  if (typeof value === "string") {
    return value === "[object Object]" ? "" : value;
  }
  if (value && typeof value === "object") {
    const text = value.text ?? value.body;
    return typeof text === "string" ? text : "";
  }
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str === "[object Object]") return "";
  return str;
};

let localStorageAvailable;
export const canUseLocalStorage = () => {
  if (typeof window === "undefined") return false;
  if (localStorageAvailable !== undefined) return localStorageAvailable;
  try {
    const testKey = "__songbird_ls_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    localStorageAvailable = true;
  } catch {
    localStorageAvailable = false;
  }
  return localStorageAvailable;
};

let idbAvailable;
export const canUseIdb = () => {
  if (typeof window === "undefined") return false;
  if (idbAvailable !== undefined) return idbAvailable;
  idbAvailable = isIdbAvailable();
  return idbAvailable;
};

export const readLocalCache = (key) => {
  if (typeof window === "undefined") return null;
  if (!canUseLocalStorage()) return null;
  return safeParseJson(window.localStorage.getItem(key));
};

export const removeLocalCache = (key) => {
  if (typeof window === "undefined") return;
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
};

export const writeLocalCache = (key, value) => {
  if (typeof window === "undefined") return false;
  if (!canUseLocalStorage()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const readIdbCache = async (store, key) => {
  if (!canUseIdb()) return null;
  const entry = await idbGet(store, key);
  return entry?.data ?? null;
};

export const writeIdbCache = async (store, key, value) => {
  if (!canUseIdb()) return false;
  const ok = await idbSet(store, key, value);
  return Boolean(ok);
};

export const deleteIdbCache = async (store, key) => {
  if (!canUseIdb()) return false;
  await idbDelete(store, key);
  return true;
};

export const buildChatListCacheKey = (username) =>
  `${CHAT_LIST_CACHE_KEY}:${String(username || "").toLowerCase()}`;

export const buildMessagesCacheKey = (username, chatId) =>
  `${CHAT_MESSAGES_CACHE_KEY}:${String(username || "").toLowerCase()}:${Number(chatId || 0)}`;

export const buildMessagesIndexKey = (username) =>
  `${CHAT_MESSAGES_INDEX_KEY}:${String(username || "").toLowerCase()}`;

export const buildChannelSeenCacheKey = (username, chatId) =>
  `${CHANNEL_SEEN_CACHE_KEY}:${String(username || "").toLowerCase()}:${Number(chatId || 0)}`;

export const isCacheExpired = (entry, ttlMs) => {
  if (!entry || typeof entry !== "object") return true;
  if (!Number.isFinite(Number(entry.updatedAt))) return true;
  return Date.now() - Number(entry.updatedAt) > ttlMs;
};

export const readChatListCache = () => null;

export const readChatListCacheAsync = async (username) => {
  const cached = await readIdbCache(
    CACHE_STORES.chatList,
    buildChatListCacheKey(username),
  );
  if (!cached || cached.version !== CHAT_CACHE_VERSION) return null;
  if (isCacheExpired(cached, CHAT_PAGE_CONFIG.cacheTtlMs)) {
    await deleteIdbCache(
      CACHE_STORES.chatList,
      buildChatListCacheKey(username),
    );
    return null;
  }
  return cached;
};

export const readMessagesCache = () => null;

export const readMessagesCacheAsync = async (username, chatId) => {
  const key = buildMessagesCacheKey(username, chatId);
  const cached = await readIdbCache(CACHE_STORES.messages, key);
  if (!cached || cached.version !== CHAT_CACHE_VERSION) return null;
  if (isCacheExpired(cached, CHAT_PAGE_CONFIG.cacheTtlMs)) {
    await deleteIdbCache(CACHE_STORES.messages, key);
    return null;
  }
  if (Array.isArray(cached.messages)) {
    cached.messages = cached.messages.filter((msg) => {
      const id = Number(msg?.id || msg?._serverId || 0);
      return Number.isFinite(id) && id > 0;
    });
  }
  return cached;
};

export const readMessagesIndex = () => [];

export const readMessagesIndexAsync = async (username) => {
  const cached = await readIdbCache(
    CACHE_STORES.index,
    buildMessagesIndexKey(username),
  );
  return Array.isArray(cached) ? cached : [];
};

export const readChannelSeenCache = () => ({});

export const readChannelSeenCacheAsync = async (username, chatId) => {
  const cached = await readIdbCache(
    CACHE_STORES.channelSeen,
    buildChannelSeenCacheKey(username, chatId),
  );
  if (!cached || typeof cached !== "object") return {};
  if (cached.version !== 1 || typeof cached.counts !== "object") return {};
  return cached.counts || {};
};

export const writeChannelSeenCache = () => {};

export const writeChannelSeenCacheAsync = async (
  username,
  chatId,
  counts = {},
) => {
  if (!username || !chatId || typeof counts !== "object") return;
  const entries = Object.entries(counts)
    .map(([key, value]) => [Number(key), Number(value)])
    .filter(
      ([id, value]) => Number.isFinite(id) && id > 0 && Number.isFinite(value),
    );
  if (!entries.length) return;
  entries.sort((a, b) => b[0] - a[0]);
  const trimmed = entries.slice(0, 300).reduce((acc, [id, value]) => {
    acc[id] = value;
    return acc;
  }, {});
  await writeIdbCache(
    CACHE_STORES.channelSeen,
    buildChannelSeenCacheKey(username, chatId),
    {
      version: 1,
      updatedAt: Date.now(),
      counts: trimmed,
    },
  );
};

export const writeMessagesIndex = async (username, index) => {
  await writeIdbCache(
    CACHE_STORES.index,
    buildMessagesIndexKey(username),
    index,
  );
};

export const pruneMessagesIndex = (username, index) => {
  const trimmed = index
    .filter(
      (entry) =>
        Number(entry?.chatId) > 0 && Number.isFinite(Number(entry?.updatedAt)),
    )
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
    .slice(0, CHAT_MESSAGES_INDEX_LIMIT);
  const keepIds = new Set(trimmed.map((entry) => Number(entry.chatId)));
  index.forEach((entry) => {
    const chatId = Number(entry?.chatId);
    if (!chatId || keepIds.has(chatId)) return;
    void deleteIdbCache(
      CACHE_STORES.messages,
      buildMessagesCacheKey(username, chatId),
    );
  });
  return trimmed;
};

export const updateMessagesIndex = async (username, chatId, updatedAt) => {
  if (!username || !chatId) return;
  const index = await readMessagesIndexAsync(username);
  const next = index.filter(
    (entry) => Number(entry?.chatId) !== Number(chatId),
  );
  next.push({
    chatId: Number(chatId),
    updatedAt: Number(updatedAt) || Date.now(),
  });
  const trimmed = pruneMessagesIndex(username, next);
  await writeMessagesIndex(username, trimmed);
};

export const evictOldestMessageCaches = async (username, maxToRemove = 3) => {
  if (!username) return;
  const index = await readMessagesIndexAsync(username);
  if (!index.length) return;
  const sorted = index
    .filter((entry) => Number(entry?.chatId) > 0)
    .sort((a, b) => Number(a.updatedAt || 0) - Number(b.updatedAt || 0));
  const toRemove = sorted.slice(0, maxToRemove);
  if (!toRemove.length) return;
  const removeIds = new Set(toRemove.map((entry) => Number(entry.chatId)));
  removeIds.forEach((chatId) => {
    void deleteIdbCache(
      CACHE_STORES.messages,
      buildMessagesCacheKey(username, chatId),
    );
  });
  const remaining = index.filter(
    (entry) => !removeIds.has(Number(entry?.chatId)),
  );
  await writeMessagesIndex(username, remaining);
};

export const migrateLocalCacheToIdb = async (username) => {
  if (!username) return;
  if (!canUseLocalStorage() || !canUseIdb()) return;
  const normalized = String(username || "").toLowerCase();
  const chatListKey = buildChatListCacheKey(normalized);
  const messagesIndexKey = buildMessagesIndexKey(normalized);

  try {
    const chatList = readLocalCache(chatListKey);
    if (chatList && chatList.version === CHAT_CACHE_VERSION) {
      await writeIdbCache(CACHE_STORES.chatList, chatListKey, chatList);
      removeLocalCache(chatListKey);
    }
  } catch {
    // ignore migration failures
  }

  try {
    const index = readLocalCache(messagesIndexKey);
    if (Array.isArray(index) && index.length) {
      await writeIdbCache(CACHE_STORES.index, messagesIndexKey, index);
      removeLocalCache(messagesIndexKey);
    }
  } catch {
    // ignore migration failures
  }

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(`${CHAT_MESSAGES_CACHE_KEY}:${normalized}:`)) continue;
      const cached = readLocalCache(key);
      if (!cached || cached.version !== CHAT_CACHE_VERSION) continue;
      await writeIdbCache(CACHE_STORES.messages, key, cached);
      removeLocalCache(key);
    }
  } catch {
    // ignore migration failures
  }

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (!key.startsWith(`${CHANNEL_SEEN_CACHE_KEY}:${normalized}:`)) continue;
      const cached = readLocalCache(key);
      if (!cached || cached.version !== 1) continue;
      await writeIdbCache(CACHE_STORES.channelSeen, key, cached);
      removeLocalCache(key);
    }
  } catch {
    // ignore migration failures
  }

  try {
    const mediaThumbs = readLocalCache(MEDIA_THUMB_CACHE_KEY);
    if (mediaThumbs && mediaThumbs.version === 1) {
      await writeIdbCache(
        CACHE_STORES.mediaThumbs,
        MEDIA_THUMB_CACHE_KEY,
        mediaThumbs,
      );
      removeLocalCache(MEDIA_THUMB_CACHE_KEY);
    }
  } catch {
    // ignore migration failures
  }

  try {
    const mediaPosters = readLocalCache(MEDIA_POSTER_CACHE_KEY);
    if (mediaPosters && mediaPosters.version === 1) {
      await writeIdbCache(
        CACHE_STORES.mediaPosters,
        MEDIA_POSTER_CACHE_KEY,
        mediaPosters,
      );
      removeLocalCache(MEDIA_POSTER_CACHE_KEY);
    }
  } catch {
    // ignore migration failures
  }

  try {
    const waveforms = readLocalCache(VOICE_WAVEFORM_CACHE_KEY);
    if (waveforms && waveforms.v === 1) {
      await writeIdbCache(
        CACHE_STORES.voiceWaveforms,
        VOICE_WAVEFORM_CACHE_KEY,
        {
          ...waveforms,
          updatedAt: waveforms.updatedAt || Date.now(),
        },
      );
      removeLocalCache(VOICE_WAVEFORM_CACHE_KEY);
    }
  } catch {
    // ignore migration failures
  }
};

export const isCacheableMessage = (message) => {
  if (!message || typeof message !== "object") return false;
  const id = Number(message.id || message._serverId || 0);
  if (!Number.isFinite(id) || id <= 0) return false;
  if (message._delivery === "sending") return false;
  if (message._awaitingServerEcho) return false;
  if (message._processingPending) return false;
  if (Array.isArray(message.files)) {
    const hasLocalBlob = message.files.some((file) =>
      String(file?.url || file?._localUrl || "").startsWith("blob:"),
    );
    if (hasLocalBlob) return false;
  }
  return true;
};

export const sanitizeMessageForCache = (message) => {
  if (!message || typeof message !== "object") return message;
  const normalizedBody = normalizeMessageBody(message.body);
  const normalizedReply =
    message.replyTo && typeof message.replyTo === "object"
      ? {
          ...message.replyTo,
          body: normalizeMessageBody(message.replyTo.body),
        }
      : message.replyTo || null;
  const { _files, ...rest } = message;
  rest.body = normalizedBody;
  if (normalizedReply) {
    rest.replyTo = normalizedReply;
  }
  if (Array.isArray(rest.files)) {
    rest.files = rest.files.map((file) => {
      if (!file || typeof file !== "object") return file;
      const {
        file: _file,
        _localUrl,
        _localId,
        _uploadProgress,
        _pending,
        ...fileRest
      } = file;
      if (String(fileRest.url || "").startsWith("blob:")) {
        fileRest.url = "";
      }
      return fileRest;
    });
  }
  return rest;
};

export const sanitizeMessagesForCache = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .filter(isCacheableMessage)
    .map(sanitizeMessageForCache)
    .slice(-MESSAGE_CACHE_MAX);

export const normalizeMessageForRender = (message) => {
  if (!message || typeof message !== "object") return message;
  let normalizedBody = normalizeMessageBody(message.body);
  const files = Array.isArray(message.files) ? message.files : [];
  const hasAudio = files.some((file) =>
    String(file?.mimeType || "")
      .toLowerCase()
      .startsWith("audio/"),
  );
  const nonAudioCount = files.filter(
    (file) =>
      !String(file?.mimeType || "")
        .toLowerCase()
        .startsWith("audio/"),
  ).length;
  if (hasAudio) {
    const genericBodyPattern =
      /^Sent (a media file|a document|a file|\d+ (files|documents|media files))$/i;
    if (
      (!normalizedBody || genericBodyPattern.test(normalizedBody)) &&
      nonAudioCount === 0
    ) {
      normalizedBody = "Sent a voice message";
    }
  }
  const normalizedReply =
    message.replyTo && typeof message.replyTo === "object"
      ? {
          ...message.replyTo,
          body: normalizeMessageBody(message.replyTo.body),
        }
      : message.replyTo || null;
  return {
    ...message,
    body: normalizedBody,
    replyTo: normalizedReply,
  };
};

export const normalizeMessagesForRender = (messages) =>
  (Array.isArray(messages) ? messages : []).map(normalizeMessageForRender);

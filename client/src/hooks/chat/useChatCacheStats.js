import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CACHE_STORES,
  idbClearStore,
  idbGet,
  idbGetAllEntries,
} from "../../utils/cacheDb.js";
import {
  CHAT_MESSAGES_CACHE_KEY,
  MEDIA_POSTER_CACHE_KEY,
  MEDIA_THUMB_CACHE_KEY,
  VOICE_WAVEFORM_CACHE_KEY,
  buildChatListCacheKey,
  buildMessagesIndexKey,
  canUseIdb,
  canUseLocalStorage,
  removeLocalCache,
} from "../../utils/chatCache.js";

const emptyStats = {
  totalBytes: 0,
  totalLabel: "0 B",
  chatList: {
    count: 0,
    sizeBytes: 0,
    sizeLabel: "0 B",
    updatedAt: null,
    entries: [],
  },
  messageCaches: {
    count: 0,
    sizeBytes: 0,
    sizeLabel: "0 B",
    entries: [],
  },
  mediaThumbs: {
    count: 0,
    sizeBytes: 0,
    sizeLabel: "0 B",
    updatedAt: null,
  },
  mediaPosters: {
    count: 0,
    sizeBytes: 0,
    sizeLabel: "0 B",
    updatedAt: null,
  },
  voiceWaveforms: {
    count: 0,
    sizeBytes: 0,
    sizeLabel: "0 B",
    updatedAt: null,
  },
};

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const kb = 1024;
  const mb = kb * 1024;
  if (value >= mb) return `${(value / mb).toFixed(2)} MB`;
  if (value >= kb) return `${Math.round(value / kb)} KB`;
  return `${Math.max(1, Math.round(value))} B`;
};

export function useChatCacheStats({ user, settingsPanel, messagesCacheRef }) {
  const [idbStats, setIdbStats] = useState(null);

  const getCacheStatsFromIdb = useCallback(async () => {
    if (!canUseIdb()) {
      return emptyStats;
    }
    const username = String(user?.username || "").toLowerCase();
    const chatListKey = buildChatListCacheKey(username);
    const chatNameById = new Map();
    let totalBytes = 0;
    let chatListSizeBytes = 0;
    let messageCacheSizeBytes = 0;
    let chatListUpdatedAt = null;
    const chatListEntries = [];
    const messageCacheEntries = [];
    let mediaThumbSizeBytes = 0;
    let mediaPosterSizeBytes = 0;
    let voiceWaveformSizeBytes = 0;
    let mediaThumbUpdatedAt = null;
    let mediaPosterUpdatedAt = null;
    let voiceWaveformUpdatedAt = null;
    let mediaThumbCount = 0;
    let mediaPosterCount = 0;
    let voiceWaveformCount = 0;

    const chatListEntry = await idbGet(CACHE_STORES.chatList, chatListKey);
    if (chatListEntry?.data) {
      totalBytes += Number(chatListEntry.sizeBytes || 0);
      chatListSizeBytes += Number(chatListEntry.sizeBytes || 0);
      const parsed = chatListEntry.data;
      chatListUpdatedAt = parsed?.updatedAt || null;
      const chats = Array.isArray(parsed?.chats) ? parsed.chats : [];
      chats.forEach((chat) => {
        const chatId = Number(chat?.id || 0);
        if (chatId) {
          chatNameById.set(
            chatId,
            String(
              chat?.name || chat?.group_username || chat?.username || "Chat",
            ),
          );
        }
        chatListEntries.push({
          id: chatId,
          name: String(
            chat?.name || chat?.group_username || chat?.username || "Chat",
          ),
          type: String(chat?.type || "").toLowerCase() || "chat",
          lastTime: chat?.last_time || null,
          avatar_url: chat?.group_avatar_url || null,
          color: chat?.group_color || null,
          members: Array.isArray(chat?.members) ? chat.members : [],
        });
      });
    }

    const messageEntries = await idbGetAllEntries(CACHE_STORES.messages);
    messageEntries.forEach((entry) => {
      if (!entry?.data) return;
      const size = Number(entry.sizeBytes || 0);
      totalBytes += size;
      messageCacheSizeBytes += size;
      const parsed = entry.data;
      const chatId = Number(parsed?.chatId || 0);
      const messageCount = Array.isArray(parsed?.messages)
        ? parsed.messages.length
        : 0;
      const updatedAt = parsed?.updatedAt || null;
      messageCacheEntries.push({
        chatId,
        chatName: chatNameById.get(chatId) || `Chat ${chatId || ""}`.trim(),
        messageCount,
        updatedAt,
        sizeBytes: size,
      });
    });

    const mediaThumbEntry = await idbGet(
      CACHE_STORES.mediaThumbs,
      MEDIA_THUMB_CACHE_KEY,
    );
    if (mediaThumbEntry?.data) {
      mediaThumbSizeBytes = Number(mediaThumbEntry.sizeBytes || 0);
      totalBytes += mediaThumbSizeBytes;
      const parsed = mediaThumbEntry.data;
      mediaThumbUpdatedAt = parsed?.updatedAt || null;
      mediaThumbCount = Array.isArray(parsed?.items) ? parsed.items.length : 0;
    }

    const mediaPosterEntry = await idbGet(
      CACHE_STORES.mediaPosters,
      MEDIA_POSTER_CACHE_KEY,
    );
    if (mediaPosterEntry?.data) {
      mediaPosterSizeBytes = Number(mediaPosterEntry.sizeBytes || 0);
      totalBytes += mediaPosterSizeBytes;
      const parsed = mediaPosterEntry.data;
      mediaPosterUpdatedAt = parsed?.updatedAt || null;
      mediaPosterCount = parsed?.posters
        ? Object.keys(parsed.posters || {}).length
        : 0;
    }

    const voiceWaveformEntry = await idbGet(
      CACHE_STORES.voiceWaveforms,
      VOICE_WAVEFORM_CACHE_KEY,
    );
    if (voiceWaveformEntry?.data) {
      voiceWaveformSizeBytes = Number(voiceWaveformEntry.sizeBytes || 0);
      totalBytes += voiceWaveformSizeBytes;
      const parsed = voiceWaveformEntry.data;
      voiceWaveformUpdatedAt = parsed?.updatedAt || null;
      voiceWaveformCount = Array.isArray(parsed?.entries)
        ? parsed.entries.length
        : 0;
    }

    return {
      totalBytes,
      totalLabel: formatBytes(totalBytes),
      chatList: {
        count: chatListEntries.length,
        sizeBytes: chatListSizeBytes,
        sizeLabel: formatBytes(chatListSizeBytes),
        updatedAt: chatListUpdatedAt,
        entries: chatListEntries,
      },
      messageCaches: {
        count: messageCacheEntries.length,
        sizeBytes: messageCacheSizeBytes,
        sizeLabel: formatBytes(messageCacheSizeBytes),
        entries: messageCacheEntries.map((entry) => ({
          ...entry,
          sizeLabel: formatBytes(entry.sizeBytes),
        })),
      },
      mediaThumbs: {
        count: mediaThumbCount,
        sizeBytes: mediaThumbSizeBytes,
        sizeLabel: formatBytes(mediaThumbSizeBytes),
        updatedAt: mediaThumbUpdatedAt,
      },
      mediaPosters: {
        count: mediaPosterCount,
        sizeBytes: mediaPosterSizeBytes,
        sizeLabel: formatBytes(mediaPosterSizeBytes),
        updatedAt: mediaPosterUpdatedAt,
      },
      voiceWaveforms: {
        count: voiceWaveformCount,
        sizeBytes: voiceWaveformSizeBytes,
        sizeLabel: formatBytes(voiceWaveformSizeBytes),
        updatedAt: voiceWaveformUpdatedAt,
      },
    };
  }, [user?.username]);

  useEffect(() => {
    if (settingsPanel !== "data") return;
    if (!canUseIdb()) return;
    let isActive = true;
    void (async () => {
      const stats = await getCacheStatsFromIdb();
      if (isActive) {
        setIdbStats(stats);
        if (Number(stats?.totalBytes || 0) === 0) {
          window.setTimeout(() => {
            void (async () => {
              const retry = await getCacheStatsFromIdb();
              if (isActive) {
                setIdbStats(retry);
              }
            })();
          }, 600);
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, [getCacheStatsFromIdb, settingsPanel]);

  const handleClearCache = useCallback(async () => {
    if (typeof window === "undefined") return;
    const username = String(user?.username || "").toLowerCase();
    if (canUseLocalStorage()) {
      try {
        if (username) {
          const keysToRemove = [];
          for (let i = 0; i < window.localStorage.length; i += 1) {
            const key = window.localStorage.key(i);
            if (!key) continue;
            if (
              key === buildChatListCacheKey(username) ||
              key === buildMessagesIndexKey(username) ||
              key.startsWith(`${CHAT_MESSAGES_CACHE_KEY}:${username}:`)
            ) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach((key) => removeLocalCache(key));
        }

        [
          MEDIA_THUMB_CACHE_KEY,
          MEDIA_POSTER_CACHE_KEY,
          VOICE_WAVEFORM_CACHE_KEY,
          "chat-media-thumbs",
          "chat-video-posters-v2",
        ].forEach((key) => removeLocalCache(key));
      } catch {
        // ignore storage failures
      }

      try {
        window.sessionStorage.removeItem("chat-media-thumbs");
        window.sessionStorage.removeItem("chat-video-posters-v2");
      } catch {
        // ignore storage failures
      }
    }

    messagesCacheRef.current.clear();

    // Clear IndexedDB in parallel
    if (canUseIdb()) {
      await Promise.all([
        idbClearStore(CACHE_STORES.chatList),
        idbClearStore(CACHE_STORES.messages),
        idbClearStore(CACHE_STORES.index),
        idbClearStore(CACHE_STORES.mediaThumbs),
        idbClearStore(CACHE_STORES.mediaPosters),
        idbClearStore(CACHE_STORES.voiceWaveforms),
      ]).catch(() => null);
    }

    // Update stats to reflect cleared cache
    setTimeout(() => {
      setIdbStats(null);
      if (canUseIdb()) {
        void (async () => {
          const stats = await getCacheStatsFromIdb();
          setIdbStats(stats);
        })();
      }
    }, 100);
  }, [getCacheStatsFromIdb, user?.username, messagesCacheRef]);

  const dataCacheStats = useMemo(() => {
    if (settingsPanel !== "data") return emptyStats;
    return idbStats || emptyStats;
  }, [idbStats, settingsPanel]);

  return { dataCacheStats, handleClearCache };
}

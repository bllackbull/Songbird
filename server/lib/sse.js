import { isValidUuid } from "./uuidUtils.js";

const UUID_EVENT_TYPES = new Set([
  "chat_message",
  "chat_message_updated",
  "chat_message_deleted",
  "chat_read",
  "chat_typing",
  "chat_updated",
  "chat_deleted",
  "chat_list_changed",
  "presence_update",
  "profile_updated",
  "user_profile_updated",
]);

function hasValidUuidReferences(payload = {}) {
  const type = String(payload?.type || "");
  if (!UUID_EVENT_TYPES.has(type)) return true;

  const uuidFields = ["chatId", "messageId", "userId", "replyToMessageId", "sourceChatId", "sourceUserId"];
  for (const field of uuidFields) {
    if (payload[field] !== undefined && payload[field] !== null && !isValidUuid(String(payload[field]))) {
      return false;
    }
  }

  if (Array.isArray(payload.messageIds) && payload.messageIds.some((id) => !isValidUuid(String(id)))) {
    return false;
  }

  if (["chat_message", "chat_message_updated", "chat_message_deleted", "chat_read", "chat_typing", "chat_updated", "chat_deleted"].includes(type) && !isValidUuid(String(payload.chatId || ""))) {
    return false;
  }
  if (type === "presence_update" && !isValidUuid(String(payload.userId || ""))) {
    return false;
  }
  if ((type === "profile_updated" || type === "user_profile_updated") && !isValidUuid(String(payload.userId || ""))) {
    return false;
  }

  return true;
}

export function createSseHub({ listChatMembers }) {
  const sseClientsByUsername = new Map();
  // Short-lived cache for chat member lists to avoid repeated DB queries on
  // rapid SSE event bursts (e.g., multiple messages in quick succession).
  const memberCache = new Map(); // chatId → { members, expiresAt }
  const MEMBER_CACHE_TTL_MS = 8000;
  // Sweep expired entries every 5 minutes to prevent unbounded Map growth.
  const memberCacheSweepTimer = setInterval(() => {
    const now = Date.now();
    memberCache.forEach((entry, chatId) => {
      if (entry.expiresAt <= now) memberCache.delete(chatId);
    });
  }, 5 * 60 * 1000);
  if (typeof memberCacheSweepTimer.unref === "function") {
    memberCacheSweepTimer.unref();
  }

  function getCachedMembers(chatId) {
    const entry = memberCache.get(chatId);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.members;
    }
    const rawMembers = listChatMembers(chatId);
    if (rawMembers && typeof rawMembers.then === "function") {
      return rawMembers.then((members) => {
        const list = Array.isArray(members) ? members : [];
        memberCache.set(chatId, {
          members: list,
          expiresAt: Date.now() + MEMBER_CACHE_TTL_MS,
        });
        return list;
      });
    }
    const list = Array.isArray(rawMembers) ? rawMembers : [];
    memberCache.set(chatId, {
      members: list,
      expiresAt: Date.now() + MEMBER_CACHE_TTL_MS,
    });
    return list;
  }

  function addSseClient(username, res) {
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key) || new Set();
    clients.add(res);
    sseClientsByUsername.set(key, clients);
  }

  function removeSseClient(username, res) {
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key);
    if (!clients) return;
    clients.delete(res);
    if (!clients.size) {
      sseClientsByUsername.delete(key);
    }
  }

  function emitSseEvent(username, payload) {
    if (!hasValidUuidReferences(payload)) return;
    const key = String(username || "").toLowerCase();
    if (!key) return;
    const clients = sseClientsByUsername.get(key);
    if (!clients?.size) return;

    const message = `data: ${JSON.stringify(payload)}\n\n`;
    clients.forEach((client) => {
      try {
        client.write(message);
      } catch (_) {
        // connection cleanup is handled on close
      }
    });
  }

  function emitChatEvent(chatId, payload) {
    if (!isValidUuid(String(chatId || "")) || !hasValidUuidReferences(payload)) return;
    const rawMembers = getCachedMembers(chatId);
    const processMembers = (members) => {
      const memberList = Array.isArray(members) ? members : [];
      memberList.forEach((member) => {
        if (!member?.username) return;
        emitSseEvent(member.username, payload);
      });
    };

    if (rawMembers && typeof rawMembers.then === "function") {
      rawMembers.then(processMembers).catch(() => {});
    } else {
      processMembers(rawMembers);
    }

    listeners.forEach((listener) => {
      try {
        listener(chatId, payload);
      } catch (_) {}
    });
  }

  const listeners = new Set();
  function onChatEvent(listener) {
    if (typeof listener === "function") {
      listeners.add(listener);
    }
    return () => listeners.delete(listener);
  }

  // Broadcasts a payload to every currently connected SSE client.
  function broadcastAll(payload) {
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    sseClientsByUsername.forEach((clients) => {
      clients.forEach((client) => {
        try { client.write(message); } catch (_) {}
      });
    });
  }

  return {
    addSseClient,
    removeSseClient,
    emitSseEvent,
    emitChatEvent,
    onChatEvent,
    broadcastAll,
    getCachedMembers,
    isUserConnected(username) {
      const key = String(username || "").toLowerCase();
      if (!key) return false;
      const clients = sseClientsByUsername.get(key);
      return Boolean(clients?.size);
    },
  };
}

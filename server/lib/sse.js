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
    const members = listChatMembers(chatId);
    memberCache.set(chatId, {
      members,
      expiresAt: Date.now() + MEMBER_CACHE_TTL_MS,
    });
    return members;
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
    const members = getCachedMembers(Number(chatId));
    members.forEach((member) => {
      if (!member?.username) return;
      emitSseEvent(member.username, payload);
    });
  }

  return {
    addSseClient,
    removeSseClient,
    emitSseEvent,
    emitChatEvent,
    getCachedMembers,
    isUserConnected(username) {
      const key = String(username || "").toLowerCase();
      if (!key) return false;
      const clients = sseClientsByUsername.get(key);
      return Boolean(clients?.size);
    },
  };
}

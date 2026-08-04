export function createPresenceTracker({
  updateLastSeen,
  getUserPresence,
  listChatsForUser,
  listChatMembers,
  emitToUser,
}) {
  // Lowercased username -> Set of connection refs (one per open WS/SSE socket).
  const connectionsByUsername = new Map();

  function normalize(username) {
    return String(username || "").toLowerCase();
  }

  function isConnected(username) {
    const key = normalize(username);
    if (!key) return false;
    const refs = connectionsByUsername.get(key);
    return Boolean(refs && refs.size > 0);
  }

  // userRow: { username, status } — status is the persisted 'online'/'invisible'.
  function effectiveStatus(userRow) {
    if (!isConnected(userRow?.username)) return "offline";
    return String(userRow?.status || "").toLowerCase() === "online"
      ? "online"
      : "offline";
  }

  function broadcastStatus(username) {
    const user = getUserPresence(normalize(username));
    if (!user?.username) return;
    const storedStatus = String(user.status || "").toLowerCase();
    const payload = {
      type: "presence_update",
      username: normalize(user.username),
      status: effectiveStatus(user),
      rawStatus: storedStatus,
      lastSeen: user.last_seen || null,
    };
    const targets = new Set([normalize(user.username)]);
    const chats = listChatsForUser(Number(user.id || 0)) || [];
    chats.forEach((chat) => {
      const members = listChatMembers(Number(chat?.id || 0)) || [];
      members.forEach((member) => {
        const memberUsername = normalize(member?.username);
        if (memberUsername) targets.add(memberUsername);
      });
    });
    targets.forEach((targetUsername) => emitToUser(targetUsername, payload));
  }

  function markConnected(username, ref) {
    const key = normalize(username);
    if (!key) return;
    const user = getUserPresence(key);
    if (!user) return;
    const refs = connectionsByUsername.get(key) || new Set();
    const wasConnected = refs.size > 0;
    refs.add(ref);
    connectionsByUsername.set(key, refs);
    if (!wasConnected) {
      updateLastSeen(user.id);
      broadcastStatus(key);
    }
  }

  function markDisconnected(username, ref) {
    const key = normalize(username);
    if (!key) return;
    const refs = connectionsByUsername.get(key);
    if (!refs) return;
    refs.delete(ref);
    if (refs.size === 0) {
      connectionsByUsername.delete(key);
      const user = getUserPresence(key);
      if (user) {
        updateLastSeen(user.id);
        broadcastStatus(key);
      }
    }
  }

  function getOnlineCount() {
    let count = 0;
    connectionsByUsername.forEach((_refs, key) => {
      const user = getUserPresence(key);
      if (user && String(user.status || "").toLowerCase() === "online")
        count += 1;
    });
    return count;
  }

  return {
    markConnected,
    markDisconnected,
    isConnected,
    effectiveStatus,
    broadcastStatus,
    getOnlineCount,
  };
}

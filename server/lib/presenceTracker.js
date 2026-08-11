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

  async function broadcastStatus(username) {
    const rawUser = getUserPresence(normalize(username));
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user?.username) return;
    const storedStatus = String(user.status || "").toLowerCase();
    const payload = {
      type: "presence_update",
      userId: user.id,
      username: normalize(user.username),
      status: effectiveStatus(user),
      rawStatus: storedStatus,
      lastSeen: user.last_seen || null,
    };
    const targets = new Set([normalize(user.username)]);
    const rawChats = listChatsForUser(user.id);
    const chats = (rawChats && typeof rawChats.then === "function" ? await rawChats : rawChats) || [];
    for (const chat of chats) {
      const rawMembers = listChatMembers(chat?.id);
      const members = (rawMembers && typeof rawMembers.then === "function" ? await rawMembers : rawMembers) || [];
      members.forEach((member) => {
        const memberUsername = normalize(member?.username);
        if (memberUsername) targets.add(memberUsername);
      });
    }
    targets.forEach((targetUsername) => emitToUser(targetUsername, payload));
  }

  async function markConnected(username, ref) {
    const key = normalize(username);
    if (!key) return;
    const rawUser = getUserPresence(key);
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user?.id) return;
    const refs = connectionsByUsername.get(key) || new Set();
    const wasConnected = refs.size > 0;
    refs.add(ref);
    connectionsByUsername.set(key, refs);
    if (!wasConnected) {
      const lastSeenRes = updateLastSeen(user.id);
      if (lastSeenRes && typeof lastSeenRes.then === "function") await lastSeenRes;
      await broadcastStatus(key);
    }
  }

  async function markDisconnected(username, ref) {
    const key = normalize(username);
    if (!key) return;
    const refs = connectionsByUsername.get(key);
    if (!refs) return;
    refs.delete(ref);
    if (refs.size === 0) {
      connectionsByUsername.delete(key);
      const rawUser = getUserPresence(key);
      const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
      if (user?.id) {
        const lastSeenRes = updateLastSeen(user.id);
        if (lastSeenRes && typeof lastSeenRes.then === "function") await lastSeenRes;
        await broadcastStatus(key);
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

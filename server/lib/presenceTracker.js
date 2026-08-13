export function createPresenceTracker({
  updateLastSeen,
  getUserPresence,
  listChatsForUser,
  listChatMembers,
  listChatMembersForChats,
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
      lastSeen: user.last_seen instanceof Date ? user.last_seen.toISOString() : user.last_seen || null,
    };
    const targets = new Set([normalize(user.username)]);
    const rawChats = listChatsForUser(user.id);
    const chats = (rawChats && typeof rawChats.then === "function" ? await rawChats : rawChats) || [];
    if (typeof listChatMembersForChats === "function" && chats.length > 0) {
      const rawMap = listChatMembersForChats(chats.map((c) => c?.id).filter(Boolean));
      const membersMap = (rawMap && typeof rawMap.then === "function" ? await rawMap : rawMap) || new Map();
      chats.forEach((chat) => {
        const cId = chat?.id;
        const members = membersMap.get(cId) || membersMap.get(String(cId || "").toLowerCase()) || [];
        members.forEach((member) => {
          const memberUsername = normalize(member?.username);
          if (memberUsername) targets.add(memberUsername);
        });
      });
    } else {
      for (const chat of chats) {
        const rawMembers = listChatMembers(chat?.id);
        const members = (rawMembers && typeof rawMembers.then === "function" ? await rawMembers : rawMembers) || [];
        members.forEach((member) => {
          const memberUsername = normalize(member?.username);
          if (memberUsername) targets.add(memberUsername);
        });
      }
    }
    targets.forEach((targetUsername) => emitToUser(targetUsername, payload));
  }

  async function markConnected(username, ref) {
    const key = normalize(username);
    if (!key) return;
    const refs = connectionsByUsername.get(key) || new Set();
    const wasConnected = refs.size > 0;
    refs.add(ref);
    connectionsByUsername.set(key, refs);

    const rawUser = getUserPresence(key);
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user?.id) {
      if (!wasConnected) {
        refs.delete(ref);
        if (refs.size === 0) connectionsByUsername.delete(key);
      }
      return;
    }
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
    const promises = [];
    connectionsByUsername.forEach((_refs, key) => {
      const user = getUserPresence(key);
      if (user && typeof user.then === "function") {
        promises.push(
          user.then((u) => {
            if (u && String(u.status || "").toLowerCase() === "online") {
              count += 1;
            }
          }),
        );
      } else if (user && String(user.status || "").toLowerCase() === "online") {
        count += 1;
      }
    });
    if (promises.length > 0) {
      return Promise.all(promises).then(() => count);
    }
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

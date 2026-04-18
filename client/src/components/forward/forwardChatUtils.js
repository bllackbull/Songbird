export function canForwardToChat(chat, currentUserId) {
  const type = String(chat?.type || "").toLowerCase();
  if (type !== "channel") return true;
  const members = Array.isArray(chat?.members) ? chat.members : [];
  return members.some(
    (member) =>
      Number(member?.id || 0) === Number(currentUserId || 0) &&
      String(member?.role || "").toLowerCase() === "owner",
  );
}

export function getForwardChatDisplay(chat, currentUsername) {
  const type = String(chat?.type || "").toLowerCase();
  if (type === "saved") {
    return {
      title: "Saved messages",
      avatarUrl: "",
      color: "#10b981",
      kind: "saved",
      initials: "S",
    };
  }
  if (type === "group" || type === "channel") {
    const title = String(
      chat?.name || (type === "channel" ? "Channel" : "Group"),
    );
    return {
      title,
      avatarUrl: String(chat?.group_avatar_url || "").trim(),
      color: String(chat?.group_color || "#10b981"),
      kind: type,
      initials: title,
    };
  }
  const members = Array.isArray(chat?.members) ? chat.members : [];
  const peer = members.find(
    (member) =>
      String(member?.username || "").toLowerCase() !==
      String(currentUsername || "").toLowerCase(),
  );
  return {
    title:
      String(peer?.nickname || peer?.username || "Deleted account").trim() ||
      "Deleted account",
    avatarUrl: String(peer?.avatar_url || "").trim(),
    color: String(peer?.color || "#94a3b8"),
    kind: "dm",
    initials:
      String(peer?.nickname || peer?.username || "Deleted account").trim() ||
      "Deleted account",
  };
}

export function sortForwardableChats(chats, currentUserId) {
  const list = Array.isArray(chats) ? [...chats] : [];
  return list.sort((a, b) => {
    const aType = String(a?.type || "").toLowerCase();
    const bType = String(b?.type || "").toLowerCase();
    if (aType === "saved" && bType !== "saved") return -1;
    if (bType === "saved" && aType !== "saved") return 1;

    const aOutgoing = a?.last_outgoing_time
      ? new Date(a.last_outgoing_time).getTime()
      : 0;
    const bOutgoing = b?.last_outgoing_time
      ? new Date(b.last_outgoing_time).getTime()
      : 0;
    if (aOutgoing !== bOutgoing) return bOutgoing - aOutgoing;

    const aFallback = a?.last_time ? new Date(a.last_time).getTime() : 0;
    const bFallback = b?.last_time ? new Date(b.last_time).getTime() : 0;
    if (aFallback !== bFallback) return bFallback - aFallback;

    const aOwners = canForwardToChat(a, currentUserId) ? 1 : 0;
    const bOwners = canForwardToChat(b, currentUserId) ? 1 : 0;
    if (aOwners !== bOwners) return bOwners - aOwners;

    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

export function excludeForwardSourceChat(chats, sourceChatId) {
  const numericSourceChatId = Number(sourceChatId || 0);
  return (Array.isArray(chats) ? chats : []).filter(
    (chat) => Number(chat?.id || 0) !== numericSourceChatId,
  );
}

import { useEffect, useMemo } from "react";

export function useActiveChatState({
  chats,
  chatsSearchQuery,
  user,
  activeChatId,
  activeChatIdRef,
  activeChatTypeRef,
  activePeer,
}) {
  const activeId = activeChatId ? Number(activeChatId) : null;
  useEffect(() => {
    activeChatIdRef.current = activeId;
  }, [activeChatIdRef, activeId]);

  const visibleChats = useMemo(() => {
    const query = String(chatsSearchQuery || "")
      .trim()
      .toLowerCase();
    if (!query) return chats;
    return chats.filter((chat) => {
      const members = Array.isArray(chat?.members) ? chat.members : [];
      const chatType = String(chat?.type || "").toLowerCase();
      if (chatType === "group" || chatType === "channel") {
        const groupName = String(chat?.name || "").toLowerCase();
        const groupUsername = String(chat?.group_username || "").toLowerCase();
        return groupName.includes(query) || groupUsername.includes(query);
      }
      if (chatType === "saved") {
        const label = String(chat?.name || "saved messages").toLowerCase();
        return label.includes(query) || "saved messages".includes(query);
      }
      const other = members.find(
        (member) =>
          String(member?.username || "").toLowerCase() !==
          String(user?.username || "").toLowerCase(),
      );
      const nickname = String(other?.nickname || "").toLowerCase();
      const username = String(other?.username || "").toLowerCase();
      return nickname.includes(query) || username.includes(query);
    });
  }, [chats, chatsSearchQuery, user?.username]);

  const activeChat =
    visibleChats.find((conv) => conv.id === activeId) ||
    chats.find((conv) => conv.id === activeId);

  useEffect(() => {
    activeChatTypeRef.current = activeChat?.type || null;
  }, [activeChat?.type, activeChatTypeRef]);

  const activeMembers = useMemo(
    () => activeChat?.members || [],
    [activeChat?.members],
  );
  const isActiveGroupChat = activeChat?.type === "group";
  const isActiveChannelChat = activeChat?.type === "channel";
  const isActiveSavedChat = activeChat?.type === "saved";
  const isActiveOwner = activeMembers.some(
    (member) =>
      Number(member.id) === Number(user?.id || 0) &&
      String(member.role || "").toLowerCase() === "owner",
  );
  const canSendInActiveChat = !isActiveChannelChat || isActiveOwner;
  const activeGroupMemberUsernames = useMemo(() => {
    if (!isActiveGroupChat && !isActiveChannelChat) return [];
    return (activeMembers || [])
      .map((member) => String(member?.username || "").toLowerCase())
      .filter(Boolean)
      .sort();
  }, [isActiveGroupChat, isActiveChannelChat, activeMembers]);
  const activeGroupMemberUsernamesKey = activeGroupMemberUsernames.join("|");
  const activeDmMember =
    activeChat?.type === "dm"
      ? activeMembers.find((member) => member.username !== user.username)
      : null;
  const isDeletedDm = activeChat?.type === "dm" && !activeDmMember;
  const deletedDmPeer = isDeletedDm
    ? {
        nickname: "Deleted account",
        username: "",
        color: "#94a3b8",
        avatar_url: "",
        isDeleted: true,
      }
    : null;
  const activeHeaderPeer = activePeer || activeDmMember || deletedDmPeer;
  const activeFallbackTitle =
    isActiveGroupChat || isActiveChannelChat
      ? activeChat?.name || (isActiveChannelChat ? "Channel" : "Group")
      : isActiveSavedChat
        ? "Saved messages"
        : activeHeaderPeer?.nickname ||
          activeHeaderPeer?.username ||
          "Select a chat";
  const activeHeaderAvatar =
    isActiveGroupChat || isActiveChannelChat || isActiveSavedChat
      ? null
      : activeHeaderPeer;
  const activeGroupAvatarColor =
    isActiveGroupChat || isActiveChannelChat
      ? activeChat?.group_color || "#10b981"
      : null;
  const activeGroupAvatarUrl =
    isActiveGroupChat || isActiveChannelChat
      ? activeChat?.group_avatar_url || ""
      : "";
  const headerAvatarColor = isActiveSavedChat
    ? "#10b981"
    : activeGroupAvatarColor;

  return {
    activeId,
    visibleChats,
    activeChat,
    activeMembers,
    isActiveGroupChat,
    isActiveChannelChat,
    isActiveSavedChat,
    canSendInActiveChat,
    activeGroupMemberUsernames,
    activeGroupMemberUsernamesKey,
    activeHeaderPeer,
    activeFallbackTitle,
    activeHeaderAvatar,
    activeGroupAvatarColor,
    activeGroupAvatarUrl,
    headerAvatarColor,
  };
}

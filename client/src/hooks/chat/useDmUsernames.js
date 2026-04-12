import { useEffect, useRef } from "react";

export function useDmUsernames({ chats, user }) {
  const dmUsernamesRef = useRef(new Set());

  useEffect(() => {
    const usernames = new Set();
    (chats || []).forEach((chat) => {
      if (chat.type !== "dm") return;
      const members = Array.isArray(chat.members) ? chat.members : [];
      const other =
        members.find(
          (member) =>
            String(member?.username || "").toLowerCase() !==
            String(user.username || "").toLowerCase(),
        ) || null;
      const otherUsername = String(
        other?.username ||
          chat?.username ||
          chat?.peer_username ||
          chat?.dm_username ||
          "",
      )
        .toLowerCase()
        .trim();
      if (
        otherUsername &&
        otherUsername !== String(user.username || "").toLowerCase()
      ) {
        usernames.add(otherUsername);
      }
    });
    dmUsernamesRef.current = usernames;
  }, [chats, user.username]);

  return { dmUsernamesRef };
}

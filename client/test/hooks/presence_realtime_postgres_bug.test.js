import { describe, expect, test } from "vitest";

// Replicating applyPresenceUpdate logic from ChatPage.jsx
function applyPresenceUpdateToChats(chats, { username, status }) {
  const targetUsername = String(username || "").toLowerCase();
  if (!targetUsername) return chats;
  const onlineStatus = status === "online" ? "online" : "offline";

  return chats.map((chat) => {
    const members = Array.isArray(chat?.members) ? chat.members : [];
    const hasMember = members.some(
      (member) =>
        String(member?.username || "").toLowerCase() === targetUsername,
    );
    const isDmMatch = chat?.type === "dm";

    if (!hasMember && !isDmMatch) {
      return chat;
    }

    const updatedMembers = hasMember
      ? members.map((member) => {
          if (String(member?.username || "").toLowerCase() !== targetUsername) {
            return member;
          }
          return {
            ...member,
            status: onlineStatus,
          };
        })
      : [
          ...members,
          {
            username: targetUsername,
            status: onlineStatus,
          },
        ];

    return {
      ...chat,
      members: updatedMembers,
    };
  });
}

// Replicating ChatsListPanel.jsx DM online status calculation logic
function isDmPeerOnline(chat, currentUserUsername) {
  const members = chat.members || [];
  const other =
    chat.type === "dm"
      ? members.find(
          (member) =>
            String(member?.username || "").toLowerCase() !==
            String(currentUserUsername || "").toLowerCase(),
        )
      : null;
  return (
    chat.type === "dm" &&
    Boolean(other) &&
    String(other?.status || "").toLowerCase() === "online"
  );
}

describe("Bug 1 Client Reproduction: Real-Time Presence Updates in Chat List Cards", () => {
  test("FAILING TEST: applyPresenceUpdate fails to update DM online badge if chat.members is empty or missing", () => {
    // DM chat card with missing/empty members array (e.g. from partial chat cache or missing members payload)
    const initialChats = [
      {
        id: "chat-dm-1",
        type: "dm",
        name: "Bob",
        members: [], // empty members
      },
    ];

    // Real-time presence update arrives: Bob becomes online
    const updatedChats = applyPresenceUpdateToChats(initialChats, {
      username: "bob",
      status: "online",
    });

    // The DM peer Bob should be displayed as online in the sidebar chat list
    const isBobOnline = isDmPeerOnline(updatedChats[0], "alice");
    expect(isBobOnline).toBe(true);
  });
});

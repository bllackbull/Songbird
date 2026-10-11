import { describe, expect, test } from "vitest";

// Client-side helper functions replicating ChatPage.jsx logic for presence & profile updates

function parsePresenceDate(rawLastSeen) {
  if (!rawLastSeen) return null;
  const d = new Date(rawLastSeen);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(status) {
  const norm = String(status || "")
    .trim()
    .toLowerCase();
  if (norm === "online") return "online";
  return "offline";
}

function isValidUuid(id) {
  if (typeof id !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
}

function normalizeUuid(id) {
  return String(id || "").toLowerCase();
}

/**
 * Replicating applyPresenceUpdate logic from ChatPage.jsx
 */
export function applyPresenceUpdate(
  payload = {},
  {
    chats,
    setChats,
    presenceStateRef,
    activeHeaderPeer,
    setPeerPresence,
    currentUsername,
  },
) {
  const targetUsername = String(payload?.username || "").toLowerCase();
  if (!targetUsername) return;
  const status = String(payload?.status || "").toLowerCase();
  const rawStatus = String(payload?.rawStatus || status).toLowerCase();
  const rawLastSeen = String(payload?.lastSeen || "").trim();
  const parsedLastSeen = parsePresenceDate(rawLastSeen);
  const normalizedLastSeen =
    parsedLastSeen?.toISOString?.() || new Date().toISOString();
  const onlineStatus = normalizeStatus(status);

  if (presenceStateRef) {
    presenceStateRef.set(targetUsername, {
      status: onlineStatus,
      rawStatus,
      lastSeen: normalizedLastSeen,
    });
  }

  const updatedChats = chats.map((chat) => {
    const members = Array.isArray(chat?.members) ? chat.members : [];
    const hasMember = members.some(
      (member) =>
        String(member?.username || "").toLowerCase() === targetUsername,
    );
    const isDmMatch =
      chat?.type === "dm" &&
      (hasMember ||
        String(chat?.last_sender_username || "").toLowerCase() ===
          targetUsername ||
        members.length === 0 ||
        (targetUsername !== String(currentUsername || "").toLowerCase() &&
          !members.some(
            (m) =>
              String(m?.username || "").toLowerCase() !==
              String(currentUsername || "").toLowerCase(),
          )));

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

  if (setChats) setChats(updatedChats);

  if (
    activeHeaderPeer &&
    String(activeHeaderPeer?.username || "").toLowerCase() === targetUsername &&
    setPeerPresence
  ) {
    setPeerPresence({
      status: onlineStatus,
      rawStatus,
      lastSeen: normalizedLastSeen,
    });
  }

  return updatedChats;
}

/**
 * Replicating applyProfileUpdate logic from ChatPage.jsx
 */
export function applyProfileUpdate(
  payload = {},
  { chats, setChats, messages, setMessages, presenceStateRef, currentUsername },
) {
  const rawUserId = payload?.userId;
  const userId = isValidUuid(rawUserId) ? normalizeUuid(rawUserId) : null;
  const nextUsername = String(payload?.username || "")
    .trim()
    .toLowerCase();
  const previousUsername = String(payload?.previousUsername || "")
    .trim()
    .toLowerCase();
  if (!userId && !nextUsername && !previousUsername) return;

  const nextNickname =
    String(payload?.nickname || "").trim() ||
    nextUsername ||
    previousUsername ||
    "";
  const nextAvatarUrl = String(payload?.avatarUrl || "").trim();
  const nextColor = String(payload?.color || "#10b981").trim() || "#10b981";
  const nextStatus =
    String(payload?.status || "online")
      .trim()
      .toLowerCase() || "online";
  const usernames = new Set([nextUsername, previousUsername].filter(Boolean));

  const matchesUser = (candidateId, candidateUsername) => {
    const normalizedCandidateId = isValidUuid(candidateId)
      ? normalizeUuid(candidateId)
      : null;
    const normalizedCandidateUsername = String(candidateUsername || "")
      .trim()
      .toLowerCase();
    return (
      (userId && normalizedCandidateId === userId) ||
      (normalizedCandidateUsername &&
        usernames.has(normalizedCandidateUsername))
    );
  };

  if (presenceStateRef) {
    presenceStateRef.delete(previousUsername);
    if (nextUsername) {
      const previousPresence =
        presenceStateRef.get(nextUsername) ||
        presenceStateRef.get(previousUsername);
      presenceStateRef.set(nextUsername, {
        status: nextStatus,
        lastSeen: previousPresence?.lastSeen || new Date().toISOString(),
      });
    }
  }

  const updatedChats = chats.map((chat) => {
    let changed = false;
    const members = Array.isArray(chat?.members) ? chat.members : [];
    const nextMembers = members.map((member) => {
      if (!matchesUser(member?.id, member?.username)) {
        return member;
      }
      changed = true;
      return {
        ...member,
        username: nextUsername || member?.username || "",
        nickname: nextNickname || member?.nickname || member?.username || "",
        avatar_url: nextAvatarUrl,
        color: nextColor,
        status: nextStatus,
      };
    });

    const isDmMatch =
      chat?.type === "dm" &&
      !changed &&
      nextUsername !== String(currentUsername || "").toLowerCase() &&
      !members.some(
        (m) =>
          String(m?.username || "").toLowerCase() !==
          String(currentUsername || "").toLowerCase(),
      );

    if (isDmMatch) {
      changed = true;
      nextMembers.push({
        username: nextUsername,
        nickname: nextNickname,
        avatar_url: nextAvatarUrl,
        color: nextColor,
        status: nextStatus,
      });
    }

    const shouldPatchLastSender = matchesUser(
      chat?.last_sender_id,
      chat?.last_sender_username,
    );
    if (!changed && !shouldPatchLastSender) {
      return chat;
    }

    return {
      ...chat,
      members: nextMembers,
      last_sender_username: shouldPatchLastSender
        ? nextUsername || chat?.last_sender_username || ""
        : chat?.last_sender_username,
      last_sender_nickname: shouldPatchLastSender
        ? nextNickname ||
          chat?.last_sender_nickname ||
          chat?.last_sender_username ||
          ""
        : chat?.last_sender_nickname,
      last_sender_avatar_url: shouldPatchLastSender
        ? nextAvatarUrl
        : chat?.last_sender_avatar_url,
    };
  });

  if (setChats) setChats(updatedChats);

  let updatedMessages = messages;
  if (Array.isArray(messages)) {
    updatedMessages = messages.map((msg) => {
      const senderMatch = matchesUser(msg?.user_id, msg?.username);
      const replyMatch = matchesUser(
        msg?.replyTo?.user_id,
        msg?.replyTo?.username,
      );
      const forwardedMatch = matchesUser(
        msg?.forwarded_from_user_id,
        msg?.forwarded_from_username,
      );
      if (!senderMatch && !replyMatch && !forwardedMatch) {
        return msg;
      }
      return {
        ...msg,
        ...(senderMatch
          ? {
              username: nextUsername || msg?.username || "",
              nickname: nextNickname || msg?.nickname || msg?.username || "",
              avatar_url: nextAvatarUrl,
              color: nextColor,
            }
          : {}),
        ...(replyMatch
          ? {
              replyTo: {
                ...msg.replyTo,
                username: nextUsername || msg?.replyTo?.username || "",
                nickname:
                  nextNickname ||
                  msg?.replyTo?.nickname ||
                  msg?.replyTo?.username ||
                  "",
                avatar_url: nextAvatarUrl,
                color: nextColor,
              },
            }
          : {}),
        ...(forwardedMatch
          ? {
              forwarded_from_username:
                nextUsername || msg?.forwarded_from_username || "",
              forwarded_from_label:
                nextNickname || msg?.forwarded_from_label || nextUsername || "",
              forwarded_from_avatar_url: nextAvatarUrl,
              forwarded_from_color: nextColor,
            }
          : {}),
      };
    });
    if (setMessages) setMessages(updatedMessages);
  }

  return { chats: updatedChats, messages: updatedMessages };
}

// Helper simulating ChatsListPanel DM online status indicator calculation
export function isDmPeerOnline(chat, currentUserUsername) {
  const members = chat?.members || [];
  const other =
    chat?.type === "dm"
      ? members.find(
          (member) =>
            String(member?.username || "").toLowerCase() !==
            String(currentUserUsername || "").toLowerCase(),
        )
      : null;
  return (
    chat?.type === "dm" &&
    Boolean(other) &&
    String(other?.status || "").toLowerCase() === "online"
  );
}

describe("Client Boundary: Real-Time Presence & User State Updates without Page Reload", () => {
  test("applyPresenceUpdate updates DM online indicator when DM members array has both users", () => {
    const presenceStateRef = new Map();
    const chats = [
      {
        id: "chat-dm-1",
        type: "dm",
        members: [
          { username: "alice", status: "online" },
          { username: "bob", status: "offline" },
        ],
      },
    ];

    const updated = applyPresenceUpdate(
      { type: "presence_update", username: "bob", status: "online" },
      { chats, presenceStateRef, currentUsername: "alice" },
    );

    expect(presenceStateRef.get("bob").status).toBe("online");
    expect(isDmPeerOnline(updated[0], "alice")).toBe(true);
  });

  test("applyPresenceUpdate updates DM online indicator in real time even if DM members only contains current user", () => {
    const presenceStateRef = new Map();
    const chats = [
      {
        id: "chat-dm-1",
        type: "dm",
        last_sender_username: "alice",
        members: [{ username: "alice", status: "online" }], // Bob missing from initial members list
      },
    ];

    const updated = applyPresenceUpdate(
      { type: "presence_update", username: "bob", status: "online" },
      { chats, presenceStateRef, currentUsername: "alice" },
    );

    expect(presenceStateRef.get("bob").status).toBe("online");
    expect(isDmPeerOnline(updated[0], "alice")).toBe(true);
  });

  test("applyProfileUpdate updates user nickname, avatar_url, and status in DM chat and message list in real time", () => {
    const presenceStateRef = new Map();
    const chats = [
      {
        id: "chat-dm-1",
        type: "dm",
        last_sender_username: "bob",
        last_sender_nickname: "Bob Old",
        last_sender_avatar_url: "/old-avatar.jpg",
        members: [
          { id: "uuid-alice", username: "alice" },
          {
            id: "uuid-bob",
            username: "bob",
            nickname: "Bob Old",
            avatar_url: "/old-avatar.jpg",
          },
        ],
      },
    ];

    const messages = [
      {
        id: "msg-1",
        user_id: "uuid-bob",
        username: "bob",
        nickname: "Bob Old",
        avatar_url: "/old-avatar.jpg",
        body: "Hello",
      },
      {
        id: "msg-2",
        user_id: "uuid-alice",
        username: "alice",
        body: "Hi Bob",
        replyTo: {
          id: "msg-1",
          user_id: "uuid-bob",
          username: "bob",
          nickname: "Bob Old",
          avatar_url: "/old-avatar.jpg",
        },
      },
    ];

    const payload = {
      type: "profile_updated",
      userId: "uuid-bob",
      username: "bob",
      nickname: "Bobby New",
      avatarUrl: "/new-avatar.jpg",
      status: "online",
    };

    const { chats: updatedChats, messages: updatedMessages } =
      applyProfileUpdate(payload, {
        chats,
        messages,
        presenceStateRef,
        currentUsername: "alice",
      });

    const bobMember = updatedChats[0].members.find((m) => m.username === "bob");
    expect(bobMember.nickname).toBe("Bobby New");
    expect(bobMember.avatar_url).toBe("/new-avatar.jpg");
    expect(updatedChats[0].last_sender_nickname).toBe("Bobby New");
    expect(updatedChats[0].last_sender_avatar_url).toBe("/new-avatar.jpg");

    expect(updatedMessages[0].nickname).toBe("Bobby New");
    expect(updatedMessages[0].avatar_url).toBe("/new-avatar.jpg");
    expect(updatedMessages[1].replyTo.nickname).toBe("Bobby New");
    expect(updatedMessages[1].replyTo.avatar_url).toBe("/new-avatar.jpg");
  });

  test("applyPresenceUpdate updates activeHeaderPeer presence when targetUsername matches", () => {
    let peerPresence = null;
    const activeHeaderPeer = { username: "bob" };
    const presenceStateRef = new Map();

    applyPresenceUpdate(
      { type: "presence_update", username: "bob", status: "online" },
      {
        chats: [],
        presenceStateRef,
        activeHeaderPeer,
        setPeerPresence: (val) => {
          peerPresence = val;
        },
        currentUsername: "alice",
      },
    );

    expect(peerPresence).toEqual({
      status: "online",
      rawStatus: "online",
      lastSeen: expect.any(String),
    });
  });

  test("applyPresenceUpdate parses PostgreSQL microsecond timestamps (+00) without throwing RangeError: invalid date", () => {
    const presenceStateRef = new Map();
    const activeHeaderPeer = { username: "bob" };
    let peerPresence = null;

    expect(() => {
      applyPresenceUpdate(
        {
          type: "presence_update",
          username: "bob",
          status: "online",
          lastSeen: "2026-08-13 16:49:09.123456+00",
        },
        {
          chats: [],
          presenceStateRef,
          activeHeaderPeer,
          setPeerPresence: (val) => {
            peerPresence = val;
          },
          currentUsername: "alice",
        },
      );
    }).not.toThrow();

    expect(presenceStateRef.get("bob").lastSeen).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(peerPresence.lastSeen).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });
});

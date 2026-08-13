/**
 * Profile & Presence Domain Service
 *
 * Encapsulates profile identity state updates, avatar replacements, and canonical
 * profile and presence propagation to affected chat participants.
 */

export function createProfileService(dbApi) {
  const {
    updateUserProfile,
    updateUserStatus,
    findUserById,
    listChatsForUser,
    listChatMembers,
  } = dbApi;

  /**
   * Updates user identity details (nickname, status message, etc.) and calculates target chat participants to notify.
   */
  async function updateProfile({ userId, updates }) {
    const rawUser = findUserById ? findUserById(userId) : null;
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (!user) throw new Error("User not found");

    if (typeof updateUserProfile === "function") {
      const rawUpdate = updateUserProfile(userId, updates);
      if (rawUpdate && typeof rawUpdate.then === "function") await rawUpdate;
    }

    const rawChats = listChatsForUser ? listChatsForUser(userId) : [];
    const chats = (rawChats && typeof rawChats.then === "function" ? await rawChats : rawChats) || [];
    const affectedUsernames = new Set();

    for (const chat of chats) {
      const rawMembers = listChatMembers ? listChatMembers(chat.id) : [];
      const members = (rawMembers && typeof rawMembers.then === "function" ? await rawMembers : rawMembers) || [];
      members.forEach((member) => {
        const username = String(member?.username || "").toLowerCase();
        if (username) affectedUsernames.add(username);
      });
    }

    const sseEvents = Array.from(affectedUsernames).map((targetUsername) => ({
      targetUsername,
      payload: {
        type: "user_profile_updated",
        userId,
      },
    }));

    return {
      success: true,
      userId,
      sseEvents,
    };
  }

  return {
    updateProfile,
  };
}

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
  function updateProfile({ userId, updates }) {
    const user = findUserById(userId);
    if (!user) throw new Error("User not found");

    if (typeof updateUserProfile === "function") {
      updateUserProfile(userId, updates);
    }

    const chats = listChatsForUser ? listChatsForUser(userId) : [];
    const affectedUsernames = new Set();

    chats.forEach((chat) => {
      const members = listChatMembers ? listChatMembers(chat.id) : [];
      members.forEach((member) => {
        const username = String(member?.username || "").toLowerCase();
        if (username) affectedUsernames.add(username);
      });
    });

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

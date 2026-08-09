/**
 * Deletion Domain Service
 *
 * Encapsulates transactional deletion for chats and user accounts.
 * Returns a post-commit plan detailing disk files to remove and SSE events to emit.
 */

export function createDeletionService(dbApi) {
  const {
    deleteChatById,
    deleteUserById,
    findChatById,
    findUserById,
    listChatMembers,
    listChatsForUser,
  } = dbApi;

  /**
   * Deletes a chat (group, channel, DM, saved) and returns post-commit cleanup & notification targets.
   */
  async function deleteChat({ chatId }) {
    const numChatId = Number(chatId);
    const chat = findChatById ? await findChatById(numChatId) : null;
    const members = listChatMembers ? (await listChatMembers(numChatId)) || [] : [];
    const memberUsernames = members
      .map((m) => String(m?.username || "").toLowerCase())
      .filter(Boolean);

    const deletion = deleteChatById ? await deleteChatById(numChatId) : {};
    const { storedNames = [] } = deletion || {};

    const sseEvents = memberUsernames.map((username) => ({
      targetUsername: username,
      payload: {
        type: "chat_deleted",
        chatId: numChatId,
      },
    }));

    return {
      success: true,
      chatId: numChatId,
      chat,
      storedFilesToRemove: storedNames,
      sseEvents,
    };
  }

  /**
   * Deletes a user account and returns post-commit disk cleanup and affected chat notification targets.
   */
  async function deleteUser({ targetUserId }) {
    const numUserId = Number(targetUserId);
    const user = findUserById ? await findUserById(numUserId) : null;
    const userChats = listChatsForUser ? (await listChatsForUser(numUserId)) || [] : [];
    const affectedChatIds = userChats.map((c) => Number(c.id));

    const deletion = deleteUserById ? await deleteUserById(numUserId) : {};
    const { storedNames = [], avatarUrl = null } = deletion || {};

    const sseEvents = [];
    for (const chatId of affectedChatIds) {
      const members = listChatMembers ? (await listChatMembers(chatId)) || [] : [];
      members.forEach((m) => {
        const username = String(m?.username || "").toLowerCase();
        if (username) {
          sseEvents.push({
            targetUsername: username,
            payload: {
              type: "chat_updated",
              chatId,
            },
          });
        }
      });
    }

    return {
      success: true,
      userId: numUserId,
      user,
      storedFilesToRemove: storedNames,
      avatarFileToRemove: avatarUrl,
      affectedChatIds,
      sseEvents,
    };
  }

  return {
    deleteChat,
    deleteUser,
  };
}

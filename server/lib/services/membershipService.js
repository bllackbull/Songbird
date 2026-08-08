/**
 * Membership Domain Service
 *
 * Encapsulates group/channel membership mutations (joining, adding, leaving,
 * removing, role changes, ownership transfers) and generates standardized
 * post-commit effects (system messages, SSE payloads, and notification targets).
 */

export function createMembershipService(dbApi) {
  const {
    getChatById,
    listChatMembers,
    addChatMember,
    removeChatMember,
    updateChatMemberRole,
    findUserById,
    findUserByUsername,
    findGroupByInviteToken,
    addSystemMessage,
    getRow,
    getAll,
    run,
  } = dbApi;

  /**
   * Helper to check if a user previously left a chat.
   */
  function isUserPriorLeft(chatId, userId) {
    if (typeof getRow === "function") {
      const priorLeft = getRow(
        `SELECT 1 AS prior_left
         FROM chat_left_members
         WHERE chat_id = ? AND user_id = ?
         UNION
         SELECT 1 AS prior_left
         FROM chat_messages
         WHERE chat_id = ? AND user_id = ? AND body LIKE ?
         LIMIT 1`,
        [
          Number(chatId),
          Number(userId),
          Number(chatId),
          Number(userId),
          "[[system:left:%",
        ],
      );
      return Boolean(priorLeft?.prior_left);
    }
    return false;
  }

  /**
   * Helper to clean up prior left markers on rejoin.
   */
  function clearPriorLeft(chatId, userId) {
    if (typeof run === "function") {
      run("DELETE FROM chat_left_members WHERE chat_id = ? AND user_id = ?", [
        Number(chatId),
        Number(userId),
      ]);
    }
  }

  /**
   * Helper to collect system messages & SSE payloads for members.
   */
  function buildEffects(
    chatId,
    systemMsgBody,
    updatedMemberUsernames = [],
    systemMessageUserId = null,
  ) {
    const chat = getChatById(Number(chatId));
    const members = listChatMembers(Number(chatId)) || [];
    const memberUsernames = members.map((m) =>
      String(m.username || "").toLowerCase(),
    );

    const sseEvents = [];
    const pushRecipients = [];

    // Notify all members (plus specific targets who may have left) of chat updates
    const sseTargets = new Set([
      ...memberUsernames,
      ...updatedMemberUsernames.map((u) => String(u).toLowerCase()),
    ]);
    sseTargets.forEach((username) => {
      if (username) {
        sseEvents.push({
          targetUsername: username,
          payload: { type: "chat_updated", chatId: Number(chatId) },
        });
        sseEvents.push({
          targetUsername: username,
          payload: { type: "chat_list_changed", chatId: Number(chatId) },
        });
      }
    });

    let systemMessageResult = null;
    if (
      systemMsgBody &&
      chat &&
      chat.type === "group" &&
      typeof addSystemMessage === "function"
    ) {
      systemMessageResult = addSystemMessage(
        Number(chatId),
        systemMsgBody,
        Number(systemMessageUserId),
      );
    }

    return {
      chat,
      members,
      systemMessage: systemMessageResult,
      sseEvents,
      pushRecipients: members.map((m) => Number(m.id)),
    };
  }

  /**
   * Add users to a chat (or rejoin).
   */
  function addMembers({
    chatId,
    targetUserIds = [],
    role = "member",
    force = false,
  }) {
    const chat = getChatById(Number(chatId));
    if (!chat) throw new Error("Chat not found");

    let addedCount = 0;
    let skippedCount = 0;
    let systemMessageUserId = null;
    const addedUsernames = [];

    const existingMembers = listChatMembers(Number(chatId)) || [];
    const existingUserIds = new Set(existingMembers.map((m) => Number(m.id)));

    for (const userId of targetUserIds) {
      const numUserId = Number(userId);
      if (existingUserIds.has(numUserId)) {
        skippedCount++;
        continue;
      }

      if (!force && isUserPriorLeft(chatId, numUserId)) {
        skippedCount++;
        continue;
      }

      clearPriorLeft(chatId, numUserId);
      addChatMember(Number(chatId), numUserId, role);
      addedCount++;

      const user = findUserById(numUserId);
      if (user?.username) {
        addedUsernames.push(user.username);
        if (systemMessageUserId === null) systemMessageUserId = numUserId;
      }
    }

    const effects = buildEffects(
      chatId,
      addedUsernames.length === 1
        ? `[[system:joined:${addedUsernames[0]}]]`
        : null,
      addedUsernames,
      systemMessageUserId,
    );

    return {
      success: true,
      addedCount,
      skippedCount,
      ...effects,
    };
  }

  async function buildEffectsAsync(
    chatId,
    systemMsgBody,
    updatedMemberUsernames = [],
    systemMessageUserId = null,
  ) {
    const rawChat = getChatById(Number(chatId));
    const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
    const rawMembers = listChatMembers(Number(chatId));
    const members = (rawMembers && typeof rawMembers.then === "function" ? await rawMembers : rawMembers) || [];
    const memberUsernames = members.map((m) =>
      String(m.username || "").toLowerCase(),
    );

    const sseEvents = [];
    const sseTargets = new Set([
      ...memberUsernames,
      ...updatedMemberUsernames.map((u) => String(u).toLowerCase()),
    ]);
    sseTargets.forEach((username) => {
      if (username) {
        sseEvents.push({
          targetUsername: username,
          payload: { type: "chat_updated", chatId: Number(chatId) },
        });
        sseEvents.push({
          targetUsername: username,
          payload: { type: "chat_list_changed", chatId: Number(chatId) },
        });
      }
    });

    let systemMessageResult = null;
    if (
      systemMsgBody &&
      chat &&
      chat.type === "group" &&
      typeof addSystemMessage === "function"
    ) {
      const rawResult = addSystemMessage(
        Number(chatId),
        systemMsgBody,
        Number(systemMessageUserId),
      );
      systemMessageResult =
        rawResult && typeof rawResult.then === "function"
          ? await rawResult
          : rawResult;
    }

    return {
      chat,
      members,
      systemMessage: systemMessageResult,
      sseEvents,
      pushRecipients: members.map((m) => Number(m.id)),
    };
  }

  /**
   * Join group via invite token.
   */
  function joinByInvite({ inviteToken, userId }) {
    const rawChat = findGroupByInviteToken(inviteToken);
    const rawUser = findUserById(Number(userId));
    const hasAsyncDependency =
      rawChat && typeof rawChat.then === "function" ||
      rawUser && typeof rawUser.then === "function";

    const join = async () => {
      const chat = rawChat && typeof rawChat.then === "function" ? await rawChat : rawChat;
      if (!chat) throw new Error("Invalid invite token");

      const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
      if (!user) throw new Error("User not found");

      const rawClear = clearPriorLeft(chat.id, user.id);
      if (rawClear && typeof rawClear.then === "function") await rawClear;
      const rawAdd = addChatMember(Number(chat.id), Number(user.id), "member");
      if (rawAdd && typeof rawAdd.then === "function") await rawAdd;

      const nickname = user.nickname || user.username;
      const effects = await buildEffectsAsync(
        chat.id,
        `[[system:joined:${nickname}]]`,
        [user.username],
        user.id,
      );

      return {
        success: true,
        chat,
        ...effects,
      };
    };

    if (hasAsyncDependency) return join();

    if (!rawChat) throw new Error("Invalid invite token");
    if (!rawUser) throw new Error("User not found");

    clearPriorLeft(rawChat.id, rawUser.id);
    addChatMember(Number(rawChat.id), Number(rawUser.id), "member");

    const nickname = rawUser.nickname || rawUser.username;
    const effects = buildEffects(
      rawChat.id,
      `[[system:joined:${nickname}]]`,
      [rawUser.username],
      rawUser.id,
    );

    return {
      success: true,
      chat: rawChat,
      ...effects,
    };
  }

  /**
   * Leave a chat.
   */
  function leaveChat({ chatId, userId }) {
    const chat = getChatById(Number(chatId));
    if (!chat) throw new Error("Chat not found");

    const user = findUserById(Number(userId));
    if (!user) throw new Error("User not found");

    removeChatMember(Number(chatId), Number(userId));

    const nickname = user.nickname || user.username;
    const effects = buildEffects(chatId, `[[system:left:${nickname}]]`, [
      user.username,
    ], user.id);

    return {
      success: true,
      chat,
      ...effects,
    };
  }

  /**
   * Remove a member from a chat.
   */
  function removeMember({ chatId, targetUserId, removedByUserId }) {
    const chat = getChatById(Number(chatId));
    if (!chat) throw new Error("Chat not found");

    const targetUser = findUserById(Number(targetUserId));
    if (!targetUser) throw new Error("User not found");

    removeChatMember(Number(chatId), Number(targetUserId));

    const nickname = targetUser.nickname || targetUser.username;
    const effects = buildEffects(chatId, `[[system:removed:${nickname}]]`, [
      targetUser.username,
    ], targetUser.id);

    return {
      success: true,
      chat,
      ...effects,
    };
  }

  /**
   * Update member role.
   */
  function updateMemberRole({ chatId, targetUserId, newRole }) {
    const chat = getChatById(Number(chatId));
    if (!chat) throw new Error("Chat not found");

    const targetUser = findUserById(Number(targetUserId));
    if (!targetUser) throw new Error("User not found");

    updateChatMemberRole(Number(chatId), Number(targetUserId), newRole);
    const effects = buildEffects(chatId, null, [targetUser.username]);

    return {
      success: true,
      chat,
      ...effects,
    };
  }

  return {
    addMembers,
    joinByInvite,
    leaveChat,
    removeMember,
    updateMemberRole,
  };
}

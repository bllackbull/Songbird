/**
 * Chat Provisioning Domain Service
 *
 * Encapsulates group/channel creation across HTTP routes, admin panel endpoints,
 * and CLI scripts. Manages chat metadata initialization, creator/member setup,
 * invite token creation, and initial sidebar notification payloads.
 */

import { createInviteToken } from "../inviteTokens.js";

export function createChatProvisioningService(dbApi) {
  const {
    createChat,
    addChatMember,
    findUserByUsername,
    findUserById,
    crypto,
    getChatById,
    listChatMembers,
  } = dbApi;

  /**
   * Provisions a new group or channel.
   */
  function createGroupOrChannel({
    name,
    type = "group",
    creatorUserId,
    initialMemberUsernames = [],
    isPublic = false,
    groupUsername = null,
    allowMemberInvites = false,
  }) {
    const creator = findUserById(creatorUserId);
    if (!creator) throw new Error("Creator user not found");

    const normalizedType = type === "channel" ? "channel" : "group";
    const inviteToken = createInviteToken(crypto);

    const chatId = createChat(name || "Untitled", normalizedType, {
      public: isPublic,
      username: groupUsername,
      allowMemberInvites,
      inviteToken,
    });

    if (!chatId) throw new Error("Failed to create chat");

    // Add creator as owner
    addChatMember(chatId, creator.id, "owner");

    // Add initial members
    const memberSet = new Set(
      initialMemberUsernames.map((u) => String(u || "").toLowerCase()),
    );
    memberSet.delete(String(creator.username || "").toLowerCase());

    const addedUsernames = [creator.username];
    memberSet.forEach((username) => {
      const member = findUserByUsername(username);
      if (member) {
        addChatMember(chatId, member.id, "member");
        addedUsernames.push(member.username);
      }
    });

    const sseEvents = addedUsernames.map((username) => ({
      targetUsername: username,
      payload: {
        type: "chat_list_changed",
        chatId,
      },
    }));

    return {
      success: true,
      chatId,
      inviteToken,
      addedUsernames,
      sseEvents,
    };
  }

  return {
    createGroupOrChannel,
  };
}

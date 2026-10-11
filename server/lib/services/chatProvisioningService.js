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
  async function createGroupOrChannel({
    name,
    type = "group",
    creatorUserId,
    initialMemberUsernames = [],
    isPublic = false,
    groupUsername = null,
    allowMemberInvites = false,
  }) {
    const rawCreator = findUserById ? findUserById(creatorUserId) : null;
    const creator = rawCreator && typeof rawCreator.then === "function" ? await rawCreator : rawCreator;
    if (!creator) throw new Error("Creator user not found");

    const normalizedType = type === "channel" ? "channel" : "group";
    const inviteToken = createInviteToken(crypto);

    const rawChatId = createChat(name || "Untitled", normalizedType, {
      public: isPublic,
      username: groupUsername,
      allowMemberInvites,
      inviteToken,
    });
    const chatId = rawChatId && typeof rawChatId.then === "function" ? await rawChatId : rawChatId;

    if (!chatId) throw new Error("Failed to create chat");

    // Add creator as owner
    const rawAddOwner = addChatMember(chatId, creator.id, "owner");
    if (rawAddOwner && typeof rawAddOwner.then === "function") await rawAddOwner;

    // Add initial members
    const memberSet = new Set(
      initialMemberUsernames.map((u) => String(u || "").toLowerCase()),
    );
    memberSet.delete(String(creator.username || "").toLowerCase());

    const addedUsernames = [creator.username];
    for (const username of memberSet) {
      const rawMember = findUserByUsername(username);
      const member = rawMember && typeof rawMember.then === "function" ? await rawMember : rawMember;
      if (member) {
        const rawAddMember = addChatMember(chatId, member.id, "member");
        if (rawAddMember && typeof rawAddMember.then === "function") await rawAddMember;
        addedUsernames.push(member.username);
      }
    }

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

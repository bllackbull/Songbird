/**
 * Message Publication Domain Service
 *
 * Encapsulates standard text message publishing, upload publication, message edit,
 * and forwarding lifecycle, including idempotency check, saved-messages auto-read,
 * and post-persistence effect descriptors (SSE payloads, push targets).
 */

export function createMessagePublicationService(dbApi) {
  const {
    createOrReuseMessage,
    createMessageFiles,
    editMessage,
    findChatById,
    findMessageById,
    listChatMembers,
    listMutedUserIdsForChat,
    markMessageRead,
    setMessageExpiresAt,
    setMessageForwardOrigin,
    findUserById,
  } = dbApi;

  /**
   * Helper to calculate push recipients for a chat.
   */
  function calculatePushRecipients(chatId, senderUserId, isUserConnectedFn) {
    const rawMembers = listChatMembers(Number(chatId));
    const rawMutedRows = listMutedUserIdsForChat(Number(chatId));

    const buildPush = (members, mutedRows) => {
      const memberList = members || [];
      const mutedList = mutedRows || [];
      const mutedIds = new Set(
        mutedList.map((row) => Number(row?.user_id || row || 0)).filter(Boolean),
      );

      return memberList
        .filter((member) => Number(member.id) !== Number(senderUserId))
        .filter((member) =>
          typeof isUserConnectedFn === "function"
            ? !isUserConnectedFn(member.username)
            : true,
        )
        .map((member) => Number(member.id))
        .filter(
          (memberId) =>
            Number.isFinite(memberId) &&
            memberId > 0 &&
            !mutedIds.has(Number(memberId)),
        );
    };

    if (
      (rawMembers && typeof rawMembers.then === "function") ||
      (rawMutedRows && typeof rawMutedRows.then === "function")
    ) {
      return Promise.all([
        rawMembers && typeof rawMembers.then === "function" ? rawMembers : Promise.resolve(rawMembers),
        rawMutedRows && typeof rawMutedRows.then === "function" ? rawMutedRows : Promise.resolve(rawMutedRows),
      ]).then(([m, r]) => buildPush(m, r));
    }

    return buildPush(rawMembers, rawMutedRows);
  }

  /**
   * Publish a text message.
   */
  function publishTextMessage({
    chatId,
    userId,
    body,
    replyToMessageId = null,
    expiresAt = null,
    clientRequestId = null,
    username = "",
    isUserConnectedFn = null,
  }) {
    const rawChat = findChatById(Number(chatId));

    const processPub = (chat) => {
      if (!chat) throw new Error("Chat not found");

      const rawCreated = createOrReuseMessage(
        Number(chatId),
        Number(userId),
        body,
        replyToMessageId,
        expiresAt,
        clientRequestId,
      );

      const processCreated = (created) => {
        const messageId = Number(created?.id || 0);
        if (!messageId) throw new Error("Unable to create message.");

        const deduped = Boolean(created?.deduped);

        if (
          chat.type === "saved" &&
          !deduped &&
          typeof markMessageRead === "function"
        ) {
          markMessageRead(messageId, Number(userId));
        }

        const rawPushRecipients = deduped
          ? []
          : calculatePushRecipients(chatId, userId, isUserConnectedFn);

        const processPush = (pushRecipients) => {
          const sseEvents = [];
          if (!deduped) {
            sseEvents.push({
              chatId: Number(chatId),
              payload: {
                type: "chat_message",
                chatId: Number(chatId),
                messageId,
                username,
                body,
                replyToMessageId,
              },
            });
          }

          return {
            success: true,
            messageId,
            deduped,
            sseEvents,
            pushRecipients: pushRecipients || [],
          };
        };

        if (rawPushRecipients && typeof rawPushRecipients.then === "function") {
          return rawPushRecipients.then(processPush);
        }
        return processPush(rawPushRecipients);
      };

      if (rawCreated && typeof rawCreated.then === "function") {
        return rawCreated.then(processCreated);
      }
      return processCreated(rawCreated);
    };

    if (rawChat && typeof rawChat.then === "function") {
      return rawChat.then(processPub);
    }
    return processPub(rawChat);
  }

  /**
   * Publish a message with attached files.
   */
  function publishUploadMessage({
    chatId,
    userId,
    fallbackBody,
    replyToMessageId = null,
    clientRequestId = null,
    normalizedFiles = [],
    editTarget = null,
    editMessageId = null,
    username = "",
  }) {
    const chat = findChatById(Number(chatId));
    if (!chat) throw new Error("Chat not found");

    let messageId = Number(editMessageId || 0);
    let deduped = false;

    if (editTarget) {
      if (typeof editMessage === "function") {
        editMessage(messageId, fallbackBody);
      }
      if (typeof setMessageExpiresAt === "function") {
        setMessageExpiresAt(messageId, null);
      }
      if (typeof createMessageFiles === "function") {
        createMessageFiles(messageId, normalizedFiles);
      }
    } else {
      const created = createOrReuseMessage(
        Number(chatId),
        Number(userId),
        fallbackBody,
        replyToMessageId,
        null,
        clientRequestId,
      );
      messageId = Number(created?.id || 0);
      deduped = Boolean(created?.deduped);
      if (!messageId) throw new Error("Unable to create message.");

      if (!deduped && typeof createMessageFiles === "function") {
        createMessageFiles(messageId, normalizedFiles);
      }
      if (
        chat.type === "saved" &&
        !deduped &&
        typeof markMessageRead === "function"
      ) {
        markMessageRead(messageId, Number(userId));
      }
    }

    const sseEvents = [];
    if (editTarget) {
      sseEvents.push({
        chatId: Number(chatId),
        payload: {
          type: "chat_message_updated",
          chatId: Number(chatId),
          messageId,
          username,
          body: fallbackBody,
        },
      });
    } else if (!deduped) {
      sseEvents.push({
        chatId: Number(chatId),
        payload: {
          type: "chat_message",
          chatId: Number(chatId),
          messageId,
          username,
          body: fallbackBody,
          replyToMessageId,
        },
      });
    }

    return {
      success: true,
      messageId,
      deduped,
      sseEvents,
    };
  }

  /**
   * Edit an existing message.
   */
  function editTextMessage({ messageId, chatId, body, username }) {
    if (typeof editMessage === "function") {
      editMessage(Number(messageId), body);
    }
    if (typeof setMessageExpiresAt === "function") {
      setMessageExpiresAt(Number(messageId), null);
    }

    return {
      success: true,
      messageId: Number(messageId),
      sseEvents: [
        {
          chatId: Number(chatId),
          payload: {
            type: "chat_message_updated",
            chatId: Number(chatId),
            messageId: Number(messageId),
            username,
            body,
          },
        },
      ],
    };
  }

  return {
    publishTextMessage,
    publishUploadMessage,
    editTextMessage,
  };
}

import { EventEmitter } from "node:events";

export const userEvents = new EventEmitter();

export function initAutoAddWorker({ db, emitChatEvent }) {
  const handleUserCreated = async ({ userId }) => {
    if (!userId) return;
    try {
      const chatIds = await db.getAutoAddPublicChatIds();
      if (!chatIds || chatIds.length === 0) return;

      const addedChatIds = await db.bulkAddMemberToChats(userId, chatIds);
      if (!addedChatIds || addedChatIds.length === 0) return;

      const user = db.findUserById ? await db.findUserById(userId) : null;
      const username = user?.username || "";
      const label = user?.nickname || username;

      for (const chatId of addedChatIds) {
        const chat = db.findChatById ? await db.findChatById(chatId) : null;
        if (chat && (chat.type === "group" || !chat.type) && label && typeof db.createMessage === "function") {
          const body = `[[system:joined:${label}]]`;
          await db.createMessage(chatId, userId, body, null, null, null, {
            allowPlaintextSystemMessage: true,
          });
          if (typeof emitChatEvent === "function") {
            emitChatEvent(chatId, {
              type: "chat_message",
              chatId,
              userId,
              username,
              body,
            });
          }
        }
        if (typeof emitChatEvent === "function") {
          emitChatEvent(chatId, { type: "chat_updated", chatId });
          emitChatEvent(chatId, { type: "chat_list_changed", chatId });
        }
      }
    } catch (err) {
      console.error("AutoAddWorker error auto-adding user:", err);
    }
  };

  userEvents.on("user:created", handleUserCreated);

  return {
    destroy: () => {
      userEvents.off("user:created", handleUserCreated);
    },
  };
}

function registerReactionRoutes(app, deps) {
  const {
    requireSession,
    findMessageById,
    isMember,
    toggleReaction,
    getReactionsForMessage,
    emitChatEvent,
  } = deps;

  // Toggle a reaction on a message (add if not present, remove if present)
  app.post("/api/messages/:messageId/reactions", requireSession, (req, res) => {
    try {
      const messageId = Number(req.params.messageId);
      const { emoji } = req.body || {};
      const userId = req.session?.userId;

      if (!messageId || !Number.isFinite(messageId)) {
        return res.status(400).json({ error: "Invalid message ID" });
      }
      if (!emoji || typeof emoji !== "string" || emoji.length > 16) {
        return res.status(400).json({ error: "Invalid emoji" });
      }

      const message = findMessageById(messageId);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Verify user is a member of the chat
      if (!isMember(message.chat_id, userId)) {
        return res.status(403).json({ error: "Not a member of this chat" });
      }

      const result = toggleReaction(messageId, userId, emoji.trim());

      // Get updated reactions for this message
      const reactions = getReactionsForMessage(messageId);

      // Broadcast to all chat members via SSE
      emitChatEvent(message.chat_id, {
        type: "chat_message_reaction",
        chatId: message.chat_id,
        messageId,
        reactions,
      });

      return res.json({ ok: true, added: result.added, reactions });
    } catch (error) {
      console.error("Reaction toggle error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get reactions for a specific message
  app.get("/api/messages/:messageId/reactions", requireSession, (req, res) => {
    try {
      const messageId = Number(req.params.messageId);
      if (!messageId || !Number.isFinite(messageId)) {
        return res.status(400).json({ error: "Invalid message ID" });
      }

      const message = findMessageById(messageId);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      const userId = req.session?.userId;
      if (!isMember(message.chat_id, userId)) {
        return res.status(403).json({ error: "Not a member of this chat" });
      }

      const reactions = getReactionsForMessage(messageId);
      return res.json({ reactions });
    } catch (error) {
      console.error("Get reactions error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}

export { registerReactionRoutes };

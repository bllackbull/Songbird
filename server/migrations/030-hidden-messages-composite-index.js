export const migration030HiddenMessagesCompositeIndex = {
  version: 30,
  up: ({ db, tableExists }) => {
    if (tableExists("hidden_chat_messages")) {
      // The existing indexes are single-column: (user_id) and (message_id).
      // Every query that filters hidden messages uses both columns together:
      //   WHERE hidden_chat_messages.user_id = ?  (with join/subquery on message_id)
      // A composite (user_id, message_id) index covers these lookups as an
      // index-only scan, which matters in listChatsForUser (unread counts) and
      // getMessages (visibility filter) — both run on every chat open.
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_user_message ON hidden_chat_messages(user_id, message_id)",
      );
    }
  },
};

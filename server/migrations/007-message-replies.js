export const migration007MessageReplies = {
  version: 7,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chat_messages")) return;

    if (!hasColumn("chat_messages", "reply_to_message_id")) {
      db.run(
        "ALTER TABLE chat_messages ADD COLUMN reply_to_message_id INTEGER",
      );
    }

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON chat_messages(reply_to_message_id)",
    );
  },
};

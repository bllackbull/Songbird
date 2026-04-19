export const migration021ChatQueryIndexes = {
  version: 21,
  up: ({ db, tableExists }) => {
    if (tableExists("chat_messages")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_id ON chat_messages(chat_id, id DESC)",
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_user_id_id ON chat_messages(chat_id, user_id, id DESC)",
      );
    }

    if (tableExists("chat_members")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_chat_members_user_chat ON chat_members(user_id, chat_id)",
      );
    }
  },
};

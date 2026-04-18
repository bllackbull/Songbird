export const migration019MessageForwardOriginUsers = {
  version: 19,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chat_messages")) return;

    if (!hasColumn("chat_messages", "forwarded_from_user_id")) {
      db.run(
        "ALTER TABLE chat_messages ADD COLUMN forwarded_from_user_id INTEGER",
      );
    }
    if (!hasColumn("chat_messages", "forwarded_from_username")) {
      db.run(
        "ALTER TABLE chat_messages ADD COLUMN forwarded_from_username TEXT",
      );
    }
    if (!hasColumn("chat_messages", "forwarded_from_avatar_url")) {
      db.run(
        "ALTER TABLE chat_messages ADD COLUMN forwarded_from_avatar_url TEXT",
      );
    }
    if (!hasColumn("chat_messages", "forwarded_from_color")) {
      db.run("ALTER TABLE chat_messages ADD COLUMN forwarded_from_color TEXT");
    }

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from_user ON chat_messages(forwarded_from_user_id)",
    );
  },
};

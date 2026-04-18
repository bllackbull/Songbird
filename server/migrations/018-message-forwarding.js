export const migration018MessageForwarding = {
  version: 18,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chat_messages")) return;

    if (!hasColumn("chat_messages", "forwarded_from_chat_id")) {
      db.run(
        "ALTER TABLE chat_messages ADD COLUMN forwarded_from_chat_id INTEGER",
      );
    }
    if (!hasColumn("chat_messages", "forwarded_from_label")) {
      db.run("ALTER TABLE chat_messages ADD COLUMN forwarded_from_label TEXT");
    }

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from_chat ON chat_messages(forwarded_from_chat_id)",
    );
  },
};

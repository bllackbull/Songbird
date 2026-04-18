export const migration020ChatMessageExpiry = {
  version: 20,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chat_messages")) return;

    if (!hasColumn("chat_messages", "expires_at")) {
      db.run("ALTER TABLE chat_messages ADD COLUMN expires_at TEXT");
    }

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_expires_at ON chat_messages(expires_at)",
    );
  },
};

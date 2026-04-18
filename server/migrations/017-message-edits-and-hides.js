export const migration017MessageEditsAndHides = {
  version: 17,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chat_messages")) return;

    if (!hasColumn("chat_messages", "edited")) {
      db.run(
        "ALTER TABLE chat_messages ADD COLUMN edited INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!hasColumn("chat_messages", "edited_body")) {
      db.run("ALTER TABLE chat_messages ADD COLUMN edited_body TEXT");
    }
    if (!hasColumn("chat_messages", "hidden_everyone_at")) {
      db.run("ALTER TABLE chat_messages ADD COLUMN hidden_everyone_at TEXT");
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS hidden_chat_messages (
        user_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        hidden_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, message_id),
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (message_id) REFERENCES chat_messages (id)
      )
    `);

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_user ON hidden_chat_messages(user_id)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_message ON hidden_chat_messages(message_id)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_hidden_everyone ON chat_messages(hidden_everyone_at)",
    );
  },
};

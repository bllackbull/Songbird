export const migration013MessageReads = {
  version: 13,
  up: ({ db, tableExists }) => {
    if (!tableExists("chat_messages") || !tableExists("users")) return;

    db.run(`
      CREATE TABLE IF NOT EXISTS chat_message_reads (
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        read_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (message_id, user_id),
        FOREIGN KEY (message_id) REFERENCES chat_messages (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_message_reads_message ON chat_message_reads(message_id)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_message_reads_user ON chat_message_reads(user_id)",
    );
  },
};

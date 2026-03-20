export const migration011ChatMutes = {
  version: 11,
  up: ({ db, tableExists }) => {
    if (!tableExists("users") || !tableExists("chats")) return;

    db.run(`
      CREATE TABLE IF NOT EXISTS chat_mutes (
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        muted INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, chat_id),
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (chat_id) REFERENCES chats (id)
      )
    `);

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_mutes_chat_user ON chat_mutes(chat_id, user_id)",
    );
  },
};

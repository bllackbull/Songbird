export const migration027MessageReactions = {
  version: 27,
  up: ({ db, hasColumn }) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (message_id) REFERENCES chat_messages (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE (message_id, user_id, emoji)
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_reactions_user ON message_reactions(user_id)`);
  },
};

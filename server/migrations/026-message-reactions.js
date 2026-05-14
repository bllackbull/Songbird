export const migration026MessageReactions = {
  version: 26,
  up: ({ db }) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS message_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        reaction TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(message_id, user_id, reaction)
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_reactions_message
      ON message_reactions(message_id)
    `);
  },
};

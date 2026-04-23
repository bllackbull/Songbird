export const migration023ChatLeftMembers = {
  version: 23,
  up: ({ db, tableExists }) => {
    if (!tableExists("users") || !tableExists("chats")) return;

    db.run(`
      CREATE TABLE IF NOT EXISTS chat_left_members (
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        left_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (chat_id, user_id),
        FOREIGN KEY (chat_id) REFERENCES chats (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_left_members_user ON chat_left_members(user_id, chat_id)",
    );
  },
};

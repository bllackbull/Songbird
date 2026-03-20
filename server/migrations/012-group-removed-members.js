export const migration012GroupRemovedMembers = {
  version: 12,
  up: ({ db, tableExists }) => {
    if (!tableExists("users") || !tableExists("chats")) return;

    db.run(`
      CREATE TABLE IF NOT EXISTS group_removed_members (
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        removed_by_user_id INTEGER NOT NULL,
        removed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (chat_id, user_id),
        FOREIGN KEY (chat_id) REFERENCES chats (id),
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (removed_by_user_id) REFERENCES users (id)
      )
    `);

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_group_removed_members_user ON group_removed_members(user_id, chat_id)",
    );
  },
};

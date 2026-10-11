export const migration033AdminStatsIndexes = {
  version: 33,
  up: ({ db, tableExists }) => {
    // getAdminStats queries chat_messages with a bare created_at range filter:
    //   WHERE created_at >= datetime('now', '-1 day')
    // The only existing index prefixed on created_at is
    // idx_messages_chat_time(chat_id, created_at), which cannot serve this
    // unqualified range scan — SQLite must read every row. A dedicated
    // single-column index lets the engine seek directly to the cutoff and
    // read only the matching tail of the B-tree.
    if (tableExists("chat_messages")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)",
      );
    }

    // users.created_at is used by the newUsers7d stat. The table is typically
    // small, but the index keeps things consistent and costs almost nothing.
    if (tableExists("users")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)",
      );
    }
  },
};

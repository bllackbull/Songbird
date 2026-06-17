export const migration = {
  version: 28,
  up: ({ db, hasColumn }) => {
    if (!hasColumn("push_subscriptions", "message_preview")) {
      db.run(`
        ALTER TABLE push_subscriptions
        ADD COLUMN message_preview INTEGER NOT NULL DEFAULT 1
      `);
    }
  },
};

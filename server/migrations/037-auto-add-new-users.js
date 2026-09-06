export const migration037AutoAddNewUsers = {
  version: 37,
  up: ({ db, hasColumn }) => {
    if (!hasColumn("chats", "auto_add_new_users")) {
      db.run(
        `ALTER TABLE chats ADD COLUMN auto_add_new_users INTEGER NOT NULL DEFAULT 0`,
      );
    }
  },
};

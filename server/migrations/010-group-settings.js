export const migration010GroupSettings = {
  version: 10,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chats")) return;

    if (!hasColumn("chats", "allow_member_invites")) {
      db.run(
        "ALTER TABLE chats ADD COLUMN allow_member_invites INTEGER NOT NULL DEFAULT 1",
      );
    }

    if (!hasColumn("chats", "group_avatar_url")) {
      db.run("ALTER TABLE chats ADD COLUMN group_avatar_url TEXT");
    }
  },
};

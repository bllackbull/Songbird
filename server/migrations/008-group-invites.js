export const migration008GroupInvites = {
  version: 8,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chats")) return;

    if (!hasColumn("chats", "group_username")) {
      db.run("ALTER TABLE chats ADD COLUMN group_username TEXT");
    }

    if (!hasColumn("chats", "group_visibility")) {
      db.run(
        "ALTER TABLE chats ADD COLUMN group_visibility TEXT NOT NULL DEFAULT 'public'",
      );
    }

    if (!hasColumn("chats", "invite_token")) {
      db.run("ALTER TABLE chats ADD COLUMN invite_token TEXT");
    }

    if (!hasColumn("chats", "created_by_user_id")) {
      db.run("ALTER TABLE chats ADD COLUMN created_by_user_id INTEGER");
    }

    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_group_username ON chats(group_username)",
    );
    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_invite_token ON chats(invite_token)",
    );
    db.run("CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type)");
  },
};

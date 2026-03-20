export const migration009GroupColor = {
  version: 9,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chats")) return;

    if (!hasColumn("chats", "group_color")) {
      db.run("ALTER TABLE chats ADD COLUMN group_color TEXT");
    }
  },
};

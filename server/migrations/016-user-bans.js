export const migration016UserBans = {
  version: 16,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("users")) return;
    if (!hasColumn("users", "banned")) {
      db.run("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
    }
  },
};

export const migration031UserRoles = {
  version: 31,
  up: ({ db, hasColumn }) => {
    if (!hasColumn("users", "role")) {
      db.run(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
    }
  },
};

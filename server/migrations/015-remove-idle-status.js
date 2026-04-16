export const migration015RemoveIdleStatus = {
  version: 15,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("users") || !hasColumn("users", "status")) return;
    db.run(
      "UPDATE users SET status = 'online' WHERE LOWER(COALESCE(status, '')) = 'idle'",
    );
  },
};

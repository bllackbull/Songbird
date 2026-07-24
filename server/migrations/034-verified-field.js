export const migration034VerifiedField = {
  version: 34,
  up: ({ db, hasColumn }) => {
    if (!hasColumn("users", "verified")) {
      db.run(
        `ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0`,
      );
    }
    if (!hasColumn("chats", "verified")) {
      db.run(
        `ALTER TABLE chats ADD COLUMN verified INTEGER NOT NULL DEFAULT 0`,
      );
    }
  },
};

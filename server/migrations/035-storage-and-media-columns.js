export const migration035StorageAndMediaColumns = {
  version: 35,
  up: ({ db, hasColumn, tableExists }) => {
    const tables = ["message_files", "chat_message_files"].filter(
      (t) => !tableExists || tableExists(t),
    );
    for (const table of tables) {
      if (!hasColumn(table, "storage_driver")) {
        db.run(
          `ALTER TABLE ${table} ADD COLUMN storage_driver TEXT DEFAULT 'local'`,
        );
      }
      if (!hasColumn(table, "storage_key")) {
        db.run(`ALTER TABLE ${table} ADD COLUMN storage_key TEXT`);
      }
      if (!hasColumn(table, "processing_status")) {
        db.run(
          `ALTER TABLE ${table} ADD COLUMN processing_status TEXT DEFAULT 'ready'`,
        );
      }
      if (!hasColumn(table, "blurhash")) {
        db.run(`ALTER TABLE ${table} ADD COLUMN blurhash TEXT`);
      }
      if (!hasColumn(table, "waveform")) {
        db.run(`ALTER TABLE ${table} ADD COLUMN waveform TEXT`);
      }
      if (!hasColumn(table, "thumb_storage_key")) {
        db.run(`ALTER TABLE ${table} ADD COLUMN thumb_storage_key TEXT`);
      }
      if (!hasColumn(table, "encryption_type")) {
        db.run(
          `ALTER TABLE ${table} ADD COLUMN encryption_type TEXT DEFAULT 'none'`,
        );
      }
    }

    if (!hasColumn("users", "avatar_storage_driver")) {
      db.run(
        `ALTER TABLE users ADD COLUMN avatar_storage_driver TEXT DEFAULT 'local'`,
      );
    }
    if (!hasColumn("users", "avatar_storage_key")) {
      db.run(`ALTER TABLE users ADD COLUMN avatar_storage_key TEXT`);
    }
    if (!hasColumn("users", "avatar_encryption_type")) {
      db.run(
        `ALTER TABLE users ADD COLUMN avatar_encryption_type TEXT DEFAULT 'none'`,
      );
    }
  },
};

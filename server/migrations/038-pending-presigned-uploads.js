export const migration038PendingPresignedUploads = {
  version: 38,
  up: ({ db, tableExists }) => {
    if (!tableExists("pending_presigned_uploads")) {
      db.run(`
        CREATE TABLE IF NOT EXISTS pending_presigned_uploads (
          storage_key TEXT PRIMARY KEY,
          user_id TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT
        )
      `);
    }
  },
};

export const migration032AdminLogs = {
  version: 32,
  up: ({ db, tableExists }) => {
    if (!tableExists("admin_logs")) {
      db.run(`
        CREATE TABLE admin_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_user_id INTEGER,
          actor_username TEXT,
          action TEXT NOT NULL,
          target_type TEXT,
          target_label TEXT,
          details TEXT,
          status TEXT NOT NULL DEFAULT 'success',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.run(`CREATE INDEX idx_admin_logs_created_at ON admin_logs (created_at DESC)`);
    }
  },
};

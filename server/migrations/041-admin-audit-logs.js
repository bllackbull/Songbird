/**
 * Migration 041: Persistent admin audit logs.
 *
 * Previously admin actions were appended as JSON lines to `logs/admin.log`,
 * which lives on local disk. On PaaS/CaaS deployments (Render, Railway, …)
 * the filesystem is ephemeral, so every redeploy wiped the audit trail.
 * The database (Postgres on PaaS, SQLite locally) is the persistent store,
 * is included in backups, and is safe for concurrent writers — so the audit
 * trail moves there.
 *
 * Idempotency: CREATE TABLE / INDEX IF NOT EXISTS; safe to re-run.
 */
export const migration041AdminAuditLogs = {
  version: 41,
  up: ({ db, tableExists }) => {
    if (!tableExists("admin_audit_logs")) {
      db.run(`
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL DEFAULT (datetime('now')),
          actor_user_id TEXT,
          actor_username TEXT,
          action TEXT NOT NULL,
          target_type TEXT,
          target_label TEXT,
          details TEXT,
          status TEXT NOT NULL DEFAULT 'success'
        )
      `);
    }
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_ts ON admin_audit_logs(ts DESC)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action)",
    );
  },
};

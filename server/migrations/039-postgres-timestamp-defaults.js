/**
 * Migration 039: Repair PostgreSQL timestamp column defaults.
 *
 * SQLite `DEFAULT (datetime('now'))` expressions work when evaluated by
 * SQLite, but Postgres tables provisioned from the SQLite schema can end up
 * with the literal string "datetime('now')" as their column default. Every
 * row inserted without an explicit timestamp then stores that literal, which
 * clients cannot parse and render as "Invalid Date".
 *
 * PostgreSQL path:
 *   1. Reset affected column defaults to (CURRENT_TIMESTAMP::text).
 *   2. Backfill rows stuck with the literal. chat_messages prefers read_at
 *      (written seconds after creation via a working code path) so the
 *      repaired timestamps stay close to the truth.
 *
 * SQLite path: no-op, datetime('now') evaluates correctly there.
 *
 * Idempotency: re-running only rewrites defaults and touches rows that still
 * carry the literal, of which there should be none after the first run.
 */
const BROKEN_LITERAL = "datetime('now')";

const AFFECTED_COLUMNS = [
  ["chat_left_members", "left_at"],
  ["chat_message_files", "created_at"],
  ["chat_message_reads", "read_at"],
  ["chat_messages", "created_at"],
  ["chat_mutes", "updated_at"],
  ["chats", "created_at"],
  ["group_removed_members", "removed_at"],
  ["hidden_chat_messages", "hidden_at"],
  ["hidden_chats", "hidden_at"],
  ["pending_presigned_uploads", "created_at"],
  ["push_subscriptions", "created_at"],
  ["push_subscriptions", "updated_at"],
  ["remote_channel_provider_state", "updated_at"],
  ["remote_channel_queue", "created_at"],
  ["remote_channel_sources", "created_at"],
  ["remote_channel_sources", "updated_at"],
  ["sessions", "created_at"],
  ["sessions", "last_seen"],
  ["users", "created_at"],
];

export const migration039PostgresTimestampDefaults = {
  version: 39,
  up: async (ctx) => {
    if (!ctx.isPostgres) return;
    const { db, tableExists, hasColumn } = ctx;
    for (const [table, column] of AFFECTED_COLUMNS) {
      if (!tableExists(table) || !hasColumn(table, column)) continue;
      await db.run(
        `ALTER TABLE ${table} ALTER COLUMN ${column} SET DEFAULT (CURRENT_TIMESTAMP::text)`,
      );
      if (table === "chat_messages" && column === "created_at") {
        await db.run(
          `UPDATE chat_messages SET created_at = COALESCE(read_at, (CURRENT_TIMESTAMP::text)) WHERE created_at = ?`,
          [BROKEN_LITERAL],
        );
      } else {
        await db.run(
          `UPDATE ${table} SET ${column} = (CURRENT_TIMESTAMP::text) WHERE ${column} = ?`,
          [BROKEN_LITERAL],
        );
      }
    }
  },
};

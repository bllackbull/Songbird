/**
 * Migration 040: Widen remote_channel_queue.created_message_id to TEXT on PostgreSQL.
 *
 * Migration 036 converted chats/messages to UUID primary keys, but missed
 * this column. `markRemoteChannelQueueItemDone` writes the mirrored
 * chat_messages.id (a UUID string) into it, so on Postgres every attempt to
 * finish a queue item fails with:
 *
 *   invalid input syntax for type integer: "<uuid>"
 *
 * The item then stays in `retry` forever and is reprocessed on every tick —
 * re-attaching streamable media to the same message on each attempt.
 *
 * SQLite path: no-op (flexible type affinity already stores UUID strings).
 *
 * Idempotency: ALTER COLUMN TYPE TEXT is safe to re-run; values cast implicitly.
 */
export const migration040QueueMessageIdText = {
  version: 40,
  up: async (ctx) => {
    if (!ctx.isPostgres) return;
    const { db, tableExists, hasColumn } = ctx;
    if (
      !tableExists("remote_channel_queue") ||
      !hasColumn("remote_channel_queue", "created_message_id")
    ) {
      return;
    }
    await db.run(
      `ALTER TABLE remote_channel_queue ALTER COLUMN created_message_id TYPE TEXT`,
    );
  },
};

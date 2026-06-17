export const migration029RemoteChannelQueueSummaryIndex = {
  version: 29,
  up: ({ db, tableExists }) => {
    if (tableExists("remote_channel_queue")) {
      // Covering index for getRemoteChannelQueueSummary:
      //   SELECT status, COUNT(*) FROM remote_channel_queue WHERE source_id = ? GROUP BY status
      // Without this, every status poll scans the entire table for the source.
      // With (source_id, status), SQLite can satisfy the WHERE + GROUP BY purely
      // from the index — making it O(distinct statuses) regardless of table size.
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_remote_channel_queue_source_status ON remote_channel_queue(source_id, status)",
      );
    }
  },
};

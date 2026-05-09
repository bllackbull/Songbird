export const migration024RemoteChannelQueue = {
  version: 24,
  up: ({ db, getAll, hasColumn, tableExists }) => {
    const ensureUniqueIndex = (name, columns, sql) => {
      const existingColumns = getAll(`PRAGMA index_info('${name}')`).map(
        (row) => row.name,
      );
      if (
        existingColumns.length === columns.length &&
        existingColumns.every((column, index) => column === columns[index])
      ) {
        return;
      }
      db.run(`DROP INDEX IF EXISTS ${name}`);
      db.run(sql);
    };

    db.run(`
      CREATE TABLE IF NOT EXISTS remote_channel_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL UNIQUE,
        provider TEXT NOT NULL DEFAULT 'telegram',
        source_raw TEXT,
        source_chat_id TEXT,
        source_username TEXT,
        source_title TEXT,
        source_avatar_url TEXT,
        last_remote_message_id INTEGER,
        source_version INTEGER NOT NULL DEFAULT 1,
        sync_metadata INTEGER NOT NULL DEFAULT 0,
        stream_media INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        last_seen_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (chat_id) REFERENCES chats (id)
      )
    `);

    if (tableExists("remote_channel_sources")) {
      if (!hasColumn("remote_channel_sources", "source_title")) {
        db.run("ALTER TABLE remote_channel_sources ADD COLUMN source_title TEXT");
      }
      if (!hasColumn("remote_channel_sources", "source_avatar_url")) {
        db.run(
          "ALTER TABLE remote_channel_sources ADD COLUMN source_avatar_url TEXT",
        );
      }
      if (!hasColumn("remote_channel_sources", "last_remote_message_id")) {
        db.run(
          "ALTER TABLE remote_channel_sources ADD COLUMN last_remote_message_id INTEGER",
        );
      }
      if (!hasColumn("remote_channel_sources", "sync_metadata")) {
        db.run(
          "ALTER TABLE remote_channel_sources ADD COLUMN sync_metadata INTEGER NOT NULL DEFAULT 0",
        );
      }
      if (!hasColumn("remote_channel_sources", "source_version")) {
        db.run(
          "ALTER TABLE remote_channel_sources ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1",
        );
      }
      if (!hasColumn("remote_channel_sources", "stream_media")) {
        db.run(
          "ALTER TABLE remote_channel_sources ADD COLUMN stream_media INTEGER NOT NULL DEFAULT 0",
        );
      }
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS remote_channel_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        provider TEXT NOT NULL DEFAULT 'telegram',
        telegram_update_id INTEGER,
        telegram_message_id INTEGER,
        source_version INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        locked_at TEXT,
        lock_owner TEXT,
        last_error TEXT,
        created_message_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        processed_at TEXT,
        FOREIGN KEY (source_id) REFERENCES remote_channel_sources (id)
      )
    `);

    if (tableExists("remote_channel_queue")) {
      if (!hasColumn("remote_channel_queue", "source_version")) {
        db.run(
          "ALTER TABLE remote_channel_queue ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1",
        );
      }
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS remote_channel_provider_state (
        provider TEXT PRIMARY KEY,
        next_update_offset INTEGER,
        last_error TEXT,
        last_polled_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.run(
      "CREATE INDEX IF NOT EXISTS idx_remote_channel_sources_provider_enabled ON remote_channel_sources(provider, enabled)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_remote_channel_queue_status_next ON remote_channel_queue(status, next_attempt_at, created_at)",
    );
    ensureUniqueIndex(
      "idx_remote_channel_queue_source_update",
      ["source_id", "source_version", "telegram_update_id"],
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_channel_queue_source_update ON remote_channel_queue(source_id, source_version, telegram_update_id)",
    );
    ensureUniqueIndex(
      "idx_remote_channel_queue_source_message",
      ["source_id", "source_version", "telegram_message_id"],
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_channel_queue_source_message ON remote_channel_queue(source_id, source_version, telegram_message_id)",
    );
  },
};

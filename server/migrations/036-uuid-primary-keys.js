import { generateUuid } from "../lib/uuidUtils.js";

/**
 * Migration 036: Rebuild all tables with UUID as primary key.
 *
 * Converts integer-based IDs to UUID TEXT primary keys for users, chats, and
 * chat_messages. All foreign key reference columns in related tables are
 * converted from INTEGER to TEXT (storing UUID strings) via JOINs.
 *
 * Strategy (SQLite — table rebuild):
 *   1. Safety backfill: ensure every row has a non-NULL uuid
 *   2. CREATE new tables with TEXT PK (id = uuid)
 *   3. INSERT...SELECT with JOINs to resolve FK integer → UUID
 *   4. DROP old tables, RENAME new tables
 *   5. Recreate indexes
 *
 * LEFT JOINs are used for FK resolution so orphaned references become NULL
 * rather than dropping rows entirely.
 *
 * Idempotency: if `users.id` is already TEXT (post-migration), skip everything.
 */
export const migration036UuidPrimaryKeys = {
  version: 36,
  up: (ctx) => {
    const { db, getAll, hasColumn, tableExists } = ctx;

    // ─── Idempotency guard ───────────────────────────────────────────────
    // If the users table already has a TEXT id column (already migrated), bail out.
    if (tableExists("users")) {
      const tableInfo = getAll("PRAGMA table_info(users)");
      const rows = Array.isArray(tableInfo) ? tableInfo : [];
      const idCol = rows.find((r) => r.name === "id");
      if (idCol && /text/i.test(String(idCol.type || ""))) {
        // Already migrated — clean up any leftover _new tables from interrupted runs
        return;
      }
      // If users table exists but no id column at all (impossible in normal flow),
      // still check if it's somehow already UUID-based
      if (!idCol) {
        return;
      }
    }

    // Clean up any leftover _new tables from a previously interrupted run
    const newTables = [
      "users_new",
      "chats_new",
      "chat_messages_new",
      "chat_members_new",
      "chat_left_members_new",
      "hidden_chat_messages_new",
      "chat_message_reads_new",
      "chat_message_files_new",
      "push_subscriptions_new",
      "remote_channel_sources_new",
      "chat_mutes_new",
      "hidden_chats_new",
      "group_removed_members_new",
    ];
    for (const t of newTables) {
      if (tableExists(t)) {
        db.run(`DROP TABLE ${t}`);
      }
    }

    // ─── Phase 1: Safety backfill — generate UUIDs for NULL uuid rows ────
    if (hasColumn("users", "uuid")) {
      backfillNullUuids(db, getAll, "users");
    }
    if (hasColumn("chats", "uuid")) {
      backfillNullUuids(db, getAll, "chats");
    }
    if (hasColumn("chat_messages", "uuid")) {
      backfillNullUuids(db, getAll, "chat_messages");
    }

    // If uuid columns don't exist yet (033-uuid-support was never applied),
    // add them and backfill everything.
    if (!hasColumn("users", "uuid")) {
      db.run("ALTER TABLE users ADD COLUMN uuid TEXT");
      backfillAllUuids(db, getAll, "users");
    }
    if (!hasColumn("chats", "uuid")) {
      db.run("ALTER TABLE chats ADD COLUMN uuid TEXT");
      backfillAllUuids(db, getAll, "chats");
    }
    if (!hasColumn("chat_messages", "uuid")) {
      db.run("ALTER TABLE chat_messages ADD COLUMN uuid TEXT");
      backfillAllUuids(db, getAll, "chat_messages");
    }

    // ─── Phase 2: Rebuild users table ────────────────────────────────────
    db.run(`
      CREATE TABLE users_new (
        id TEXT NOT NULL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        nickname TEXT,
        avatar_url TEXT,
        color TEXT,
        status TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        verified INTEGER DEFAULT 0,
        banned INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        last_seen TEXT,
        avatar_storage_driver TEXT DEFAULT 'local',
        avatar_storage_key TEXT,
        avatar_encryption_type TEXT DEFAULT 'none'
      )
    `);

    db.run(`
      INSERT INTO users_new (id, username, nickname, avatar_url, color, status, password_hash, role, verified, banned, created_at, last_seen, avatar_storage_driver, avatar_storage_key, avatar_encryption_type)
      SELECT uuid, username, nickname, avatar_url, color, status, password_hash,
             COALESCE(role, 'user'),
             COALESCE(verified, 0),
             COALESCE(banned, 0),
             created_at,
             last_seen,
             COALESCE(avatar_storage_driver, 'local'),
             avatar_storage_key,
             COALESCE(avatar_encryption_type, 'none')
      FROM users
    `);

    // ─── Phase 3: Rebuild chats table ────────────────────────────────────
    db.run(`
      CREATE TABLE chats_new (
        id TEXT NOT NULL PRIMARY KEY,
        name TEXT,
        type TEXT NOT NULL DEFAULT 'dm',
        group_username TEXT,
        group_visibility TEXT DEFAULT 'public',
        invite_token TEXT,
        created_by_user_id TEXT,
        group_color TEXT,
        allow_member_invites INTEGER DEFAULT 1,
        group_avatar_url TEXT,
        verified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      INSERT INTO chats_new (id, name, type, group_username, group_visibility, invite_token, created_by_user_id, group_color, allow_member_invites, group_avatar_url, verified, created_at)
      SELECT c.uuid, c.name, c.type, c.group_username, c.group_visibility, c.invite_token,
             u.uuid,
             c.group_color, c.allow_member_invites, c.group_avatar_url,
             COALESCE(c.verified, 0),
             c.created_at
      FROM chats c
      LEFT JOIN users u ON u.id = c.created_by_user_id
    `);

    // ─── Phase 4: Rebuild chat_messages table ────────────────────────────
    db.run(`
      CREATE TABLE chat_messages_new (
        id TEXT NOT NULL PRIMARY KEY,
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        body TEXT,
        reply_to_message_id TEXT,
        client_request_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        read_at TEXT,
        read_by_user_id TEXT,
        edited INTEGER DEFAULT 0,
        edited_body TEXT,
        hidden_everyone_at TEXT,
        expires_at TEXT,
        forwarded_from_chat_id TEXT,
        forwarded_from_label TEXT,
        forwarded_from_user_id TEXT,
        forwarded_from_username TEXT,
        forwarded_from_avatar_url TEXT,
        forwarded_from_color TEXT
      )
    `);

    db.run(`
      INSERT INTO chat_messages_new (
        id, chat_id, user_id, body, reply_to_message_id, client_request_id,
        created_at, read_at, read_by_user_id, edited, edited_body, hidden_everyone_at, expires_at,
        forwarded_from_chat_id, forwarded_from_label,
        forwarded_from_user_id, forwarded_from_username,
        forwarded_from_avatar_url, forwarded_from_color
      )
      SELECT
        m.uuid,
        ch.uuid,
        u.uuid,
        m.body,
        rm.uuid,
        m.client_request_id,
        m.created_at,
        m.read_at,
        ru.uuid,
        COALESCE(m.edited, 0),
        m.edited_body,
        m.hidden_everyone_at,
        m.expires_at,
        fch.uuid,
        m.forwarded_from_label,
        fu.uuid,
        m.forwarded_from_username,
        m.forwarded_from_avatar_url,
        m.forwarded_from_color
      FROM chat_messages m
      LEFT JOIN chats ch ON ch.id = m.chat_id
      LEFT JOIN users u ON u.id = m.user_id
      LEFT JOIN chat_messages rm ON rm.id = m.reply_to_message_id
      LEFT JOIN users ru ON ru.id = m.read_by_user_id
      LEFT JOIN chats fch ON fch.id = m.forwarded_from_chat_id
      LEFT JOIN users fu ON fu.id = m.forwarded_from_user_id
    `);

    // ─── Phase 5: Rebuild chat_members ───────────────────────────────────
    db.run(`
      CREATE TABLE chat_members_new (
        chat_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        PRIMARY KEY (chat_id, user_id)
      )
    `);

    db.run(`
      INSERT OR IGNORE INTO chat_members_new (chat_id, user_id, role)
      SELECT ch.uuid, u.uuid, cm.role
      FROM chat_members cm
      LEFT JOIN chats ch ON ch.id = cm.chat_id
      LEFT JOIN users u ON u.id = cm.user_id
      WHERE ch.uuid IS NOT NULL AND u.uuid IS NOT NULL
    `);

    // ─── Phase 6: Rebuild other referencing tables ───────────────────────

    // 6a. chat_left_members
    if (tableExists("chat_left_members")) {
      db.run(`
        CREATE TABLE chat_left_members_new (
          chat_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          left_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (chat_id, user_id)
        )
      `);
      db.run(`
        INSERT OR IGNORE INTO chat_left_members_new (chat_id, user_id, left_at)
        SELECT ch.uuid, u.uuid, clm.left_at
        FROM chat_left_members clm
        LEFT JOIN chats ch ON ch.id = clm.chat_id
        LEFT JOIN users u ON u.id = clm.user_id
        WHERE ch.uuid IS NOT NULL AND u.uuid IS NOT NULL
      `);
    }

    // 6b. hidden_chat_messages
    if (tableExists("hidden_chat_messages")) {
      db.run(`
        CREATE TABLE hidden_chat_messages_new (
          user_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          hidden_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, message_id)
        )
      `);
      db.run(`
        INSERT OR IGNORE INTO hidden_chat_messages_new (user_id, message_id, hidden_at)
        SELECT u.uuid, m.uuid, hcm.hidden_at
        FROM hidden_chat_messages hcm
        LEFT JOIN users u ON u.id = hcm.user_id
        LEFT JOIN chat_messages m ON m.id = hcm.message_id
        WHERE u.uuid IS NOT NULL AND m.uuid IS NOT NULL
      `);
    }

    // 6c. chat_message_reads
    if (tableExists("chat_message_reads")) {
      db.run(`
        CREATE TABLE chat_message_reads_new (
          message_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          read_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (message_id, user_id)
        )
      `);
      db.run(`
        INSERT OR IGNORE INTO chat_message_reads_new (message_id, user_id, read_at)
        SELECT m.uuid, u.uuid, cmr.read_at
        FROM chat_message_reads cmr
        LEFT JOIN chat_messages m ON m.id = cmr.message_id
        LEFT JOIN users u ON u.id = cmr.user_id
        WHERE m.uuid IS NOT NULL AND u.uuid IS NOT NULL
      `);
    }

    // 6d. chat_message_files
    if (tableExists("chat_message_files")) {
      db.run(`
        CREATE TABLE chat_message_files_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          original_name TEXT NOT NULL,
          stored_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          width_px INTEGER,
          height_px INTEGER,
          duration_seconds REAL,
          expires_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          storage_driver TEXT DEFAULT 'local',
          storage_key TEXT,
          processing_status TEXT DEFAULT 'ready',
          blurhash TEXT,
          waveform TEXT,
          thumb_storage_key TEXT,
          encryption_type TEXT DEFAULT 'none'
        )
      `);
      db.run(`
        INSERT INTO chat_message_files_new (
          id, message_id, kind, original_name, stored_name, mime_type, size_bytes,
          width_px, height_px, duration_seconds, expires_at, created_at,
          storage_driver, storage_key, processing_status, blurhash, waveform,
          thumb_storage_key, encryption_type
        )
        SELECT
          cmf.id, m.uuid, cmf.kind, cmf.original_name, cmf.stored_name,
          cmf.mime_type, cmf.size_bytes, cmf.width_px, cmf.height_px,
          cmf.duration_seconds, cmf.expires_at, cmf.created_at,
          cmf.storage_driver, cmf.storage_key, cmf.processing_status,
          cmf.blurhash, cmf.waveform, cmf.thumb_storage_key, cmf.encryption_type
        FROM chat_message_files cmf
        LEFT JOIN chat_messages m ON m.id = cmf.message_id
      `);
    }

    // 6e. push_subscriptions
    if (tableExists("push_subscriptions")) {
      db.run(`
        CREATE TABLE push_subscriptions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT,
          auth TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.run(`
        INSERT INTO push_subscriptions_new (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
        SELECT ps.id, u.uuid, ps.endpoint, ps.p256dh, ps.auth, ps.created_at, ps.updated_at
        FROM push_subscriptions ps
        LEFT JOIN users u ON u.id = ps.user_id
        WHERE u.uuid IS NOT NULL
      `);
    }

    // 6f. remote_channel_sources
    if (tableExists("remote_channel_sources")) {
      db.run(`
        CREATE TABLE remote_channel_sources_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id TEXT NOT NULL UNIQUE,
          provider TEXT NOT NULL DEFAULT 'telegram',
          source_raw TEXT,
          source_chat_id TEXT,
          source_username TEXT,
          source_title TEXT,
          source_avatar_url TEXT,
          source_url TEXT,
          last_remote_message_id INTEGER,
          source_version INTEGER NOT NULL DEFAULT 1,
          sync_metadata INTEGER NOT NULL DEFAULT 0,
          stream_media INTEGER NOT NULL DEFAULT 0,
          paused INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          last_seen_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.run(`
        INSERT INTO remote_channel_sources_new (
          id, chat_id, provider, source_raw, source_chat_id, source_username,
          source_title, source_avatar_url, source_url, last_remote_message_id,
          source_version, sync_metadata, stream_media, paused, enabled,
          last_error, last_seen_at, created_at, updated_at
        )
        SELECT
          rcs.id, ch.uuid, rcs.provider, rcs.source_raw, rcs.source_chat_id,
          rcs.source_username, rcs.source_title, rcs.source_avatar_url,
          rcs.source_url, rcs.last_remote_message_id,
          rcs.source_version, rcs.sync_metadata, rcs.stream_media,
          COALESCE(rcs.paused, 0), rcs.enabled,
          rcs.last_error, rcs.last_seen_at, rcs.created_at, rcs.updated_at
        FROM remote_channel_sources rcs
        LEFT JOIN chats ch ON ch.id = rcs.chat_id
        WHERE ch.uuid IS NOT NULL
      `);
    }

    // 6g. chat_mutes
    if (tableExists("chat_mutes")) {
      db.run(`
        CREATE TABLE chat_mutes_new (
          user_id TEXT NOT NULL,
          chat_id TEXT NOT NULL,
          muted INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, chat_id)
        )
      `);
      db.run(`
        INSERT OR IGNORE INTO chat_mutes_new (user_id, chat_id, muted, updated_at)
        SELECT u.uuid, ch.uuid, cmu.muted, cmu.updated_at
        FROM chat_mutes cmu
        LEFT JOIN users u ON u.id = cmu.user_id
        LEFT JOIN chats ch ON ch.id = cmu.chat_id
        WHERE u.uuid IS NOT NULL AND ch.uuid IS NOT NULL
      `);
    }

    // 6h. hidden_chats
    if (tableExists("hidden_chats")) {
      db.run(`
        CREATE TABLE hidden_chats_new (
          user_id TEXT NOT NULL,
          chat_id TEXT NOT NULL,
          hidden_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (user_id, chat_id)
        )
      `);
      db.run(`
        INSERT OR IGNORE INTO hidden_chats_new (user_id, chat_id, hidden_at)
        SELECT u.uuid, ch.uuid, hc.hidden_at
        FROM hidden_chats hc
        LEFT JOIN users u ON u.id = hc.user_id
        LEFT JOIN chats ch ON ch.id = hc.chat_id
        WHERE u.uuid IS NOT NULL AND ch.uuid IS NOT NULL
      `);
    }

    // 6i. group_removed_members
    if (tableExists("group_removed_members")) {
      db.run(`
        CREATE TABLE group_removed_members_new (
          chat_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          removed_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (chat_id, user_id)
        )
      `);
      db.run(`
        INSERT OR IGNORE INTO group_removed_members_new (chat_id, user_id, removed_at)
        SELECT ch.uuid, u.uuid, grm.removed_at
        FROM group_removed_members grm
        LEFT JOIN chats ch ON ch.id = grm.chat_id
        LEFT JOIN users u ON u.id = grm.user_id
        WHERE ch.uuid IS NOT NULL AND u.uuid IS NOT NULL
      `);
    }

    // ─── Phase 7: Drop old tables, rename new tables ─────────────────────
    // Disable FK enforcement during table swap to avoid constraint errors
    db.run("PRAGMA foreign_keys = OFF");

    // Order matters — drop tables that reference others first (child → parent)

    if (
      tableExists("group_removed_members") &&
      tableExists("group_removed_members_new")
    ) {
      db.run("DROP TABLE group_removed_members");
      db.run(
        "ALTER TABLE group_removed_members_new RENAME TO group_removed_members",
      );
    }

    if (tableExists("hidden_chats") && tableExists("hidden_chats_new")) {
      db.run("DROP TABLE hidden_chats");
      db.run("ALTER TABLE hidden_chats_new RENAME TO hidden_chats");
    }

    if (tableExists("chat_mutes") && tableExists("chat_mutes_new")) {
      db.run("DROP TABLE chat_mutes");
      db.run("ALTER TABLE chat_mutes_new RENAME TO chat_mutes");
    }

    if (
      tableExists("remote_channel_sources") &&
      tableExists("remote_channel_sources_new")
    ) {
      db.run("DROP TABLE remote_channel_sources");
      db.run(
        "ALTER TABLE remote_channel_sources_new RENAME TO remote_channel_sources",
      );
    }

    if (
      tableExists("push_subscriptions") &&
      tableExists("push_subscriptions_new")
    ) {
      db.run("DROP TABLE push_subscriptions");
      db.run("ALTER TABLE push_subscriptions_new RENAME TO push_subscriptions");
    }

    if (
      tableExists("chat_message_files") &&
      tableExists("chat_message_files_new")
    ) {
      db.run("DROP TABLE chat_message_files");
      db.run("ALTER TABLE chat_message_files_new RENAME TO chat_message_files");
    }

    if (
      tableExists("chat_message_reads") &&
      tableExists("chat_message_reads_new")
    ) {
      db.run("DROP TABLE chat_message_reads");
      db.run("ALTER TABLE chat_message_reads_new RENAME TO chat_message_reads");
    }

    if (
      tableExists("hidden_chat_messages") &&
      tableExists("hidden_chat_messages_new")
    ) {
      db.run("DROP TABLE hidden_chat_messages");
      db.run(
        "ALTER TABLE hidden_chat_messages_new RENAME TO hidden_chat_messages",
      );
    }

    if (
      tableExists("chat_left_members") &&
      tableExists("chat_left_members_new")
    ) {
      db.run("DROP TABLE chat_left_members");
      db.run("ALTER TABLE chat_left_members_new RENAME TO chat_left_members");
    }

    // Now drop and rename the core entity tables (child → parent order)
    db.run("DROP TABLE chat_members");
    db.run("ALTER TABLE chat_members_new RENAME TO chat_members");

    db.run("DROP TABLE chat_messages");
    db.run("ALTER TABLE chat_messages_new RENAME TO chat_messages");

    db.run("DROP TABLE chats");
    db.run("ALTER TABLE chats_new RENAME TO chats");

    db.run("DROP TABLE users");
    db.run("ALTER TABLE users_new RENAME TO users");

    // Re-enable FK enforcement
    db.run("PRAGMA foreign_keys = ON");

    // ─── Phase 8: Recreate indexes ──────────────────────────────────────
    // Core entity indexes
    db.run("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
    db.run("CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type)");
    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_group_username ON chats(group_username)",
    );
    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_invite_token ON chats(invite_token)",
    );

    // chat_messages indexes
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON chat_messages(chat_id, created_at)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON chat_messages(reply_to_message_id)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_expires_at ON chat_messages(expires_at)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_hidden_everyone ON chat_messages(hidden_everyone_at)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from_chat ON chat_messages(forwarded_from_chat_id)",
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from_user ON chat_messages(forwarded_from_user_id)",
    );
    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_request ON chat_messages(chat_id, user_id, client_request_id)",
    );

    // chat_members indexes
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id)",
    );

    // chat_left_members
    if (tableExists("chat_left_members")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_chat_left_members_user ON chat_left_members(user_id, chat_id)",
      );
    }

    // hidden_chat_messages
    if (tableExists("hidden_chat_messages")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_user ON hidden_chat_messages(user_id)",
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_message ON hidden_chat_messages(message_id)",
      );
    }

    // chat_message_reads
    if (tableExists("chat_message_reads")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_message_reads_message ON chat_message_reads(message_id)",
      );
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_message_reads_user ON chat_message_reads(user_id)",
      );
    }

    // chat_message_files
    if (tableExists("chat_message_files")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_message_files_message_id ON chat_message_files(message_id)",
      );
    }

    // push_subscriptions
    if (tableExists("push_subscriptions")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)",
      );
    }

    // remote_channel_sources
    if (tableExists("remote_channel_sources")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_remote_channel_sources_provider_enabled ON remote_channel_sources(provider, enabled)",
      );
    }

    // chat_mutes
    if (tableExists("chat_mutes")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_chat_mutes_chat_user ON chat_mutes(chat_id, user_id)",
      );
    }

    // hidden_chats
    if (tableExists("hidden_chats")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_hidden_chats_user ON hidden_chats(user_id, chat_id)",
      );
    }

    // group_removed_members
    if (tableExists("group_removed_members")) {
      db.run(
        "CREATE INDEX IF NOT EXISTS idx_group_removed_members_user ON group_removed_members(user_id, chat_id)",
      );
    }
  },
};

// ─── Helper functions ──────────────────────────────────────────────────────

/**
 * Backfill NULL uuid values for rows that somehow don't have one yet.
 */
function backfillNullUuids(db, getAll, table) {
  const rows = getAll(`SELECT id FROM ${table} WHERE uuid IS NULL`);
  const nullRows = Array.isArray(rows) ? rows : [];
  for (const row of nullRows) {
    db.run(`UPDATE ${table} SET uuid = ? WHERE id = ?`, [
      generateUuid(),
      row.id,
    ]);
  }
}

/**
 * Backfill ALL rows with a uuid (used when the column was just added).
 */
function backfillAllUuids(db, getAll, table) {
  const rows = getAll(`SELECT id FROM ${table}`);
  const allRows = Array.isArray(rows) ? rows : [];
  for (const row of allRows) {
    db.run(`UPDATE ${table} SET uuid = ? WHERE id = ?`, [
      generateUuid(),
      row.id,
    ]);
  }
}

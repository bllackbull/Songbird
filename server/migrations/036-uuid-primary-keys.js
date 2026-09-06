import { generateUuid } from "../lib/uuidUtils.js";

/**
 * Migration 036: Convert integer PKs to UUID TEXT primary keys.
 *
 * Two code paths:
 *   - SQLite: Table-rebuild (DROP + RENAME) since SQLite cannot alter column types.
 *   - PostgreSQL: In-place ALTER COLUMN TYPE with FK constraint management.
 *
 * Idempotency: if `users.id` is already TEXT, skip.
 */
export const migration036UuidPrimaryKeys = {
  version: 36,
  up: async (ctx) => {
    if (ctx.isPostgres) {
      return postgresUp(ctx);
    }
    return sqliteUp(ctx);
  },
};


// =============================================================================
// PostgreSQL implementation
// =============================================================================

async function postgresUp(ctx) {
  const { db, getAll, hasColumn } = ctx;

  // ─── Idempotency guard ─────────────────────────────────────────────────
  const colInfo = await getAll(
    "SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'",
  );
  const colRows = Array.isArray(colInfo) ? colInfo : [];
  if (
    colRows.length > 0 &&
    /text|character varying|uuid/i.test(String(colRows[0].data_type || ""))
  ) {
    return; // Already migrated
  }

  // ─── Phase 1: Add uuid columns and backfill ────────────────────────────
  if (!hasColumn("users", "uuid")) {
    await db.run("ALTER TABLE users ADD COLUMN uuid TEXT");
  }
  if (!hasColumn("chats", "uuid")) {
    await db.run("ALTER TABLE chats ADD COLUMN uuid TEXT");
  }
  if (!hasColumn("chat_messages", "uuid")) {
    await db.run("ALTER TABLE chat_messages ADD COLUMN uuid TEXT");
  }

  await backfillNullUuidsPg(db, getAll, "users");
  await backfillNullUuidsPg(db, getAll, "chats");
  await backfillNullUuidsPg(db, getAll, "chat_messages");

  // ─── Phase 2: Create temporary mapping tables ──────────────────────────
  // These let us convert FK integer values -> UUID text in referencing tables.
  await db.run("CREATE TEMP TABLE _map_users (old_id INTEGER PRIMARY KEY, new_id TEXT NOT NULL)");
  await db.run("INSERT INTO _map_users (old_id, new_id) SELECT id, uuid FROM users");

  await db.run("CREATE TEMP TABLE _map_chats (old_id INTEGER PRIMARY KEY, new_id TEXT NOT NULL)");
  await db.run("INSERT INTO _map_chats (old_id, new_id) SELECT id, uuid FROM chats");

  await db.run("CREATE TEMP TABLE _map_messages (old_id INTEGER PRIMARY KEY, new_id TEXT NOT NULL)");
  await db.run("INSERT INTO _map_messages (old_id, new_id) SELECT id, uuid FROM chat_messages");

  // ─── Phase 3: Drop FK constraints referencing core tables ────────────
  const allFks = await getAll(`
    SELECT tc.constraint_name, tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND (
        (ccu.table_name = 'users' AND ccu.column_name = 'id')
        OR (ccu.table_name = 'chats' AND ccu.column_name = 'id')
        OR (ccu.table_name = 'chat_messages' AND ccu.column_name = 'id')
      )
  `);
  const fkList = Array.isArray(allFks) ? allFks : [];
  for (const fk of fkList) {
    await db.run(`ALTER TABLE "${fk.table_name}" DROP CONSTRAINT IF EXISTS "${fk.constraint_name}"`);
  }

  // ─── Phase 4: Convert FK columns in referencing tables ──────────────
  // For tables with composite PKs that include FK columns, we need to
  // drop the PK first, convert columns, then recreate.

  // Drop composite PKs on affected tables before column conversion
  const compositePkTables = [
    "chat_members", "chat_left_members", "chat_message_reads",
    "hidden_chat_messages", "chat_mutes", "hidden_chats", "group_removed_members",
  ];
  for (const table of compositePkTables) {
    await dropPrimaryKeyPg(db, getAll, table);
  }

  // --- Tables referencing users.id ---
  const userFkColumns = [
    { table: "chat_members", col: "user_id" },
    { table: "chat_left_members", col: "user_id" },
    { table: "chat_messages", col: "user_id" },
    { table: "chat_messages", col: "read_by_user_id" },
    { table: "chat_messages", col: "forwarded_from_user_id" },
    { table: "chat_message_reads", col: "user_id" },
    { table: "hidden_chat_messages", col: "user_id" },
    { table: "hidden_chats", col: "user_id" },
    { table: "chat_mutes", col: "user_id" },
    { table: "group_removed_members", col: "user_id" },
    { table: "push_subscriptions", col: "user_id" },
    { table: "chats", col: "created_by_user_id" },
    { table: "sessions", col: "user_id" },
  ];

  for (const { table, col } of userFkColumns) {
    if (hasColumn(table, col)) {
      await convertFkColumnPg(db, table, col, "_map_users");
    }
  }

  // group_removed_members.removed_by_user_id
  if (hasColumn("group_removed_members", "removed_by_user_id")) {
    await convertFkColumnPg(db, "group_removed_members", "removed_by_user_id", "_map_users");
  }

  // --- Tables referencing chats.id ---
  const chatFkColumns = [
    { table: "chat_members", col: "chat_id" },
    { table: "chat_left_members", col: "chat_id" },
    { table: "chat_messages", col: "chat_id" },
    { table: "chat_messages", col: "forwarded_from_chat_id" },
    { table: "chat_mutes", col: "chat_id" },
    { table: "hidden_chats", col: "chat_id" },
    { table: "group_removed_members", col: "chat_id" },
    { table: "remote_channel_sources", col: "chat_id" },
  ];

  for (const { table, col } of chatFkColumns) {
    if (hasColumn(table, col)) {
      await convertFkColumnPg(db, table, col, "_map_chats");
    }
  }

  // --- Tables referencing chat_messages.id ---
  const messageFkColumns = [
    { table: "chat_messages", col: "reply_to_message_id" },
    { table: "chat_message_reads", col: "message_id" },
    { table: "chat_message_files", col: "message_id" },
    { table: "hidden_chat_messages", col: "message_id" },
  ];

  for (const { table, col } of messageFkColumns) {
    if (hasColumn(table, col)) {
      await convertFkColumnPg(db, table, col, "_map_messages");
    }
  }

  // Recreate composite PKs
  await db.run("ALTER TABLE chat_members ADD PRIMARY KEY (chat_id, user_id)");
  await db.run("ALTER TABLE chat_left_members ADD PRIMARY KEY (chat_id, user_id)");
  await db.run("ALTER TABLE chat_message_reads ADD PRIMARY KEY (message_id, user_id)");
  await db.run("ALTER TABLE hidden_chat_messages ADD PRIMARY KEY (user_id, message_id)");
  await db.run("ALTER TABLE chat_mutes ADD PRIMARY KEY (user_id, chat_id)");
  await db.run("ALTER TABLE hidden_chats ADD PRIMARY KEY (user_id, chat_id)");
  await db.run("ALTER TABLE group_removed_members ADD PRIMARY KEY (chat_id, user_id)");

  // ─── Phase 5: Convert the 3 primary key columns ────────────────────────
  // Drop PKs
  await dropPrimaryKeyPg(db, getAll, "users");
  await dropPrimaryKeyPg(db, getAll, "chats");
  await dropPrimaryKeyPg(db, getAll, "chat_messages");

  // Drop default (serial sequence)
  await db.run("ALTER TABLE users ALTER COLUMN id DROP DEFAULT");
  await db.run("ALTER TABLE chats ALTER COLUMN id DROP DEFAULT");
  await db.run("ALTER TABLE chat_messages ALTER COLUMN id DROP DEFAULT");

  // Convert type using the uuid column value
  await db.run("ALTER TABLE users ALTER COLUMN id TYPE TEXT USING uuid");
  await db.run("ALTER TABLE chats ALTER COLUMN id TYPE TEXT USING uuid");
  await db.run("ALTER TABLE chat_messages ALTER COLUMN id TYPE TEXT USING uuid");

  // Re-add primary keys
  await db.run("ALTER TABLE users ADD PRIMARY KEY (id)");
  await db.run("ALTER TABLE chats ADD PRIMARY KEY (id)");
  await db.run("ALTER TABLE chat_messages ADD PRIMARY KEY (id)");

  // Drop uuid columns (no longer needed)
  await db.run("ALTER TABLE users DROP COLUMN uuid");
  await db.run("ALTER TABLE chats DROP COLUMN uuid");
  await db.run("ALTER TABLE chat_messages DROP COLUMN uuid");

  // Drop orphaned sequences
  await db.run("DROP SEQUENCE IF EXISTS users_id_seq");
  await db.run("DROP SEQUENCE IF EXISTS chats_id_seq");
  await db.run("DROP SEQUENCE IF EXISTS chat_messages_id_seq");

  // ─── Phase 6: Drop temp mapping tables ─────────────────────────────────
  await db.run("DROP TABLE IF EXISTS _map_users");
  await db.run("DROP TABLE IF EXISTS _map_chats");
  await db.run("DROP TABLE IF EXISTS _map_messages");

  // ─── Phase 7: Recreate indexes ────────────────────────────────────────
  await db.run("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type)");
  await db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_group_username ON chats(group_username)");
  await db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_invite_token ON chats(invite_token)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON chat_messages(chat_id, created_at)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON chat_messages(reply_to_message_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_expires_at ON chat_messages(expires_at)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_hidden_everyone ON chat_messages(hidden_everyone_at)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from_chat ON chat_messages(forwarded_from_chat_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from_user ON chat_messages(forwarded_from_user_id)");
  await db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_request ON chat_messages(chat_id, user_id, client_request_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_left_members_user ON chat_left_members(user_id, chat_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_user ON hidden_chat_messages(user_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_message ON hidden_chat_messages(message_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_message_reads_message ON chat_message_reads(message_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_message_reads_user ON chat_message_reads(user_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_message_files_message_id ON chat_message_files(message_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_remote_channel_sources_provider_enabled ON remote_channel_sources(provider, enabled)");
  await db.run("CREATE UNIQUE INDEX IF NOT EXISTS remote_channel_sources_chat_id_key ON remote_channel_sources(chat_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_chat_mutes_chat_user ON chat_mutes(chat_id, user_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_hidden_chats_user ON hidden_chats(user_id, chat_id)");
  await db.run("CREATE INDEX IF NOT EXISTS idx_group_removed_members_user ON group_removed_members(user_id, chat_id)");
}

/**
 * Convert an integer FK column to TEXT using a mapping table.
 * Strategy: add _new col, populate from map, drop old, rename new.
 */
async function convertFkColumnPg(db, table, col, mapTable) {
  const tmpCol = `${col}__new`;
  await db.run(`ALTER TABLE "${table}" ADD COLUMN "${tmpCol}" TEXT`);
  await db.run(`
    UPDATE "${table}" t
    SET "${tmpCol}" = m.new_id
    FROM ${mapTable} m
    WHERE t."${col}" = m.old_id
  `);
  await db.run(`ALTER TABLE "${table}" DROP COLUMN "${col}"`);
  await db.run(`ALTER TABLE "${table}" RENAME COLUMN "${tmpCol}" TO "${col}"`);
}

async function dropPrimaryKeyPg(db, getAll, tableName) {
  const pkRows = await getAll(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = '${tableName}' AND constraint_type = 'PRIMARY KEY'
  `);
  const pks = Array.isArray(pkRows) ? pkRows : [];
  for (const pk of pks) {
    await db.run(`ALTER TABLE "${tableName}" DROP CONSTRAINT "${pk.constraint_name}"`);
  }
}

async function backfillNullUuidsPg(db, getAll, table) {
  const rows = await getAll(`SELECT id FROM ${table} WHERE uuid IS NULL`);
  const nullRows = Array.isArray(rows) ? rows : [];
  for (const row of nullRows) {
    await db.run(`UPDATE ${table} SET uuid = '${generateUuid()}' WHERE id = ${row.id}`);
  }
}


// =============================================================================
// SQLite implementation (original table-rebuild strategy)
// =============================================================================

function sqliteUp(ctx) {
  const { db, getAll, hasColumn, tableExists } = ctx;

  // ─── Idempotency guard ───────────────────────────────────────────────
  if (tableExists("users")) {
    const tableInfo = getAll("PRAGMA table_info(users)");
    const rows = Array.isArray(tableInfo) ? tableInfo : [];
    const idCol = rows.find((r) => r.name === "id");
    if (idCol && /text/i.test(String(idCol.type || ""))) {
      return;
    }
    if (!idCol) {
      return;
    }
  }

  // Clean up leftover _new tables from interrupted runs
  const newTables = [
    "users_new", "chats_new", "chat_messages_new", "chat_members_new",
    "chat_left_members_new", "hidden_chat_messages_new", "chat_message_reads_new",
    "chat_message_files_new", "push_subscriptions_new", "remote_channel_sources_new",
    "chat_mutes_new", "hidden_chats_new", "group_removed_members_new",
  ];
  for (const t of newTables) {
    if (tableExists(t)) {
      db.run(`DROP TABLE ${t}`);
    }
  }

  // ─── Phase 1: Safety backfill ──────────────────────────────────────────
  if (hasColumn("users", "uuid")) {
    backfillNullUuids(db, getAll, "users");
  }
  if (hasColumn("chats", "uuid")) {
    backfillNullUuids(db, getAll, "chats");
  }
  if (hasColumn("chat_messages", "uuid")) {
    backfillNullUuids(db, getAll, "chat_messages");
  }

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
           COALESCE(role, 'user'), COALESCE(verified, 0), COALESCE(banned, 0),
           created_at, last_seen,
           COALESCE(avatar_storage_driver, 'local'), avatar_storage_key,
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
           u.uuid, c.group_color, c.allow_member_invites, c.group_avatar_url,
           COALESCE(c.verified, 0), c.created_at
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
      m.uuid, ch.uuid, u.uuid, m.body, rm.uuid, m.client_request_id,
      m.created_at, m.read_at, ru.uuid, COALESCE(m.edited, 0), m.edited_body,
      m.hidden_everyone_at, m.expires_at, fch.uuid, m.forwarded_from_label,
      fu.uuid, m.forwarded_from_username, m.forwarded_from_avatar_url, m.forwarded_from_color
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

  if (tableExists("chat_left_members")) {
    db.run(`CREATE TABLE chat_left_members_new (chat_id TEXT NOT NULL, user_id TEXT NOT NULL, left_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (chat_id, user_id))`);
    db.run(`INSERT OR IGNORE INTO chat_left_members_new (chat_id, user_id, left_at) SELECT ch.uuid, u.uuid, clm.left_at FROM chat_left_members clm LEFT JOIN chats ch ON ch.id = clm.chat_id LEFT JOIN users u ON u.id = clm.user_id WHERE ch.uuid IS NOT NULL AND u.uuid IS NOT NULL`);
  }

  if (tableExists("hidden_chat_messages")) {
    db.run(`CREATE TABLE hidden_chat_messages_new (user_id TEXT NOT NULL, message_id TEXT NOT NULL, hidden_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, message_id))`);
    db.run(`INSERT OR IGNORE INTO hidden_chat_messages_new (user_id, message_id, hidden_at) SELECT u.uuid, m.uuid, hcm.hidden_at FROM hidden_chat_messages hcm LEFT JOIN users u ON u.id = hcm.user_id LEFT JOIN chat_messages m ON m.id = hcm.message_id WHERE u.uuid IS NOT NULL AND m.uuid IS NOT NULL`);
  }

  if (tableExists("chat_message_reads")) {
    db.run(`CREATE TABLE chat_message_reads_new (message_id TEXT NOT NULL, user_id TEXT NOT NULL, read_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (message_id, user_id))`);
    db.run(`INSERT OR IGNORE INTO chat_message_reads_new (message_id, user_id, read_at) SELECT m.uuid, u.uuid, cmr.read_at FROM chat_message_reads cmr LEFT JOIN chat_messages m ON m.id = cmr.message_id LEFT JOIN users u ON u.id = cmr.user_id WHERE m.uuid IS NOT NULL AND u.uuid IS NOT NULL`);
  }

  if (tableExists("chat_message_files")) {
    db.run(`CREATE TABLE chat_message_files_new (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, kind TEXT NOT NULL, original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, width_px INTEGER, height_px INTEGER, duration_seconds REAL, expires_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), storage_driver TEXT DEFAULT 'local', storage_key TEXT, processing_status TEXT DEFAULT 'ready', blurhash TEXT, waveform TEXT, thumb_storage_key TEXT, encryption_type TEXT DEFAULT 'none')`);
    db.run(`INSERT INTO chat_message_files_new (id, message_id, kind, original_name, stored_name, mime_type, size_bytes, width_px, height_px, duration_seconds, expires_at, created_at, storage_driver, storage_key, processing_status, blurhash, waveform, thumb_storage_key, encryption_type) SELECT cmf.id, m.uuid, cmf.kind, cmf.original_name, cmf.stored_name, cmf.mime_type, cmf.size_bytes, cmf.width_px, cmf.height_px, cmf.duration_seconds, cmf.expires_at, cmf.created_at, cmf.storage_driver, cmf.storage_key, cmf.processing_status, cmf.blurhash, cmf.waveform, cmf.thumb_storage_key, cmf.encryption_type FROM chat_message_files cmf LEFT JOIN chat_messages m ON m.id = cmf.message_id`);
  }

  if (tableExists("push_subscriptions")) {
    db.run(`CREATE TABLE push_subscriptions_new (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
    db.run(`INSERT INTO push_subscriptions_new (id, user_id, endpoint, p256dh, auth, created_at, updated_at) SELECT ps.id, u.uuid, ps.endpoint, ps.p256dh, ps.auth, ps.created_at, ps.updated_at FROM push_subscriptions ps LEFT JOIN users u ON u.id = ps.user_id WHERE u.uuid IS NOT NULL`);
  }

  if (tableExists("remote_channel_sources")) {
    db.run(`CREATE TABLE remote_channel_sources_new (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL UNIQUE, provider TEXT NOT NULL DEFAULT 'telegram', source_raw TEXT, source_chat_id TEXT, source_username TEXT, source_title TEXT, source_avatar_url TEXT, source_url TEXT, last_remote_message_id INTEGER, source_version INTEGER NOT NULL DEFAULT 1, sync_metadata INTEGER NOT NULL DEFAULT 0, stream_media INTEGER NOT NULL DEFAULT 0, paused INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 0, last_error TEXT, last_seen_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    db.run(`INSERT INTO remote_channel_sources_new (id, chat_id, provider, source_raw, source_chat_id, source_username, source_title, source_avatar_url, source_url, last_remote_message_id, source_version, sync_metadata, stream_media, paused, enabled, last_error, last_seen_at, created_at, updated_at) SELECT rcs.id, ch.uuid, rcs.provider, rcs.source_raw, rcs.source_chat_id, rcs.source_username, rcs.source_title, rcs.source_avatar_url, rcs.source_url, rcs.last_remote_message_id, rcs.source_version, rcs.sync_metadata, rcs.stream_media, COALESCE(rcs.paused, 0), rcs.enabled, rcs.last_error, rcs.last_seen_at, rcs.created_at, rcs.updated_at FROM remote_channel_sources rcs LEFT JOIN chats ch ON ch.id = rcs.chat_id WHERE ch.uuid IS NOT NULL`);
  }

  if (tableExists("chat_mutes")) {
    db.run(`CREATE TABLE chat_mutes_new (user_id TEXT NOT NULL, chat_id TEXT NOT NULL, muted INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, chat_id))`);
    db.run(`INSERT OR IGNORE INTO chat_mutes_new (user_id, chat_id, muted, updated_at) SELECT u.uuid, ch.uuid, cmu.muted, cmu.updated_at FROM chat_mutes cmu LEFT JOIN users u ON u.id = cmu.user_id LEFT JOIN chats ch ON ch.id = cmu.chat_id WHERE u.uuid IS NOT NULL AND ch.uuid IS NOT NULL`);
  }

  if (tableExists("hidden_chats")) {
    db.run(`CREATE TABLE hidden_chats_new (user_id TEXT NOT NULL, chat_id TEXT NOT NULL, hidden_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, chat_id))`);
    db.run(`INSERT OR IGNORE INTO hidden_chats_new (user_id, chat_id, hidden_at) SELECT u.uuid, ch.uuid, hc.hidden_at FROM hidden_chats hc LEFT JOIN users u ON u.id = hc.user_id LEFT JOIN chats ch ON ch.id = hc.chat_id WHERE u.uuid IS NOT NULL AND ch.uuid IS NOT NULL`);
  }

  if (tableExists("group_removed_members")) {
    db.run(`CREATE TABLE group_removed_members_new (chat_id TEXT NOT NULL, user_id TEXT NOT NULL, removed_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (chat_id, user_id))`);
    db.run(`INSERT OR IGNORE INTO group_removed_members_new (chat_id, user_id, removed_at) SELECT ch.uuid, u.uuid, grm.removed_at FROM group_removed_members grm LEFT JOIN chats ch ON ch.id = grm.chat_id LEFT JOIN users u ON u.id = grm.user_id WHERE ch.uuid IS NOT NULL AND u.uuid IS NOT NULL`);
  }

  // ─── Phase 7: Drop old tables, rename new tables ─────────────────────
  db.run("PRAGMA foreign_keys = OFF");

  if (tableExists("group_removed_members") && tableExists("group_removed_members_new")) {
    db.run("DROP TABLE group_removed_members");
    db.run("ALTER TABLE group_removed_members_new RENAME TO group_removed_members");
  }
  if (tableExists("hidden_chats") && tableExists("hidden_chats_new")) {
    db.run("DROP TABLE hidden_chats");
    db.run("ALTER TABLE hidden_chats_new RENAME TO hidden_chats");
  }
  if (tableExists("chat_mutes") && tableExists("chat_mutes_new")) {
    db.run("DROP TABLE chat_mutes");
    db.run("ALTER TABLE chat_mutes_new RENAME TO chat_mutes");
  }
  if (tableExists("remote_channel_sources") && tableExists("remote_channel_sources_new")) {
    db.run("DROP TABLE remote_channel_sources");
    db.run("ALTER TABLE remote_channel_sources_new RENAME TO remote_channel_sources");
  }
  if (tableExists("push_subscriptions") && tableExists("push_subscriptions_new")) {
    db.run("DROP TABLE push_subscriptions");
    db.run("ALTER TABLE push_subscriptions_new RENAME TO push_subscriptions");
  }
  if (tableExists("chat_message_files") && tableExists("chat_message_files_new")) {
    db.run("DROP TABLE chat_message_files");
    db.run("ALTER TABLE chat_message_files_new RENAME TO chat_message_files");
  }
  if (tableExists("chat_message_reads") && tableExists("chat_message_reads_new")) {
    db.run("DROP TABLE chat_message_reads");
    db.run("ALTER TABLE chat_message_reads_new RENAME TO chat_message_reads");
  }
  if (tableExists("hidden_chat_messages") && tableExists("hidden_chat_messages_new")) {
    db.run("DROP TABLE hidden_chat_messages");
    db.run("ALTER TABLE hidden_chat_messages_new RENAME TO hidden_chat_messages");
  }
  if (tableExists("chat_left_members") && tableExists("chat_left_members_new")) {
    db.run("DROP TABLE chat_left_members");
    db.run("ALTER TABLE chat_left_members_new RENAME TO chat_left_members");
  }

  db.run("DROP TABLE chat_members");
  db.run("ALTER TABLE chat_members_new RENAME TO chat_members");
  db.run("DROP TABLE chat_messages");
  db.run("ALTER TABLE chat_messages_new RENAME TO chat_messages");
  db.run("DROP TABLE chats");
  db.run("ALTER TABLE chats_new RENAME TO chats");
  db.run("DROP TABLE users");
  db.run("ALTER TABLE users_new RENAME TO users");

  db.run("PRAGMA foreign_keys = ON");

  // ─── Phase 8: Recreate indexes ──────────────────────────────────────
  db.run("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type)");
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_group_username ON chats(group_username)");
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_invite_token ON chats(invite_token)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON chat_messages(chat_id, created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON chat_messages(reply_to_message_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_expires_at ON chat_messages(expires_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_hidden_everyone ON chat_messages(hidden_everyone_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from_chat ON chat_messages(forwarded_from_chat_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chat_messages_forwarded_from_user ON chat_messages(forwarded_from_user_id)");
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_request ON chat_messages(chat_id, user_id, client_request_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id)");

  if (tableExists("chat_left_members")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_chat_left_members_user ON chat_left_members(user_id, chat_id)");
  }
  if (tableExists("hidden_chat_messages")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_user ON hidden_chat_messages(user_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_hidden_chat_messages_message ON hidden_chat_messages(message_id)");
  }
  if (tableExists("chat_message_reads")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_message_reads_message ON chat_message_reads(message_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_message_reads_user ON chat_message_reads(user_id)");
  }
  if (tableExists("chat_message_files")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_message_files_message_id ON chat_message_files(message_id)");
  }
  if (tableExists("push_subscriptions")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)");
  }
  if (tableExists("remote_channel_sources")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_remote_channel_sources_provider_enabled ON remote_channel_sources(provider, enabled)");
  }
  if (tableExists("chat_mutes")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_chat_mutes_chat_user ON chat_mutes(chat_id, user_id)");
  }
  if (tableExists("hidden_chats")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_hidden_chats_user ON hidden_chats(user_id, chat_id)");
  }
  if (tableExists("group_removed_members")) {
    db.run("CREATE INDEX IF NOT EXISTS idx_group_removed_members_user ON group_removed_members(user_id, chat_id)");
  }
}

// ─── SQLite helper functions ─────────────────────────────────────────────────

function backfillNullUuids(db, getAll, table) {
  const rows = getAll(`SELECT id FROM ${table} WHERE uuid IS NULL`);
  const nullRows = Array.isArray(rows) ? rows : [];
  for (const row of nullRows) {
    db.run(`UPDATE ${table} SET uuid = ? WHERE id = ?`, [generateUuid(), row.id]);
  }
}

function backfillAllUuids(db, getAll, table) {
  const rows = getAll(`SELECT id FROM ${table}`);
  const allRows = Array.isArray(rows) ? rows : [];
  for (const row of allRows) {
    db.run(`UPDATE ${table} SET uuid = ? WHERE id = ?`, [generateUuid(), row.id]);
  }
}

import Database from "better-sqlite3";
import knex from "knex";
import path from "node:path";
import fs from "node:fs";

/**
 * Cross-Engine Database Converter
 *
 * Supports bidirectional conversions between SQLite and PostgreSQL databases.
 */

const COLUMN_DEFAULTS = {
  users: {
    status: "online",
    role: "user",
    banned: 0,
    verified: 0,
    avatar_encryption_type: "none",
    avatar_storage_driver: "local",
  },
  chats: {
    type: "dm",
    allow_member_invites: 1,
    verified: 0,
    auto_add_new_users: 0,
  },
  chat_members: {
    role: "member",
  },
  chat_messages: {
    edited: 0,
  },
  chat_message_files: {
    storage_driver: "local",
    processing_status: "ready",
    encryption_type: "none",
  },
  chat_mutes: {
    muted: 1,
  },
  remote_channel_sources: {
    provider: "telegram",
    source_version: 1,
    sync_metadata: 0,
    stream_media: 0,
    paused: 0,
    enabled: 0,
  },
  remote_channel_queue: {
    provider: "telegram",
    source_version: 1,
    status: "pending",
    attempts: 0,
  },
};

export async function convertSqliteToPostgres({ sqlitePath, postgresConfig }) {
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite source file not found: ${sqlitePath}`);
  }

  const sqliteDb = new Database(sqlitePath, { readonly: true });
  const pgKnex = knex({
    client: "pg",
    connection: postgresConfig,
    useNullAsDefault: true,
  });

  try {
    const pgTablesRes = await pgKnex.raw(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
    );
    const pgTableNames = new Set(
      (pgTablesRes?.rows || pgTablesRes || []).map((row) => row.table_name)
    );

    const rawTables = sqliteDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'"
      )
      .all()
      .map((row) => row.name);

    const tables = rawTables.filter((table) => pgTableNames.has(table));

    // Sort tables so parent tables (users, chats, meta) come before dependent child tables
    const tablePriority = ["meta", "app_settings", "users", "chats", "remote_channel_sources", "chat_messages"];
    tables.sort((a, b) => {
      const indexA = tablePriority.indexOf(a);
      const indexB = tablePriority.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });

    let replicationRoleSet = false;
    try {
      await pgKnex.raw("SET session_replication_role = 'replica';");
      replicationRoleSet = true;
    } catch (_) {
      // Non-superuser PostgreSQL connections (e.g. managed databases like RDS, Supabase, Render, Neon)
      // do not have permission to set session_replication_role.
    }

    for (const table of tables) {
      const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) continue;

      await pgKnex.raw(`TRUNCATE TABLE "${table}" CASCADE;`);

      const chunkSize = 500;
      const defaults = COLUMN_DEFAULTS[table] || {};
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize).map((row) => {
          const newRow = { ...row };
          for (const [col, defaultVal] of Object.entries(defaults)) {
            if (newRow[col] === null || newRow[col] === undefined) {
              newRow[col] = defaultVal;
            }
          }
          return newRow;
        });
        await pgKnex(table).insert(chunk);
      }
    }

    if (replicationRoleSet) {
      try {
        await pgKnex.raw("SET session_replication_role = 'origin';");
      } catch (_) {}
    }

    for (const table of tables) {
      try {
        await pgKnex.raw(
          `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM "${table}";`
        );
      } catch (_) {
        // Ignore table sequence reset errors
      }
    }

    return {
      success: true,
      tablesConverted: tables.length,
    };
  } finally {
    sqliteDb.close();
    await pgKnex.destroy();
  }
}

export async function convertPostgresToSqlite({ postgresConfig, sqlitePath }) {
  const pgKnex = knex({
    client: "pg",
    connection: postgresConfig,
    useNullAsDefault: true,
  });

  if (fs.existsSync(sqlitePath)) {
    fs.unlinkSync(sqlitePath);
  }

  const targetDir = path.dirname(sqlitePath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const sqliteDb = new Database(sqlitePath);

  try {
    const res = await pgKnex.raw(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name NOT LIKE 'knex_%';"
    );
    const tables = (res?.rows || res || []).map((row) => row.table_name);

    for (const table of tables) {
      const rows = await pgKnex(table).select("*");
      if (!rows.length) continue;

      const firstRow = rows[0];
      const columns = Object.keys(firstRow);
      const colDefs = columns.map((col) => `"${col}" TEXT`).join(", ");

      sqliteDb.exec(`CREATE TABLE IF NOT EXISTS "${table}" (${colDefs});`);

      const placeholders = columns.map(() => "?").join(", ");
      const insertStmt = sqliteDb.prepare(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`
      );

      const insertMany = sqliteDb.transaction((items) => {
        for (const item of items) {
          const values = columns.map((col) => {
            const val = item[col];
            if (val === null || val === undefined) return null;
            if (typeof val === "object") return JSON.stringify(val);
            return String(val);
          });
          insertStmt.run(values);
        }
      });

      insertMany(rows);
    }

    return {
      success: true,
      tablesConverted: tables.length,
    };
  } finally {
    sqliteDb.close();
    await pgKnex.destroy();
  }
}

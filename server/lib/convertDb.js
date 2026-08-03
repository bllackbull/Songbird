import Database from "better-sqlite3";
import knex from "knex";
import path from "node:path";
import fs from "node:fs";

/**
 * Cross-Engine Database Converter
 *
 * Supports bidirectional conversions between SQLite and PostgreSQL databases.
 */

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
    const tables = sqliteDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'"
      )
      .all()
      .map((row) => row.name);

    await pgKnex.raw("SET session_replication_role = 'replica';");

    for (const table of tables) {
      const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) continue;

      await pgKnex(table).truncate({ cascade: true });

      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await pgKnex(table).insert(chunk);
      }
    }

    await pgKnex.raw("SET session_replication_role = 'origin';");

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

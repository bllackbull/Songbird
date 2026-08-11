/**
 * Normalizes SQLite SQL queries into PostgreSQL dialect.
 * Note: Knex.raw handles `?` parameter placeholders natively for PostgreSQL.
 */
export function normalizeSqlForPostgres(sql, params = []) {
  let normalizedSql = sql;
  const normalizedParams = [...params];

  // 1. Replace INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY
  normalizedSql = normalizedSql.replace(
    /INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi,
    "SERIAL PRIMARY KEY"
  );

  // 2. Replace PRAGMA table_info('tableName') -> information_schema.columns
  normalizedSql = normalizedSql.replace(
    /PRAGMA\s+table_info\(['"]?([a-zA-Z0-9_]+)['"]?\)/gi,
    "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$1'"
  );

  // 3. Replace PRAGMA user_version -> meta table query
  normalizedSql = normalizedSql.replace(
    /PRAGMA\s+user_version/gi,
    "SELECT value AS user_version FROM meta WHERE key = 'user_version'"
  );

  // 4. Replace last_insert_rowid() -> LASTVAL()
  normalizedSql = normalizedSql.replace(/last_insert_rowid\(\)/gi, "LASTVAL()");

  // 5. Replace julianday(expr) -> expr
  normalizedSql = normalizedSql.replace(/julianday\(([^)]+)\)/gi, "$1");

  // 6. Replace INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
  const isInsertOrIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/gi.test(normalizedSql);
  normalizedSql = normalizedSql.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO/gi,
    "INSERT INTO"
  );

  // 7. Replace datetime('now', '<offset>') -> text-cast interval expression for TEXT columns
  //    and plain datetime('now') -> CURRENT_TIMESTAMP cast to text
  normalizedSql = normalizedSql.replace(
    /datetime\('now',\s*'([^']+)'\)/gi,
    (_, offset) => {
      // Convert SQLite offset like '-7 days', '+1 hour', '-1 day' to PG interval
      const trimmed = offset.trim();
      const match = trimmed.match(/^([+-]?\d+)\s+(.+)$/);
      if (match) {
        const [, num, unit] = match;
        const sign = num.startsWith("-") ? "-" : "+";
        const absNum = num.replace(/^[+-]/, "");
        return `(CURRENT_TIMESTAMP ${sign} INTERVAL '${absNum} ${unit}')::text`;
      }
      // Fallback: pass as-is interval string
      return `(CURRENT_TIMESTAMP + INTERVAL '${trimmed}')::text`;
    }
  );
  normalizedSql = normalizedSql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP::text");

  // 8. Replace sqlite_master queries -> information_schema.tables
  normalizedSql = normalizedSql.replace(
    /FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=/gi,
    "FROM information_schema.tables WHERE table_schema = 'public' AND table_name ="
  );

  if (isInsertOrIgnore && !normalizedSql.toLowerCase().includes("on conflict")) {
    normalizedSql = `${normalizedSql} ON CONFLICT DO NOTHING`;
  }

  return {
    sql: normalizedSql,
    params: normalizedParams,
  };
}

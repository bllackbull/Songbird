/**
 * Normalizes SQLite SQL queries and parameter placeholders into PostgreSQL dialect.
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

  // 5. Replace INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
  const isInsertOrIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/gi.test(normalizedSql);
  normalizedSql = normalizedSql.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO/gi,
    "INSERT INTO"
  );

  // 6. Replace datetime('now') -> CURRENT_TIMESTAMP
  normalizedSql = normalizedSql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");

  // 7. Replace sqlite_master queries -> information_schema.tables
  normalizedSql = normalizedSql.replace(
    /FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=/gi,
    "FROM information_schema.tables WHERE table_schema = 'public' AND table_name ="
  );

  // 8. Convert ? placeholders into $1, $2, $3...
  let paramIndex = 1;
  normalizedSql = normalizedSql.replace(/\?/g, () => `$${paramIndex++}`);

  if (isInsertOrIgnore && !normalizedSql.toLowerCase().includes("on conflict")) {
    normalizedSql = `${normalizedSql} ON CONFLICT DO NOTHING`;
  }

  return {
    sql: normalizedSql,
    params: normalizedParams,
  };
}

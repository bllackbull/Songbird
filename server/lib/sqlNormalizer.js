/**
 * Normalizes SQLite SQL queries and parameter placeholders into PostgreSQL dialect.
 */
export function normalizeSqlForPostgres(sql, params = []) {
  let normalizedSql = sql;
  const normalizedParams = [...params];

  // 1. Replace INSERT OR IGNORE INTO -> INSERT INTO ... ON CONFLICT DO NOTHING
  normalizedSql = normalizedSql.replace(
    /INSERT\s+OR\s+IGNORE\s+INTO/gi,
    "INSERT INTO"
  );
  const isInsertOrIgnore = /INSERT\s+OR\s+IGNORE\s+INTO/gi.test(sql);

  // 2. Replace datetime('now') -> CURRENT_TIMESTAMP
  normalizedSql = normalizedSql.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");

  // 3. Replace sqlite_master queries -> information_schema.tables
  normalizedSql = normalizedSql.replace(
    /FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=/gi,
    "FROM information_schema.tables WHERE table_schema = 'public' AND table_name ="
  );

  // 4. Convert ? placeholders into $1, $2, $3...
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

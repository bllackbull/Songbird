import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'
import Database from 'better-sqlite3'
import dotenv from 'dotenv'
import { dataDir, serverDir } from './_cli.js'
import { migrations } from '../migrations/index.js'
import { createKnexInstance } from '../db/knex.js'
import { normalizeSqlForPostgres } from '../lib/sqlNormalizer.js'

dotenv.config({ path: path.join(serverDir, '..', '.env'), quiet: true })
dotenv.config({ path: path.join(serverDir, '.env'), override: true, quiet: true })

export const dbPath = path.join(dataDir, 'songbird.db')
export const uploadsDir = path.join(dataDir, 'uploads', 'messages')
export const avatarUploadsDir = path.join(dataDir, 'uploads', 'avatars')
const backupDir = path.join(dataDir, 'backups')

let sqlSingleton = null
const USER_COLORS = [
  '#10b981',
  '#0ea5e9',
  '#f97316',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#f59e0b',
  '#3b82f6',
  '#84cc16',
  '#ec4899',
]

function isPostgresMode() {
  const client = (process.env.DB_CLIENT || 'sqlite3').toLowerCase()
  return client === 'postgres' || client === 'postgresql' || client === 'pg'
}

function getPostgresRows(result) {
  const rows = Array.isArray(result) ? result : result?.rows || []
  return rows.length === 1 && Array.isArray(rows[0]?.rows) ? rows[0].rows : rows
}

function updateSchemaSetsFromSql(sql, tablesSet, columnsSet) {
  if (!sql || typeof sql !== 'string') return

  for (const statement of sql.split(';')) {
    const trimmed = statement.trim()
    if (!trimmed) continue

    const createMatch = trimmed.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`']?([a-zA-Z0-9_]+)["`']?\s*\(([\s\S]+)\)/i,
    )
    if (createMatch) {
      const tableName = createMatch[1].toLowerCase()
      tablesSet.add(tableName)
      for (const column of createMatch[2].split(',')) {
        const columnMatch = column.trim().match(/^(["`']?)([a-zA-Z0-9_]+)\1/)
        if (columnMatch && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)$/i.test(columnMatch[2])) {
          columnsSet.add(`${tableName}.${columnMatch[2].toLowerCase()}`)
        }
      }
    }

    const alterMatch = trimmed.match(
      /ALTER\s+TABLE\s+["`']?([a-zA-Z0-9_]+)["`']?\s+ADD\s+(?:COLUMN\s+)?["`']?([a-zA-Z0-9_]+)["`']?/i,
    )
    if (alterMatch) {
      const tableName = alterMatch[1].toLowerCase()
      tablesSet.add(tableName)
      columnsSet.add(`${tableName}.${alterMatch[2].toLowerCase()}`)
    }
  }
}

async function getSql() {
  if (sqlSingleton) return sqlSingleton
  sqlSingleton = await initSqlJs({
    locateFile: (file) => path.resolve(serverDir, 'node_modules', 'sql.js', 'dist', file),
  })
  return sqlSingleton
}

export async function openDatabase(options = {}) {
  const { inMemory = false, dbPath: customDbPath = null, skipMigrations = false } = options
  const isInMemory = Boolean(inMemory || customDbPath === ':memory:')
  const targetDbPath = isInMemory ? ':memory:' : customDbPath || dbPath

  if (!isInMemory && !fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const isPostgres = isPostgresMode()
  let db = null
  let isBetter = false

  if (isPostgres) {
    db = createKnexInstance()
  } else {
    try {
      db = new Database(targetDbPath)
      db.pragma('journal_mode = WAL')
      isBetter = true
    } catch (err) {
      const SQL = await getSql()
      const fileExists = isInMemory ? false : fs.existsSync(targetDbPath)
      const fileBuffer = !isInMemory && fileExists ? fs.readFileSync(targetDbPath) : null
      db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database()
    }
  }

  const fileExists = isInMemory ? false : fs.existsSync(targetDbPath)

  const extractSqlAndParams = (sqlOrBuilder, params = []) => {
    if (sqlOrBuilder && typeof sqlOrBuilder.toSQL === 'function') {
      const compiled = sqlOrBuilder.toSQL()
      return { sql: compiled.sql, params: compiled.bindings || [] }
    }
    return { sql: sqlOrBuilder, params }
  }

  const getRow = (sqlOrBuilder, params = []) => {
    const { sql, params: normParamsInput } = extractSqlAndParams(sqlOrBuilder, params)
    if (isPostgres) {
      const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, normParamsInput)
      const result = db.raw(normSql, normParams)
      if (result && typeof result.then === 'function') {
        return result
          .then((res) => {
            const rows = getPostgresRows(res)
            return rows[0] || null
          })
      }
      const rows = getPostgresRows(result)
      return rows[0] || null
    }

    const normalizedParams = Array.isArray(normParamsInput) ? normParamsInput : [normParamsInput]
    if (isBetter) {
      const stmt = db.prepare(sql)
      return stmt.get(...normalizedParams) || null
    }

    const stmt = db.prepare(sql)
    stmt.bind(normalizedParams)
    const row = stmt.step() ? stmt.getAsObject() : null
    stmt.free()
    return row
  }

  const getAll = (sqlOrBuilder, params = []) => {
    const { sql, params: normParamsInput } = extractSqlAndParams(sqlOrBuilder, params)
    if (isPostgres) {
      const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, normParamsInput)
      const result = db.raw(normSql, normParams)
      if (result && typeof result.then === 'function') {
        return result.then(getPostgresRows)
      }
      return getPostgresRows(result)
    }

    const normalizedParams = Array.isArray(normParamsInput) ? normParamsInput : [normParamsInput]
    if (isBetter) {
      const stmt = db.prepare(sql)
      return stmt.all(...normalizedParams)
    }

    const stmt = db.prepare(sql)
    stmt.bind(normalizedParams)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  }

  const run = (sqlOrBuilder, params = []) => {
    const { sql, params: normParamsInput } = extractSqlAndParams(sqlOrBuilder, params)
    if (isPostgres) {
      const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, normParamsInput)
      const result = db.raw(normSql, normParams)
      if (result && typeof result.then === 'function') {
        return result
          .then((res) => {
            if (typeof res?.rowCount === 'number') return res.rowCount
            const rows = getPostgresRows(res)
            return rows.length
          })
      }
      if (typeof result?.rowCount === 'number') return result.rowCount
      const rows = getPostgresRows(result)
      return rows.length
    }

    const normalizedParams = Array.isArray(normParamsInput) ? normParamsInput : [normParamsInput]
    if (isBetter) {
      const stmt = db.prepare(sql)
      const info = stmt.run(...normalizedParams)
      return info.changes
    }

    const stmt = db.prepare(sql)
    stmt.bind(normalizedParams)
    stmt.step()
    stmt.free()
  }

  const tableExists = (name) => {
    const res = getRow("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name])
    if (res && typeof res.then === 'function') {
      return res.then((row) => Boolean(row))
    }
    return Boolean(res)
  }

  const hasColumn = (tableName, columnName) => {
    if (isPostgres) {
      const res = getAll(
        `SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?`,
        [tableName],
      )
      if (res && typeof res.then === 'function') {
        return res.then((rows) => Array.isArray(rows) && rows.some((col) => col.name === columnName))
      }
      return Array.isArray(res) && res.some((col) => col.name === columnName)
    }
    const res = getAll(`PRAGMA table_info('${tableName}')`)
    if (res && typeof res.then === 'function') {
      return res.then((rows) => Array.isArray(rows) && rows.some((col) => col.name === columnName))
    }
    return Array.isArray(res) && res.some((col) => col.name === columnName)
  }

  const getSchemaVersion = () => {
    if (isPostgres) {
      return getRow("SELECT value AS user_version FROM meta WHERE key = 'user_version'")
        .then((row) => Number(row?.user_version || 0))
    }
    const res = getRow('PRAGMA user_version')
    if (res && typeof res.then === 'function') {
      return res.then((row) => Number(row?.user_version || 0)).catch(() => 0)
    }
    return Number(res?.user_version || 0)
  }

  const setSchemaVersion = async (version) => {
    if (isPostgres) {
      await run(
        "INSERT INTO meta (key, value) VALUES ('user_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [String(Number(version) || 0)],
      )
      return
    }
    if (isBetter) {
      db.pragma(`user_version = ${Number(version) || 0}`)
    } else {
      db.run(`PRAGMA user_version = ${Number(version) || 0}`)
    }
  }

  const getRandomUserColor = () => {
    const index = Math.floor(Math.random() * USER_COLORS.length)
    return USER_COLORS[index]
  }

  const createPreMigrationBackup = (fromVersion, toVersion) => {
    if (isPostgres || isInMemory || !fileExists || !fs.existsSync(targetDbPath)) return
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(
      backupDir,
      `songbird-pre-migration-v${fromVersion}-to-v${toVersion}-${stamp}.db`,
    )
    fs.copyFileSync(targetDbPath, backupPath)
  }

  const schemaVersionBeforeMigrations = isPostgres
    ? await db.raw(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).then(() => getSchemaVersion())
    : await getSchemaVersion()
  const tablesSet = new Set()
  const columnsSet = new Set()
  if (isPostgres) {
    const schemaResult = await db.raw(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `)
    for (const row of getPostgresRows(schemaResult)) {
      const tableName = String(row.table_name || '').toLowerCase()
      const columnName = String(row.column_name || '').toLowerCase()
      tablesSet.add(tableName)
      columnsSet.add(`${tableName}.${columnName}`)
    }
  }
  const migrationPromiseChain = { current: Promise.resolve() }
  const migrationContext = {
    db: {
      run: (sql, params = []) => {
        if (!isPostgres) return run(sql, params)
        const operation = migrationPromiseChain.current.then(async () => {
          const result = await run(sql, params)
          updateSchemaSetsFromSql(sql, tablesSet, columnsSet)
          return result
        })
        migrationPromiseChain.current = operation.catch(() => {})
        return operation
      },
      exec: (sql) => {
        if (!isPostgres) return isBetter ? db.exec(sql) : db?.exec(sql)
        const operation = migrationPromiseChain.current.then(async () => {
          const result = await db.raw(sql)
          updateSchemaSetsFromSql(sql, tablesSet, columnsSet)
          return result
        })
        migrationPromiseChain.current = operation.catch(() => {})
        return operation
      },
      prepare: (sql) => (isBetter ? db.prepare(sql) : null),
    },
    getAll: (sql, params = []) => {
      if (!isPostgres) return getAll(sql, params)
      const operation = migrationPromiseChain.current.then(() => getAll(sql, params))
      migrationPromiseChain.current = operation.catch(() => {})
      return operation
    },
    tableExists: (name) => isPostgres ? tablesSet.has(String(name || '').toLowerCase()) : tableExists(name),
    hasColumn: (tableName, columnName) => isPostgres
      ? columnsSet.has(`${String(tableName || '').toLowerCase()}.${String(columnName || '').toLowerCase()}`)
      : hasColumn(tableName, columnName),
    getRandomUserColor,
    setUserColor: getRandomUserColor,
  }

  if (!skipMigrations) {
    const orderedMigrations = [...migrations].sort((a, b) => a.version - b.version)
    const latestVersion = orderedMigrations.length
      ? Math.max(...orderedMigrations.map((migration) => Number(migration.version) || 0))
      : 0
    if (!isInMemory && schemaVersionBeforeMigrations < latestVersion) {
      createPreMigrationBackup(schemaVersionBeforeMigrations, latestVersion)
    }
    for (const migration of orderedMigrations) {
      const currentVersion = await getSchemaVersion()
      if (currentVersion >= migration.version) continue
      await migration.up(migrationContext)
      await migrationPromiseChain.current
      await setSchemaVersion(migration.version)
    }
    for (const migration of orderedMigrations) {
      await migration.up(migrationContext)
    }
    if ((await getSchemaVersion()) < latestVersion) {
      await setSchemaVersion(latestVersion)
    }
  }

  const transaction = async (callback) => {
    if (!isPostgres) {
      throw new Error("Connection-bound transactions are only available in PostgreSQL mode")
    }
    return db.transaction(async (trx) => callback({
      raw: (sql, params = []) => {
        const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, params)
        return trx.raw(normSql, normParams)
      },
    }))
  }

  const save = () => {
    if (isPostgres || isBetter || isInMemory) return
    if (typeof db?.export === 'function') {
      const data = db.export()
      fs.writeFileSync(targetDbPath, Buffer.from(data))
    }
  }

  if (!isInMemory && (await getSchemaVersion()) !== schemaVersionBeforeMigrations) {
    save()
  }

  const close = async () => {
    if (isPostgres) {
      if (typeof db?.destroy === 'function') {
        await db.destroy()
      }
    } else if (isBetter) {
      if (typeof db?.close === 'function') {
        db.close()
      }
    } else if (typeof db?.close === 'function') {
      db.close()
    }
  }

  return {
    db,
    getRow,
    getAll,
    run,
    save,
    transaction,
    close,
    fileExists,
    tableExists,
    hasColumn,
    getSchemaVersion,
    setSchemaVersion,
    migrationContext,
  }
}

export function removeStoredFiles(storedNames = []) {
  if (!Array.isArray(storedNames) || storedNames.length === 0) return { removed: 0, missing: 0 }
  let removed = 0
  let missing = 0
  storedNames.forEach((storedName) => {
    const safeName = String(storedName || '').trim()
    if (!safeName) return
    const filePath = path.join(uploadsDir, safeName)
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
      removed += 1
    } else {
      missing += 1
    }
  })
  return { removed, missing }
}

export function removeAvatarFiles(fileNames = []) {
  if (!Array.isArray(fileNames) || fileNames.length === 0) return { removed: 0, missing: 0 }
  let removed = 0
  let missing = 0
  fileNames.forEach((name) => {
    const safeName = path.basename(String(name || '').trim())
    if (!safeName) return
    const filePath = path.join(avatarUploadsDir, safeName)
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true })
      removed += 1
    } else {
      missing += 1
    }
  })
  return { removed, missing }
}

export function chunkArray(items = [], size = 500) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function detectRunningServer() {
  const port = Number(process.env.PORT || process.env.SERVER_PORT || 5174)
  const timeoutMs = 600
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    return res.ok ? { running: true, port } : { running: false, port }
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (message.includes('aborted')) {
      return { running: false, port }
    }
    return { running: false, port }
  } finally {
    clearTimeout(timer)
  }
}

export async function runAdminActionViaServer(action, payload = {}) {
  const { running, port } = await detectRunningServer()
  if (!running) return null

  const headers = { 'Content-Type': 'application/json' }
  if (process.env.ADMIN_API_TOKEN) {
    headers['x-songbird-admin-token'] = process.env.ADMIN_API_TOKEN
  }

  const res = await fetch(`http://127.0.0.1:${port}/api/admin/db-tools`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, payload }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `Server admin action failed (${res.status}).`)
  }
  return data?.result || data || { ok: true }
}

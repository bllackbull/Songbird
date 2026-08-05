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

async function getSql() {
  if (sqlSingleton) return sqlSingleton
  sqlSingleton = await initSqlJs({
    locateFile: (file) => path.resolve(serverDir, 'node_modules', 'sql.js', 'dist', file),
  })
  return sqlSingleton
}

export async function openDatabase() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const isPostgres = isPostgresMode()
  let db = null
  let isBetter = false

  if (isPostgres) {
    db = createKnexInstance()
  } else {
    try {
      db = new Database(dbPath)
      db.pragma('journal_mode = WAL')
      isBetter = true
    } catch (err) {
      const SQL = await getSql()
      const fileExists = fs.existsSync(dbPath)
      const fileBuffer = fileExists ? fs.readFileSync(dbPath) : null
      db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database()
    }
  }

  const fileExists = fs.existsSync(dbPath)

  const getRow = (sql, params = []) => {
    if (isPostgres) {
      const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, params)
      const result = db.raw(normSql, normParams)
      if (result && typeof result.then === 'function') {
        return result
          .then((res) => {
            const rows = Array.isArray(res) ? res : res?.rows || []
            return rows[0] || null
          })
          .catch(() => null)
      }
      const rows = Array.isArray(result) ? result : result?.rows || []
      return rows[0] || null
    }

    const normalizedParams = Array.isArray(params) ? params : [params]
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

  const getAll = (sql, params = []) => {
    if (isPostgres) {
      const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, params)
      const result = db.raw(normSql, normParams)
      if (result && typeof result.then === 'function') {
        return result
          .then((res) => {
            return Array.isArray(res) ? res : res?.rows || []
          })
          .catch(() => [])
      }
      return Array.isArray(result) ? result : result?.rows || []
    }

    const normalizedParams = Array.isArray(params) ? params : [params]
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

  const run = (sql, params = []) => {
    if (isPostgres) {
      const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, params)
      const result = db.raw(normSql, normParams)
      if (result && typeof result.then === 'function') {
        return result
          .then((res) => {
            if (typeof res?.rowCount === 'number') return res.rowCount
            const rows = Array.isArray(res) ? res : res?.rows || []
            return rows.length
          })
          .catch(() => 0)
      }
      if (typeof result?.rowCount === 'number') return result.rowCount
      const rows = Array.isArray(result) ? result : result?.rows || []
      return rows.length
    }

    const normalizedParams = Array.isArray(params) ? params : [params]
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
      return res.then((row) => Boolean(row)).catch(() => false)
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
        return res
          .then((rows) => Array.isArray(rows) && rows.some((col) => col.name === columnName))
          .catch(() => false)
      }
      return Array.isArray(res) && res.some((col) => col.name === columnName)
    }
    const res = getAll(`PRAGMA table_info('${tableName}')`)
    if (res && typeof res.then === 'function') {
      return res
        .then((rows) => Array.isArray(rows) && rows.some((col) => col.name === columnName))
        .catch(() => false)
    }
    return Array.isArray(res) && res.some((col) => col.name === columnName)
  }

  const getSchemaVersion = () => {
    const res = getRow('PRAGMA user_version')
    if (res && typeof res.then === 'function') {
      return res.then((row) => Number(row?.user_version || 0)).catch(() => 0)
    }
    return Number(res?.user_version || 0)
  }

  const setSchemaVersion = (version) => {
    if (isPostgres) return
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
    if (isPostgres || !fileExists || !fs.existsSync(dbPath)) return
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(
      backupDir,
      `songbird-pre-migration-v${fromVersion}-to-v${toVersion}-${stamp}.db`,
    )
    fs.copyFileSync(dbPath, backupPath)
  }

  const schemaVersionBeforeMigrations = await getSchemaVersion()
  const migrationContext = {
    db: {
      run: (sql, params = []) => run(sql, params),
      exec: (sql) => (isBetter ? db.exec(sql) : isPostgres ? db.raw(sql) : db?.exec(sql)),
      prepare: (sql) => (isBetter ? db.prepare(sql) : isPostgres ? null : db?.prepare(sql)),
    },
    getAll: (sql, params = []) => {
      const res = getAll(sql, params)
      if (res && typeof res.then === 'function') {
        res.catch(() => [])
        return []
      }
      return Array.isArray(res) ? res : []
    },
    tableExists,
    hasColumn,
    getRandomUserColor,
    setUserColor: getRandomUserColor,
  }
  const orderedMigrations = [...migrations].sort((a, b) => a.version - b.version)
  const latestVersion = orderedMigrations.length
    ? Math.max(...orderedMigrations.map((migration) => Number(migration.version) || 0))
    : 0
  if (schemaVersionBeforeMigrations < latestVersion) {
    createPreMigrationBackup(schemaVersionBeforeMigrations, latestVersion)
  }
  for (const migration of orderedMigrations) {
    const currentVersion = await getSchemaVersion()
    if (currentVersion >= migration.version) continue
    await migration.up(migrationContext)
    setSchemaVersion(migration.version)
  }
  for (const migration of orderedMigrations) {
    await migration.up(migrationContext)
  }
  if ((await getSchemaVersion()) < latestVersion) {
    setSchemaVersion(latestVersion)
  }

  const save = () => {
    if (isPostgres || isBetter) return
    if (typeof db?.export === 'function') {
      const data = db.export()
      fs.writeFileSync(dbPath, Buffer.from(data))
    }
  }

  if ((await getSchemaVersion()) !== schemaVersionBeforeMigrations) {
    save()
  }

  const close = () => {
    if (isPostgres) {
      if (typeof db?.destroy === 'function') {
        db.destroy()
      }
    } else if (isBetter) {
      if (typeof db?.close === 'function') {
        db.close()
      }
    } else if (typeof db?.close === 'function') {
      db.close()
    }
  }

  return { db, getRow, getAll, run, save, close, fileExists }
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
  const port = Number(process.env.SERVER_PORT || process.env.PORT || 5174)
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

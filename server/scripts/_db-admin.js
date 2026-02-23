import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'
import { dataDir, serverDir } from './_cli.js'

export const dbPath = path.join(dataDir, 'songbird.db')
export const uploadsDir = path.join(dataDir, 'uploads', 'messages')
export const avatarUploadsDir = path.join(dataDir, 'uploads', 'avatars')

let sqlSingleton = null

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
  const SQL = await getSql()
  const fileExists = fs.existsSync(dbPath)
  const fileBuffer = fileExists ? fs.readFileSync(dbPath) : null
  const db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database()

  const getRow = (sql, params = []) => {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const row = stmt.step() ? stmt.getAsObject() : null
    stmt.free()
    return row
  }

  const getAll = (sql, params = []) => {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
  }

  const run = (sql, params = []) => {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    stmt.step()
    stmt.free()
  }

  const save = () => {
    const data = db.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  }

  const close = () => {
    db.close()
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
  const port = Number(process.env.PORT || 5174)
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

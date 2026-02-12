import fs from 'node:fs'
import path from 'node:path'

const dataDir = path.resolve(process.cwd(), '..', 'data')
const dbPath = path.join(dataDir, 'songbird.db')
const backupDir = path.join(dataDir, 'backups')

if (!fs.existsSync(dbPath)) {
  console.error(`Database file not found at ${dbPath}`)
  process.exit(1)
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

const now = new Date()
const stamp = now.toISOString().replace(/[:.]/g, '-')
const backupPath = path.join(backupDir, `songbird-${stamp}.db`)

fs.copyFileSync(dbPath, backupPath)
console.log(`Backup created: ${backupPath}`)

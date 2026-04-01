import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const dataDir = path.resolve(process.cwd(), '..', 'data')
const dbPath = path.join(dataDir, 'songbird.db')
const uploadsDir = path.join(dataDir, 'uploads')
const backupDir = path.join(dataDir, 'backups')

if (!fs.existsSync(dbPath) && !fs.existsSync(uploadsDir)) {
  console.error(`No data found in ${dataDir}. Missing songbird.db and uploads/.`)
  process.exit(1)
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

const now = new Date()
const stamp = now.toISOString().replace(/[:.]/g, '-')
const backupPath = path.join(backupDir, `songbird-backup-${stamp}.zip`)

const zipBinary = process.env.ZIP_BIN || 'zip'
const entries = []
if (fs.existsSync(dbPath)) entries.push('songbird.db')
if (fs.existsSync(uploadsDir)) entries.push('uploads')

if (!entries.length) {
  console.error('Nothing to back up.')
  process.exit(1)
}

try {
  execFileSync(zipBinary, ['-r', backupPath, ...entries], {
    cwd: dataDir,
    stdio: 'pipe',
  })
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.error('zip command not found. Install zip and retry.')
  } else {
    console.error(`Backup failed: ${error?.message || error}`)
  }
  process.exit(1)
}

console.log(`Backup created: ${backupPath}`)

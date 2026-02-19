import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(scriptDir, '..')
const dataDir = path.resolve(serverDir, '..', 'data')
const dbPath = path.join(dataDir, 'songbird.db')
const uploadsDir = path.join(dataDir, 'uploads', 'messages')

const args = process.argv.slice(2).map((arg) => String(arg).trim().toLowerCase())
const hasForceFlag =
  args.includes('--yes') ||
  args.includes('-y') ||
  process.env.SONGBIRD_FORCE_DELETE === '1'

async function confirmDelete() {
  if (hasForceFlag) return true
  if (!input.isTTY) {
    console.error('Refusing to delete database in non-interactive mode without -y/--yes.')
    console.error('Run: npm run db:delete -- --yes')
    process.exit(1)
  }

  const rl = readline.createInterface({ input, output })
  try {
    while (true) {
      const answer = (
        await rl.question('This will permanently delete database and uploaded message files. Continue? (y/n): ')
      )
        .trim()
        .toLowerCase()
      if (answer === 'y' || answer === 'yes') return true
      if (answer === 'n' || answer === 'no') return false
    }
  } finally {
    rl.close()
  }
}

const confirmed = await confirmDelete()
if (!confirmed) {
  console.log('Aborted.')
  process.exit(0)
}

let removedDb = false
let removedUploads = false

if (fs.existsSync(dbPath)) {
  fs.rmSync(dbPath, { force: true })
  removedDb = true
}

if (fs.existsSync(uploadsDir)) {
  fs.rmSync(uploadsDir, { recursive: true, force: true })
  removedUploads = true
}

console.log(`Data directory: ${dataDir}`)
console.log(`Database removed: ${removedDb ? 'yes' : 'no (not found)'}`)
console.log(`Message uploads removed: ${removedUploads ? 'yes' : 'no (not found)'}`)
console.log('Deletion complete. Start the server to recreate a fresh database.')

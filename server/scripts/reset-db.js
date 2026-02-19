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
  process.env.SONGBIRD_FORCE_RESET === '1'
const hasNoRecreateFlag = args.includes('--no-recreate')
const hasRecreateFlag = args.includes('--recreate')

async function confirmReset() {
  if (hasForceFlag) return true
  if (!input.isTTY) {
    console.error('Refusing to reset database in non-interactive mode without -y/--yes.')
    console.error('Run: npm run db:reset -- --yes')
    process.exit(1)
  }

  const rl = readline.createInterface({ input, output })
  try {
    while (true) {
      const answer = (
        await rl.question('This will reset database and delete uploaded message files. Continue? (y/n): ')
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

async function confirmRecreate() {
  if (hasNoRecreateFlag) return false
  if (hasRecreateFlag || hasForceFlag) return true
  if (!input.isTTY) return false

  const rl = readline.createInterface({ input, output })
  try {
    while (true) {
      const answer = (
        await rl.question('Recreate a fresh database now? (y/n): ')
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

const confirmed = await confirmReset()
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
console.log(`Database reset: ${removedDb ? 'yes' : 'no (not found)'}`)
console.log(`Message uploads removed: ${removedUploads ? 'yes' : 'no (not found)'}`)

const shouldRecreate = await confirmRecreate()
if (!shouldRecreate) {
  console.log('Reset complete. Database recreation skipped.')
  process.exit(0)
}

await import('../db.js')
const recreated = fs.existsSync(dbPath)
console.log(`Database recreated: ${recreated ? 'yes' : 'no'}`)
if (recreated) {
  console.log('Reset complete with fresh database.')
} else {
  console.log('Reset complete, but database recreation failed.')
  process.exit(1)
}

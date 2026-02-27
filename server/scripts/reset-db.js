import fs from 'node:fs'
import path from 'node:path'
import { dataDir, getCliArgs, hasForceYes, confirmAction } from './_cli.js'
import { runAdminActionViaServer } from './_db-admin.js'
const dbPath = path.join(dataDir, 'songbird.db')
const uploadsDir = path.join(dataDir, 'uploads', 'messages')

const args = getCliArgs()
const hasForceFlag = hasForceYes(args) || process.env.SONGBIRD_FORCE_RESET === '1'
const hasNoRecreateFlag = args.includes('--no-recreate')
const hasRecreateFlag = args.includes('--recreate')

const confirmed = await confirmAction({
  prompt: 'This will reset database and delete uploaded message files. Continue?',
  force: hasForceFlag,
  forceHint: 'Refusing to reset database in non-interactive mode without -y/--yes. Run: npm run db:reset -- -y',
})
if (!confirmed) {
  console.log('Aborted.')
  process.exit(0)
}

const remoteResult = await runAdminActionViaServer('reset_db')
if (remoteResult) {
  console.log('Server mode: database content reset while server is running.')
  console.log('Reset complete with existing schema.')
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

const shouldRecreate =
  hasNoRecreateFlag
    ? false
    : hasRecreateFlag || hasForceFlag
      ? true
      : await confirmAction({
          prompt: 'Recreate a fresh database now?',
          force: false,
        })
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

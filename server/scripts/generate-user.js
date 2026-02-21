import bcrypt from 'bcryptjs'
import { getCliArgs, getPositionalArgs, getFlagValue } from './_cli.js'
import { openDatabase, runAdminActionViaServer } from './_db-admin.js'

function randomToken(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let output = ''
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)]
  }
  return output
}

const args = getCliArgs()
const positional = getPositionalArgs(args)
const amountRaw = getFlagValue(args, '--count') || positional[0] || '10'
const amount = Math.max(1, Math.min(5000, Number(amountRaw) || 0))
const password = getFlagValue(args, '--password') || positional[1] || 'Passw0rd!'
const nicknamePrefix = getFlagValue(args, '--nickname-prefix') || 'User'
const usernamePrefix = getFlagValue(args, '--username-prefix') || 'user'

if (!amount) {
  console.error('Usage: npm run db:user:generate -- --count 50 --password "Passw0rd!"')
  process.exit(1)
}

const remoteResult = await runAdminActionViaServer('generate_users', {
  count: amount,
  password,
  nicknamePrefix,
  usernamePrefix,
})
if (remoteResult) {
  console.log(`Server mode generated users: ${remoteResult.created ?? 0}`)
  console.log(`Default password for generated users: ${remoteResult.password || password}`)
  process.exit(0)
}

const dbApi = await openDatabase()
try {
  const passwordHash = await bcrypt.hash(password, 10)
  const existingRows = dbApi.getAll('SELECT username FROM users')
  const usedUsernames = new Set(existingRows.map((row) => String(row.username || '').toLowerCase()))

  let created = 0
  dbApi.run('BEGIN')
  try {
    for (let i = 0; i < amount; i += 1) {
      let username = ''
      do {
        username = `${usernamePrefix}_${randomToken(8)}`.toLowerCase()
      } while (usedUsernames.has(username))
      usedUsernames.add(username)
      const nickname = `${nicknamePrefix} ${created + 1}`
      dbApi.run(
        'INSERT INTO users (username, nickname, avatar_url, color, status, password_hash, created_at, last_seen) VALUES (?, ?, NULL, NULL, ?, ?, datetime("now"), datetime("now"))',
        [username, nickname, 'online', passwordHash],
      )
      created += 1
    }
    dbApi.run('COMMIT')
  } catch (error) {
    dbApi.run('ROLLBACK')
    throw error
  }

  dbApi.save()
  console.log(`Generated users: ${created}`)
  console.log(`Default password for generated users: ${password}`)
} finally {
  dbApi.close()
}

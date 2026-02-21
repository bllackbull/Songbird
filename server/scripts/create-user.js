import bcrypt from 'bcryptjs'
import { getCliArgs, getPositionalArgs, getFlagValue } from './_cli.js'
import { openDatabase, runAdminActionViaServer } from './_db-admin.js'

const USERNAME_REGEX = /^[a-z0-9._-]+$/

const args = getCliArgs()
const positional = getPositionalArgs(args)
const nickname = getFlagValue(args, '--nickname') || positional[0] || ''
const username = getFlagValue(args, '--username') || positional[1] || ''
const password = getFlagValue(args, '--password') || positional[2] || ''

if (!username || !password) {
  console.error('Usage: npm run db:user:create -- --nickname "Display Name" --username your_username --password your_password')
  console.error('Or positional: npm run db:user:create -- "Display Name" your_username your_password')
  process.exit(1)
}

if (!USERNAME_REGEX.test(username)) {
  console.error('Invalid username. Allowed: lowercase english letters, numbers, ., _, -')
  process.exit(1)
}

const remoteResult = await runAdminActionViaServer('create_user', {
  nickname,
  username,
  password,
})
if (remoteResult) {
  console.log(`Server mode user created: id=${remoteResult.id} username=${remoteResult.username}`)
  process.exit(0)
}

const dbApi = await openDatabase()
try {
  const exists = dbApi.getRow('SELECT id FROM users WHERE username = ?', [username])
  if (exists?.id) {
    console.error(`Username already exists: ${username}`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  dbApi.run(
    'INSERT INTO users (username, nickname, avatar_url, color, status, password_hash, created_at, last_seen) VALUES (?, ?, NULL, NULL, ?, ?, datetime("now"), datetime("now"))',
    [username, nickname || username, 'online', passwordHash],
  )

  const row = dbApi.getRow('SELECT id, username, nickname FROM users WHERE username = ?', [username])
  dbApi.save()
  console.log(`User created: id=${row.id} username=${row.username} nickname=${row.nickname || ''}`)
} finally {
  dbApi.close()
}

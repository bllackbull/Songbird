import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { getCliArgs, getPositionalArgs, getFlagValue } from './_cli.js'
import { openDatabase, runAdminActionViaServer } from './_db-admin.js'
import { setUserColor } from '../settings/colors.js'

const clampEnvInt = (value, fallback, { min, max } = {}) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const intValue = Math.trunc(parsed)
  if (min !== undefined && intValue < min) return fallback
  if (max !== undefined && intValue > max) return fallback
  return intValue
}
const USERNAME_MAX = clampEnvInt(process.env.USERNAME_MAX, 16, { min: 3, max: 32 })
const NICKNAME_MAX = clampEnvInt(process.env.NICKNAME_MAX, 24, { min: 3, max: 64 })

function randomToken(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let output = ''
  for (let i = 0; i < length; i += 1) {
    output += chars[crypto.randomInt(0, chars.length)]
  }
  return output
}

const args = getCliArgs()
const positional = getPositionalArgs(args)
const envCount = process.env.npm_config_count || process.env.npm_config_counts || ''
const envPassword = process.env.npm_config_password || ''
const amountRaw = getFlagValue(args, '--count') || envCount || positional[0] || '10'
const amount = Math.max(1, Math.min(5000, Number(amountRaw) || 0))
const password = getFlagValue(args, '--password') || envPassword || positional[1] || 'Passw0rd!'
const nicknamePrefix = getFlagValue(args, '--nickname-prefix') || 'User'
const usernamePrefix = getFlagValue(args, '--username-prefix') || 'user'
const maxUsername = Math.max(3, Number(USERNAME_MAX || 16))
const maxNickname = Math.max(3, Number(NICKNAME_MAX || 24))
const maxPrefixLen = Math.max(1, maxUsername - 2)
const clampPrefix = (value, maxLen) => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed
}

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
  console.log('Default password was set from the CLI argument or default value.')
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
        const basePrefix = clampPrefix(usernamePrefix, maxPrefixLen)
        const safePrefix = basePrefix.length >= 1 ? basePrefix : clampPrefix('user', maxPrefixLen)
        const tokenBudget = Math.max(1, maxUsername - safePrefix.length - 1)
        const token = randomToken(Math.min(12, tokenBudget))
        username = `${safePrefix}_${token}`.toLowerCase().slice(0, maxUsername)
      } while (usedUsernames.has(username))
      usedUsernames.add(username)
      const rawNickname = `${nicknamePrefix} ${created + 1}`
      const nickname =
        rawNickname.length > maxNickname ? rawNickname.slice(0, maxNickname) : rawNickname
      const assignedColor = setUserColor()
      dbApi.run(
        'INSERT INTO users (username, nickname, avatar_url, color, status, password_hash, created_at, last_seen) VALUES (?, ?, NULL, ?, ?, ?, datetime("now"), datetime("now"))',
        [username, nickname, assignedColor, 'online', passwordHash],
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
  console.log('Default password was set from the CLI argument or default value.')
} finally {
  dbApi.close()
}

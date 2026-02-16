import path from 'node:path'
import fs from 'node:fs'
import initSqlJs from 'sql.js'
import { migrations } from './migrations/index.js'

const dataDir = path.resolve(process.cwd(), '..', 'data')
const dbPath = path.join(dataDir, 'songbird.db')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const SQL = await initSqlJs({
  locateFile: (file) => path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
})

const fileExists = fs.existsSync(dbPath)
const fileBuffer = fileExists ? fs.readFileSync(dbPath) : null
const db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database()

function saveDatabase() {
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

function getRow(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const row = stmt.step() ? stmt.getAsObject() : null
  stmt.free()
  return row
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function run(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  stmt.step()
  stmt.free()
  saveDatabase()
}

function getLastInsertId() {
  const row = getRow('SELECT last_insert_rowid() AS id')
  return row?.id
}

function tableExists(name) {
  return Boolean(getRow("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]))
}

function hasColumn(tableName, columnName) {
  return getAll(`PRAGMA table_info('${tableName}')`).some((col) => col.name === columnName)
}

function getSchemaVersion() {
  const row = getRow('PRAGMA user_version')
  return Number(row?.user_version || 0)
}

function setSchemaVersion(version) {
  db.run(`PRAGMA user_version = ${Number(version) || 0}`)
}

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

function getRandomUserColor() {
  const index = Math.floor(Math.random() * USER_COLORS.length)
  return USER_COLORS[index]
}

function runDatabaseMigrations() {
  const migrationContext = {
    db,
    getAll,
    tableExists,
    hasColumn,
    getRandomUserColor,
  }
  const orderedMigrations = [...migrations].sort((a, b) => a.version - b.version)

  orderedMigrations.forEach((migration) => {
    if (getSchemaVersion() >= migration.version) return
    migration.up(migrationContext)
    setSchemaVersion(migration.version)
  })
}

runDatabaseMigrations()

saveDatabase()

export function getCurrentSchemaVersion() {
  return getSchemaVersion()
}

export function findUserByUsername(username) {
  return getRow(
    'SELECT id, username, nickname, avatar_url, color, status, password_hash FROM users WHERE username = ?',
    [username]
  )
}

export function findUserById(id) {
  return getRow(
    'SELECT id, username, nickname, avatar_url, color, status, password_hash FROM users WHERE id = ?',
    [id]
  )
}

export function listUsers(excludeUsername) {
  if (excludeUsername) {
    return getAll(
      'SELECT id, username, nickname, avatar_url, color, status FROM users WHERE username != ? ORDER BY username',
      [excludeUsername]
    )
  }
  return getAll('SELECT id, username, nickname, avatar_url, color, status FROM users ORDER BY username')
}

export function searchUsers(query, excludeUsername) {
  const like = `%${query}%`
  if (excludeUsername) {
    return getAll(
      'SELECT id, username, nickname, avatar_url, color, status FROM users WHERE username != ? AND (username LIKE ? OR nickname LIKE ?) ORDER BY username',
      [excludeUsername, like, like]
    )
  }
  return getAll(
    'SELECT id, username, nickname, avatar_url, color, status FROM users WHERE username LIKE ? OR nickname LIKE ? ORDER BY username',
    [like, like]
  )
}

export function createUser(username, passwordHash, nickname = null, avatarUrl = null, color = null) {
  const nextColor = color || getRandomUserColor()
  run(
    'INSERT INTO users (username, nickname, avatar_url, color, password_hash, last_seen) VALUES (?, ?, ?, ?, ?, datetime("now"))',
    [username, nickname, avatarUrl, nextColor, passwordHash]
  )
  return getLastInsertId()
}

export function findDmChat(userId, otherUserId) {
  const row = getRow(
    `
    SELECT c.id
    FROM chats c
    JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
    JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
    WHERE c.type = 'dm'
    LIMIT 1
  `,
    [userId, otherUserId]
  )
  return row?.id || null
}

export function createChat(name, type = 'dm') {
  run('INSERT INTO chats (name, type) VALUES (?, ?)', [name || null, type])
  const id = getLastInsertId()
  if (id) return id
  const fallback = getRow('SELECT id FROM chats ORDER BY id DESC LIMIT 1')
  return fallback?.id || null
}

export function addChatMember(chatId, userId, role = 'member') {
  run(
    'INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)',
    [chatId, userId, role]
  )
}

export function isMember(chatId, userId) {
  const row = getRow('SELECT chat_id FROM chat_members WHERE chat_id = ? AND user_id = ?', [
    chatId,
    userId,
  ])
  return Boolean(row)
}

export function listChatMembers(chatId) {
  return getAll(
    `
    SELECT users.id, users.username, users.nickname, users.avatar_url, users.color, users.status, chat_members.role
    FROM chat_members
    JOIN users ON users.id = chat_members.user_id
    WHERE chat_members.chat_id = ?
    ORDER BY users.username
  `,
    [chatId]
  )
}

export function listChatsForUser(userId) {
  return getAll(
    `
    SELECT c.id, c.name, c.type,
      (SELECT body FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_time,
      (SELECT user_id FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_sender_id,
      (SELECT users.username FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE chat_messages.chat_id = c.id ORDER BY chat_messages.created_at DESC LIMIT 1) AS last_sender_username,
      (SELECT users.nickname FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE chat_messages.chat_id = c.id ORDER BY chat_messages.created_at DESC LIMIT 1) AS last_sender_nickname,
      (SELECT users.avatar_url FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE chat_messages.chat_id = c.id ORDER BY chat_messages.created_at DESC LIMIT 1) AS last_sender_avatar_url,
      (SELECT read_at FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_read_at,
      (SELECT read_by_user_id FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_read_by_user_id,
      (SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id AND user_id != ? AND read_at IS NULL) AS unread_count
    FROM chats c
    JOIN chat_members m ON m.chat_id = c.id
    LEFT JOIN hidden_chats h ON h.chat_id = c.id AND h.user_id = m.user_id
    WHERE m.user_id = ?
      AND h.chat_id IS NULL
    ORDER BY last_time DESC, c.created_at DESC
  `,
    [userId, userId]
  )
}

export function createMessage(chatId, userId, body) {
  run('INSERT INTO chat_messages (chat_id, user_id, body) VALUES (?, ?, ?)', [chatId, userId, body])
  return getLastInsertId()
}

export function getMessages(chatId) {
  return getAll(
    `
    SELECT chat_messages.id, chat_messages.body, chat_messages.created_at, chat_messages.read_at, chat_messages.read_by_user_id,
      users.username, users.nickname, users.avatar_url, users.color
    FROM chat_messages
    JOIN users ON users.id = chat_messages.user_id
    WHERE chat_messages.chat_id = ?
    ORDER BY chat_messages.created_at ASC
    LIMIT 200
  `,
    [chatId]
  )
}

export function updateUserProfile(userId, username, nickname, avatarUrl) {
  run('UPDATE users SET username = ?, nickname = ?, avatar_url = ? WHERE id = ?', [
    username,
    nickname,
    avatarUrl,
    userId,
  ])
}

export function updateUserPassword(userId, passwordHash) {
  run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId])
}

export function updateUserStatus(userId, status) {
  run('UPDATE users SET status = ? WHERE id = ?', [status, userId])
}

export function updateLastSeen(userId) {
  run("UPDATE users SET last_seen = datetime('now') WHERE id = ?", [userId])
}

export function getUserPresence(username) {
  return getRow('SELECT id, username, status, last_seen FROM users WHERE username = ?', [username])
}

export function markMessagesRead(chatId, readerId) {
  run(
    `
    UPDATE chat_messages
    SET read_at = datetime('now'), read_by_user_id = ?
    WHERE chat_id = ? AND user_id != ? AND read_at IS NULL
  `,
    [readerId, chatId, readerId]
  )
}

export function hideChatsForUser(userId, chatIds = []) {
  chatIds.forEach((chatId) => {
    run('INSERT OR IGNORE INTO hidden_chats (user_id, chat_id) VALUES (?, ?)', [userId, chatId])
  })
}

export function unhideChat(userId, chatId) {
  run('DELETE FROM hidden_chats WHERE user_id = ? AND chat_id = ?', [userId, chatId])
}

export function createSession(userId, token) {
  run('INSERT INTO sessions (user_id, token) VALUES (?, ?)', [userId, token])
}

export function getSession(token) {
  return getRow(
    `
    SELECT sessions.id AS session_id, sessions.token, users.id, users.username, users.nickname,
           users.avatar_url, users.color, users.status
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `,
    [token]
  )
}

export function touchSession(token) {
  run("UPDATE sessions SET last_seen = datetime('now') WHERE token = ?", [token])
}

export function deleteSession(token) {
  run('DELETE FROM sessions WHERE token = ?', [token])
}

export function createMailMessage({
  senderUserId = null,
  senderEmail,
  senderName = null,
  recipientUserId,
  recipientEmail,
  subject = '',
  body,
  source = 'internal',
}) {
  run(
    `
    INSERT INTO mail_messages (
      sender_user_id, sender_email, sender_name, recipient_user_id, recipient_email, subject, body, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [senderUserId, senderEmail, senderName, recipientUserId, recipientEmail, subject, body, source]
  )
  return getLastInsertId()
}

export function listMailMessagesForUser(userId, folder = 'inbox', limit = 100) {
  const safeLimit = Math.max(1, Number(limit) || 100)
  let whereClause = 'm.recipient_user_id = ? AND m.deleted_by_recipient = 0'
  let params = [userId, safeLimit]

  if (folder === 'sent') {
    whereClause = 'm.sender_user_id = ? AND m.deleted_by_sender = 0'
    params = [userId, safeLimit]
  } else if (folder === 'trash') {
    whereClause =
      '((m.recipient_user_id = ? AND m.deleted_by_recipient = 1) OR (m.sender_user_id = ? AND m.deleted_by_sender = 1))'
    params = [userId, userId, safeLimit]
  }

  return getAll(
    `
    SELECT
      m.id,
      m.sender_email,
      m.sender_name,
      m.recipient_email,
      m.subject,
      m.body,
      m.source,
      m.received_at,
      m.read_at,
      m.sender_user_id,
      m.recipient_user_id,
      su.username AS sender_username,
      su.nickname AS sender_nickname,
      su.avatar_url AS sender_avatar_url,
      su.color AS sender_color,
      ru.username AS recipient_username,
      ru.nickname AS recipient_nickname,
      ru.avatar_url AS recipient_avatar_url,
      ru.color AS recipient_color
    FROM mail_messages m
    LEFT JOIN users su ON su.id = m.sender_user_id
    LEFT JOIN users ru ON ru.id = m.recipient_user_id
    WHERE ${whereClause}
    ORDER BY m.received_at DESC
    LIMIT ?
  `,
    params
  ).map((row) => {
    const isSent = Number(row.sender_user_id) === Number(userId)
    const peerName = isSent
      ? row.recipient_nickname || row.recipient_username || row.recipient_email
      : row.sender_name || row.sender_nickname || row.sender_username || row.sender_email
    const peerEmail = isSent ? row.recipient_email : row.sender_email
    const peerAvatarUrl = isSent ? row.recipient_avatar_url : row.sender_avatar_url
    const peerColor = isSent ? row.recipient_color : row.sender_color
    return {
      ...row,
      direction: isSent ? 'sent' : 'inbox',
      peer_name: peerName,
      peer_email: peerEmail,
      peer_avatar_url: peerAvatarUrl,
      peer_color: peerColor || '#10b981',
    }
  })
}

export function getMailMessageForUser(userId, mailId) {
  return getRow(
    `
    SELECT
      m.id,
      m.sender_email,
      m.sender_name,
      m.recipient_email,
      m.subject,
      m.body,
      m.source,
      m.received_at,
      m.read_at,
      m.sender_user_id,
      m.recipient_user_id,
      su.username AS sender_username,
      su.nickname AS sender_nickname,
      su.avatar_url AS sender_avatar_url,
      su.color AS sender_color,
      ru.username AS recipient_username,
      ru.nickname AS recipient_nickname,
      ru.avatar_url AS recipient_avatar_url,
      ru.color AS recipient_color
    FROM mail_messages m
    LEFT JOIN users ru ON ru.id = m.recipient_user_id
    LEFT JOIN users su ON su.id = m.sender_user_id
    WHERE m.id = ?
      AND (
        m.recipient_user_id = ?
        OR m.sender_user_id = ?
      )
    LIMIT 1
  `,
    [mailId, userId, userId]
  )
}

export function markMailMessageReadForUser(userId, mailId) {
  run(
    `
    UPDATE mail_messages
    SET read_at = datetime('now')
    WHERE id = ? AND recipient_user_id = ? AND deleted_by_recipient = 0 AND read_at IS NULL
  `,
    [mailId, userId]
  )
}

export function deleteMailMessageForUser(userId, mailId) {
  run(
    `
    UPDATE mail_messages
    SET deleted_by_sender = 1
    WHERE id = ? AND sender_user_id = ?
  `,
    [mailId, userId]
  )
  run(
    `
    UPDATE mail_messages
    SET deleted_by_recipient = 1
    WHERE id = ? AND recipient_user_id = ?
  `,
    [mailId, userId]
  )
}

export function restoreMailMessageForUser(userId, mailId) {
  run(
    `
    UPDATE mail_messages
    SET deleted_by_sender = 0
    WHERE id = ? AND sender_user_id = ?
  `,
    [mailId, userId]
  )
  run(
    `
    UPDATE mail_messages
    SET deleted_by_recipient = 0
    WHERE id = ? AND recipient_user_id = ?
  `,
    [mailId, userId]
  )
}

export function purgeOldTrashedMailForUser(userId, days = 7) {
  run(
    `
    DELETE FROM mail_messages
    WHERE received_at < datetime('now', ?)
      AND (
        (recipient_user_id = ? AND deleted_by_recipient = 1)
        OR (sender_user_id = ? AND deleted_by_sender = 1)
      )
  `,
    [`-${Number(days) || 7} days`, userId, userId]
  )
}

export function deleteAllTrashForUser(userId) {
  run(
    `
    DELETE FROM mail_messages
    WHERE (recipient_user_id = ? AND deleted_by_recipient = 1)
       OR (sender_user_id = ? AND deleted_by_sender = 1)
  `,
    [userId, userId]
  )
}

export function countUnreadMailForUser(userId) {
  const row = getRow(
    `
    SELECT COUNT(*) AS unread_count
    FROM mail_messages
    WHERE recipient_user_id = ? AND deleted_by_recipient = 0 AND read_at IS NULL
  `,
    [userId]
  )
  return Number(row?.unread_count || 0)
}

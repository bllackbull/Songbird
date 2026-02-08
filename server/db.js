import path from 'node:path'
import fs from 'node:fs'
import initSqlJs from 'sql.js'

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

const initSql = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'online',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT NOT NULL DEFAULT 'dm',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS hidden_chats (
    user_id INTEGER NOT NULL,
    conversation_id INTEGER NOT NULL,
    hidden_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, conversation_id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON chat_messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_members_user ON conversation_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
`

initSql
  .trim()
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean)
  .forEach((statement) => db.run(statement))

const userColumns = getAll("PRAGMA table_info('users')")
const hasNickname = userColumns.some((col) => col.name === 'nickname')
const hasAvatar = userColumns.some((col) => col.name === 'avatar_url')
const hasStatus = userColumns.some((col) => col.name === 'status')
const hasLastSeen = userColumns.some((col) => col.name === 'last_seen')

if (!hasNickname) {
  db.run('ALTER TABLE users ADD COLUMN nickname TEXT')
}
if (!hasAvatar) {
  db.run('ALTER TABLE users ADD COLUMN avatar_url TEXT')
}
if (!hasStatus) {
  db.run("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'online'")
}
if (!hasLastSeen) {
  db.run("ALTER TABLE users ADD COLUMN last_seen TEXT")
}

const messageColumns = getAll("PRAGMA table_info('chat_messages')")
const hasReadAt = messageColumns.some((col) => col.name === 'read_at')
const hasReadBy = messageColumns.some((col) => col.name === 'read_by_user_id')
if (!hasReadAt) {
  db.run("ALTER TABLE chat_messages ADD COLUMN read_at TEXT")
}
if (!hasReadBy) {
  db.run('ALTER TABLE chat_messages ADD COLUMN read_by_user_id INTEGER')
}

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

export function findUserByUsername(username) {
  return getRow(
    'SELECT id, username, nickname, avatar_url, status, password_hash FROM users WHERE username = ?',
    [username]
  )
}

export function findUserById(id) {
  return getRow(
    'SELECT id, username, nickname, avatar_url, status, password_hash FROM users WHERE id = ?',
    [id]
  )
}

export function listUsers(excludeUsername) {
  if (excludeUsername) {
    return getAll(
      'SELECT id, username, nickname, avatar_url, status FROM users WHERE username != ? ORDER BY username',
      [excludeUsername]
    )
  }
  return getAll('SELECT id, username, nickname, avatar_url, status FROM users ORDER BY username')
}

export function searchUsers(query, excludeUsername) {
  const like = `%${query}%`
  if (excludeUsername) {
    return getAll(
      'SELECT id, username, nickname, avatar_url, status FROM users WHERE username != ? AND (username LIKE ? OR nickname LIKE ?) ORDER BY username',
      [excludeUsername, like, like]
    )
  }
  return getAll(
    'SELECT id, username, nickname, avatar_url, status FROM users WHERE username LIKE ? OR nickname LIKE ? ORDER BY username',
    [like, like]
  )
}

export function createUser(username, passwordHash, nickname = null, avatarUrl = null) {
  run(
    'INSERT INTO users (username, nickname, avatar_url, password_hash, last_seen) VALUES (?, ?, ?, ?, datetime("now"))',
    [username, nickname, avatarUrl, passwordHash]
  )
  return getLastInsertId()
}

export function findDmConversation(userId, otherUserId) {
  const row = getRow(
    `
    SELECT c.id
    FROM conversations c
    JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
    JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
    WHERE c.type = 'dm'
    LIMIT 1
  `,
    [userId, otherUserId]
  )
  return row?.id || null
}

export function createConversation(name, type = 'dm') {
  run('INSERT INTO conversations (name, type) VALUES (?, ?)', [name || null, type])
  const id = getLastInsertId()
  if (id) return id
  const fallback = getRow('SELECT id FROM conversations ORDER BY id DESC LIMIT 1')
  return fallback?.id || null
}

export function addConversationMember(conversationId, userId, role = 'member') {
  run(
    'INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, ?)',
    [conversationId, userId, role]
  )
}

export function isMember(conversationId, userId) {
  const row = getRow(
    'SELECT conversation_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId]
  )
  return Boolean(row)
}

export function listConversationMembers(conversationId) {
  return getAll(
    `
    SELECT users.id, users.username, users.nickname, users.avatar_url, users.status, conversation_members.role
    FROM conversation_members
    JOIN users ON users.id = conversation_members.user_id
    WHERE conversation_members.conversation_id = ?
    ORDER BY users.username
  `,
    [conversationId]
  )
}

export function listConversationsForUser(userId) {
  return getAll(
    `
    SELECT c.id, c.name, c.type,
      (SELECT body FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_time,
      (SELECT user_id FROM chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_sender_id,
      (SELECT users.username FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE chat_messages.conversation_id = c.id ORDER BY chat_messages.created_at DESC LIMIT 1) AS last_sender_username,
      (SELECT users.nickname FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE chat_messages.conversation_id = c.id ORDER BY chat_messages.created_at DESC LIMIT 1) AS last_sender_nickname,
      (SELECT users.avatar_url FROM chat_messages JOIN users ON users.id = chat_messages.user_id WHERE chat_messages.conversation_id = c.id ORDER BY chat_messages.created_at DESC LIMIT 1) AS last_sender_avatar_url,
      (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id AND user_id != ? AND read_at IS NULL) AS unread_count
    FROM conversations c
    JOIN conversation_members m ON m.conversation_id = c.id
    LEFT JOIN hidden_chats h ON h.conversation_id = c.id AND h.user_id = m.user_id
    WHERE m.user_id = ?
      AND h.conversation_id IS NULL
    ORDER BY last_time DESC, c.created_at DESC
  `,
    [userId, userId]
  )
}

export function createMessage(conversationId, userId, body) {
  run('INSERT INTO chat_messages (conversation_id, user_id, body) VALUES (?, ?, ?)', [
    conversationId,
    userId,
    body,
  ])
  return getLastInsertId()
}

export function getMessages(conversationId) {
  return getAll(
    `
    SELECT chat_messages.id, chat_messages.body, chat_messages.created_at, chat_messages.read_at, chat_messages.read_by_user_id,
      users.username, users.nickname, users.avatar_url
    FROM chat_messages
    JOIN users ON users.id = chat_messages.user_id
    WHERE chat_messages.conversation_id = ?
    ORDER BY chat_messages.created_at ASC
    LIMIT 200
  `,
    [conversationId]
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

export function markMessagesRead(conversationId, readerId) {
  run(
    `
    UPDATE chat_messages
    SET read_at = datetime('now'), read_by_user_id = ?
    WHERE conversation_id = ? AND user_id != ? AND read_at IS NULL
  `,
    [readerId, conversationId, readerId]
  )
}

export function hideChatsForUser(userId, conversationIds = []) {
  conversationIds.forEach((conversationId) => {
    run(
      'INSERT OR IGNORE INTO hidden_chats (user_id, conversation_id) VALUES (?, ?)',
      [userId, conversationId]
    )
  })
}

export function createSession(userId, token) {
  run('INSERT INTO sessions (user_id, token) VALUES (?, ?)', [userId, token])
}

export function getSession(token) {
  return getRow(
    `
    SELECT sessions.id AS session_id, sessions.token, users.id, users.username, users.nickname,
           users.avatar_url, users.status
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

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

function resetLegacySchemaIfNeeded() {
  const legacyConversations = tableExists('conversations') || tableExists('conversation_members')
  const messagesNeedsRename = tableExists('chat_messages') && !hasColumn('chat_messages', 'chat_id')
  const hiddenNeedsRename = tableExists('hidden_chats') && !hasColumn('hidden_chats', 'chat_id')

  if (!legacyConversations && !messagesNeedsRename && !hiddenNeedsRename) {
    return
  }

  ;[
    'hidden_chats',
    'chat_messages',
    'chat_members',
    'chats',
    'sessions',
    'users',
    'meta',
    'conversation_members',
    'conversations',
  ].forEach((table) => {
    db.run(`DROP TABLE IF EXISTS ${table}`)
  })

  saveDatabase()
}

resetLegacySchemaIfNeeded()

const initSql = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT,
    avatar_url TEXT,
    color TEXT,
    status TEXT NOT NULL DEFAULT 'online',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT NOT NULL DEFAULT 'dm',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    read_at TEXT,
    read_by_user_id INTEGER,
    FOREIGN KEY (chat_id) REFERENCES chats (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS hidden_chats (
    user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    hidden_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, chat_id),
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (chat_id) REFERENCES chats (id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON chat_messages(chat_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
`

initSql
  .trim()
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean)
  .forEach((statement) => db.run(statement))

if (!hasColumn('users', 'nickname')) {
  db.run('ALTER TABLE users ADD COLUMN nickname TEXT')
}
if (!hasColumn('users', 'avatar_url')) {
  db.run('ALTER TABLE users ADD COLUMN avatar_url TEXT')
}
if (!hasColumn('users', 'color')) {
  db.run('ALTER TABLE users ADD COLUMN color TEXT')
}
if (!hasColumn('users', 'status')) {
  db.run("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'online'")
}
if (!hasColumn('users', 'last_seen')) {
  db.run("ALTER TABLE users ADD COLUMN last_seen TEXT")
}
if (!hasColumn('chat_messages', 'read_at')) {
  db.run("ALTER TABLE chat_messages ADD COLUMN read_at TEXT")
}
if (!hasColumn('chat_messages', 'read_by_user_id')) {
  db.run('ALTER TABLE chat_messages ADD COLUMN read_by_user_id INTEGER')
}

const usersMissingColor = getAll("SELECT id FROM users WHERE color IS NULL OR TRIM(color) = ''")
usersMissingColor.forEach((row) => {
  run('UPDATE users SET color = ? WHERE id = ?', [getRandomUserColor(), row.id])
})

saveDatabase()

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

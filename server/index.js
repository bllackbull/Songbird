import express from 'express'
import path from 'node:path'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import {
  addConversationMember,
  createConversation,
  createMessage,
  createSession,
  deleteSession,
  createUser,
  findDmConversation,
  findUserById,
  findUserByUsername,
  getMessages,
  getSession,
  isMember,
  listConversationMembers,
  listConversationsForUser,
  listUsers,
  searchUsers,
  touchSession,
  updateLastSeen,
  getUserPresence,
  hideChatsForUser,
  markMessagesRead,
  updateUserPassword,
  updateUserProfile,
  updateUserStatus,
  unhideChat,
} from './db.js'

const app = express()
const port = process.env.PORT || 5174
const isProduction = process.env.NODE_ENV === 'production'

app.use(express.json({ limit: '1mb' }))

function parseCookies(req) {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return {}
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...rest] = cookie.trim().split('=')
    if (!name) return acc
    acc[name] = decodeURIComponent(rest.join('='))
    return acc
  }, {})
}

function setSessionCookie(res, token) {
  const parts = [
    `sid=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=1209600',
  ]
  if (isProduction) {
    parts.push('Secure')
  }
  res.setHeader('Set-Cookie', parts.join('; '))
}

function clearSessionCookie(res) {
  const parts = ['sid=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isProduction) {
    parts.push('Secure')
  }
  res.setHeader('Set-Cookie', parts.join('; '))
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req)
  if (!cookies.sid) return null
  const session = getSession(cookies.sid)
  if (session) {
    touchSession(cookies.sid)
  }
  return session
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.post('/api/register', (req, res) => {
  const { username, password, nickname, avatarUrl } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  const trimmed = username.trim().toLowerCase()
  if (trimmed.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  const existing = findUserByUsername(trimmed)
  if (existing) {
    return res.status(409).json({ error: 'Username already exists.' })
  }

  const passwordHash = bcrypt.hashSync(password, 10)
  const id = createUser(trimmed, passwordHash, nickname?.trim() || null, avatarUrl?.trim() || null)
  const token = crypto.randomBytes(24).toString('hex')
  createSession(id, token)
  setSessionCookie(res, token)

  return res.json({
    id,
    username: trimmed,
    nickname: nickname?.trim() || null,
    avatarUrl: avatarUrl?.trim() || null,
    status: 'online',
  })
})

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' })
  }

  const trimmed = username.trim().toLowerCase()
  const user = findUserByUsername(trimmed)

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials.' })
  }

  updateLastSeen(user.id)
  const token = crypto.randomBytes(24).toString('hex')
  createSession(user.id, token)
  setSessionCookie(res, token)
  return res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname || null,
    avatarUrl: user.avatar_url || null,
    status: user.status || 'online',
  })
})

app.get('/api/me', (req, res) => {
  const session = getSessionFromRequest(req)
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated.' })
  }
  res.json({
    id: session.id,
    username: session.username,
    nickname: session.nickname || null,
    avatarUrl: session.avatar_url || null,
    status: session.status || 'online',
  })
})

app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req)
  if (cookies.sid) {
    deleteSession(cookies.sid)
  }
  clearSessionCookie(res)
  res.json({ ok: true })
})

app.get('/api/profile', (req, res) => {
  const username = req.query.username?.toString()
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' })
  }
  const user = findUserByUsername(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }
  res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname || null,
    avatarUrl: user.avatar_url || null,
    status: user.status || 'online',
  })
})

app.post('/api/presence', (req, res) => {
  const { username } = req.body || {}
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' })
  }
  const user = findUserByUsername(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }
  updateLastSeen(user.id)
  res.json({ ok: true })
})

app.get('/api/presence', (req, res) => {
  const username = req.query.username?.toString()
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' })
  }
  const user = getUserPresence(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }
  res.json({
    username: user.username,
    status: user.status || 'online',
    lastSeen: user.last_seen || null,
  })
})

app.put('/api/profile', (req, res) => {
  const { currentUsername, username, nickname, avatarUrl } = req.body || {}
  if (!currentUsername || !username) {
    return res.status(400).json({ error: 'Current username and new username are required.' })
  }

  const currentUser = findUserByUsername(currentUsername.toLowerCase())
  if (!currentUser) {
    return res.status(404).json({ error: 'User not found.' })
  }

  const trimmed = username.trim().toLowerCase()
  if (trimmed.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' })
  }

  if (trimmed !== currentUser.username) {
    const existing = findUserByUsername(trimmed)
    if (existing) {
      return res.status(409).json({ error: 'Username already exists.' })
    }
  }

  updateUserProfile(currentUser.id, trimmed, nickname?.trim() || null, avatarUrl?.trim() || null)
  const updated = findUserById(currentUser.id)

  res.json({
    id: updated.id,
    username: updated.username,
    nickname: updated.nickname || null,
    avatarUrl: updated.avatar_url || null,
    status: updated.status || 'online',
  })
})

app.put('/api/password', (req, res) => {
  const { username, currentPassword, newPassword } = req.body || {}
  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Username, current password, and new password are required.' })
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  const user = findUserByUsername(username.toLowerCase())
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials.' })
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10)
  updateUserPassword(user.id, passwordHash)

  res.json({ ok: true })
})

app.put('/api/status', (req, res) => {
  const { username, status } = req.body || {}
  if (!username || !status) {
    return res.status(400).json({ error: 'Username and status are required.' })
  }
  const allowed = new Set(['online', 'idle', 'invisible'])
  if (!allowed.has(status)) {
    return res.status(400).json({ error: 'Invalid status.' })
  }
  const user = findUserByUsername(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }
  updateUserStatus(user.id, status)
  res.json({ ok: true, status })
})

app.get('/api/users', (req, res) => {
  const exclude = req.query.exclude?.toString()
  const query = req.query.query?.toString()
  const users = query ? searchUsers(query.toLowerCase(), exclude) : listUsers(exclude)
  res.json({ users })
})

app.get('/api/conversations', (req, res) => {
  const username = req.query.username?.toString()
  if (!username) {
    return res.status(400).json({ error: 'Username is required.' })
  }
  const user = findUserByUsername(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }

  const conversations = listConversationsForUser(user.id).map((conv) => {
    const members = listConversationMembers(conv.id)
    return { ...conv, members }
  })

  res.json({ conversations })
})

app.post('/api/conversations/dm', (req, res) => {
  const { from, to } = req.body || {}
  if (!from || !to) {
    return res.status(400).json({ error: 'Both users are required.' })
  }

  const fromUser = findUserByUsername(from.toLowerCase())
  const toUser = findUserByUsername(to.toLowerCase())
  if (!fromUser || !toUser) {
    return res.status(404).json({ error: 'User not found.' })
  }

  const existingId = findDmConversation(fromUser.id, toUser.id)
  if (existingId) {
    // Unhide the conversation for both users (in case it was previously deleted)
    unhideChat(fromUser.id, existingId)
    unhideChat(toUser.id, existingId)
    return res.json({ id: existingId })
  }

  const convoId = createConversation(null, 'dm')
  if (!convoId) {
    return res.status(500).json({ error: 'Failed to create conversation.' })
  }
  addConversationMember(convoId, fromUser.id, 'owner')
  addConversationMember(convoId, toUser.id, 'member')

  res.json({ id: convoId })
})

app.post('/api/conversations', (req, res) => {
  const { name, type, members = [], creator } = req.body || {}
  if (!creator) {
    return res.status(400).json({ error: 'Creator is required.' })
  }

  const creatorUser = findUserByUsername(creator.toLowerCase())
  if (!creatorUser) {
    return res.status(404).json({ error: 'Creator not found.' })
  }

  const normalizedType = type === 'channel' ? 'channel' : 'group'
  const convoId = createConversation(name || 'Untitled', normalizedType)

  addConversationMember(convoId, creatorUser.id, 'owner')

  const memberSet = new Set(members.map((value) => value.toString().toLowerCase()))
  memberSet.delete(creatorUser.username)

  memberSet.forEach((username) => {
    const member = findUserByUsername(username)
    if (member) {
      addConversationMember(convoId, member.id, 'member')
    }
  })

  res.json({ id: convoId })
})

app.get('/api/messages', (req, res) => {
  const conversationId = Number(req.query.conversationId)
  const username = req.query.username?.toString()
  if (!conversationId || !username) {
    return res.status(400).json({ error: 'Conversation and username are required.' })
  }

  const user = findUserByUsername(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }

  if (!isMember(conversationId, user.id)) {
    return res.status(403).json({ error: 'Not a member of this conversation.' })
  }

  const messages = getMessages(conversationId)
  res.json({ conversationId, messages })
})

app.post('/api/messages/read', (req, res) => {
  const { conversationId, username } = req.body || {}
  if (!conversationId || !username) {
    return res.status(400).json({ error: 'Conversation and username are required.' })
  }
  const user = findUserByUsername(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }
  if (!isMember(Number(conversationId), user.id)) {
    return res.status(403).json({ error: 'Not a member of this conversation.' })
  }
  markMessagesRead(Number(conversationId), user.id)
  res.json({ ok: true })
})

app.post('/api/chats/hide', (req, res) => {
  const { username, conversationIds = [] } = req.body || {}
  if (!username || !Array.isArray(conversationIds) || !conversationIds.length) {
    return res.status(400).json({ error: 'Username and conversationIds are required.' })
  }
  const user = findUserByUsername(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }
  hideChatsForUser(
    user.id,
    conversationIds.map((id) => Number(id)).filter(Boolean)
  )
  res.json({ ok: true })
})

app.post('/api/messages', (req, res) => {
  const { conversationId, username, body } = req.body || {}
  if (!conversationId || !username || !body) {
    return res.status(400).json({ error: 'Conversation, username, and message body are required.' })
  }

  const user = findUserByUsername(username.toLowerCase())
  if (!user) {
    return res.status(404).json({ error: 'User not found.' })
  }

  if (!isMember(Number(conversationId), user.id)) {
    return res.status(403).json({ error: 'Not a member of this conversation.' })
  }

  const id = createMessage(Number(conversationId), user.id, body)

  res.json({ id })
})

if (isProduction) {
  const clientDist = path.resolve(process.cwd(), '..', 'client', 'dist')
  app.use(express.static(clientDist))
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Songbird server running on http://localhost:${port}`)
})



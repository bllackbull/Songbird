import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import {
  addChatMember,
  countUnreadMailForUser,
  createChat,
  createMailMessage,
  createMessage,
  createSession,
  deleteSession,
  deleteAllTrashForUser,
  deleteMailMessageForUser,
  createUser,
  findDmChat,
  findUserById,
  findUserByUsername,
  getMailMessageForUser,
  getMessages,
  getSession,
  isMember,
  listMailMessagesForUser,
  listChatMembers,
  listChatsForUser,
  listUsers,
  markMailMessageReadForUser,
  purgeOldTrashedMailForUser,
  restoreMailMessageForUser,
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
} from "./db.js";

const app = express();
const port = process.env.PORT || 5174;
const isProduction = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});

const USER_COLORS = [
  "#10b981",
  "#0ea5e9",
  "#f97316",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
  "#f59e0b",
  "#3b82f6",
  "#84cc16",
  "#ec4899",
];
const USERNAME_REGEX = /^[a-z0-9._-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAIL_INBOUND_TOKEN = process.env.MAIL_INBOUND_TOKEN || "";
const MAIL_DOMAIN_OVERRIDE = process.env.MAIL_DOMAIN?.toLowerCase() || "";
const sseClientsByUsername = new Map();

function getMailDomain(req) {
  if (MAIL_DOMAIN_OVERRIDE) return MAIL_DOMAIN_OVERRIDE;
  const hostRaw = (req.headers["x-forwarded-host"] || req.headers.host || "")
    .toString()
    .split(",")[0]
    .trim()
    .toLowerCase();
  const host = hostRaw.replace(/:\d+$/, "");
  if (!host || host === "localhost") return "localhost";
  const parts = host.split(".");
  if (parts.length >= 3) {
    return parts.slice(1).join(".");
  }
  return host;
}

function getUserMailAddress(req, username) {
  return `${username.toLowerCase()}@${getMailDomain(req)}`;
}

function normalizeRecipientValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => `${entry}`.split(/[,\s]+/))
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  }
  return `${value}`
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function addSseClient(username, res) {
  const key = username.toLowerCase();
  const clients = sseClientsByUsername.get(key) || new Set();
  clients.add(res);
  sseClientsByUsername.set(key, clients);
}

function removeSseClient(username, res) {
  const key = username.toLowerCase();
  const clients = sseClientsByUsername.get(key);
  if (!clients) return;
  clients.delete(res);
  if (!clients.size) {
    sseClientsByUsername.delete(key);
  }
}

function emitSseEvent(username, payload) {
  const key = username.toLowerCase();
  const clients = sseClientsByUsername.get(key);
  if (!clients?.size) return;
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => {
    try {
      client.write(message);
    } catch (_) {
      // connection cleanup is handled on close
    }
  });
}

function emitChatEvent(chatId, payload) {
  const members = listChatMembers(Number(chatId));
  members.forEach((member) => {
    if (!member?.username) return;
    emitSseEvent(member.username, payload);
  });
}

function emitMailEvent(username, payload) {
  if (!username) return;
  emitSseEvent(username, payload);
}

function getRandomUserColor() {
  const index = Math.floor(Math.random() * USER_COLORS.length);
  return USER_COLORS[index];
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (!name) return acc;
    acc[name] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function setSessionCookie(res, token) {
  const parts = [
    `sid=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=1209600",
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  const parts = ["sid=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isProduction) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  if (!cookies.sid) return null;
  const session = getSession(cookies.sid);
  if (session) {
    touchSession(cookies.sid);
  }
  return session;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/events", (req, res) => {
  const username = req.query.username?.toString()?.toLowerCase();
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  const user = findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  addSseClient(username, res);
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeSseClient(username, res);
  });
});

app.post("/api/register", (req, res) => {
  const { username, password, nickname, avatarUrl } = req.body || {};
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  const trimmed = username.trim().toLowerCase();
  if (trimmed.length < 3) {
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters." });
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return res.status(400).json({
      error:
        "Username can only include english letters, numbers, dot (.), underscore (_), and dash (-).",
    });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters." });
  }

  const existing = findUserByUsername(trimmed);
  if (existing) {
    return res.status(409).json({ error: "Username already exists." });
  }

  const assignedColor = getRandomUserColor();
  const passwordHash = bcrypt.hashSync(password, 10);
  const id = createUser(
    trimmed,
    passwordHash,
    nickname?.trim() || null,
    avatarUrl?.trim() || null,
    assignedColor,
  );
  const token = crypto.randomBytes(24).toString("hex");
  createSession(id, token);
  setSessionCookie(res, token);

  return res.json({
    id,
    username: trimmed,
    nickname: nickname?.trim() || null,
    avatarUrl: avatarUrl?.trim() || null,
    color: assignedColor,
    status: "online",
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  const trimmed = username.trim().toLowerCase();
  const user = findUserByUsername(trimmed);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  updateLastSeen(user.id);
  const token = crypto.randomBytes(24).toString("hex");
  createSession(user.id, token);
  setSessionCookie(res, token);
  return res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname || null,
    avatarUrl: user.avatar_url || null,
    color: user.color || "#10b981",
    status: user.status || "online",
  });
});

app.get("/api/me", (req, res) => {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: "Not authenticated." });
  }
  res.json({
    id: session.id,
    username: session.username,
    nickname: session.nickname || null,
    avatarUrl: session.avatar_url || null,
    color: session.color || "#10b981",
    status: session.status || "online",
  });
});

app.get("/api/mail", (req, res) => {
  const username = req.query.username?.toString()?.toLowerCase();
  const limit = Number(req.query.limit) || 100;
  const folderRaw = req.query.folder?.toString()?.toLowerCase() || "inbox";
  const folder = ["inbox", "sent", "trash"].includes(folderRaw)
    ? folderRaw
    : "inbox";
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  const user = findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  if (folder === "trash") {
    purgeOldTrashedMailForUser(user.id, 7);
  }
  const mails = listMailMessagesForUser(
    user.id,
    folder,
    Math.min(Math.max(limit, 1), 200),
  );
  const unreadCount = countUnreadMailForUser(user.id);
  res.json({
    address: getUserMailAddress(req, user.username),
    folder,
    unreadCount,
    mails,
  });
});

app.get("/api/mail/:id", (req, res) => {
  const username = req.query.username?.toString()?.toLowerCase();
  const mailId = Number(req.params.id);
  if (!username || !mailId) {
    return res.status(400).json({ error: "Username and mail id are required." });
  }
  const user = findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  const mail = getMailMessageForUser(user.id, mailId);
  if (!mail) {
    return res.status(404).json({ error: "Mail not found." });
  }
  res.json({ mail });
});

app.post("/api/mail", (req, res) => {
  const { fromUsername, toUsername, subject, body } = req.body || {};
  if (!fromUsername || !toUsername || !body) {
    return res.status(400).json({
      error: "fromUsername, toUsername, and body are required.",
    });
  }
  const fromUser = findUserByUsername(fromUsername.toLowerCase());
  if (!fromUser) {
    return res.status(404).json({ error: "Sender not found." });
  }
  const toUser = findUserByUsername(toUsername.toLowerCase());
  if (!toUser) {
    return res.status(404).json({ error: "Recipient not found." });
  }
  const createdId = createMailMessage({
    senderUserId: fromUser.id,
    senderEmail: getUserMailAddress(req, fromUser.username),
    senderName: fromUser.nickname || fromUser.username,
    recipientUserId: toUser.id,
    recipientEmail: getUserMailAddress(req, toUser.username),
    subject: subject?.toString()?.trim() || "",
    body: body?.toString() || "",
    source: "internal",
  });
  emitMailEvent(toUser.username, {
    type: "mail_updated",
    username: toUser.username,
    mailId: Number(createdId),
  });
  emitMailEvent(fromUser.username, {
    type: "mail_updated",
    username: fromUser.username,
    mailId: Number(createdId),
  });
  res.json({ id: createdId });
});

app.post("/api/mail/:id/read", (req, res) => {
  const { username } = req.body || {};
  const mailId = Number(req.params.id);
  if (!username || !mailId) {
    return res.status(400).json({ error: "Username and mail id are required." });
  }
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  markMailMessageReadForUser(user.id, mailId);
  res.json({ ok: true });
});

app.delete("/api/mail/:id", (req, res) => {
  const username = req.query.username?.toString()?.toLowerCase();
  const mailId = Number(req.params.id);
  if (!username || !mailId) {
    return res.status(400).json({ error: "Username and mail id are required." });
  }
  const user = findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  deleteMailMessageForUser(user.id, mailId);
  emitMailEvent(user.username, {
    type: "mail_updated",
    username: user.username,
    mailId,
  });
  res.json({ ok: true });
});

app.post("/api/mail/:id/restore", (req, res) => {
  const { username } = req.body || {};
  const mailId = Number(req.params.id);
  if (!username || !mailId) {
    return res.status(400).json({ error: "Username and mail id are required." });
  }
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  restoreMailMessageForUser(user.id, mailId);
  emitMailEvent(user.username, {
    type: "mail_updated",
    username: user.username,
    mailId,
  });
  res.json({ ok: true });
});

app.delete("/api/mail/actions/trash-all", (req, res) => {
  const username = req.query.username?.toString()?.toLowerCase();
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  const user = findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  deleteAllTrashForUser(user.id);
  emitMailEvent(user.username, {
    type: "mail_updated",
    username: user.username,
  });
  res.json({ ok: true });
});

app.post("/api/mail/inbound", (req, res) => {
  if (!MAIL_INBOUND_TOKEN) {
    return res.status(503).json({ error: "Inbound mail is not configured." });
  }
  const token = req.headers["x-inbound-token"]?.toString() || "";
  if (token !== MAIL_INBOUND_TOKEN) {
    return res.status(401).json({ error: "Unauthorized inbound token." });
  }

  const recipients = normalizeRecipientValues(req.body?.to || req.body?.recipient || req.body?.envelopeTo);
  if (!recipients.length) {
    return res.status(400).json({ error: "No recipient address provided." });
  }
  const senderEmail = req.body?.from?.toString()?.trim()?.toLowerCase();
  if (!senderEmail || !EMAIL_REGEX.test(senderEmail)) {
    return res.status(400).json({ error: "A valid sender email is required." });
  }
  const senderName = req.body?.senderName?.toString()?.trim() || null;
  const subject = req.body?.subject?.toString()?.trim() || "";
  const body = req.body?.text?.toString() || req.body?.body?.toString() || req.body?.html?.toString() || "";
  if (!body.trim()) {
    return res.status(400).json({ error: "Mail body is required." });
  }

  let delivered = 0;
  recipients.forEach((recipientAddress) => {
    const [localPart] = recipientAddress.split("@");
    if (!localPart) return;
    const recipient = findUserByUsername(localPart);
    if (!recipient) return;
    createMailMessage({
      senderUserId: null,
      senderEmail,
      senderName,
      recipientUserId: recipient.id,
      recipientEmail: getUserMailAddress(req, recipient.username),
      subject,
      body,
      source: "external",
    });
    emitMailEvent(recipient.username, {
      type: "mail_updated",
      username: recipient.username,
    });
    delivered += 1;
  });

  if (!delivered) {
    return res.status(404).json({ error: "No matching recipients found." });
  }
  res.json({ ok: true, delivered });
});

app.post("/api/logout", (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.sid) {
    deleteSession(cookies.sid);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/profile", (req, res) => {
  const username = req.query.username?.toString();
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname || null,
    avatarUrl: user.avatar_url || null,
    color: user.color || "#10b981",
    status: user.status || "online",
  });
});

app.post("/api/presence", (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  updateLastSeen(user.id);
  res.json({ ok: true });
});

app.get("/api/presence", (req, res) => {
  const username = req.query.username?.toString();
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  const user = getUserPresence(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  res.json({
    username: user.username,
    status: user.status || "online",
    lastSeen: user.last_seen || null,
  });
});

app.put("/api/profile", (req, res) => {
  const { currentUsername, username, nickname, avatarUrl } = req.body || {};
  if (!currentUsername || !username) {
    return res
      .status(400)
      .json({ error: "Current username and new username are required." });
  }

  const currentUser = findUserByUsername(currentUsername.toLowerCase());
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const trimmed = username.trim().toLowerCase();
  if (trimmed.length < 3) {
    return res
      .status(400)
      .json({ error: "Username must be at least 3 characters." });
  }
  if (!USERNAME_REGEX.test(trimmed)) {
    return res.status(400).json({
      error:
        "Username can only include english letters, numbers, dot (.), underscore (_), and dash (-).",
    });
  }

  if (trimmed !== currentUser.username) {
    const existing = findUserByUsername(trimmed);
    if (existing) {
      return res.status(409).json({ error: "Username already exists." });
    }
  }

  updateUserProfile(
    currentUser.id,
    trimmed,
    nickname?.trim() || null,
    avatarUrl?.trim() || null,
  );
  const updated = findUserById(currentUser.id);

  res.json({
    id: updated.id,
    username: updated.username,
    nickname: updated.nickname || null,
    avatarUrl: updated.avatar_url || null,
    color: updated.color || "#10b981",
    status: updated.status || "online",
  });
});

app.put("/api/password", (req, res) => {
  const { username, currentPassword, newPassword } = req.body || {};
  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({
      error: "Username, current password, and new password are required.",
    });
  }
  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters." });
  }

  const user = findUserByUsername(username.toLowerCase());
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  updateUserPassword(user.id, passwordHash);

  res.json({ ok: true });
});

app.put("/api/status", (req, res) => {
  const { username, status } = req.body || {};
  if (!username || !status) {
    return res.status(400).json({ error: "Username and status are required." });
  }
  const allowed = new Set(["online", "idle", "invisible"]);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  updateUserStatus(user.id, status);
  res.json({ ok: true, status });
});

app.get("/api/users", (req, res) => {
  const exclude = req.query.exclude?.toString();
  const query = req.query.query?.toString();
  const users = query
    ? searchUsers(query.toLowerCase(), exclude)
    : listUsers(exclude);
  res.json({ users });
});

app.get("/api/chats", (req, res) => {
  const username = req.query.username?.toString();
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const chats = listChatsForUser(user.id).map((conv) => {
    const members = listChatMembers(conv.id);
    return { ...conv, members };
  });

  res.json({ chats });
});

app.post("/api/chats/dm", (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) {
    return res.status(400).json({ error: "Both users are required." });
  }

  const fromUser = findUserByUsername(from.toLowerCase());
  const toUser = findUserByUsername(to.toLowerCase());
  if (!fromUser || !toUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const existingId = findDmChat(fromUser.id, toUser.id);
  if (existingId) {
    // Unhide the chat for both users (in case it was previously deleted)
    unhideChat(fromUser.id, existingId);
    unhideChat(toUser.id, existingId);
    return res.json({ id: existingId });
  }

  const chatId = createChat(null, "dm");
  if (!chatId) {
    return res.status(500).json({ error: "Failed to create chat." });
  }
  addChatMember(chatId, fromUser.id, "owner");
  addChatMember(chatId, toUser.id, "member");

  res.json({ id: chatId });
});

app.post("/api/chats", (req, res) => {
  const { name, type, members = [], creator } = req.body || {};
  if (!creator) {
    return res.status(400).json({ error: "Creator is required." });
  }

  const creatorUser = findUserByUsername(creator.toLowerCase());
  if (!creatorUser) {
    return res.status(404).json({ error: "Creator not found." });
  }

  const normalizedType = type === "channel" ? "channel" : "group";
  const chatId = createChat(name || "Untitled", normalizedType);

  addChatMember(chatId, creatorUser.id, "owner");

  const memberSet = new Set(
    members.map((value) => value.toString().toLowerCase()),
  );
  memberSet.delete(creatorUser.username);

  memberSet.forEach((username) => {
    const member = findUserByUsername(username);
    if (member) {
      addChatMember(chatId, member.id, "member");
    }
  });

  res.json({ id: chatId });
});

app.get("/api/messages", (req, res) => {
  const chatId = Number(req.query.chatId);
  const username = req.query.username?.toString();
  if (!chatId || !username) {
    return res
      .status(400)
      .json({ error: "Chat and username are required." });
  }

  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!isMember(chatId, user.id)) {
    return res
      .status(403)
      .json({ error: "Not a member of this chat." });
  }

  const messages = getMessages(chatId);
  res.json({ chatId, messages });
});

app.post("/api/messages/read", (req, res) => {
  const { chatId, username } = req.body || {};
  if (!chatId || !username) {
    return res
      .status(400)
      .json({ error: "Chat and username are required." });
  }
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  if (!isMember(Number(chatId), user.id)) {
    return res
      .status(403)
      .json({ error: "Not a member of this chat." });
  }
  markMessagesRead(Number(chatId), user.id);
  emitChatEvent(Number(chatId), {
    type: "chat_read",
    chatId: Number(chatId),
    username: user.username,
  });
  res.json({ ok: true });
});

app.post("/api/chats/hide", (req, res) => {
  const { username, chatIds = [] } = req.body || {};
  if (!username || !Array.isArray(chatIds) || !chatIds.length) {
    return res
      .status(400)
      .json({ error: "Username and chatIds are required." });
  }
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  hideChatsForUser(
    user.id,
    chatIds.map((id) => Number(id)).filter(Boolean),
  );
  res.json({ ok: true });
});

app.post("/api/messages", (req, res) => {
  const { chatId, username, body } = req.body || {};
  if (!chatId || !username || !body) {
    return res.status(400).json({
      error: "Chat, username, and message body are required.",
    });
  }

  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!isMember(Number(chatId), user.id)) {
    return res
      .status(403)
      .json({ error: "Not a member of this chat." });
  }

  const id = createMessage(Number(chatId), user.id, body);
  emitChatEvent(Number(chatId), {
    type: "chat_message",
    chatId: Number(chatId),
    messageId: Number(id),
    username: user.username,
  });

  res.json({ id });
});

if (isProduction) {
  app.use("/api", apiLimiter);
  app.use(staticLimiter);

  const clientDist = path.resolve(process.cwd(), "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Songbird server running on http://localhost:${port}`);
});

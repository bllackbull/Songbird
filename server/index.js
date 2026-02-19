import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
  addChatMember,
  createChat,
  createMessageFiles,
  createMessage,
  createSession,
  deleteSession,
  createUser,
  findDmChat,
  findUserById,
  findUserByUsername,
  getMessages,
  listMessageFilesByMessageIds,
  getSession,
  isMember,
  listChatMembers,
  listChatsForUser,
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
} from "./db.js";

const app = express();
const port = process.env.PORT || 5174;
const isProduction = process.env.NODE_ENV === "production";
const serverDir = path.dirname(fileURLToPath(import.meta.url));

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
const sseClientsByUsername = new Map();
const dataDir = path.resolve(serverDir, "..", "data");
const uploadRootDir = path.join(dataDir, "uploads", "messages");
const MESSAGE_FILE_LIMITS = {
  maxFiles: 10,
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxTotalBytes: 75 * 1024 * 1024,
};

if (!fs.existsSync(uploadRootDir)) {
  fs.mkdirSync(uploadRootDir, { recursive: true });
}

app.use(
  "/uploads/messages",
  express.static(uploadRootDir, {
    etag: true,
    lastModified: true,
    maxAge: "365d",
    immutable: true,
    setHeaders: (res) => {
      // Uploaded message files are content-addressed by generated filename.
      // They can be cached aggressively by browsers and CDNs.
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Vary", "Accept-Encoding");
    },
  }),
);

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRootDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const uploadFiles = multer({
  storage: uploadStorage,
  limits: {
    fileSize: MESSAGE_FILE_LIMITS.maxFileSizeBytes,
    files: MESSAGE_FILE_LIMITS.maxFiles,
  },
});

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

function getRandomUserColor() {
  const index = Math.floor(Math.random() * USER_COLORS.length);
  return USER_COLORS[index];
}

function getUploadKind(uploadType, mimeType = "") {
  const type = String(mimeType || "").toLowerCase();
  if (uploadType === "media") {
    if (type.startsWith("image/") || type.startsWith("video/")) {
      return "media";
    }
    return null;
  }
  if (uploadType === "document") {
    return "document";
  }
  return null;
}

function decodeOriginalFilename(name = "") {
  try {
    return Buffer.from(String(name), "latin1").toString("utf8");
  } catch (_) {
    return String(name || "file");
  }
}

function inferMimeFromFilename(name = "") {
  const ext = path.extname(String(name || "")).toLowerCase();
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".m4v": "video/mp4",
  };
  return map[ext] || "";
}

function removeUploadedFiles(files = []) {
  files.forEach((file) => {
    try {
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (_) {
      // best effort cleanup
    }
  });
}

function parseUploadFileMetadata(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(String(rawValue));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function sanitizePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Math.round(n);
}

function sanitizeDurationSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return Math.round(n * 1000) / 1000;
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
  const lastMessageIds = chats
    .map((chat) => Number(chat.last_message_id || 0))
    .filter(Boolean);
  const lastFiles = listMessageFilesByMessageIds(lastMessageIds);
  const filesByMessageId = lastFiles.reduce((acc, file) => {
    const messageId = Number(file.message_id);
    if (!acc[messageId]) acc[messageId] = [];
    acc[messageId].push({
      id: Number(file.id),
      kind: file.kind,
      name: file.original_name,
      mimeType: file.mime_type,
      sizeBytes: Number(file.size_bytes || 0),
      width: Number.isFinite(Number(file.width_px)) ? Number(file.width_px) : null,
      height: Number.isFinite(Number(file.height_px)) ? Number(file.height_px) : null,
      durationSeconds: Number.isFinite(Number(file.duration_seconds))
        ? Number(file.duration_seconds)
        : null,
      url: `/uploads/messages/${file.stored_name}`,
    });
    return acc;
  }, {});
  const enrichedChats = chats.map((chat) => ({
    ...chat,
    last_message_files: filesByMessageId[Number(chat.last_message_id || 0)] || [],
  }));

  res.json({ chats: enrichedChats });
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
  const beforeId = Number(req.query.beforeId || 0);
  const limitRaw = Number(req.query.limit || 50);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(200, limitRaw))
    : 50;
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

  const { messages, hasMore, totalCount } = getMessages(chatId, {
    beforeId: beforeId > 0 ? beforeId : null,
    limit,
  });
  const messageIds = messages.map((message) => Number(message.id)).filter(Boolean);
  const files = listMessageFilesByMessageIds(messageIds);
  const filesByMessageId = files.reduce((acc, file) => {
    const messageId = Number(file.message_id);
    if (!acc[messageId]) acc[messageId] = [];
    acc[messageId].push({
      id: Number(file.id),
      kind: file.kind,
      name: file.original_name,
      mimeType: file.mime_type,
      sizeBytes: Number(file.size_bytes || 0),
      width: Number.isFinite(Number(file.width_px)) ? Number(file.width_px) : null,
      height: Number.isFinite(Number(file.height_px)) ? Number(file.height_px) : null,
      durationSeconds: Number.isFinite(Number(file.duration_seconds))
        ? Number(file.duration_seconds)
        : null,
      url: `/uploads/messages/${file.stored_name}`,
    });
    return acc;
  }, {});
  const enriched = messages.map((message) => ({
    ...message,
    files: filesByMessageId[Number(message.id)] || [],
  }));
  res.json({ chatId, messages: enriched, hasMore, totalCount });
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

app.post("/api/messages/upload", uploadFiles.array("files", MESSAGE_FILE_LIMITS.maxFiles), (req, res) => {
  const uploadedFiles = req.files || [];
  try {
    const chatId = Number(req.body?.chatId);
    const username = req.body?.username?.toString();
    const uploadType = req.body?.uploadType?.toString();
    const fileMeta = parseUploadFileMetadata(req.body?.fileMeta);
    const body = req.body?.body?.toString() || "";
    const trimmedBody = body.trim();

    if (!chatId || !username) {
      removeUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: "Chat and username are required." });
    }
    if (!uploadedFiles.length) {
      return res.status(400).json({ error: "At least one file is required." });
    }
    if (uploadedFiles.length > MESSAGE_FILE_LIMITS.maxFiles) {
      removeUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: `Maximum ${MESSAGE_FILE_LIMITS.maxFiles} files per message.` });
    }

    const user = findUserByUsername(username.toLowerCase());
    if (!user) {
      removeUploadedFiles(uploadedFiles);
      return res.status(404).json({ error: "User not found." });
    }
    if (!isMember(chatId, user.id)) {
      removeUploadedFiles(uploadedFiles);
      return res.status(403).json({ error: "Not a member of this chat." });
    }

    const totalBytes = uploadedFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
    if (totalBytes > MESSAGE_FILE_LIMITS.maxTotalBytes) {
      removeUploadedFiles(uploadedFiles);
      return res.status(400).json({
        error: `Total upload size cannot exceed ${Math.round(MESSAGE_FILE_LIMITS.maxTotalBytes / (1024 * 1024))} MB.`,
      });
    }

    const normalizedFiles = uploadedFiles.map((file, index) => {
      const originalName = decodeOriginalFilename(file.originalname || "file");
      const inferredMime = inferMimeFromFilename(originalName);
      const mimeType = (file.mimetype || inferredMime || "application/octet-stream").toLowerCase();
      const kind = getUploadKind(uploadType, mimeType);
      if (!kind) {
        throw new Error("Invalid file type for selected upload option.");
      }
      const meta = fileMeta[index] || {};
      return {
        kind,
        originalName,
        storedName: path.basename(file.filename),
        mimeType,
        sizeBytes: Number(file.size || 0),
        widthPx: sanitizePositiveInt(meta.width),
        heightPx: sanitizePositiveInt(meta.height),
        durationSeconds: sanitizeDurationSeconds(meta.durationSeconds),
      };
    });

    const fallbackBody =
      trimmedBody ||
      (normalizedFiles.length === 1
        ? `Sent ${normalizedFiles[0].kind === "media" ? "a media file" : "a document"}`
        : `Sent ${normalizedFiles.length} files`);

    const messageId = createMessage(chatId, user.id, fallbackBody);
    if (!messageId) {
      throw new Error("Unable to create message.");
    }
    createMessageFiles(messageId, normalizedFiles);

    emitChatEvent(chatId, {
      type: "chat_message",
      chatId,
      messageId: Number(messageId),
      username: user.username,
    });

    return res.json({ id: Number(messageId) });
  } catch (error) {
    removeUploadedFiles(uploadedFiles);
    return res.status(400).json({ error: error.message || "Unable to upload files." });
  }
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
  if (!id) {
    return res.status(500).json({ error: "Unable to create message." });
  }
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

  const clientDist = path.resolve(serverDir, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: `Each file must be smaller than ${Math.round(MESSAGE_FILE_LIMITS.maxFileSizeBytes / (1024 * 1024))} MB.` });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ error: `Maximum ${MESSAGE_FILE_LIMITS.maxFiles} files per message.` });
    }
    return res.status(400).json({ error: err.message });
  }
  return next(err);
});

app.listen(port, () => {
  console.log(`Songbird server running on http://localhost:${port}`);
});

import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
  addChatMember,
  adminGetAll,
  adminGetRow,
  adminRun,
  adminSave,
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
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env") });
dotenv.config({ path: path.join(serverDir, ".env"), override: true });

const readEnvInt = (keys, fallback, options = {}) => {
  const names = Array.isArray(keys) ? keys : [keys];
  const raw = names
    .map((name) => process.env[name])
    .find((value) => value !== undefined && value !== null && value !== "");
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const value = Math.trunc(parsed);
  if (options.min !== undefined && value < options.min) return fallback;
  if (options.max !== undefined && value > options.max) return fallback;
  return value;
};
const readEnvBool = (keys, fallback) => {
  const names = Array.isArray(keys) ? keys : [keys];
  const raw = names
    .map((name) => process.env[name])
    .find((value) => value !== undefined && value !== null && value !== "");
  if (raw === undefined || raw === null || raw === "") return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};
const port = process.env.PORT || 5174;
const appEnv = process.env.APP_ENV || "production";
const isProduction = appEnv === "production";

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});

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
const avatarUploadRootDir = path.join(dataDir, "uploads", "avatars");
const SHARED_MAX_FILE_SIZE_BYTES = readEnvInt(
  "FILE_UPLOAD_MAX_SIZE",
  25 * 1024 * 1024,
  { min: 1024 },
);
const MESSAGE_FILE_RETENTION_DAYS = readEnvInt(
  "MESSAGE_FILE_RETENTION",
  7,
  { min: 0, max: 3650 },
);
const FILE_UPLOAD = readEnvBool("FILE_UPLOAD", true);
const MESSAGE_FILE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MESSAGE_FILE_LIMITS = {
  maxFiles: 10,
  maxFileSizeBytes: SHARED_MAX_FILE_SIZE_BYTES,
  maxTotalBytes: 75 * 1024 * 1024,
};
const AVATAR_FILE_LIMITS = {
  maxFileSizeBytes: SHARED_MAX_FILE_SIZE_BYTES,
};
const SAFE_INLINE_MESSAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
  ".m4v",
  ".pdf",
]);
const DANGEROUS_FILE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".xhtml",
  ".svg",
  ".xml",
  ".js",
  ".mjs",
  ".cjs",
  ".wasm",
]);
const DANGEROUS_MIME_SNIPPETS = [
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/xml",
  "text/xml",
  "javascript",
];
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

if (!fs.existsSync(uploadRootDir)) {
  fs.mkdirSync(uploadRootDir, { recursive: true });
}
if (!fs.existsSync(avatarUploadRootDir)) {
  fs.mkdirSync(avatarUploadRootDir, { recursive: true });
}

app.use(
  "/api/uploads/messages",
  express.static(uploadRootDir, {
    etag: true,
    lastModified: true,
    maxAge: "365d",
    immutable: true,
    setHeaders: (res, servedPath) => {
      // Uploaded message files are content-addressed by generated filename.
      // They can be cached aggressively by browsers and CDNs.
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("X-Content-Type-Options", "nosniff");
      const ext = path.extname(String(servedPath || "")).toLowerCase();
      if (!SAFE_INLINE_MESSAGE_EXTENSIONS.has(ext)) {
        res.setHeader("Content-Disposition", 'attachment; filename="download"');
      }
    },
  }),
);

app.use(
  "/api/uploads/avatars",
  express.static(avatarUploadRootDir, {
    etag: true,
    lastModified: true,
    maxAge: "30d",
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=2592000");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("X-Content-Type-Options", "nosniff");
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

const avatarUploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarUploadRootDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `avatar-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const uploadAvatar = multer({
  storage: avatarUploadStorage,
  limits: {
    fileSize: AVATAR_FILE_LIMITS.maxFileSizeBytes,
    files: 1,
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
  const allowedRoots = [uploadRootDir, avatarUploadRootDir]
    .map((root) => path.resolve(String(root || "")))
    .filter(Boolean);

  const isInsideAllowedRoot = (candidatePath) => {
    return allowedRoots.some((root) => {
      const withSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
      return candidatePath === root || candidatePath.startsWith(withSep);
    });
  };

  files.forEach((file) => {
    try {
      const rawPath = typeof file?.path === "string" ? file.path : "";
      if (!rawPath) return;
      const filePath = path.resolve(String(rawPath || ""));
      if (!isInsideAllowedRoot(filePath)) return;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {
      // best effort cleanup
    }
  });
}

function removeStoredFileNames(storedNames = []) {
  storedNames.forEach((storedName) => {
    try {
      const safeName = path.basename(String(storedName || '').trim())
      if (!safeName) return
      const filePath = path.join(uploadRootDir, safeName)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (_) {
      // best effort cleanup
    }
  })
}

function removeAvatarByUrl(avatarUrl = "") {
  try {
    const raw = String(avatarUrl || "").trim();
    if (!raw.startsWith("/api/uploads/avatars/") && !raw.startsWith("/uploads/avatars/")) return;
    const safeName = path.basename(raw);
    if (!safeName) return;
    const filePath = path.join(avatarUploadRootDir, safeName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // best effort cleanup
  }
}

function resolveAvatarDiskPath(avatarUrl = "") {
  const raw = String(avatarUrl || "").trim();
  if (!raw.startsWith("/api/uploads/avatars/") && !raw.startsWith("/uploads/avatars/")) return null;
  const safeName = path.basename(raw);
  if (!safeName) return null;
  return path.join(avatarUploadRootDir, safeName);
}

function normalizeAvatarPublicUrl(avatarUrl = "") {
  const raw = String(avatarUrl || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/api/uploads/avatars/")) return raw;
  if (raw.startsWith("/uploads/avatars/")) {
    return `/api${raw}`;
  }
  return raw;
}

function ensureAvatarExists(userId, avatarUrl) {
  const value = String(avatarUrl || "").trim();
  if (!value) return null;
  const diskPath = resolveAvatarDiskPath(value);
  const normalized = normalizeAvatarPublicUrl(value);
  if (!diskPath) return normalized || null;
  if (fs.existsSync(diskPath)) return normalized || null;
  if (Number.isFinite(Number(userId)) && Number(userId) > 0) {
    adminRun("UPDATE users SET avatar_url = NULL WHERE id = ?", [Number(userId)]);
    adminSave();
  }
  return null;
}

function chunkIds(ids = [], size = 500) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

function cleanupMissingMessageFilesForMessageIds(messageIds = []) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!normalized.length) return { deletedMessageIds: [], changed: false };

  const rows = listMessageFilesByMessageIds(normalized);
  if (!rows.length) return { deletedMessageIds: [], changed: false };

  const missingMessageIds = new Set();
  rows.forEach((row) => {
    const stored = path.basename(String(row.stored_name || "").trim());
    if (!stored) return;
    const filePath = path.join(uploadRootDir, stored);
    if (!fs.existsSync(filePath)) {
      missingMessageIds.add(Number(row.message_id));
    }
  });

  if (!missingMessageIds.size) {
    return { deletedMessageIds: [], changed: false };
  }

  const targetMessageIds = Array.from(missingMessageIds);
  const placeholders = targetMessageIds.map(() => "?").join(", ");
  const allFilesRows = adminGetAll(
    `SELECT stored_name FROM chat_message_files WHERE message_id IN (${placeholders})`,
    targetMessageIds,
  );
  const storedNames = allFilesRows.map((row) => row.stored_name);

  adminRun("BEGIN");
  try {
    chunkIds(targetMessageIds, 500).forEach((chunk) => {
      const chunkPlaceholders = chunk.map(() => "?").join(", ");
      adminRun(
        `DELETE FROM chat_message_files WHERE message_id IN (${chunkPlaceholders})`,
        chunk,
      );
      adminRun(`DELETE FROM chat_messages WHERE id IN (${chunkPlaceholders})`, chunk);
    });
    adminRun("COMMIT");
  } catch (error) {
    adminRun("ROLLBACK");
    throw error;
  }

  removeStoredFileNames(storedNames);
  adminSave();
  return { deletedMessageIds: targetMessageIds, changed: true };
}

function cleanupExpiredMessageFiles() {
  if (MESSAGE_FILE_RETENTION_DAYS <= 0) {
    return { removedMessages: 0, removedFiles: 0 };
  }
  const nowIso = new Date().toISOString();
  const rows = adminGetAll(
    `SELECT DISTINCT message_id
     FROM chat_message_files
     WHERE expires_at IS NOT NULL AND expires_at != '' AND julianday(expires_at) <= julianday(?)`,
    [nowIso],
  );
  const messageIds = rows
    .map((row) => Number(row.message_id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!messageIds.length) {
    return { removedMessages: 0, removedFiles: 0 };
  }

  const placeholders = messageIds.map(() => "?").join(", ");
  const fileRows = adminGetAll(
    `SELECT stored_name FROM chat_message_files WHERE message_id IN (${placeholders})`,
    messageIds,
  );
  const storedNames = fileRows.map((row) => row.stored_name);

  adminRun("BEGIN");
  try {
    chunkArray(messageIds, 500).forEach((chunk) => {
      const chunkPlaceholders = chunk.map(() => "?").join(", ");
      adminRun(
        `DELETE FROM chat_message_files WHERE message_id IN (${chunkPlaceholders})`,
        chunk,
      );
      adminRun(`DELETE FROM chat_messages WHERE id IN (${chunkPlaceholders})`, chunk);
    });
    adminRun("COMMIT");
  } catch (error) {
    adminRun("ROLLBACK");
    throw error;
  }

  removeStoredFileNames(storedNames);
  adminSave();
  return { removedMessages: messageIds.length, removedFiles: storedNames.length };
}

function backfillMessageFileExpiry() {
  if (MESSAGE_FILE_RETENTION_DAYS <= 0) return 0;
  const nowDays = Number(MESSAGE_FILE_RETENTION_DAYS);
  const row = adminGetRow(
    `SELECT COUNT(*) AS n
     FROM chat_message_files
     WHERE (expires_at IS NULL OR expires_at = '')`,
  );
  const pending = Number(row?.n || 0);
  if (!pending) return 0;
  adminRun(
    `UPDATE chat_message_files
     SET expires_at = datetime(created_at, '+' || ? || ' days')
     WHERE (expires_at IS NULL OR expires_at = '')`,
    [nowDays],
  );
  adminSave();
  return pending;
}

function getDiskUsageInfo() {
  try {
    if (typeof fs.statfsSync !== "function") return null;
    const stat = fs.statfsSync(dataDir);
    const blockSize = Number(stat.bsize || 0);
    const blocks = Number(stat.blocks || 0);
    const freeBlocks = Number(stat.bavail || stat.bfree || 0);
    const totalBytes = blockSize * blocks;
    const freeBytes = blockSize * freeBlocks;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    return {
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent,
      freePercent: Math.max(0, 100 - usedPercent),
    };
  } catch (_) {
    return null;
  }
}

function buildInspectSnapshot(kind = "all", limit = 25) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 25));
  const mode = String(kind || "all").toLowerCase();
  const counts = {
    users: Number(adminGetRow("SELECT COUNT(*) AS n FROM users")?.n || 0),
    chats: Number(adminGetRow("SELECT COUNT(*) AS n FROM chats")?.n || 0),
    messages: Number(adminGetRow("SELECT COUNT(*) AS n FROM chat_messages")?.n || 0),
    files: Number(adminGetRow("SELECT COUNT(*) AS n FROM chat_message_files")?.n || 0),
  };
  const snapshot = {
    kind: mode,
    limit: safeLimit,
    counts,
    disk: getDiskUsageInfo(),
  };

  if (mode === "all" || mode === "user") {
    snapshot.users = adminGetAll(
      `SELECT id, username, nickname, status, avatar_url, created_at
       FROM users
       ORDER BY id ASC
       LIMIT ?`,
      [safeLimit],
    );
  }
  if (mode === "all" || mode === "chat") {
    snapshot.chats = adminGetAll(
      `SELECT c.id, c.type, c.name,
              (SELECT COUNT(*) FROM chat_members cm WHERE cm.chat_id = c.id) AS members,
              (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = c.id) AS messages,
              c.created_at
       FROM chats c
       ORDER BY c.id ASC
       LIMIT ?`,
      [safeLimit],
    );
  }
  if (mode === "all" || mode === "file") {
    snapshot.messageFiles = adminGetAll(
      `SELECT cmf.id, cmf.message_id, cm.chat_id, cm.user_id, cmf.kind, cmf.original_name, cmf.stored_name, cmf.mime_type, cmf.size_bytes, cmf.created_at
       FROM chat_message_files cmf
       JOIN chat_messages cm ON cm.id = cmf.message_id
       ORDER BY cmf.id ASC
       LIMIT ?`,
      [safeLimit],
    );
    snapshot.avatarFiles = adminGetAll(
      `SELECT id AS user_id, username, nickname, avatar_url
       FROM users
       WHERE avatar_url IS NOT NULL AND avatar_url != ''
       ORDER BY id ASC
       LIMIT ?`,
      [safeLimit],
    );
    snapshot.fileStorage = {
      messageFilesBytes: Number(
        adminGetRow("SELECT COALESCE(SUM(size_bytes), 0) AS n FROM chat_message_files")?.n || 0,
      ),
    };
  }
  return snapshot;
}

function removeAllMessageUploads() {
  try {
    if (fs.existsSync(uploadRootDir)) {
      fs.rmSync(uploadRootDir, { recursive: true, force: true })
    }
    fs.mkdirSync(uploadRootDir, { recursive: true })
  } catch (_) {
    // ignore
  }
}

function chunkArray(items = [], size = 500) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function hasEnoughFreeDiskSpace(requiredBytes = 0) {
  const required = Number(requiredBytes || 0);
  if (!Number.isFinite(required) || required <= 0) return true;
  const disk = getDiskUsageInfo();
  if (!disk || !Number.isFinite(Number(disk.freeBytes))) return true;
  const safetyBuffer = 1 * 1024 * 1024;
  return Number(disk.freeBytes) >= required + safetyBuffer;
}

function computeExpiryIso(createdAt = new Date(), days = MESSAGE_FILE_RETENTION_DAYS) {
  const safeDays = Number(days || 0);
  if (!Number.isFinite(safeDays) || safeDays <= 0) return null;
  const base = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const expiry = new Date(base.getTime() + safeDays * 24 * 60 * 60 * 1000);
  return expiry.toISOString();
}

function buildTimestampSchedule(count, daysBack) {
  const safeCountRaw = Number(count);
  const safeDaysRaw = Number(daysBack);
  const safeCount = Number.isFinite(safeCountRaw) ? Math.max(1, Math.min(10000, Math.trunc(safeCountRaw))) : 1;
  const days = Number.isFinite(safeDaysRaw) ? Math.max(1, Math.min(365, Math.trunc(safeDaysRaw))) : 1;
  const today = new Date()
  const startDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  startDay.setDate(startDay.getDate() - (days - 1))

  const perDay = new Array(days).fill(0)
  for (let i = 0; i < safeCount; i += 1) {
    perDay[i % days] += 1
  }

  const stamps = []
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const messagesInDay = perDay[dayIndex]
    if (!messagesInDay) continue
    const dayStart = new Date(startDay)
    dayStart.setDate(startDay.getDate() + dayIndex)
    const seconds = []
    for (let i = 0; i < messagesInDay; i += 1) {
      seconds.push(Math.floor(Math.random() * 86400))
    }
    seconds.sort((a, b) => a - b)
    for (let i = 0; i < seconds.length; i += 1) {
      stamps.push(new Date(dayStart.getTime() + seconds[i] * 1000).toISOString())
    }
  }
  return stamps
}

function isLoopbackRequest(req) {
  const source = String(req.ip || req.socket?.remoteAddress || '')
  return (
    source === '::1' ||
    source === '127.0.0.1' ||
    source === '::ffff:127.0.0.1'
  )
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

function requireSession(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Not authenticated." });
    return null;
  }
  return session;
}

function requireSessionUsernameMatch(res, session, suppliedUsername) {
  const supplied = String(suppliedUsername || "").trim().toLowerCase();
  if (supplied && supplied !== String(session.username || "").toLowerCase()) {
    res.status(403).json({ error: "Username does not match authenticated user." });
    return false;
  }
  return true;
}

function isDangerousUploadFile(originalName, mimeType) {
  const ext = path.extname(String(originalName || "")).toLowerCase();
  const lowerMime = String(mimeType || "").toLowerCase();
  if (DANGEROUS_FILE_EXTENSIONS.has(ext)) return true;
  return DANGEROUS_MIME_SNIPPETS.some((snippet) => lowerMime.includes(snippet));
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/events", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const username = req.query.username?.toString()?.toLowerCase();
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  if (!requireSessionUsernameMatch(res, session, username)) return;
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
    avatarUrl: ensureAvatarExists(id, avatarUrl?.trim()) || null,
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
    avatarUrl: ensureAvatarExists(user.id, user.avatar_url) || null,
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
    avatarUrl: ensureAvatarExists(session.id, session.avatar_url) || null,
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
  const session = requireSession(req, res);
  if (!session) return;
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
    avatarUrl: ensureAvatarExists(user.id, user.avatar_url) || null,
    color: user.color || "#10b981",
    status: user.status || "online",
  });
});

app.post("/api/presence", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const suppliedUsername = req.body?.username;
  if (!requireSessionUsernameMatch(res, session, suppliedUsername)) return;
  const user = findUserByUsername(String(session.username || "").toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  updateLastSeen(user.id);
  res.json({ ok: true });
});

app.get("/api/presence", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
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
  const session = requireSession(req, res);
  if (!session) return;
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
  if (!requireSessionUsernameMatch(res, session, currentUsername)) return;

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

  const nextAvatarUrl = String(avatarUrl || "").trim() || null;
  const currentAvatarUrl = String(currentUser.avatar_url || "").trim() || null;
  if (currentAvatarUrl && currentAvatarUrl !== nextAvatarUrl) {
    removeAvatarByUrl(currentAvatarUrl);
  }

  updateUserProfile(
    currentUser.id,
    trimmed,
    nickname?.trim() || null,
    nextAvatarUrl,
  );
  const updated = findUserById(currentUser.id);

  res.json({
    id: updated.id,
    username: updated.username,
    nickname: updated.nickname || null,
    avatarUrl: ensureAvatarExists(updated.id, updated.avatar_url) || null,
    color: updated.color || "#10b981",
    status: updated.status || "online",
  });
});

app.post("/api/profile/avatar", uploadAvatar.single("avatar"), (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    removeUploadedFiles(req.file ? [req.file] : []);
    return;
  }
  const currentUsername = String(req.body?.currentUsername || "").trim().toLowerCase();
  const file = req.file;

  if (!FILE_UPLOAD) {
    removeUploadedFiles(file ? [file] : []);
    return res.status(503).json({ error: "File uploads are disabled on this server." });
  }

  if (!currentUsername) {
    removeUploadedFiles(file ? [file] : []);
    return res.status(400).json({ error: "Current username is required." });
  }
  if (!requireSessionUsernameMatch(res, session, currentUsername)) {
    removeUploadedFiles(file ? [file] : []);
    return;
  }
  const user = findUserByUsername(currentUsername);
  if (!user) {
    removeUploadedFiles(file ? [file] : []);
    return res.status(404).json({ error: "User not found." });
  }
  if (!file) {
    return res.status(400).json({ error: "Avatar file is required." });
  }
  const avatarMime = String(file.mimetype || "").toLowerCase();
  if (!ALLOWED_AVATAR_MIME_TYPES.has(avatarMime)) {
    removeUploadedFiles([file]);
    return res.status(400).json({ error: "Avatar must be a JPEG, PNG, GIF, WEBP, or BMP image." });
  }
  if (!hasEnoughFreeDiskSpace(Number(file.size || 0))) {
    removeUploadedFiles([file]);
    return res.status(400).json({ error: "Not enough free storage space on server." });
  }

  const avatarUrl = `/api/uploads/avatars/${file.filename}`;
  if (String(user.avatar_url || "").trim() && user.avatar_url !== avatarUrl) {
    removeAvatarByUrl(user.avatar_url);
  }

  return res.json({
    avatarUrl,
    sizeBytes: Number(file.size || 0),
    maxFileSizeBytes: AVATAR_FILE_LIMITS.maxFileSizeBytes,
  });
});

app.put("/api/password", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
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

  if (!requireSessionUsernameMatch(res, session, username)) return;
  const user = findUserByUsername(username.toLowerCase());
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  updateUserPassword(user.id, passwordHash);

  res.json({ ok: true });
});

app.put("/api/status", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const { username, status } = req.body || {};
  if (!username || !status) {
    return res.status(400).json({ error: "Username and status are required." });
  }
  const allowed = new Set(["online", "idle", "invisible"]);
  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  if (!requireSessionUsernameMatch(res, session, username)) return;
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }
  updateUserStatus(user.id, status);
  res.json({ ok: true, status });
});

app.get("/api/users", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const exclude = req.query.exclude?.toString();
  const query = req.query.query?.toString();
  if (exclude && !requireSessionUsernameMatch(res, session, exclude)) return;
  const users = query
    ? searchUsers(query.toLowerCase(), exclude)
    : listUsers(exclude);
  res.json({
    users: users.map((item) => ({
      ...item,
      avatar_url: ensureAvatarExists(item.id, item.avatar_url),
    })),
  });
});

app.get("/api/chats", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const username = req.query.username?.toString();
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  if (!requireSessionUsernameMatch(res, session, username)) return;
  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  let chats = listChatsForUser(user.id).map((conv) => {
    const members = listChatMembers(conv.id).map((member) => ({
      ...member,
      avatar_url: ensureAvatarExists(member.id, member.avatar_url),
    }));
    return { ...conv, members };
  });
  const initialLastMessageIds = chats
    .map((chat) => Number(chat.last_message_id || 0))
    .filter(Boolean);
  const cleanup = cleanupMissingMessageFilesForMessageIds(initialLastMessageIds);
  if (cleanup.changed) {
    chats = listChatsForUser(user.id).map((conv) => {
      const members = listChatMembers(conv.id).map((member) => ({
        ...member,
        avatar_url: ensureAvatarExists(member.id, member.avatar_url),
      }));
      return { ...conv, members };
    });
  }
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
      expiresAt: file.expires_at || null,
      url: `/api/uploads/messages/${file.stored_name}`,
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
  const session = requireSession(req, res);
  if (!session) return;
  const { from, to } = req.body || {};
  if (!from || !to) {
    return res.status(400).json({ error: "Both users are required." });
  }
  if (!requireSessionUsernameMatch(res, session, from)) return;

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
  const session = requireSession(req, res);
  if (!session) return;
  const { name, type, members = [], creator } = req.body || {};
  if (!creator) {
    return res.status(400).json({ error: "Creator is required." });
  }
  if (!requireSessionUsernameMatch(res, session, creator)) return;

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
  const session = requireSession(req, res);
  if (!session) return;
  const chatId = Number(req.query.chatId);
  const username = req.query.username?.toString();
  const beforeId = Number(req.query.beforeId || 0);
  const beforeCreatedAt = req.query.beforeCreatedAt?.toString() || "";
  const limitRaw = Number(req.query.limit || 50);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(10000, limitRaw))
    : 50;
  if (!chatId || !username) {
    return res
      .status(400)
      .json({ error: "Chat and username are required." });
  }
  if (!requireSessionUsernameMatch(res, session, username)) return;

  const user = findUserByUsername(username.toLowerCase());
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  if (!isMember(chatId, user.id)) {
    return res
      .status(403)
      .json({ error: "Not a member of this chat." });
  }

  let { messages, hasMore, totalCount } = getMessages(chatId, {
    beforeId: beforeId > 0 ? beforeId : null,
    beforeCreatedAt: beforeCreatedAt || null,
    limit,
  });
  const cleanup = cleanupMissingMessageFilesForMessageIds(
    messages.map((message) => Number(message.id)).filter(Boolean),
  );
  if (cleanup.changed) {
    const refreshed = getMessages(chatId, {
      beforeId: beforeId > 0 ? beforeId : null,
      beforeCreatedAt: beforeCreatedAt || null,
      limit,
    });
    messages = refreshed.messages;
    hasMore = refreshed.hasMore;
    totalCount = refreshed.totalCount;
  }
  const normalizedMessages = messages.map((message) => ({
    ...message,
    avatar_url: ensureAvatarExists(message.user_id, message.avatar_url),
  }));
  const messageIds = normalizedMessages.map((message) => Number(message.id)).filter(Boolean);
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
      expiresAt: file.expires_at || null,
      url: `/api/uploads/messages/${file.stored_name}`,
    });
    return acc;
  }, {});
  const enriched = normalizedMessages.map((message) => ({
    ...message,
    files: filesByMessageId[Number(message.id)] || [],
  }));
  res.json({ chatId, messages: enriched, hasMore, totalCount });
});

app.post("/api/messages/read", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const { chatId, username } = req.body || {};
  if (!chatId || !username) {
    return res
      .status(400)
      .json({ error: "Chat and username are required." });
  }
  if (!requireSessionUsernameMatch(res, session, username)) return;
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
  const session = requireSession(req, res);
  if (!session) return;
  const { username, chatIds = [] } = req.body || {};
  if (!username || !Array.isArray(chatIds) || !chatIds.length) {
    return res
      .status(400)
      .json({ error: "Username and chatIds are required." });
  }
  if (!requireSessionUsernameMatch(res, session, username)) return;
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
  const session = requireSession(req, res);
  if (!session) {
    removeUploadedFiles(req.files || []);
    return;
  }
  if (!Array.isArray(req.files)) {
    return res.status(400).json({ error: "Invalid files payload." });
  }
  const uploadedFiles = req.files;
  try {
    if (!FILE_UPLOAD) {
      removeUploadedFiles(uploadedFiles);
      return res.status(503).json({ error: "File uploads are disabled on this server." });
    }
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
    if (!requireSessionUsernameMatch(res, session, username)) {
      removeUploadedFiles(uploadedFiles);
      return;
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
    if (!hasEnoughFreeDiskSpace(totalBytes)) {
      removeUploadedFiles(uploadedFiles);
      return res.status(400).json({
        error: "Not enough free storage space on server.",
      });
    }

    const createdAtIso = new Date().toISOString();
    const expiresAtIso = computeExpiryIso(createdAtIso, MESSAGE_FILE_RETENTION_DAYS);
    const normalizedFiles = uploadedFiles.map((file, index) => {
      const originalName = decodeOriginalFilename(file.originalname || "file");
      const inferredMime = inferMimeFromFilename(originalName);
      const mimeType = (file.mimetype || inferredMime || "application/octet-stream").toLowerCase();
      if (isDangerousUploadFile(originalName, mimeType)) {
        throw new Error("This file type is not allowed for security reasons.");
      }
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
        expiresAt: expiresAtIso,
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
  const session = requireSession(req, res);
  if (!session) return;
  const { chatId, username, body } = req.body || {};
  if (!chatId || !username || !body) {
    return res.status(400).json({
      error: "Chat, username, and message body are required.",
    });
  }

  if (!requireSessionUsernameMatch(res, session, username)) return;
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

app.post('/api/admin/db-tools', async (req, res) => {
  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const expectedToken = process.env.ADMIN_API_TOKEN
  if (expectedToken) {
    const provided = String(req.headers['x-songbird-admin-token'] || '')
    if (!provided || provided !== expectedToken) {
      return res.status(401).json({ error: 'Invalid admin token.' })
    }
  }

  const action = String(req.body?.action || '').trim().toLowerCase()
  const payload = req.body?.payload || {}

  try {
    if (action === 'delete_chats') {
      let chatIds = Array.isArray(payload.chatIds)
        ? payload.chatIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : []
      if (!chatIds.length) {
        chatIds = adminGetAll('SELECT id FROM chats ORDER BY id ASC')
          .map((row) => Number(row.id))
          .filter((id) => Number.isFinite(id) && id > 0)
      }

      if (!chatIds.length) {
        return res.json({ ok: true, result: { removedChats: 0, removedFiles: 0 } })
      }

      const placeholders = chatIds.map(() => '?').join(', ')
      const fileRows = adminGetAll(
        `SELECT cmf.stored_name
         FROM chat_message_files cmf
         JOIN chat_messages cm ON cm.id = cmf.message_id
         WHERE cm.chat_id IN (${placeholders})`,
        chatIds,
      )
      const storedNames = fileRows.map((row) => row.stored_name)

      adminRun('BEGIN')
      try {
        chunkArray(chatIds, 500).forEach((chunk) => {
          const chunkPlaceholders = chunk.map(() => '?').join(', ')
          adminRun(
            `DELETE FROM chat_message_files WHERE message_id IN (
              SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
            )`,
            chunk,
          )
          adminRun(`DELETE FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          adminRun(`DELETE FROM chat_members WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          adminRun(`DELETE FROM hidden_chats WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          adminRun(`DELETE FROM chats WHERE id IN (${chunkPlaceholders})`, chunk)
        })
        adminRun('COMMIT')
      } catch (error) {
        adminRun('ROLLBACK')
        throw error
      }

      removeStoredFileNames(storedNames)
      adminSave()
      return res.json({ ok: true, result: { removedChats: chatIds.length, removedFiles: storedNames.length } })
    }

    if (action === 'delete_users') {
      const selectors = Array.isArray(payload.selectors) ? payload.selectors : []
      let userIds = []
      selectors.forEach((selector) => {
        const raw = String(selector || '').trim()
        if (!raw) return
        const numeric = Number(raw)
        if (Number.isFinite(numeric) && numeric > 0) {
          userIds.push(Math.trunc(numeric))
          return
        }
        const row = adminGetRow('SELECT id FROM users WHERE username = ?', [raw])
        if (row?.id) userIds.push(Number(row.id))
      })

      if (!userIds.length) {
        userIds = adminGetAll('SELECT id FROM users ORDER BY id ASC')
          .map((row) => Number(row.id))
          .filter((id) => Number.isFinite(id) && id > 0)
      }

      userIds = Array.from(new Set(userIds))
      if (!userIds.length) {
        return res.json({ ok: true, result: { removedUsers: 0, removedFiles: 0, removedChats: 0 } })
      }

      const userPlaceholders = userIds.map(() => '?').join(', ')
      const fileRows = adminGetAll(
        `SELECT cmf.stored_name
         FROM chat_message_files cmf
         JOIN chat_messages cm ON cm.id = cmf.message_id
         WHERE cm.user_id IN (${userPlaceholders})`,
        userIds,
      )
      const storedNames = fileRows.map((row) => row.stored_name)

      adminRun('BEGIN')
      try {
        chunkArray(userIds, 500).forEach((chunk) => {
          const chunkPlaceholders = chunk.map(() => '?').join(', ')
          adminRun(`DELETE FROM sessions WHERE user_id IN (${chunkPlaceholders})`, chunk)
          adminRun(`DELETE FROM hidden_chats WHERE user_id IN (${chunkPlaceholders})`, chunk)
          adminRun(`UPDATE chat_messages SET read_by_user_id = NULL WHERE read_by_user_id IN (${chunkPlaceholders})`, chunk)
          adminRun(
            `DELETE FROM chat_message_files WHERE message_id IN (
              SELECT id FROM chat_messages WHERE user_id IN (${chunkPlaceholders})
            )`,
            chunk,
          )
          adminRun(`DELETE FROM chat_messages WHERE user_id IN (${chunkPlaceholders})`, chunk)
          adminRun(`DELETE FROM chat_members WHERE user_id IN (${chunkPlaceholders})`, chunk)
          adminRun(`DELETE FROM users WHERE id IN (${chunkPlaceholders})`, chunk)
        })

        const orphanRows = adminGetAll(`
          SELECT c.id
          FROM chats c
          LEFT JOIN chat_members cm ON cm.chat_id = c.id
          GROUP BY c.id
          HAVING COUNT(cm.user_id) = 0
        `)
        const orphanChatIds = orphanRows
          .map((row) => Number(row.id))
          .filter((id) => Number.isFinite(id) && id > 0)

        if (orphanChatIds.length) {
          chunkArray(orphanChatIds, 500).forEach((chunk) => {
            const chunkPlaceholders = chunk.map(() => '?').join(', ')
            const orphanFiles = adminGetAll(
              `SELECT cmf.stored_name
               FROM chat_message_files cmf
               JOIN chat_messages cm ON cm.id = cmf.message_id
               WHERE cm.chat_id IN (${chunkPlaceholders})`,
              chunk,
            )
            storedNames.push(...orphanFiles.map((row) => row.stored_name))
            adminRun(
              `DELETE FROM chat_message_files WHERE message_id IN (
                SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
              )`,
              chunk,
            )
            adminRun(`DELETE FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})`, chunk)
            adminRun(`DELETE FROM hidden_chats WHERE chat_id IN (${chunkPlaceholders})`, chunk)
            adminRun(`DELETE FROM chats WHERE id IN (${chunkPlaceholders})`, chunk)
          })
        }

        adminRun('COMMIT')
      } catch (error) {
        adminRun('ROLLBACK')
        throw error
      }

      removeStoredFileNames(storedNames)
      adminSave()
      return res.json({ ok: true, result: { removedUsers: userIds.length, removedFiles: storedNames.length } })
    }

    if (action === 'create_user') {
      const nickname = String(payload.nickname || '').trim()
      const username = String(payload.username || '').trim().toLowerCase()
      const password = String(payload.password || '')
      if (!username || !password) {
        return res.status(400).json({ error: 'username and password are required.' })
      }
      if (!USERNAME_REGEX.test(username)) {
        return res.status(400).json({ error: 'Invalid username format.' })
      }
      const existing = findUserByUsername(username)
      if (existing) {
        return res.status(409).json({ error: 'Username already exists.' })
      }
      const passwordHash = await bcrypt.hash(password, 10)
      const id = createUser(username, passwordHash, nickname || username)
      return res.json({ ok: true, result: { id, username, nickname: nickname || username } })
    }

    if (action === 'generate_users') {
      const count = Math.max(1, Math.min(5000, Number(payload.count || 0) || 10))
      const password = String(payload.password || 'Passw0rd!')
      const nicknamePrefix = String(payload.nicknamePrefix || 'User')
      const usernamePrefix = String(payload.usernamePrefix || 'user')

      const randomToken = (length = 8) => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
        let out = ''
        for (let i = 0; i < length; i += 1) {
          out += chars[crypto.randomInt(0, chars.length)]
        }
        return out
      }

      const passwordHash = await bcrypt.hash(password, 10)
      let created = 0
      for (let i = 0; i < count; i += 1) {
        let username = ''
        do {
          username = `${usernamePrefix}_${randomToken(8)}`.toLowerCase()
        } while (findUserByUsername(username))
        createUser(username, passwordHash, `${nicknamePrefix} ${i + 1}`)
        created += 1
      }
      return res.json({ ok: true, result: { created } })
    }

    if (action === 'generate_chat_messages') {
      const chatId = Number(payload.chatId)
      const count = Math.max(1, Math.min(10000, Number(payload.count || 0) || 100))
      const days = Math.max(1, Math.min(365, Number(payload.days || 0) || 7))
      const userASelector = String(payload.userA || '').trim()
      const userBSelector = String(payload.userB || '').trim()

      if (!chatId || !userASelector || !userBSelector) {
        return res.status(400).json({ error: 'chatId, userA, and userB are required.' })
      }

      const resolveUserId = (selector) => {
        const numeric = Number(selector)
        if (Number.isFinite(numeric) && numeric > 0) {
          const row = findUserById(Number(numeric))
          return row?.id ? Number(row.id) : null
        }
        const row = findUserByUsername(String(selector).toLowerCase())
        return row?.id ? Number(row.id) : null
      }

      const userAId = resolveUserId(userASelector)
      const userBId = resolveUserId(userBSelector)
      if (!userAId || !userBId || userAId === userBId) {
        return res.status(400).json({ error: 'Invalid users for message generation.' })
      }
      if (!adminGetRow('SELECT id FROM chats WHERE id = ?', [chatId])) {
        return res.status(404).json({ error: 'Chat not found.' })
      }
      addChatMember(chatId, userAId)
      addChatMember(chatId, userBId)

      const samples = [
        'Hello there',
        'How are you doing?',
        'Sounds good',
        'I will check and reply',
        'Can you send details?',
        'Sure, one second',
        'Thanks',
        'Got it',
        'Let us do it',
        'Looks great',
        'See you soon',
      ]
      const timestamps = buildTimestampSchedule(count, days)
      for (let i = 0; i < count; i += 1) {
        const senderId = i % 2 === 0 ? userAId : userBId
        const body = `${samples[i % samples.length]} #${i + 1}`
        adminRun(
          'INSERT INTO chat_messages (chat_id, user_id, body, created_at, read_at, read_by_user_id) VALUES (?, ?, ?, ?, NULL, NULL)',
          [chatId, senderId, body, timestamps[i]],
        )
      }
      adminSave()
      return res.json({ ok: true, result: { created: count, chatId } })
    }

    if (action === 'inspect_db') {
      const kind = String(payload.kind || 'all').toLowerCase()
      const limit = Math.max(1, Math.min(1000, Number(payload.limit || 25) || 25))
      return res.json({ ok: true, result: buildInspectSnapshot(kind, limit) })
    }

    if (action === 'delete_files') {
      const selectors = Array.isArray(payload.selectors)
        ? payload.selectors.map((value) => String(value || '').trim()).filter(Boolean)
        : []
      const deleteAll = selectors.length === 0

      let targetMessageIds = []
      let messageStoredNames = []
      let targetAvatarUsers = []

      if (deleteAll) {
        targetMessageIds = adminGetAll(
          'SELECT DISTINCT message_id FROM chat_message_files ORDER BY message_id ASC',
        )
          .map((row) => Number(row.message_id))
          .filter((id) => Number.isFinite(id) && id > 0)
        messageStoredNames = adminGetAll('SELECT stored_name FROM chat_message_files').map(
          (row) => row.stored_name,
        )
        targetAvatarUsers = adminGetAll(
          `SELECT id, avatar_url
           FROM users
           WHERE avatar_url LIKE '/uploads/avatars/%'
              OR avatar_url LIKE '/api/uploads/avatars/%'`,
        )
      } else {
        const numericIds = selectors
          .map((value) => Number(value))
          .filter((id) => Number.isFinite(id) && id > 0)
        const named = selectors.map((value) => path.basename(value)).filter(Boolean)

        const byIdRows = numericIds.length
          ? adminGetAll(
              `SELECT id, message_id, stored_name FROM chat_message_files WHERE id IN (${numericIds
                .map(() => '?')
                .join(', ')})`,
              numericIds,
            )
          : []
        const byNameRows = named.length
          ? adminGetAll(
              `SELECT id, message_id, stored_name FROM chat_message_files WHERE stored_name IN (${named
                .map(() => '?')
                .join(', ')})`,
              named,
            )
          : []
        const fileRows = [...byIdRows, ...byNameRows]
        targetMessageIds = Array.from(
          new Set(
            fileRows
              .map((row) => Number(row.message_id))
              .filter((id) => Number.isFinite(id) && id > 0),
          ),
        )
        if (targetMessageIds.length) {
          messageStoredNames = adminGetAll(
            `SELECT stored_name FROM chat_message_files WHERE message_id IN (${targetMessageIds
              .map(() => '?')
              .join(', ')})`,
            targetMessageIds,
          ).map((row) => row.stored_name)
        }
        if (named.length) {
          targetAvatarUsers = adminGetAll(
            `SELECT id, avatar_url
             FROM users
             WHERE avatar_url LIKE '/uploads/avatars/%'
                OR avatar_url LIKE '/api/uploads/avatars/%'`,
          ).filter((row) => named.includes(path.basename(String(row.avatar_url || ''))))
        }
      }

      adminRun('BEGIN')
      try {
        if (targetMessageIds.length) {
          chunkArray(targetMessageIds, 500).forEach((chunk) => {
            const placeholders = chunk.map(() => '?').join(', ')
            adminRun(`DELETE FROM chat_message_files WHERE message_id IN (${placeholders})`, chunk)
            adminRun(`DELETE FROM chat_messages WHERE id IN (${placeholders})`, chunk)
          })
        }
        if (targetAvatarUsers.length) {
          chunkArray(
            targetAvatarUsers.map((row) => Number(row.id)).filter(Boolean),
            500,
          ).forEach((chunk) => {
            const placeholders = chunk.map(() => '?').join(', ')
            adminRun(`UPDATE users SET avatar_url = NULL WHERE id IN (${placeholders})`, chunk)
          })
        }
        adminRun('COMMIT')
      } catch (error) {
        adminRun('ROLLBACK')
        throw error
      }

      removeStoredFileNames(messageStoredNames)
      const avatarNames = targetAvatarUsers.map((row) =>
        path.basename(String(row.avatar_url || '').trim()),
      )
      avatarNames.forEach((name) => {
        try {
          const filePath = path.join(avatarUploadRootDir, name)
          if (name && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } catch (_) {
          // best effort cleanup
        }
      })

      adminSave()
      return res.json({
        ok: true,
        result: {
          removedMessages: targetMessageIds.length,
          removedMessageFiles: messageStoredNames.length,
          removedAvatars: targetAvatarUsers.length,
        },
      })
    }

    if (action === 'reset_db' || action === 'delete_db') {
      adminRun('BEGIN')
      try {
        adminRun('DELETE FROM chat_message_files')
        adminRun('DELETE FROM chat_messages')
        adminRun('DELETE FROM hidden_chats')
        adminRun('DELETE FROM chat_members')
        adminRun('DELETE FROM chats')
        adminRun('DELETE FROM sessions')
        adminRun('DELETE FROM users')
        adminRun('COMMIT')
      } catch (error) {
        adminRun('ROLLBACK')
        throw error
      }
      removeAllMessageUploads()
      adminSave()
      return res.json({ ok: true, result: { cleared: true } })
    }

    return res.status(400).json({ error: 'Unknown admin action.' })
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Admin action failed.' })
  }
})

if (isProduction) {
  app.use("/api", apiLimiter);
  app.use(staticLimiter);

  const clientDist = path.resolve(serverDir, "..", "client", "dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      if (req.path === "/api/profile/avatar") {
        return res
          .status(400)
          .json({ error: `Profile photo must be smaller than ${Math.round(AVATAR_FILE_LIMITS.maxFileSizeBytes / (1024 * 1024))} MB.` });
      }
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

if (MESSAGE_FILE_RETENTION_DAYS > 0) {
  try {
    backfillMessageFileExpiry();
    cleanupExpiredMessageFiles();
  } catch (_) {
    // best effort startup cleanup
  }
  const expiryCleanupTimer = setInterval(() => {
    try {
      cleanupExpiredMessageFiles();
    } catch (_) {
      // keep server alive if cleanup fails
    }
  }, MESSAGE_FILE_CLEANUP_INTERVAL_MS);
  if (typeof expiryCleanupTimer.unref === "function") {
    expiryCleanupTimer.unref();
  }
}

app.listen(port, () => {
  console.log(`Songbird server running on http://localhost:${port}`);
});

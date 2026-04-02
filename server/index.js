import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import multer from "multer";
import webpush from "web-push";
import { registerApiRoutes } from "./api/index.js";
import { USER_COLORS, setUserColor } from "./settings/colors.js";
import { readEnvBool, readEnvInt } from "./settings/env.js";
import {
  addChatMember,
  adminGetAll,
  adminGetRow,
  adminRun,
  adminSave,
  ensureSavedChatForUser,
  clearGroupMemberRemoved,
  createChat,
  createMessageFiles,
  createMessage,
  createSession,
  deleteSession,
  createUser,
  deleteChatById,
  deleteUserById,
  findChatById,
  findDmChat,
  findChatByGroupUsername,
  findChatByInviteToken,
  findMessageById,
  findUserById,
  findUserByUsername,
  getMessageReadCounts,
  getMessageAuthors,
  getMessageReadByUser,
  getMessages,
  recordMessageReads,
  listMessageFilesByMessageIds,
  markGroupMemberRemoved,
  regenerateGroupInviteToken,
  removeChatMember,
  getSession,
  isMember,
  isGroupMemberRemoved,
  listChatMembers,
  listChatsForUser,
  listUsers,
  searchUsers,
  searchPublicGroups,
  searchPublicChannels,
  setChatMuted,
  touchSession,
  updateLastSeen,
  getUserPresence,
  hideChatsForUser,
  markMessagesRead,
  markMessageRead,
  updateUserPassword,
  updateUserProfile,
  updateUserStatus,
  updateGroupChat,
  updateChannelChat,
  unhideChat,
  getChatMemberRole,
  setChatMemberRole,
  upsertPushSubscription,
  deletePushSubscription,
  listPushSubscriptionsByUserIds,
  listMutedUserIdsForChat,
} from "./db.js";

const app = express();
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env") });
dotenv.config({ path: path.join(serverDir, ".env"), override: true });

function updateEnvValue(envPath, key, value) {
  const safeValue = String(value ?? "");
  let contents = "";
  try {
    contents = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  } catch (_) {
    contents = "";
  }
  const lines = contents ? contents.split(/\r?\n/) : [];
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${safeValue}`;
    }
    return line;
  });
  if (!found) {
    updated.push(`${key}=${safeValue}`);
  }
  const next = updated.filter((line, idx, arr) => line.length > 0 || idx < arr.length - 1);
  fs.writeFileSync(envPath, `${next.join("\n")}\n`);
}

function ensureValidVapidKeys() {
  const envPath = path.join(projectRootDir, ".env");
  const subject = String(process.env.VAPID_SUBJECT || "mailto:admin@example.com").trim();
  let publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  let privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();

  const decodeBase64Url = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    try {
      return Buffer.from(raw, "base64url");
    } catch {
      try {
        const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
        return Buffer.from(padded, "base64");
      } catch {
        return null;
      }
    }
  };

  const isValidVapidPublicKey = (value) => {
    const decoded = decodeBase64Url(value);
    return decoded && decoded.length === 65;
  };

  const isValidVapidPrivateKey = (value) => {
    const decoded = decodeBase64Url(value);
    return decoded && decoded.length === 32;
  };

  const tryValidate = () => {
    if (!publicKey || !privateKey) return false;
    if (!isValidVapidPublicKey(publicKey) || !isValidVapidPrivateKey(privateKey)) {
      return false;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      return true;
    } catch (_) {
      return false;
    }
  };

  if (tryValidate()) {
    return { publicKey, privateKey, subject };
  }

  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
  try {
    updateEnvValue(envPath, "VAPID_PUBLIC_KEY", publicKey);
    updateEnvValue(envPath, "VAPID_PRIVATE_KEY", privateKey);
    if (!String(process.env.VAPID_SUBJECT || "").trim()) {
      updateEnvValue(envPath, "VAPID_SUBJECT", subject);
    }
  } catch (error) {
    console.warn("[push] Unable to update .env with regenerated VAPID keys:", String(error?.message || error));
  }
  process.env.VAPID_PUBLIC_KEY = publicKey;
  process.env.VAPID_PRIVATE_KEY = privateKey;
  process.env.VAPID_SUBJECT = subject;
  return { publicKey, privateKey, subject };
}

const port = process.env.SERVER_PORT || process.env.PORT || 5174;
const appEnv = process.env.APP_ENV || "production";
const isProduction = appEnv === "production";
const APP_DEBUG = readEnvBool("APP_DEBUG", false);

function debugLog(...args) {
  if (!APP_DEBUG) return;
  console.log("[app-debug]", ...args);
}

const debugRouteCounts = new Map();

if (APP_DEBUG) {
  setInterval(() => {
    const entries = Array.from(debugRouteCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([route, count]) => ({ route, count }));

    debugLog("api:requests-per-minute", { routes: entries });

    debugRouteCounts.clear();
  }, 60 * 1000);
}

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});

if (APP_DEBUG) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    let responseBody = null;
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on("finish", () => {
      const routeKey = `${String(req.method || "GET").toUpperCase()} ${
        String(req.path || req.originalUrl || req.url || "").split("?")[0]
      }`;

      debugRouteCounts.set(
        routeKey,
        Number(debugRouteCounts.get(routeKey) || 0) + 1,
      );

      debugLog("api:request", {
        method: req.method,
        path: req.originalUrl || req.url || "",
        query: req.query || {},
        params: req.params || {},
        body: req.body || {},
        status: Number(res.statusCode || 0),
        durationMs: Date.now() - startedAt,
        response: responseBody,
      });
    });
    next();
  });
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});

const USERNAME_REGEX = /^[a-z0-9._]+$/;
const USERNAME_MAX = readEnvInt("USERNAME_MAX", 16, { min: 3, max: 32 });
const NICKNAME_MAX = readEnvInt("NICKNAME_MAX", 24, { min: 3, max: 64 });
const MESSAGE_MAX_CHARS = readEnvInt(
  ["MESSAGE_MAX_CHARS", "MESSAGE_MAX"],
  4000,
  { min: 1, max: 20000 },
);
const ACCOUNT_CREATION = readEnvBool("ACCOUNT_CREATION", true);
const vapid = ensureValidVapidKeys();
const VAPID_PUBLIC_KEY = String(vapid.publicKey || "").trim();
const VAPID_PRIVATE_KEY = String(vapid.privateKey || "").trim();
const VAPID_SUBJECT = String(vapid.subject || "mailto:admin@example.com").trim();
const PUSH_ENABLED = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
const sseClientsByUsername = new Map();
const dataDir = path.resolve(serverDir, "..", "data");
const uploadRootDir = path.join(dataDir, "uploads", "messages");
const avatarUploadRootDir = path.join(dataDir, "uploads", "avatars");

const FILE_UPLOAD_MAX_SIZE = readEnvInt(
  "FILE_UPLOAD_MAX_SIZE",
  25 * 1024 * 1024,
  { min: 1024 },
);

const FILE_UPLOAD_MAX_FILES = readEnvInt("FILE_UPLOAD_MAX_FILES", 10, {
  min: 1,
});

const FILE_UPLOAD_MAX_TOTAL_SIZE = readEnvInt(
  "FILE_UPLOAD_MAX_TOTAL_SIZE",
  78643200,
);

const MESSAGE_FILE_RETENTION_DAYS = readEnvInt("MESSAGE_FILE_RETENTION", 7, {
  min: 0,
  max: 3650,
});

const TRANSCODE_VIDEOS_TO_H264 = readEnvBool(
  "FILE_UPLOAD_TRANSCODE_VIDEOS",
  true,
);

const FILE_UPLOAD = readEnvBool("FILE_UPLOAD", true);
const MESSAGE_FILE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const TRANSCODED_VIDEO_NAME_TAG = "-h264-";
const videoTranscodeQueue = [];
let videoTranscodeWorkerRunning = false;
let ffmpegAvailabilityChecked = false;
let ffmpegAvailable = false;

const MESSAGE_FILE_LIMITS = {
  maxFiles: FILE_UPLOAD_MAX_FILES,
  maxFileSizeBytes: FILE_UPLOAD_MAX_SIZE,
  maxTotalBytes: FILE_UPLOAD_MAX_TOTAL_SIZE,
};

const AVATAR_FILE_LIMITS = {
  maxFileSizeBytes: FILE_UPLOAD_MAX_SIZE,
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

function buildDownloadFilename(value) {
  const raw = String(value || "download");
  const cleaned = raw
    .replace(/[\r\n"]/g, "")
    .replace(/[\\/:*?<>|%]/g, "_")
    .trim();
  return cleaned || "download";
}

function buildAsciiFallbackFilename(value) {
  const cleaned = buildDownloadFilename(value)
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "download";
}

app.get("/api/uploads/messages/:storedName", (req, res) => {
  const storedName = path.basename(String(req.params?.storedName || "").trim());
  if (!storedName) return res.status(404).end();

  const filePath = path.join(uploadRootDir, storedName);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const row = adminGetRow(
    "SELECT original_name, mime_type FROM chat_message_files WHERE stored_name = ?",
    [storedName],
  );
  const originalName = buildDownloadFilename(row?.original_name);
  const fallbackName = buildAsciiFallbackFilename(originalName);
  const mimeType = String(row?.mime_type || "").trim();
  const ext = path.extname(storedName).toLowerCase();

  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Vary", "Accept-Encoding");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (mimeType) {
    res.type(mimeType);
  }

  const forceDownload =
    String(req.query?.download || "").toLowerCase() === "1" ||
    String(req.query?.download || "").toLowerCase() === "true";
  if (forceDownload || !SAFE_INLINE_MESSAGE_EXTENSIONS.has(ext)) {
    const encoded = encodeURIComponent(originalName);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encoded}`,
    );
  }

  return res.sendFile(filePath);
});

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
    cb(
      null,
      `avatar-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`,
    );
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

if (PUSH_ENABLED) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (error) {
    console.error("[push] VAPID setup failed:", String(error?.message || error));
  }
}

async function sendPushNotificationToUsers(userIds = [], payload = {}) {
  if (!PUSH_ENABLED) return;
  const targets = listPushSubscriptionsByUserIds(userIds);
  if (!targets.length) return;
  const body = JSON.stringify(payload || {});
  await Promise.all(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh || "",
              auth: sub.auth || "",
            },
          },
          body,
        );
      } catch (error) {
        const status = Number(error?.statusCode || 0);
        if (status === 404 || status === 410) {
          deletePushSubscription(sub.endpoint);
        }
      }
    }),
  );
}

function getUploadKind(uploadType, mimeType = "") {
  const type = String(mimeType || "").toLowerCase();

  if (uploadType === "media") {
    if (type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/")) {
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

function removeUploadedFiles(files = [], uploadDir = uploadRootDir) {
  if (!Array.isArray(files) || !files.length) return;
  const baseDir = path.resolve(String(uploadDir || ""));
  if (!baseDir) return;

  files.forEach((file) => {
    try {
      const fileName = path.basename(String(file?.filename || "").trim());
      if (!fileName) return;

      const diskPath = path.join(baseDir, fileName);

      if (fs.existsSync(diskPath)) {
        fs.unlinkSync(diskPath);
      }
    } catch (_) {
      // best effort cleanup
    }
  });
}

function removeStoredFileNames(storedNames = []) {
  storedNames.forEach((storedName) => {
    try {
      const fileName = path.basename(String(storedName || "").trim());
      if (!fileName) return;

      const filePath = path.join(uploadRootDir, fileName);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) {
      // best effort cleanup
    }
  });
}

function removeAvatarByUrl(avatarUrl = "") {
  try {
    const raw = String(avatarUrl || "").trim();

    if (
      !raw.startsWith("/api/uploads/avatars/") &&
      !raw.startsWith("/uploads/avatars/")
    )
      return;

    const fileName = path.basename(raw);
    if (!fileName) return;

    const filePath = path.join(avatarUploadRootDir, fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // best effort cleanup
  }
}

function resolveAvatarDiskPath(avatarUrl = "") {
  const raw = String(avatarUrl || "").trim();

  if (
    !raw.startsWith("/api/uploads/avatars/") &&
    !raw.startsWith("/uploads/avatars/")
  )
    return null;

  const fileName = path.basename(raw);
  if (!fileName) return null;

  return path.join(avatarUploadRootDir, fileName);
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
    adminRun("UPDATE users SET avatar_url = NULL WHERE id = ?", [
      Number(userId),
    ]);
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

function cleanupMissingMessageFiles(messageIds = []) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );

  if (!normalized.length)
    return { deletedMessageIds: [], deletedByChat: new Map(), changed: false };

  const rows = listMessageFilesByMessageIds(normalized);
  if (!rows.length)
    return { deletedMessageIds: [], deletedByChat: new Map(), changed: false };

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
    return { deletedMessageIds: [], deletedByChat: new Map(), changed: false };
  }

  const targetMessageIds = Array.from(missingMessageIds);
  const placeholders = targetMessageIds.map(() => "?").join(", ");
  const allFilesRows = adminGetAll(
    `SELECT stored_name FROM chat_message_files WHERE message_id IN (${placeholders})`,
    targetMessageIds,
  );
  const storedNames = allFilesRows.map((row) => row.stored_name);
  const messageChatPairs = adminGetAll(
    `SELECT id, chat_id FROM chat_messages WHERE id IN (${placeholders})`,
    targetMessageIds,
  );
  const deletedByChat = new Map();
  messageChatPairs.forEach((row) => {
    const chatId = Number(row?.chat_id || 0);
    const messageId = Number(row?.id || 0);
    if (!chatId || !messageId) return;
    const list = deletedByChat.get(chatId) || [];
    list.push(messageId);
    deletedByChat.set(chatId, list);
  });

  adminRun("BEGIN");
  try {
    chunkIds(targetMessageIds, 500).forEach((chunk) => {
      const chunkPlaceholders = chunk.map(() => "?").join(", ");

      adminRun(
        `DELETE FROM chat_message_files WHERE message_id IN (${chunkPlaceholders})`,
        chunk,
      );

      adminRun(
        `DELETE FROM chat_messages WHERE id IN (${chunkPlaceholders})`,
        chunk,
      );
    });
    adminRun("COMMIT");
  } catch (error) {
    adminRun("ROLLBACK");
    throw error;
  }

  removeStoredFileNames(storedNames);
  adminSave();

  return { deletedMessageIds: targetMessageIds, deletedByChat, changed: true };
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

      adminRun(
        `DELETE FROM chat_messages WHERE id IN (${chunkPlaceholders})`,
        chunk,
      );
    });
    adminRun("COMMIT");
  } catch (error) {
    adminRun("ROLLBACK");
    throw error;
  }

  removeStoredFileNames(storedNames);
  adminSave();

  return {
    removedMessages: messageIds.length,
    removedFiles: storedNames.length,
  };
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
    messages: Number(
      adminGetRow("SELECT COUNT(*) AS n FROM chat_messages")?.n || 0,
    ),
    files: Number(
      adminGetRow("SELECT COUNT(*) AS n FROM chat_message_files")?.n || 0,
    ),
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
        adminGetRow(
          "SELECT COALESCE(SUM(size_bytes), 0) AS n FROM chat_message_files",
        )?.n || 0,
      ),
    };
  }

  return snapshot;
}

function removeAllMessageUploads() {
  try {
    if (fs.existsSync(uploadRootDir)) {
      fs.rmSync(uploadRootDir, { recursive: true, force: true });
    }

    fs.mkdirSync(uploadRootDir, { recursive: true });
  } catch (_) {
    // ignore
  }
}

function chunkArray(items = [], size = 500) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function hasEnoughFreeDiskSpace(requiredBytes = 0) {
  const required = Number(requiredBytes || 0);
  if (!Number.isFinite(required) || required <= 0) return true;

  const disk = getDiskUsageInfo();
  if (!disk || !Number.isFinite(Number(disk.freeBytes))) return true;

  const safetyBuffer = 1 * 1024 * 1024;

  return Number(disk.freeBytes) >= required + safetyBuffer;
}

function computeExpiryIso(
  createdAt = new Date(),
  days = MESSAGE_FILE_RETENTION_DAYS,
) {
  const safeDays = Number(days || 0);
  if (!Number.isFinite(safeDays) || safeDays <= 0) return null;

  const base = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const expiry = new Date(base.getTime() + safeDays * 24 * 60 * 60 * 1000);

  return expiry.toISOString();
}

function buildTimestampSchedule(count, daysBack) {
  const safeCountRaw = Number(count);
  const safeDaysRaw = Number(daysBack);
  const safeCount = Number.isFinite(safeCountRaw)
    ? Math.max(1, Math.min(10000, Math.trunc(safeCountRaw)))
    : 1;
  const days = Number.isFinite(safeDaysRaw)
    ? Math.max(1, Math.min(365, Math.trunc(safeDaysRaw)))
    : 1;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowSecondsOfDay =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const startDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const stamps = [];

  startDay.setDate(startDay.getDate() - (days - 1));

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const baseCount = Math.floor(safeCount / days);
    const remainder = safeCount % days;
    const messagesInDay = baseCount + (dayIndex < remainder ? 1 : 0);
    if (!messagesInDay) continue;

    const dayStart = new Date(startDay);
    dayStart.setDate(startDay.getDate() + dayIndex);

    const isToday =
      dayStart.getFullYear() === today.getFullYear() &&
      dayStart.getMonth() === today.getMonth() &&
      dayStart.getDate() === today.getDate();
    const maxSecondOfDay = isToday
      ? Math.max(0, Math.min(86399, nowSecondsOfDay))
      : 86399;
    const seconds = [];

    for (let i = 0; i < messagesInDay; i += 1) {
      seconds.push(Math.floor(Math.random() * (maxSecondOfDay + 1)));
    }

    seconds.sort((a, b) => a - b);

    for (let i = 0; i < seconds.length; i += 1) {
      stamps.push(
        new Date(dayStart.getTime() + seconds[i] * 1000).toISOString(),
      );
    }
  }

  return stamps;
}

function isLoopbackRequest(req) {
  const source = String(req.ip || req.socket?.remoteAddress || "");

  return (
    source === "::1" || source === "127.0.0.1" || source === "::ffff:127.0.0.1"
  );
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

function runFfmpeg(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");

      if (stderr.length > 16000) {
        stderr = stderr.slice(-16000);
      }
    });

    child.on("error", (error) => reject(error));

    child.on("close", (code) => {
      if (code === 0) return resolve();

      const details = stderr.trim();

      reject(
        new Error(
          details
            ? `ffmpeg failed: ${details}`
            : `ffmpeg failed with exit code ${String(code)}`,
        ),
      );
    });
  });
}

function runFfprobe(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");

      if (stdout.length > 160000) {
        stdout = stdout.slice(-160000);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");

      if (stderr.length > 16000) {
        stderr = stderr.slice(-16000);
      }
    });

    child.on("error", (error) => reject(error));

    child.on("close", (code) => {
      if (code === 0) return resolve(stdout);

      const details = stderr.trim();

      reject(
        new Error(
          details
            ? `ffprobe failed: ${details}`
            : `ffprobe failed with exit code ${String(code)}`,
        ),
      );
    });
  });
}

async function probeVideoMetadata(filePath) {
  try {
    const output = await runFfprobe([
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration:stream_tags=rotate:stream_side_data=rotation:format=duration",
      "-of",
      "json",
      filePath,
    ]);

    const parsed = JSON.parse(String(output || "{}"));
    const stream = Array.isArray(parsed?.streams)
      ? parsed.streams[0] || {}
      : {};
    const format = parsed?.format || {};
    const rawWidth = sanitizePositiveInt(stream?.width);
    const rawHeight = sanitizePositiveInt(stream?.height);
    const tagRotate = Number(stream?.tags?.rotate);
    const sideDataRotate = Array.isArray(stream?.side_data_list)
      ? Number(
          stream.side_data_list.find((item) =>
            Number.isFinite(Number(item?.rotation)),
          )?.rotation,
        )
      : NaN;
    const rotation = Number.isFinite(sideDataRotate)
      ? sideDataRotate
      : Number.isFinite(tagRotate)
        ? tagRotate
        : 0;
    const normalizedRotation = Math.abs(Math.round(rotation)) % 360;
    const shouldSwapAxes =
      normalizedRotation === 90 || normalizedRotation === 270;
    const widthPx = shouldSwapAxes ? rawHeight : rawWidth;
    const heightPx = shouldSwapAxes ? rawWidth : rawHeight;
    const durationSeconds = sanitizeDurationSeconds(
      stream?.duration ?? format?.duration,
    );

    return { widthPx, heightPx, durationSeconds };
  } catch (_) {
    return { widthPx: null, heightPx: null, durationSeconds: null };
  }
}

async function ensureFfmpegAvailable() {
  if (ffmpegAvailabilityChecked) {
    if (!ffmpegAvailable) {
      throw new Error("ffmpeg is not installed or not available in PATH.");
    }
    return;
  }

  ffmpegAvailabilityChecked = true;

  try {
    await runFfmpeg(["-version"]);
    ffmpegAvailable = true;
  } catch (_) {
    ffmpegAvailable = false;
    throw new Error("ffmpeg is not installed or not available in PATH.");
  }
}

function summarizeMessageFiles(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const videoCount = rows.filter((file) =>
    String(file?.mime_type || "").toLowerCase().startsWith("video/"),
  ).length;
  const imageCount = rows.filter((file) =>
    String(file?.mime_type || "").toLowerCase().startsWith("image/"),
  ).length;
  const audioCount = rows.filter((file) =>
    String(file?.mime_type || "").toLowerCase().startsWith("audio/"),
  ).length;
  const docCount = Math.max(0, rows.length - videoCount - imageCount - audioCount);
  if (rows.length === 1) {
    if (videoCount === 1) return "Sent a video";
    if (imageCount === 1) return "Sent a photo";
    if (audioCount === 1) return "Sent a voice message";
    return "Sent a document";
  }
  if (audioCount > 0 && videoCount === 0 && imageCount === 0 && docCount === 0) {
    return `Sent ${audioCount} voice message${audioCount > 1 ? "s" : ""}`;
  }
  if (videoCount > 0 && imageCount === 0 && docCount === 0) {
    return `Sent ${videoCount} video${videoCount > 1 ? "s" : ""}`;
  }
  if (imageCount > 0 && videoCount === 0 && docCount === 0) {
    return `Sent ${imageCount} photo${imageCount > 1 ? "s" : ""}`;
  }
  if (docCount > 0 && imageCount === 0 && videoCount === 0) {
    return `Sent ${docCount} document${docCount > 1 ? "s" : ""}`;
  }
  return `Sent ${rows.length} files`;
}

async function runVideoTranscodeJob(job) {
  const fileId = Number(job?.fileId || 0);
  const inputStoredName = path.basename(String(job?.storedName || "").trim());
  if (!fileId || !inputStoredName) return;

  const inputPath = path.join(uploadRootDir, inputStoredName);
  if (!fs.existsSync(inputPath)) return;

  const parsed = path.parse(inputStoredName);
  const outputName = `${parsed.name}-h264-${crypto.randomBytes(4).toString("hex")}.mp4`;
  const outputPath = path.join(uploadRootDir, outputName);

  try {
    debugLog("video-transcode:start", {
      fileId,
      messageId: Number(job?.messageId || 0) || null,
      chatId: Number(job?.chatId || 0) || null,
      inputStoredName,
    });

    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const outputStat = fs.statSync(outputPath);
    const outputMeta = await probeVideoMetadata(outputPath);

    fs.unlinkSync(inputPath);

    adminRun(
      `UPDATE chat_message_files
       SET stored_name = ?, mime_type = ?, size_bytes = ?, width_px = COALESCE(?, width_px), height_px = COALESCE(?, height_px), duration_seconds = COALESCE(?, duration_seconds)
       WHERE id = ?`,
      [
        outputName,
        "video/mp4",
        Number(outputStat.size || 0),
        Number.isFinite(Number(outputMeta?.widthPx))
          ? Number(outputMeta.widthPx)
          : null,
        Number.isFinite(Number(outputMeta?.heightPx))
          ? Number(outputMeta.heightPx)
          : null,
        Number.isFinite(Number(outputMeta?.durationSeconds))
          ? Number(outputMeta.durationSeconds)
          : null,
        fileId,
      ],
    );

    adminSave();

    debugLog("video-transcode:done", {
      fileId,
      outputName,
      width: outputMeta?.widthPx ?? null,
      height: outputMeta?.heightPx ?? null,
      durationSeconds: outputMeta?.durationSeconds ?? null,
      sizeBytes: Number(outputStat.size || 0),
    });

    const chatId = Number(job?.chatId || 0);
    const messageId = Number(job?.messageId || 0);
    const messageRow = messageId
      ? adminGetRow("SELECT body FROM chat_messages WHERE id = ?", [messageId])
      : null;
    const messageBody = String(messageRow?.body || "").trim();
    const filesForMessage = messageId
      ? listMessageFilesByMessageIds([messageId])
      : [];
    const summaryText = summarizeMessageFiles(filesForMessage);

    if (chatId > 0) {
      emitChatEvent(chatId, {
        type: "chat_message",
        chatId,
        messageId: messageId || null,
        username: String(job?.username || ""),
        body: messageBody,
        summaryText,
      });
    }
  } catch (error) {
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (_) {
      // best effort cleanup
    }

    console.error(
      `[video-transcode] failed for ${inputStoredName}: ${String(error?.message || error)}`,
    );

    debugLog("video-transcode:error", {
      fileId,
      inputStoredName,
      error: String(error?.message || error),
    });
  }
}

async function processVideoTranscodeQueue() {
  if (videoTranscodeWorkerRunning) return;
  videoTranscodeWorkerRunning = true;

  try {
    while (videoTranscodeQueue.length) {
      const job = videoTranscodeQueue.shift();
      // eslint-disable-next-line no-await-in-loop
      await runVideoTranscodeJob(job);
    }
  } finally {
    videoTranscodeWorkerRunning = false;
  }
}

function enqueueVideoTranscodeJob(job) {
  videoTranscodeQueue.push(job);
  void processVideoTranscodeQueue();
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

function isVideoFileProcessing(row) {
  if (!TRANSCODE_VIDEOS_TO_H264) return false;
  if (String(row?.kind || "").toLowerCase() === "document") return false;

  const mimeType = String(row?.mime_type || "").toLowerCase();
  if (!mimeType.startsWith("video/")) return false;

  const storedName = String(row?.stored_name || "").toLowerCase();
  return !storedName.includes(TRANSCODED_VIDEO_NAME_TAG);
}

async function hydrateMissingVideoMetadata(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return rows;

  const startedAt = Date.now();
  let updated = false;
  let probedCount = 0;
  let probesRemaining = 8;

  for (const row of rows) {
    const mimeType = String(row?.mime_type || "").toLowerCase();
    if (!mimeType.startsWith("video/")) continue;

    const hasWidth =
      Number.isFinite(Number(row?.width_px)) && Number(row.width_px) > 0;
    const hasHeight =
      Number.isFinite(Number(row?.height_px)) && Number(row.height_px) > 0;
    const hasDuration =
      Number.isFinite(Number(row?.duration_seconds)) &&
      Number(row.duration_seconds) >= 0;

    if (hasWidth && hasHeight && hasDuration) continue;
    if (probesRemaining <= 0) break;

    const storedName = path.basename(String(row?.stored_name || "").trim());
    if (!storedName) continue;

    const inputPath = path.join(uploadRootDir, storedName);
    if (!fs.existsSync(inputPath)) continue;

    probesRemaining -= 1;

    // Sequential probing avoids burst-spawning ffprobe processes under load.
    // eslint-disable-next-line no-await-in-loop
    const meta = await probeVideoMetadata(inputPath);
    probedCount += 1;
    const nextWidth =
      hasWidth || !Number.isFinite(Number(meta?.widthPx))
        ? row.width_px
        : Number(meta.widthPx);
    const nextHeight =
      hasHeight || !Number.isFinite(Number(meta?.heightPx))
        ? row.height_px
        : Number(meta.heightPx);
    const nextDuration =
      hasDuration || !Number.isFinite(Number(meta?.durationSeconds))
        ? row.duration_seconds
        : Number(meta.durationSeconds);

    if (
      Number(nextWidth || 0) === Number(row.width_px || 0) &&
      Number(nextHeight || 0) === Number(row.height_px || 0) &&
      Number(nextDuration || 0) === Number(row.duration_seconds || 0)
    ) {
      continue;
    }

    adminRun(
      `UPDATE chat_message_files
       SET width_px = COALESCE(?, width_px), height_px = COALESCE(?, height_px), duration_seconds = COALESCE(?, duration_seconds)
       WHERE id = ?`,
      [
        Number.isFinite(Number(nextWidth)) ? Number(nextWidth) : null,
        Number.isFinite(Number(nextHeight)) ? Number(nextHeight) : null,
        Number.isFinite(Number(nextDuration)) ? Number(nextDuration) : null,
        Number(row.id),
      ],
    );

    row.width_px = Number.isFinite(Number(nextWidth))
      ? Number(nextWidth)
      : row.width_px;

    row.height_px = Number.isFinite(Number(nextHeight))
      ? Number(nextHeight)
      : row.height_px;

    row.duration_seconds = Number.isFinite(Number(nextDuration))
      ? Number(nextDuration)
      : row.duration_seconds;

    updated = true;
  }

  if (updated) {
    adminSave();
  }

  if (probedCount > 0) {
    debugLog("video-metadata:hydrate", {
      rows: rows.length,
      probed: probedCount,
      updated,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return rows;
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

function isHttpsRequest(req) {
  if (!req) return false;
  if (req.secure) return true;

  const proto = String(req.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  return proto === "https";
}

function shouldUseSecureCookie(req) {
  // Only mark cookies Secure on actual HTTPS requests.
  // This keeps local HTTP development working even if APP_ENV is production.
  return isProduction && isHttpsRequest(req);
}

function setSessionCookie(req, res, token) {
  const parts = [
    `sid=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=1209600",
  ];

  if (shouldUseSecureCookie(req)) {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req, res) {
  const parts = ["sid=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];

  if (shouldUseSecureCookie(req)) {
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
  const supplied = String(suppliedUsername || "")
    .trim()
    .toLowerCase();

  if (supplied && supplied !== String(session.username || "").toLowerCase()) {
    res
      .status(403)
      .json({ error: "Username does not match authenticated user." });
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

const apiDeps = {
  ALLOWED_AVATAR_MIME_TYPES,
  APP_DEBUG,
  AVATAR_FILE_LIMITS,
  FILE_UPLOAD,
  MESSAGE_FILE_LIMITS,
  MESSAGE_FILE_RETENTION_DAYS,
  TRANSCODE_VIDEOS_TO_H264,
  USER_COLORS,
  NICKNAME_MAX,
  USERNAME_MAX,
  MESSAGE_MAX_CHARS,
  ACCOUNT_CREATION,
  USERNAME_REGEX,
  VAPID_PUBLIC_KEY: PUSH_ENABLED ? VAPID_PUBLIC_KEY : "",
  addChatMember,
  addSseClient,
  adminGetAll,
  adminGetRow,
  adminRun,
  adminSave,
  ensureSavedChatForUser,
  avatarUploadRootDir,
  bcrypt,
  buildInspectSnapshot,
  buildTimestampSchedule,
  chunkArray,
  cleanupMissingMessageFiles,
  clearGroupMemberRemoved,
  clearSessionCookie,
  computeExpiryIso,
  createChat,
  createMessage,
  createMessageFiles,
  createSession,
  createUser,
  crypto,
  debugLog,
  decodeOriginalFilename,
  deleteSession,
  deleteChatById,
  deleteUserById,
  emitChatEvent,
  emitSseEvent,
  enqueueVideoTranscodeJob,
  ensureAvatarExists,
  ensureFfmpegAvailable,
  findChatById,
  findDmChat,
  findChatByGroupUsername,
  findChatByInviteToken,
  findMessageById,
  findUserById,
  findUserByUsername,
  fs,
  getMessageReadCounts,
  getMessageAuthors,
  getMessageReadByUser,
  getMessages,
  getSessionFromRequest,
  getUploadKind,
  getUserPresence,
  hasEnoughFreeDiskSpace,
  hideChatsForUser,
  hydrateMissingVideoMetadata,
  inferMimeFromFilename,
  isDangerousUploadFile,
  isLoopbackRequest,
  isMember,
  isGroupMemberRemoved,
  isVideoFileProcessing,
  listPushSubscriptionsByUserIds,
  listChatMembers,
  listChatsForUser,
  listMessageFilesByMessageIds,
  listUsers,
  getChatMemberRole,
  setChatMemberRole,
  recordMessageReads,
  markGroupMemberRemoved,
  markMessagesRead,
  markMessageRead,
  parseCookies,
  parseUploadFileMetadata,
  path,
  probeVideoMetadata,
  regenerateGroupInviteToken,
  removeAllMessageUploads,
  removeAvatarByUrl,
  removeChatMember,
  deletePushSubscription,
  removeStoredFileNames,
  removeUploadedFiles,
  removeSseClient,
  requireSession,
  requireSessionUsernameMatch,
  sanitizeDurationSeconds,
  sanitizePositiveInt,
  searchUsers,
  searchPublicGroups,
  searchPublicChannels,
  setChatMuted,
  listMutedUserIdsForChat,
  setSessionCookie,
  setUserColor,
  updateLastSeen,
  updateGroupChat,
  updateChannelChat,
  unhideChat,
  updateUserPassword,
  updateUserProfile,
  updateUserStatus,
  uploadAvatar,
  uploadFiles,
  uploadRootDir,
  upsertPushSubscription,
  sendPushNotificationToUsers,
};

registerApiRoutes(app, apiDeps);

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
        return res.status(400).json({
          error: `Profile photo must be smaller than ${Math.round(AVATAR_FILE_LIMITS.maxFileSizeBytes / (1024 * 1024))} MB.`,
        });
      }

      return res.status(400).json({
        error: `Each file must be smaller than ${Math.round(MESSAGE_FILE_LIMITS.maxFileSizeBytes / (1024 * 1024))} MB.`,
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: `Maximum ${MESSAGE_FILE_LIMITS.maxFiles} files per message.`,
      });
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


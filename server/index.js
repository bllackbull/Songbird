import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import compression from "compression";
import rateLimit from "express-rate-limit";
import multer from "multer";
import webpush from "web-push";
import { registerApiRoutes } from "./api/index.js";
import { ensureValidVapidKeys } from "./lib/vapid.js";
import { createSseHub } from "./lib/sse.js";
import { createPushService } from "./lib/push.js";
import { createUploadTools } from "./lib/uploads.js";
import { createVideoTranscodeManager } from "./lib/videoTranscode.js";
import { createMessageFileJobs } from "./lib/messageFileJobs.js";
import { createInspector } from "./lib/inspect.js";
import { createSessionHelpers } from "./lib/sessions.js";
import { storageEncryption } from "./lib/storageEncryption.js";
import { createRemoteChannelManager } from "./lib/remoteChannels.js";
import { buildTimestampSchedule } from "./lib/timeUtils.js";
import { isLoopbackRequest, parseUploadFileMetadata } from "./lib/requestUtils.js";
import { USERNAME_REGEX } from "./lib/validation.js";
import { USER_COLORS, setUserColor } from "./settings/colors.js";
import { readEnvInt } from "./settings/env.js";
import {
  addChatMember,
  adminGetAll,
  adminGetRow,
  adminRun,
  adminSave,
  ensureSavedChatForUser,
  clearChatMemberLeft,
  clearGroupMemberRemoved,
  createChat,
  createMessageFiles,
  createMessage,
  createOrReuseMessage,
  editMessage,
  createSession,
  deleteSession,
  createUser,
  deleteChatById,
  deleteUserById,
  findChatById,
  findDmChat,
  findChatByGroupUsername,
  findChatByInviteToken,
  findMessageIdByClientRequestId,
  findMessageById,
  hideMessageForEveryone,
  hideMessageForUser,
  findUserById,
  findUserByUsername,
  getMessageReadCounts,
  getMessageAuthors,
  getMessageReadByUser,
  getMessages,
  getFirstUnreadMessage,
  recordMessageReads,
  listMessageFilesByMessageIds,
  markGroupMemberRemoved,
  markChatMemberLeft,
  regenerateGroupInviteToken,
  removeChatMember,
  setMessageExpiresAt,
  setMessageForwardOrigin,
  getSession,
  isMember,
  isGroupMemberRemoved,
  listChatMembers,
  listChatMembersForChats,
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
  getTotalUnreadCount,
  listMutedUserIdsForChat,
  claimNextRemoteChannelQueueItem,
  enqueueRemoteChannelQueueItem,
  getRemoteChannelProviderState,
  getRemoteChannelQueueSummary,
  getRemoteChannelSourceByChatId,
  getRemoteChannelSourceById,
  listEnabledRemoteChannelSources,
  markRemoteChannelQueueItemDone,
  markRemoteChannelQueueItemRetry,
  markRemoteChannelQueueItemSkipped,
  releaseStaleRemoteChannelQueueItems,
  setRemoteChannelProviderState,
  skipAllRemoteChannelQueueItems,
  skipCurrentRemoteChannelQueueItem,
  getCurrentRemoteChannelQueueItemId,
  updateRemoteChannelSourceError,
  updateRemoteChannelSourcePaused,
  updateRemoteChannelSourceSeen,
  upsertRemoteChannelSource,
  purgeOldRemoteChannelQueueItems,
  setUserRole,
  isUserAdmin,
  isUserOwner,
  getOwnerUser,
  getAdminStats,
  adminListUsers,
  adminListChats,
  adminBanUser,
  adminDeleteUser,
  adminDeleteChat,
  vacuumDatabase,
  reloadDatabase,
  adminClearAllMessages,
  adminResetDatabase,
  dbGetAllSettings,
  dbSetSetting,
  dbDeleteSetting,
} from "./db.js";
import {
  loadSettings,
  getSetting,
  getAllSettings,
  setSetting,
  setSettings,
  resetSetting,
  validateSetting,
  SETTING_DEFS,
} from "./lib/appSettings.js";

process.title = "songbird-server";

const app = express();
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env"), override: true, quiet: true });
dotenv.config({ path: path.join(serverDir, ".env"), override: true, quiet: true });

// Load runtime settings from DB (env vars remain as fallback defaults).
// Must run after dotenv and after the DB module (which runs migrations).
loadSettings(dbGetAllSettings);

const port = process.env.SERVER_PORT || process.env.PORT || 5174;
const appEnv = process.env.APP_ENV || "production";
const isProduction = appEnv === "production";

function debugLog(...args) {
  if (!getSetting("APP_DEBUG")) return;
  console.log("[app-debug]", ...args);
}

const debugRouteCounts = new Map();

// Always scheduled; the interval body checks the live setting on each tick
// so toggling APP_DEBUG in the admin panel takes effect without a restart.
const debugSummaryTimer = setInterval(() => {
  if (!getSetting("APP_DEBUG")) return;
  const entries = Array.from(debugRouteCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([route, count]) => ({ route, count }));

  debugLog("api:requests-per-minute", { routes: entries });

  debugRouteCounts.clear();
}, 60 * 1000);
if (typeof debugSummaryTimer.unref === "function") debugSummaryTimer.unref();

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(
  compression({
    threshold: 1024,
    filter(req, res) {
      if (req.path === "/api/events") return false;
      const contentType = String(res.getHeader("Content-Type") || "").toLowerCase();
      if (contentType.includes("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  }),
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
});

// Always registered; each request checks the live setting so toggling
// APP_DEBUG in the admin panel takes effect without a restart.
app.use((req, res, next) => {
  if (!getSetting("APP_DEBUG")) return next();

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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
});

const MB = 1024 * 1024;

const USERNAME_MAX = getSetting("USERNAME_MAX_CHARS");
const NICKNAME_MAX = getSetting("NICKNAME_MAX_CHARS");
const MESSAGE_MAX_CHARS = getSetting("MESSAGE_MAX_CHARS");
const ACCOUNT_CREATION = getSetting("SIGN_UP");
const dataDir = path.resolve(serverDir, "..", "data");
const vapid = ensureValidVapidKeys({ projectRootDir, dataDir, fs, path, webpush });
const uploadRootDir = path.join(dataDir, "uploads", "messages");
const avatarUploadRootDir = path.join(dataDir, "uploads", "avatars");

const FILE_UPLOAD_MAX_SIZE = getSetting("FILE_UPLOAD_MAX_SIZE_MB") * MB;
const FILE_UPLOAD_MAX_FILES = getSetting("FILE_UPLOAD_MAX_FILES");
const FILE_UPLOAD_MAX_TOTAL_SIZE = getSetting("FILE_UPLOAD_MAX_TOTAL_SIZE_MB") * MB;

const MESSAGE_FILE_RETENTION_DAYS = getSetting("MESSAGE_FILE_RETENTION");
const MESSAGE_TEXT_RETENTION_DAYS = getSetting("MESSAGE_TEXT_RETENTION");

const TRANSCODE_VIDEOS_TO_H264 = getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS");


const FILE_UPLOAD = getSetting("FILE_UPLOAD");
const REMOTE_CHANNEL = getSetting("REMOTE_CHANNEL");
const REMOTE_CHANNEL_UI = getSetting("REMOTE_CHANNEL_UI");
const REMOTE_CHANNEL_MEDIA_STREAM = getSetting("REMOTE_CHANNEL_MEDIA_STREAM");
// Telegram credentials remain in .env (secrets — never stored in DB)
const REMOTE_CHANNEL_TELEGRAM_API_ID = readEnvInt(
  "REMOTE_CHANNEL_TELEGRAM_API_ID",
  0,
  { min: 1 },
);
const REMOTE_CHANNEL_TELEGRAM_API_HASH = String(
  process.env.REMOTE_CHANNEL_TELEGRAM_API_HASH || "",
).trim();
const REMOTE_CHANNEL_TELEGRAM_SESSION_STRING = String(
  process.env.REMOTE_CHANNEL_TELEGRAM_SESSION_STRING || "",
).trim();
const REMOTE_CHANNEL_PROXY_URL = String(
  getSetting("REMOTE_CHANNEL_TELEGRAM_PROXY_URL") || "",
).trim();
const REMOTE_CHANNEL_SONGBIRD_PROXY_URL = String(
  getSetting("REMOTE_CHANNEL_SONGBIRD_PROXY_URL") || "",
).trim();
const REMOTE_CHANNEL_TELEGRAM_CONFIGURED = Boolean(
  REMOTE_CHANNEL_TELEGRAM_API_ID &&
    REMOTE_CHANNEL_TELEGRAM_API_HASH &&
    REMOTE_CHANNEL_TELEGRAM_SESSION_STRING,
);
const REMOTE_CHANNEL_CONFIG = {
  enabled: REMOTE_CHANNEL,
  uiEnabled: REMOTE_CHANNEL_UI,
  mediaStreamEnabled: REMOTE_CHANNEL_MEDIA_STREAM,
  telegramConfigured: REMOTE_CHANNEL_TELEGRAM_CONFIGURED,
  proxyConfigured: Boolean(REMOTE_CHANNEL_PROXY_URL),
  songbirdProxyUrl: REMOTE_CHANNEL_SONGBIRD_PROXY_URL,
  telegramApiId: REMOTE_CHANNEL_TELEGRAM_API_ID,
  telegramApiHash: REMOTE_CHANNEL_TELEGRAM_API_HASH,
  telegramSessionString: REMOTE_CHANNEL_TELEGRAM_SESSION_STRING,
  proxyUrl: REMOTE_CHANNEL_PROXY_URL,
  pollIntervalMs: getSetting("REMOTE_CHANNEL_POLL_INTERVAL_MS"),
  telegramPollLimit: getSetting("REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT"),
  queueIntervalMs: getSetting("REMOTE_CHANNEL_QUEUE_INTERVAL_MS"),
  queueMaxAttempts: getSetting("REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS"),
  queueBatchSize: getSetting("REMOTE_CHANNEL_QUEUE_BATCH_SIZE"),
  queueConcurrency: getSetting("REMOTE_CHANNEL_QUEUE_CONCURRENCY"),
  queueStaleLockMs: getSetting("REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS"),
  messageTextRetentionDays: MESSAGE_TEXT_RETENTION_DAYS,
  messageFileRetentionDays: MESSAGE_FILE_RETENTION_DAYS,
  messageMaxChars: MESSAGE_MAX_CHARS,
  fileUploadEnabled: FILE_UPLOAD,
  messageFileLimits: {
    maxFiles: FILE_UPLOAD_MAX_FILES,
    maxFileSizeBytes: FILE_UPLOAD_MAX_SIZE,
    maxTotalBytes: FILE_UPLOAD_MAX_TOTAL_SIZE,
  },
  transcodeVideosToH264: TRANSCODE_VIDEOS_TO_H264,
  uploadRootDir,
  avatarUploadRootDir,
};
const MESSAGE_FILE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const uploadTools = createUploadTools({
  fs,
  path,
  crypto,
  multer,
  adminGetRow,
  adminRun,
  adminSave,
  uploadRootDir,
  avatarUploadRootDir,
  fileUploadMaxSize: FILE_UPLOAD_MAX_SIZE,
  fileUploadMaxFiles: FILE_UPLOAD_MAX_FILES,
  fileUploadMaxTotalSize: FILE_UPLOAD_MAX_TOTAL_SIZE,
  storageEncryption,
});

const {
  MESSAGE_FILE_LIMITS,
  AVATAR_FILE_LIMITS,
  ALLOWED_AVATAR_MIME_TYPES,
  uploadFiles,
  uploadAvatar,
  buildDownloadFilename,
  buildAsciiFallbackFilename,
  decodeOriginalFilename,
  inferMimeFromFilename,
  getUploadKind,
  removeUploadedFiles,
  removeStoredFileNames,
  removeAvatarByUrl,
  resolveAvatarDiskPath,
  normalizeAvatarPublicUrl,
  ensureAvatarExists,
  isDangerousUploadFile,
  registerUploadRoutes,
} = uploadTools;

const { addSseClient, removeSseClient, emitSseEvent, emitChatEvent, getCachedMembers, isUserConnected } = createSseHub({
  listChatMembers,
});

const pushService = createPushService({
  webpush,
  listPushSubscriptionsByUserIds,
  deletePushSubscription,
  getTotalUnreadCount,
  vapid,
  proxyUrl: getSetting("PUSH_PROXY_URL"),
});
const { PUSH_ENABLED, VAPID_PUBLIC_KEY, sendPushNotificationToUsers } = pushService;

const videoTranscoder = createVideoTranscodeManager({
  spawn,
  fs,
  path,
  crypto,
  adminRun,
  adminGetRow,
  adminSave,
  listMessageFilesByMessageIds,
  emitChatEvent,
  debugLog,
  uploadRootDir,
  transcodeVideosToH264: TRANSCODE_VIDEOS_TO_H264,
  storageEncryption,
});
const {
  enqueueVideoTranscodeJob,
  ensureFfmpegAvailable,
  probeVideoMetadata,
  isVideoFileProcessing,
  hydrateMissingVideoMetadata,
  summarizeMessageFiles,
  sanitizePositiveInt,
  sanitizeDurationSeconds,
} = videoTranscoder;

const messageFileJobs = createMessageFileJobs({
  adminGetAll,
  adminGetRow,
  adminRun,
  adminSave,
  listMessageFilesByMessageIds,
  removeStoredFileNames,
  uploadRootDir,
  fs,
  path,
  getSetting,
});
const {
  chunkArray,
  cleanupMissingMessageFiles,
  cleanupExpiredMessageFiles,
  backfillMessageFileExpiry,
  removeAllMessageUploads,
  computeExpiryIso,
} = messageFileJobs;

const inspector = createInspector({ fs, dataDir, adminGetRow, adminGetAll });
const { buildInspectSnapshot, hasEnoughFreeDiskSpace } = inspector;

const sessionHelpers = createSessionHelpers({
  getSession,
  touchSession,
  isProduction,
});
const {
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
  requireSession,
  requireSessionUsernameMatch,
} = sessionHelpers;

function backfillStorageEncryption() {
  if (!storageEncryption.isEnabled()) return;

  // Process messages in batches with async yields to avoid blocking the event
  // loop for extended periods on large databases.
  const BATCH_SIZE = 200;

  function encryptMessageBatch(offset) {
    const batch = adminGetAll(
      `SELECT id, body
       FROM chat_messages
       WHERE body IS NOT NULL AND body != ''
       LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset],
    );

    if (!batch.length) return 0;

    let encryptedInBatch = 0;
    batch.forEach((row) => {
      const body = String(row?.body || "");
      const nextBody = storageEncryption.encryptText(body);
      if (nextBody === body) return;
      adminRun("UPDATE chat_messages SET body = ? WHERE id = ?", [
        nextBody,
        Number(row.id),
      ]);
      encryptedInBatch += 1;
    });

    if (encryptedInBatch > 0) adminSave();

    if (batch.length === BATCH_SIZE) {
      // Schedule next batch without blocking the event loop.
      setImmediate(() => encryptMessageBatch(offset + BATCH_SIZE));
    }
    return encryptedInBatch;
  }

  try {
    // Start the message encryption batching.
    encryptMessageBatch(0);

    // Files and avatars are typically fewer in number; process them once.
    const fileRows = adminGetAll("SELECT stored_name FROM chat_message_files");
    let encryptedFiles = 0;

    fileRows.forEach((row) => {
      const storedName = path.basename(String(row?.stored_name || "").trim());
      if (!storedName) return;

      const filePath = path.join(uploadRootDir, storedName);
      if (!fs.existsSync(filePath)) return;

      if (storageEncryption.encryptFileInPlace(filePath)) {
        encryptedFiles += 1;
      }
    });

    let encryptedAvatars = 0;
    if (fs.existsSync(avatarUploadRootDir)) {
      fs.readdirSync(avatarUploadRootDir, { withFileTypes: true }).forEach(
        (entry) => {
          if (!entry.isFile()) return;

          const filePath = path.join(avatarUploadRootDir, entry.name);
          if (storageEncryption.encryptFileInPlace(filePath)) {
            encryptedAvatars += 1;
          }
        },
      );
    }

    if (encryptedFiles > 0 || encryptedAvatars > 0) {
      adminSave();
      console.log(
        `[storage-encryption] encrypted ${encryptedFiles} file(s) and ${encryptedAvatars} avatar file(s) at rest.`,
      );
    }
  } catch (error) {
    console.error(
      `[storage-encryption] backfill failed: ${String(error?.message || error)}`,
    );
  }
}

registerUploadRoutes(app, { adminGetRow });

const apiDeps = {
  ALLOWED_AVATAR_MIME_TYPES,
  // APP_DEBUG intentionally NOT passed here — messages.js must call
  // getSetting("APP_DEBUG") at request time so admin-panel changes apply live.
  AVATAR_FILE_LIMITS,
  // FILE_UPLOAD, MESSAGE_FILE_RETENTION_DAYS, MESSAGE_TEXT_RETENTION_DAYS,
  // TRANSCODE_VIDEOS_TO_H264, NICKNAME_MAX, USERNAME_MAX, MESSAGE_MAX_CHARS,
  // and ACCOUNT_CREATION are intentionally NOT passed here — route handlers
  // must call getSetting("KEY") at request time so admin-panel changes take
  // effect live, instead of reading a value captured once at server startup.
  MESSAGE_FILE_LIMITS,
  USER_COLORS,
  REMOTE_CHANNELS: {
    enabled: REMOTE_CHANNEL_CONFIG.enabled,
    uiEnabled: REMOTE_CHANNEL_CONFIG.uiEnabled,
    mediaStreamEnabled: REMOTE_CHANNEL_CONFIG.mediaStreamEnabled,
    telegramConfigured: REMOTE_CHANNEL_CONFIG.telegramConfigured,
    songbirdConfigured: REMOTE_CHANNEL_CONFIG.enabled,
    proxyConfigured: REMOTE_CHANNEL_CONFIG.proxyConfigured,
  },
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
  claimNextRemoteChannelQueueItem,
  chunkArray,
  cleanupMissingMessageFiles,
  clearGroupMemberRemoved,
  clearChatMemberLeft,
  clearSessionCookie,
  computeExpiryIso,
  createChat,
  createMessage,
  createOrReuseMessage,
  createMessageFiles,
  editMessage,
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
  isUserConnected,
  enqueueRemoteChannelQueueItem,
  enqueueVideoTranscodeJob,
  ensureAvatarExists,
  ensureFfmpegAvailable,
  findChatById,
  findDmChat,
  findChatByGroupUsername,
  findChatByInviteToken,
  findMessageIdByClientRequestId,
  findMessageById,
  findUserById,
  findUserByUsername,
  fs,
  getCachedMembers,
  getMessageReadCounts,
  getMessageAuthors,
  getMessageReadByUser,
  getMessages,
  getFirstUnreadMessage,
  getRemoteChannelProviderState,
  getRemoteChannelQueueSummary,
  getRemoteChannelSourceByChatId,
  getRemoteChannelSourceById,
  getSessionFromRequest,
  getUploadKind,
  getUserPresence,
  hasEnoughFreeDiskSpace,
  hideChatsForUser,
  hideMessageForEveryone,
  hideMessageForUser,
  hydrateMissingVideoMetadata,
  inferMimeFromFilename,
  isDangerousUploadFile,
  isLoopbackRequest,
  isMember,
  isGroupMemberRemoved,
  isVideoFileProcessing,
  listPushSubscriptionsByUserIds,
  listChatMembers,
  listChatMembersForChats,
  listChatsForUser,
  listEnabledRemoteChannelSources,
  listMessageFilesByMessageIds,
  listUsers,
  setMessageForwardOrigin,
  getChatMemberRole,
  setChatMemberRole,
  recordMessageReads,
  releaseStaleRemoteChannelQueueItems,
  markChatMemberLeft,
  markGroupMemberRemoved,
  markMessagesRead,
  markMessageRead,
  markRemoteChannelQueueItemDone,
  markRemoteChannelQueueItemRetry,
  markRemoteChannelQueueItemSkipped,
  parseCookies,
  parseUploadFileMetadata,
  path,
  projectRootDir,
  skipAllRemoteChannelQueueItems,
  skipCurrentRemoteChannelQueueItem,
  updateRemoteChannelSourcePaused,
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
  setMessageExpiresAt,
  setRemoteChannelProviderState,
  listMutedUserIdsForChat,
  setSessionCookie,
  setUserColor,
  updateLastSeen,
  updateGroupChat,
  updateChannelChat,
  unhideChat,
  updateRemoteChannelSourceError,
  updateRemoteChannelSourceSeen,
  updateUserPassword,
  updateUserProfile,
  updateUserStatus,
  uploadAvatar,
  uploadFiles,
  uploadRootDir,
  upsertRemoteChannelSource,
  upsertPushSubscription,
  sendPushNotificationToUsers,
  storageEncryption,
  setUserRole,
  isUserAdmin,
  isUserOwner,
  getOwnerUser,
  getAdminStats,
  adminListUsers,
  adminListChats,
  adminBanUser,
  adminDeleteUser,
  adminDeleteChat,
  vacuumDatabase,
  reloadDatabase,
  adminClearAllMessages,
  adminResetDatabase,
  // Settings
  getSetting,
  getAllSettings,
  setSetting,
  setSettings,
  resetSetting,
  validateSetting,
  SETTING_DEFS,
  dbRun: adminRun,
  dbSave: adminSave,
};

const remoteChannelManager = createRemoteChannelManager({
  config: REMOTE_CHANNEL_CONFIG,
  computeExpiryIso,
  createMessageFiles,
  createOrReuseMessage,
  crypto,
  debugLog,
  emitChatEvent,
  emitSseEvent,
  enqueueVideoTranscodeJob,
  ensureFfmpegAvailable,
  findChatById,
  findUserById,
  fs,
  getRemoteChannelProviderState,
  getRemoteChannelSourceById,
  getUploadKind,
  hasEnoughFreeDiskSpace,
  isDangerousUploadFile,
  listEnabledRemoteChannelSources,
  listChatMembers,
  listMessageFilesByMessageIds,
  listMutedUserIdsForChat,
  enqueueRemoteChannelQueueItem,
  releaseStaleRemoteChannelQueueItems,
  claimNextRemoteChannelQueueItem,
  markRemoteChannelQueueItemDone,
  markRemoteChannelQueueItemRetry,
  markRemoteChannelQueueItemSkipped,
  skipAllRemoteChannelQueueItems,
  skipCurrentRemoteChannelQueueItem,
  getCurrentRemoteChannelQueueItemId,
  path,
  probeVideoMetadata,
  sanitizeDurationSeconds,
  sanitizePositiveInt,
  sendPushNotificationToUsers,
  isUserConnected,
  setMessageExpiresAt,
  setMessageForwardOrigin,
  setRemoteChannelProviderState,
  storageEncryption,
  updateChannelChat,
  updateRemoteChannelSourceError,
  updateRemoteChannelSourceSeen,
});

apiDeps.remoteChannelManager = remoteChannelManager;

if (isProduction) {
  app.use("/api", apiLimiter);
}

registerApiRoutes(app, apiDeps);

if (isProduction) {
  app.use(staticLimiter);

  const clientDist = path.resolve(serverDir, "..", "client", "dist");
  const setStaticCacheHeaders = (res, filePath) => {
    const normalizedPath = String(filePath || "").replace(/\\/g, "/");
    if (
      normalizedPath.endsWith("/index.html") ||
      normalizedPath.endsWith("/sw.js") ||
      normalizedPath.endsWith("/manifest.webmanifest")
    ) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return;
    }
    if (normalizedPath.includes("/assets/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
  };

  app.use(
    express.static(clientDist, {
      index: false,
      setHeaders: setStaticCacheHeaders,
    }),
  );

  app.get("*path", (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
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

function cleanupExpiredTextOnlyMessages() {
  if (getSetting("MESSAGE_TEXT_RETENTION") <= 0) {
    return { removedMessages: 0 };
  }

  const rows = adminGetAll(
    `SELECT id, chat_id
     FROM chat_messages
     WHERE expires_at IS NOT NULL
       AND expires_at != ''
       AND hidden_everyone_at IS NULL
       AND julianday(expires_at) <= julianday(?)
       AND NOT EXISTS (
         SELECT 1
         FROM chat_message_files
         WHERE chat_message_files.message_id = chat_messages.id
       )`,
    [new Date().toISOString()],
  );

  const messageIds = rows
    .map((row) => Number(row?.id || 0))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!messageIds.length) {
    return { removedMessages: 0 };
  }

  const deletedByChat = new Map();
  rows.forEach((row) => {
    const chatId = Number(row?.chat_id || 0);
    const messageId = Number(row?.id || 0);
    if (!chatId || !messageId) return;
    const list = deletedByChat.get(chatId) || [];
    list.push(messageId);
    deletedByChat.set(chatId, list);
  });

  adminRun("BEGIN");
  try {
    chunkArray(messageIds, 500).forEach((chunk) => {
      const placeholders = chunk.map(() => "?").join(", ");
      adminRun(
        `DELETE FROM chat_message_reads WHERE message_id IN (${placeholders})`,
        chunk,
      );
      adminRun(
        `DELETE FROM hidden_chat_messages WHERE message_id IN (${placeholders})`,
        chunk,
      );
      adminRun(`DELETE FROM chat_messages WHERE id IN (${placeholders})`, chunk);
    });
    adminRun("COMMIT");
  } catch (error) {
    adminRun("ROLLBACK");
    throw error;
  }

  adminSave();
  deletedByChat.forEach((ids, chatId) => {
    emitChatEvent(Number(chatId), {
      type: "chat_message_deleted",
      chatId: Number(chatId),
      messageIds: ids,
    });
  });

  return { removedMessages: messageIds.length };
}

function backfillTextMessageExpiry() {
  const textRetentionDays = getSetting("MESSAGE_TEXT_RETENTION");
  if (textRetentionDays <= 0) return 0;

  const row = adminGetRow(
    `SELECT COUNT(*) AS n
     FROM chat_messages
     WHERE (expires_at IS NULL OR expires_at = '')
       AND hidden_everyone_at IS NULL
       AND body IS NOT NULL
       AND TRIM(body) != ''
       AND body NOT LIKE '[[system:%]]'
       AND NOT EXISTS (
         SELECT 1
         FROM chat_message_files
         WHERE chat_message_files.message_id = chat_messages.id
       )`,
  );

  const pending = Number(row?.n || 0);
  if (!pending) return 0;

  adminRun(
    `UPDATE chat_messages
     SET expires_at = datetime(created_at, '+' || ? || ' days')
     WHERE (expires_at IS NULL OR expires_at = '')
       AND hidden_everyone_at IS NULL
       AND body IS NOT NULL
       AND TRIM(body) != ''
       AND body NOT LIKE '[[system:%]]'
       AND NOT EXISTS (
         SELECT 1
         FROM chat_message_files
         WHERE chat_message_files.message_id = chat_messages.id
       )`,
    [textRetentionDays],
  );

  adminSave();
  return pending;
}

// Cleanup timers always run — each tick re-reads the live setting, so
// enabling/disabling retention via the admin panel takes effect without a
// server restart.
try {
  if (getSetting("MESSAGE_FILE_RETENTION") > 0) {
    backfillMessageFileExpiry();
    cleanupExpiredMessageFiles();
  }
} catch (_) {
  // best effort startup cleanup
}

const expiryCleanupTimer = setInterval(() => {
  try {
    if (getSetting("MESSAGE_FILE_RETENTION") > 0) {
      cleanupExpiredMessageFiles();
    }
  } catch (_) {
    // keep server alive if cleanup fails
  }
}, MESSAGE_FILE_CLEANUP_INTERVAL_MS);

if (typeof expiryCleanupTimer.unref === "function") {
  expiryCleanupTimer.unref();
}

try {
  if (getSetting("MESSAGE_TEXT_RETENTION") > 0) {
    backfillTextMessageExpiry();
    cleanupExpiredTextOnlyMessages();
  }
} catch (_) {
  // best effort startup cleanup
}

const textCleanupTimer = setInterval(() => {
  try {
    if (getSetting("MESSAGE_TEXT_RETENTION") > 0) {
      backfillTextMessageExpiry();
      cleanupExpiredTextOnlyMessages();
    }
  } catch (_) {
    // keep server alive if cleanup fails
  }
}, MESSAGE_FILE_CLEANUP_INTERVAL_MS);

if (typeof textCleanupTimer.unref === "function") {
  textCleanupTimer.unref();
}

// Defer the storage encryption backfill so it doesn't block the event loop
// before the server starts accepting requests.
setImmediate(() => {
  try {
    backfillStorageEncryption();
  } catch (err) {
    console.error("[storage-encryption] deferred backfill failed:", String(err?.message || err));
  }
});
remoteChannelManager.start();

// Periodically purge old done/skipped/failed remote channel queue rows to
// prevent the table growing without bound. Runs every 24 hours; keeps rows
// that are less than 7 days old.
if (REMOTE_CHANNEL) {
  const QUEUE_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const QUEUE_PURGE_KEEP_DAYS = 7;
  const runQueuePurge = () => {
    try {
      const cutoff = new Date(
        Date.now() - QUEUE_PURGE_KEEP_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();
      purgeOldRemoteChannelQueueItems(cutoff);
    } catch (_) {
      // best effort — don't crash the server if purge fails
    }
  };
  // Run once at startup to clean up any accumulated rows.
  setImmediate(runQueuePurge);
  const queuePurgeTimer = setInterval(runQueuePurge, QUEUE_PURGE_INTERVAL_MS);
  if (typeof queuePurgeTimer.unref === "function") queuePurgeTimer.unref();
}

app.listen(port, () => {
  console.log(`Songbird server running on http://localhost:${port}`);
});

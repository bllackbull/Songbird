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
import { ensureValidVapidKeys } from "./lib/vapid.js";
import { createSseHub } from "./lib/sse.js";
import { createPushService } from "./lib/push.js";
import { createUploadTools } from "./lib/uploads.js";
import { createVideoTranscodeManager } from "./lib/videoTranscode.js";
import { createMessageFileJobs } from "./lib/messageFileJobs.js";
import { createInspector } from "./lib/inspect.js";
import { createSessionHelpers } from "./lib/sessions.js";
import { buildTimestampSchedule } from "./lib/timeUtils.js";
import { isLoopbackRequest, parseUploadFileMetadata } from "./lib/requestUtils.js";
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

process.title = "songbird-server";

const app = express();
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env") });
dotenv.config({ path: path.join(serverDir, ".env"), override: true });

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
const vapid = ensureValidVapidKeys({ projectRootDir, fs, path, webpush });
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

const uploadTools = createUploadTools({
  fs,
  path,
  crypto,
  multer,
  adminRun,
  adminSave,
  uploadRootDir,
  avatarUploadRootDir,
  fileUploadMaxSize: FILE_UPLOAD_MAX_SIZE,
  fileUploadMaxFiles: FILE_UPLOAD_MAX_FILES,
  fileUploadMaxTotalSize: FILE_UPLOAD_MAX_TOTAL_SIZE,
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

const { addSseClient, removeSseClient, emitSseEvent, emitChatEvent } = createSseHub({
  listChatMembers,
});

const pushService = createPushService({
  webpush,
  listPushSubscriptionsByUserIds,
  deletePushSubscription,
  vapid,
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
  messageFileRetentionDays: MESSAGE_FILE_RETENTION_DAYS,
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

registerUploadRoutes(app, { express, adminGetRow });







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




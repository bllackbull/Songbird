/**
 * Test app factory.
 *
 * Creates a minimal Express app wired through registerApiRoutes with fully
 * injectable stub dependencies — no real database, no file system, no WASM.
 * Each test can override individual stubs by merging into the deps object.
 */

import express from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { registerApiRoutes } from "../../api/index.js";
import { createSessionHelpers } from "../../lib/sessions.js";
import { USER_COLORS } from "../../settings/colors.js";
import { createStorageProvider } from "../../lib/storage/index.js";
import { generateUuid } from "../../lib/uuidUtils.js";

// ─── Minimal in-memory session store ─────────────────────────────────────────

export function makeSessionStore() {
  const sessions = new Map();
  return {
    sessions,
    createSession: (userId, token) => {
      sessions.set(token, { userId, token });
    },
    deleteSession: (token) => {
      sessions.delete(token);
    },
    getSession: (token) => sessions.get(token) ?? null,
    touchSession: () => {},
  };
}

// ─── Minimal in-memory user store ────────────────────────────────────────────

export function makeUserStore(initialUsers = []) {
  const users = new Map(initialUsers.map((u) => [u.username, u]));
  return {
    users,
    createUser: (username, passwordHash, nickname, avatarUrl, color) => {
      const id = generateUuid();
      users.set(username, {
        id,
        username,
        password_hash: passwordHash,
        nickname,
        avatar_url: avatarUrl,
        color,
        status: "online",
        role: "user",
        banned: false,
      });
      return id;
    },
    findUserByUsername: (username) => users.get(username) ?? null,
    findUserById: (id) => [...users.values()].find((u) => u.id === id) ?? null,
    updateLastSeen: () => {},
  };
}

// ─── App factory ─────────────────────────────────────────────────────────────

export function makeApp(overrides = {}) {
  const app = express();
  app.use(express.json());

  const sessionStore = overrides.sessionStore ?? makeSessionStore();
  const userStore = overrides.userStore ?? makeUserStore();

  const sessionHelpers = createSessionHelpers({
    getSession: sessionStore.getSession,
    touchSession: sessionStore.touchSession,
    isProduction: false,
  });

  // Build a getSessionFromRequest that also hydrates the full user row
  const getSessionFromRequest = (req) => {
    const cookies = sessionHelpers.parseCookies(req);
    if (!cookies.sid) return null;
    const record = sessionStore.getSession(cookies.sid);
    if (!record) return null;
    sessionStore.touchSession(cookies.sid);
    return userStore.findUserById(record.userId) ?? null;
  };

  const deps = {
    // ── Settings ──────────────────────────────────────────────────────────────
    getSetting: (key) => {
      const defaults = {
        SIGN_UP: true,
        USERNAME_MAX_CHARS: 16,
        NICKNAME_MAX_CHARS: 24,
        FILE_UPLOAD: true,
        MESSAGE_MAX_CHARS: 4000,
        CHAT_MESSAGE_FETCH_LIMIT: 60,
        CHAT_MESSAGE_PAGE_SIZE: 60,
        CHAT_CACHE_TTL: 24,
        REMOTE_CHANNEL_UI: false,
        REMOTE_CHANNEL_MEDIA_STREAM: false,
      };
      return overrides.settings?.[key] ?? defaults[key] ?? null;
    },

    // ── Crypto / bcrypt ───────────────────────────────────────────────────────
    crypto,
    bcrypt,

    // ── Debug logging (no-op unless APP_DEBUG is set) ─────────────────────────
    debugLog: () => {},

    // ── Push notifications ────────────────────────────────────────────────────
    sendPushNotificationToUsers: async () => {},

    // ── User helpers ──────────────────────────────────────────────────────────
    USER_COLORS,
    USERNAME_REGEX: /^(?=.*[a-z0-9])[a-z0-9._]+$/,
    setUserColor: () => USER_COLORS[0],
    createUser: userStore.createUser,
    findUserByUsername: userStore.findUserByUsername,
    findUserById: userStore.findUserById,
    updateLastSeen: userStore.updateLastSeen,
    ensureAvatarExists: (_id, url) => url || null,
    findChatByGroupUsername: () => null,

    // ── Session helpers ───────────────────────────────────────────────────────
    createSession: sessionStore.createSession,
    deleteSession: sessionStore.deleteSession,
    getSession: sessionStore.getSession,
    touchSession: sessionStore.touchSession,
    parseCookies: sessionHelpers.parseCookies,
    setSessionCookie: sessionHelpers.setSessionCookie,
    clearSessionCookie: sessionHelpers.clearSessionCookie,
    getSessionFromRequest,
    requireSession: (req, res) => {
      const session = getSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ error: "Not authenticated." });
        return null;
      }
      return session;
    },
    requireSessionUsernameMatch: sessionHelpers.requireSessionUsernameMatch,

    // ── App meta (fs/path/projectRootDir) ─────────────────────────────────────
    fs: {
      readFileSync: () => "",
      existsSync: () => false,
    },
    path: { join: (...parts) => parts.join("/") },
    projectRootDir: "/test",

    // ── Remote channels ───────────────────────────────────────────────────────
    REMOTE_CHANNELS: {
      enabled: false,
      telegramConfigured: false,
      proxyConfigured: false,
    },

    // ── SSE (not used in tests, but routes expect these) ─────────────────────
    addSseClient: () => {},
    removeSseClient: () => {},
    emitSseEvent: () => {},
    emitChatEvent: () => {},
    broadcastAll: () => {},
    isUserConnected: () => false,
    connectPresence: () => {},
    disconnectPresence: () => {},
    broadcastPresence: () => {},
    isConnected: () => false,
    getConnectedUsernames: () => [],
    getOnlineCount: () => 0,

    // ── Upload stubs (multer instances — .single/.array called at route
    //    registration time, so they must return valid middleware) ───────────
    uploadAvatar: { single: () => (_req, _res, next) => next() },
    uploadFiles: { array: () => (_req, _res, next) => next() },
    uploadRootDir: "/tmp/test-uploads",
    avatarUploadRootDir: "/tmp/test-avatars",
    removeUploadedFiles: () => {},
    storageProvider: createStorageProvider({ STORAGE_DRIVER: "local" }),
    storageProcessingMode: "sync",
    webhookSecret: null,

    removeStoredFileNames: () => {},
    removeAllMessageUploads: () => {},
    isLoopbackRequest: () => false,
    chunkArray: (arr) => [arr],
    decodeOriginalFilename: (name) => name,
    computeExpiryIso: () => null,
    cleanupMissingMessageFiles: () => [],
    buildInspectSnapshot: () => ({}),
    enqueueVideoTranscodeJob: () => {},
    ensureFfmpegAvailable: () => false,
    MESSAGE_FILE_LIMITS: { maxFiles: 10, maxSizeMb: 25, maxTotalSizeMb: 75 },
    listMessageFilesByMessageIds: () => [],
    parseUploadFileMetadata: () => [],
    getCachedMembers: () => [],
    getMessages: () => [],
    getFirstUnreadMessage: () => null,
    recordMessageReads: () => {},
    markMessagesRead: () => {},
    markMessageRead: () => {},
    createMessage: () => generateUuid(),
    createOrReuseMessage: () => ({ id: generateUuid() }),
    editMessage: () => {},
    createMessageFiles: () => [],
    hideMessageForEveryone: () => {},
    hideMessageForUser: () => {},
    setMessageExpiresAt: () => {},
    setMessageForwardOrigin: () => {},
    findMessageById: () => null,
    findMessageIdByClientRequestId: () => null,
    getMessageReadCounts: () => ({}),
    getMessageAuthors: () => [],
    getMessageReadByUser: () => false,
    isMember: () => false,
    isGroupMemberRemoved: () => false,
    listChatMembers: () => [],
    listChatMembersForChats: () => [],
    listChatsForUser: () => [],
    listUsers: () => [],
    searchUsers: () => [],
    searchPublicGroups: () => [],
    searchPublicChannels: () => [],
    createChat: () => generateUuid(),
    findChatById: () => null,
    findDmChat: () => null,
    findChatByInviteToken: () => null,
    deleteChatById: () => {},
    deleteUserById: () => {},
    addChatMember: () => {},
    addAllEligibleChatMembers: () => ({ addedUsers: [], skippedLeftCount: 0 }),
    removeChatMember: () => {},
    setChatMuted: () => {},
    setChatMemberRole: () => {},
    getChatMemberRole: () => null,
    regenerateGroupInviteToken: () => null,
    markGroupMemberRemoved: () => {},
    clearGroupMemberRemoved: () => {},
    markChatMemberLeft: () => {},
    clearChatMemberLeft: () => {},
    updateGroupChat: () => {},
    updateChannelChat: () => {},
    hideChatsForUser: () => {},
    unhideChat: () => {},
    ensureSavedChatForUser: () => {},
    getTotalUnreadCount: () => 0,
    listMutedUserIdsForChat: () => [],
    upsertPushSubscription: () => {},
    deletePushSubscription: () => {},
    listPushSubscriptionsByUserIds: () => [],
    getUserPresence: () => null,
    updateUserProfile: () => {},
    updateUserPassword: () => {},
    updateUserStatus: () => {},
    // Remote channel stubs
    upsertRemoteChannelSource: () => {},
    getRemoteChannelSourceByChatId: () => null,
    getRemoteChannelSourceById: () => null,
    listEnabledRemoteChannelSources: () => [],
    getRemoteChannelProviderState: () => null,
    getRemoteChannelQueueSummary: () => ({}),
    enqueueRemoteChannelQueueItem: () => {},
    skipCurrentRemoteChannelQueueItem: () => {},
    skipAllRemoteChannelQueueItems: () => {},
    getCurrentRemoteChannelQueueItemId: () => null,
    releaseStaleRemoteChannelQueueItems: () => {},
    purgeOldRemoteChannelQueueItems: () => {},
    updateRemoteChannelSourceError: () => {},
    updateRemoteChannelSourcePaused: () => {},
    updateRemoteChannelSourceSeen: () => {},
    setRemoteChannelProviderState: () => {},
    claimNextRemoteChannelQueueItem: () => null,
    markRemoteChannelQueueItemDone: () => {},
    markRemoteChannelQueueItemRetry: () => {},
    markRemoteChannelQueueItemSkipped: () => {},
    // Admin stubs
    adminGetAll: () => [],
    adminGetRow: () => null,
    adminRun: () => {},
    adminTransaction: async (callback) => callback(async () => {}),
    adminSave: () => {},
    isUserAdmin: () => false,
    isUserOwner: () => false,
    getOwnerUser: () => null,
    getAdminStats: () => ({}),
    adminListUsers: () => [],
    adminListChats: () => [],
    adminCountUsers: () => 0,
    adminCountChats: () => 0,
    adminBanUser: () => {},
    adminDeleteUser: () => {},
    adminDeleteChat: () => {},
    vacuumDatabase: () => {},
    reloadDatabase: () => {},
    adminClearAllMessages: () => {},
    adminResetDatabase: () => {},
    dbConfig: { client: "sqlite3" },
    postgresMaintenance: {
      backup: async () => {},
      restore: async () => {},
      vacuum: async () => {},
      dropDatabase: async () => {},
    },
    // Avoid probing the host's service manager whenever an in-memory test app
    // registers admin routes. Production resolves this once during startup.
    getServiceControlStatus: () => ({ available: false, reason: "systemctl not available." }),
    dbGetAllSettings: () => [],
    dbSetSetting: () => {},
    dbDeleteSetting: () => {},
    getAllSettings: () => [],
    setSetting: () => ({ ok: true }),
    setSettings: () => ({ ok: true }),
    resetSetting: () => ({ ok: true }),
    validateSetting: () => ({ valid: true }),
    SETTING_DEFS: [],
    buildTimestampSchedule: () => [],
    setUserRole: () => {},
    VAPID_PUBLIC_KEY: "",
    PUSH_ENABLED: false,
    createPushNotification: () => {},

    // ── Spread any remaining overrides ───────────────────────────────────────
    ...overrides.deps,
  };

  registerApiRoutes(app, deps);
  return { app, sessionStore, userStore, deps };
}

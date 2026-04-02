import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MobileTabMenu from "../components/MobileTabMenu.jsx";
import ChatWindowPanel from "../components/ChatWindowPanel.jsx";
import ChatProfileModal from "../components/ChatProfileModal.jsx";
import {
  DeleteChatsModal,
  GroupInviteLinkModal,
  NewChatModal,
  NewGroupModal,
} from "../components/ChatModals.jsx";
import { DesktopSettingsModal, NotificationsSettingsModal } from "../components/settings/index.js";
import { ChatSidebar } from "../components/chatpage/index.js";
import { CHAT_PAGE_CONFIG } from "../settings/chatPageConfig.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import { NICKNAME_MAX, USERNAME_MAX } from "../utils/nameLimits.js";
import {
  formatBytesAsMb,
  formatChatCardTimestamp,
  formatDayLabel,
  formatTime,
  parseServerDate,
} from "../utils/chatFormat.js";
import { useChatEvents } from "../hooks/useChatEvents.js";
import { useChatScroll } from "../hooks/useChatScroll.js";
import { Bookmark } from "../icons/lucide.js";
import {
  createDmChat,
  discoverUsersAndGroups,
  createChannelChat,
  createGroupChat,
  deleteAccount,
  deleteGroupChat,
  fetchHealth,
  fetchPresence,
  getGroupInviteLink,
  getMessagesUploadUrl,
  getSseStreamUrl,
  hideChats,
  leaveGroupChat,
  listChatsForUser,
  listMessagesByQuery,
  logout,
  markMessagesRead,
  pingPresence,
  searchUsers,
  sendMessage,
  removeGroupMember,
  regenerateGroupInviteLink,
  setChatMute,
  updateChannelChat,
  getMessageReadCounts,
  updateGroupChat,
  uploadGroupAvatar,
  getSavedMessagesChat,
  fetchPushPublicKey,
  subscribePush,
  unsubscribePush,
  sendPushTest,
  updatePassword,
  updateProfile,
  updateStatus as updateStatusRequest,
  uploadAvatar,
} from "../api/chatApi.js";
import { APP_CONFIG } from "../settings/appConfig.js";

const NEW_CHAT_SEARCH_DEBOUNCE_MS = 300;
const MOBILE_CLOSE_ANIMATION_MS = 340;
const UPLOAD_PROGRESS_HIDE_DELAY_MS = 600;
const NOTIFICATION_PREVIEW_MAX_CHARS = 120;
const NOTIFICATIONS_ENABLED_KEY = "songbird-notify-enabled";
const OPEN_CHAT_ID_KEY = "songbird-open-chat-id";
const PRESENCE_IDLE_THRESHOLD_MS = 12 * 1000;
const CHAT_CACHE_VERSION = 2;
const CHAT_LIST_CACHE_KEY = "songbird-chat-list-cache";
const CHAT_MESSAGES_CACHE_KEY = "songbird-chat-messages-cache";
const CHAT_MESSAGES_INDEX_KEY = "songbird-chat-messages-index";
const CHAT_MESSAGES_INDEX_LIMIT = 25;
const MEDIA_THUMB_CACHE_KEY = "chat-media-thumbs-v2";
const MEDIA_POSTER_CACHE_KEY = "chat-video-posters-v3";
const VOICE_WAVEFORM_CACHE_KEY = "voice-waveform-cache-v1";
const CHANNEL_SEEN_CACHE_KEY = "songbird-channel-seen";
const MESSAGE_CACHE_MAX = Math.max(
  50,
  Math.min(200, CHAT_PAGE_CONFIG.messageFetchLimit),
);

const safeParseJson = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeMessageBody = (value) => {
  if (typeof value === "string") {
    return value === "[object Object]" ? "" : value;
  }
  if (value && typeof value === "object") {
    const text = value.text ?? value.body;
    return typeof text === "string" ? text : "";
  }
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str === "[object Object]") return "";
  return str;
};

const readLocalCache = (key) => {
  if (typeof window === "undefined") return null;
  return safeParseJson(window.localStorage.getItem(key));
};

const removeLocalCache = (key) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
};

const writeLocalCache = (key, value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage failures
  }
};

const buildChatListCacheKey = (username) =>
  `${CHAT_LIST_CACHE_KEY}:${String(username || "").toLowerCase()}`;

const buildMessagesCacheKey = (username, chatId) =>
  `${CHAT_MESSAGES_CACHE_KEY}:${String(username || "").toLowerCase()}:${Number(chatId || 0)}`;

const buildMessagesIndexKey = (username) =>
  `${CHAT_MESSAGES_INDEX_KEY}:${String(username || "").toLowerCase()}`;

const buildChannelSeenCacheKey = (username, chatId) =>
  `${CHANNEL_SEEN_CACHE_KEY}:${String(username || "").toLowerCase()}:${Number(chatId || 0)}`;

const isCacheExpired = (entry, ttlMs) => {
  if (!entry || typeof entry !== "object") return true;
  if (!Number.isFinite(Number(entry.updatedAt))) return true;
  return Date.now() - Number(entry.updatedAt) > ttlMs;
};

const readChatListCache = (username) => {
  const cached = readLocalCache(buildChatListCacheKey(username));
  if (!cached || cached.version !== CHAT_CACHE_VERSION) return null;
  if (isCacheExpired(cached, CHAT_PAGE_CONFIG.cacheTtlMs)) {
    removeLocalCache(buildChatListCacheKey(username));
    return null;
  }
  return cached;
};

const readMessagesCache = (username, chatId) => {
  const key = buildMessagesCacheKey(username, chatId);
  const cached = readLocalCache(key);
  if (!cached || cached.version !== CHAT_CACHE_VERSION) return null;
  if (isCacheExpired(cached, CHAT_PAGE_CONFIG.cacheTtlMs)) {
    removeLocalCache(key);
    return null;
  }
  return cached;
};

const readMessagesIndex = (username) => {
  const index = readLocalCache(buildMessagesIndexKey(username));
  return Array.isArray(index) ? index : [];
};

const readChannelSeenCache = (username, chatId) => {
  const cached = readLocalCache(buildChannelSeenCacheKey(username, chatId));
  if (!cached || typeof cached !== "object") return {};
  if (cached.version !== 1 || typeof cached.counts !== "object") return {};
  return cached.counts || {};
};

const writeChannelSeenCache = (username, chatId, counts = {}) => {
  if (!username || !chatId || typeof counts !== "object") return;
  const entries = Object.entries(counts)
    .map(([key, value]) => [Number(key), Number(value)])
    .filter(([id, value]) => Number.isFinite(id) && id > 0 && Number.isFinite(value));
  if (!entries.length) return;
  entries.sort((a, b) => b[0] - a[0]);
  const trimmed = entries.slice(0, 300).reduce((acc, [id, value]) => {
    acc[id] = value;
    return acc;
  }, {});
  writeLocalCache(buildChannelSeenCacheKey(username, chatId), {
    version: 1,
    updatedAt: Date.now(),
    counts: trimmed,
  });
};

const writeMessagesIndex = (username, index) => {
  writeLocalCache(buildMessagesIndexKey(username), index);
};

const pruneMessagesIndex = (username, index) => {
  const trimmed = index
    .filter((entry) => Number(entry?.chatId) > 0 && Number.isFinite(Number(entry?.updatedAt)))
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
    .slice(0, CHAT_MESSAGES_INDEX_LIMIT);
  const keepIds = new Set(trimmed.map((entry) => Number(entry.chatId)));
  index.forEach((entry) => {
    const chatId = Number(entry?.chatId);
    if (!chatId || keepIds.has(chatId)) return;
    removeLocalCache(buildMessagesCacheKey(username, chatId));
  });
  return trimmed;
};

const updateMessagesIndex = (username, chatId, updatedAt) => {
  if (!username || !chatId) return;
  const index = readMessagesIndex(username);
  const next = index.filter((entry) => Number(entry?.chatId) !== Number(chatId));
  next.push({ chatId: Number(chatId), updatedAt: Number(updatedAt) || Date.now() });
  const trimmed = pruneMessagesIndex(username, next);
  writeMessagesIndex(username, trimmed);
};

const sanitizeMessageForCache = (message) => {
  if (!message || typeof message !== "object") return message;
  const normalizedBody = normalizeMessageBody(message.body);
  const normalizedReply =
    message.replyTo && typeof message.replyTo === "object"
      ? {
          ...message.replyTo,
          body: normalizeMessageBody(message.replyTo.body),
        }
      : message.replyTo || null;
  const { _files, ...rest } = message;
  rest.body = normalizedBody;
  if (normalizedReply) {
    rest.replyTo = normalizedReply;
  }
  if (Array.isArray(rest.files)) {
    rest.files = rest.files.map((file) => {
      if (!file || typeof file !== "object") return file;
      const { file: _file, ...fileRest } = file;
      return fileRest;
    });
  }
  return rest;
};

const sanitizeMessagesForCache = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .map(sanitizeMessageForCache)
    .slice(-MESSAGE_CACHE_MAX);

const normalizeMessageForRender = (message) => {
  if (!message || typeof message !== "object") return message;
  let normalizedBody = normalizeMessageBody(message.body);
  const files = Array.isArray(message.files) ? message.files : [];
  const hasAudio = files.some((file) =>
    String(file?.mimeType || "").toLowerCase().startsWith("audio/"),
  );
  if (hasAudio) {
    const genericBodyPattern =
      /^Sent (a media file|a document|a file|\d+ files|\d+ media files)$/i;
    if (!normalizedBody || genericBodyPattern.test(normalizedBody)) {
      normalizedBody = "Sent a voice message";
    }
  }
  const normalizedReply =
    message.replyTo && typeof message.replyTo === "object"
      ? {
          ...message.replyTo,
          body: normalizeMessageBody(message.replyTo.body),
        }
      : message.replyTo || null;
  return {
    ...message,
    body: normalizedBody,
    replyTo: normalizedReply,
  };
};

const normalizeMessagesForRender = (messages) =>
  (Array.isArray(messages) ? messages : []).map(normalizeMessageForRender);




export default function ChatPage({ user, setUser, isDark, setIsDark, toggleTheme }) {
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [channelSeenCounts, setChannelSeenCounts] = useState({});
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileTab, setMobileTab] = useState("chats");
  const [settingsPanel, setSettingsPanel] = useState(null);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState(false);
  const [testNotificationSent, setTestNotificationSent] = useState(false);
  const [pushSwReady, setPushSwReady] = useState(false);
  const [pushVapidReady, setPushVapidReady] = useState(null);
  const [pushVapidLength, setPushVapidLength] = useState(null);
  const [pushSubscribeStatus, setPushSubscribeStatus] = useState(null);
  const [pushSubscribeError, setPushSubscribeError] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatUsername, setNewChatUsername] = useState("");
  const [newChatError, setNewChatError] = useState("");
  const [newChatResults, setNewChatResults] = useState([]);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [newChatSelection, setNewChatSelection] = useState(null);
  const dmUsernamesRef = useRef(new Set());
  const [chatsSearchQuery, setChatsSearchQuery] = useState("");
  const [chatsSearchFocused, setChatsSearchFocused] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [discoverGroups, setDiscoverGroups] = useState([]);
  const [discoverChannels, setDiscoverChannels] = useState([]);
  const [discoverSaved, setDiscoverSaved] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupModalType, setGroupModalType] = useState("group");
  const [newGroupForm, setNewGroupForm] = useState({
    nickname: "",
    username: "",
    visibility: "public",
    allowMemberInvites: true,
  });
  const [newGroupSearch, setNewGroupSearch] = useState("");
  const [newGroupSearchResults, setNewGroupSearchResults] = useState([]);
  const [newGroupSearchLoading, setNewGroupSearchLoading] = useState(false);
  const [newGroupMembers, setNewGroupMembers] = useState([]);
  const [newGroupError, setNewGroupError] = useState("");
  const [groupInviteOpen, setGroupInviteOpen] = useState(false);
  const [createdGroupInviteLink, setCreatedGroupInviteLink] = useState("");
  const [editGroupInviteLink, setEditGroupInviteLink] = useState("");
  const [regeneratingGroupInviteLink, setRegeneratingGroupInviteLink] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalMember, setProfileModalMember] = useState(null);
  const [profileInviteLink, setProfileInviteLink] = useState("");
  const [mentionProfile, setMentionProfile] = useState(null);
  const [mentionRefreshToken, setMentionRefreshToken] = useState(0);
  const [editingGroup, setEditingGroup] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedChats, setSelectedChats] = useState([]);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [, setIsAtBottom] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [unreadInChat, setUnreadInChat] = useState(0);
  const [unreadMarkerId, setUnreadMarkerId] = useState(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [pendingUploadType, setPendingUploadType] = useState("");
  const [pendingVoiceMessage, setPendingVoiceMessage] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [activeUploadProgress, setActiveUploadProgress] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const chatScrollRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const userScrolledUpRef = useRef(false);
  const pendingScrollToBottomRef = useRef(false);
  const pendingScrollToUnreadRef = useRef(null);
  const unreadMarkerIdRef = useRef(null);
  const openingHadUnreadRef = useRef(false);
  const openingUnreadCountRef = useRef(0);
  const allowStartReachedRef = useRef(false);
  const unreadAnchorLockUntilRef = useRef(0);
  const unreadAlignTimersRef = useRef([]);
  const suppressScrolledUpRef = useRef(false);
  const shouldAutoMarkReadRef = useRef(true);
  const openingChatRef = useRef(false);
  const pendingUploadFilesRef = useRef([]);
  const pendingVoiceMessageRef = useRef(null);
  const prevUploadProgressRef = useRef(null);
  const mediaLoadSnapTimerRef = useRef(null);
  const messageRefreshTimerRef = useRef(null);
  const messageFetchInFlightRef = useRef(false);
  const queuedSilentMessageRefreshRef = useRef(null);
  const channelSeenQueueRef = useRef([]);
  const channelSeenActiveRef = useRef(false);
  const channelSeenLoadedRef = useRef(new Set());
  const channelSeenTimerRef = useRef(null);
  const channelSeenLatestRefreshRef = useRef(0);
  const messagesCacheRef = useRef(new Map());
  const [sseConnected, setSseConnected] = useState(false);
  const [dataCacheStats, setDataCacheStats] = useState({
    totalBytes: 0,
    totalLabel: "0 B",
    chatList: {
      count: 0,
      sizeBytes: 0,
      sizeLabel: "0 B",
      updatedAt: null,
      entries: [],
    },
    messageCaches: {
      count: 0,
      sizeBytes: 0,
      sizeLabel: "0 B",
      entries: [],
    },
    mediaThumbs: {
      count: 0,
      sizeBytes: 0,
      sizeLabel: "0 B",
      updatedAt: null,
    },
    mediaPosters: {
      count: 0,
      sizeBytes: 0,
      sizeLabel: "0 B",
      updatedAt: null,
    },
    voiceWaveforms: {
      count: 0,
      sizeBytes: 0,
      sizeLabel: "0 B",
      updatedAt: null,
    },
  });
  const [profileForm, setProfileForm] = useState({
    nickname: user?.nickname || "",
    username: user?.username || "",
    avatarUrl: user?.avatarUrl || "",
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || "");
  const [groupAvatarPreview, setGroupAvatarPreview] = useState("");
  const [pendingGroupAvatarFile, setPendingGroupAvatarFile] = useState(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [statusSelection, setStatusSelection] = useState(
    user?.status || "online",
  );
  const [isConnected, setIsConnected] = useState(false);
  const [isUpdatingChats, setIsUpdatingChats] = useState(false);
  const [sidebarScrollEpoch, setSidebarScrollEpoch] = useState(0);
  const [activePeer, setActivePeer] = useState(null);
  const [peerPresence, setPeerPresence] = useState({
    status: "offline",
    lastSeen: null,
  });
  const [isAppActive, setIsAppActive] = useState(
    document.visibilityState === "visible" && document.hasFocus(),
  );
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    return stored === "0" ? false : true;
  });
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  });

  const settingsMenuRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const activeChatTypeRef = useRef(null);
  const sseReconnectRef = useRef(null);
  const isMarkingReadRef = useRef(false);
  const sendingClientIdsRef = useRef(new Set());
  const usernameRef = useRef(String(user?.username || ""));
  const loadChatsRef = useRef(null);
  const scheduleMessageRefreshRef = useRef(null);
  const presenceStateRef = useRef(new Map());
  const wasAppActiveRef = useRef(
    document.visibilityState === "visible" && document.hasFocus(),
  );

  const truncateText = (text, maxChars) => {
    const value = String(text || "");
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars).trimEnd()}...`;
  };

  const uaPlatform =
    typeof navigator !== "undefined"
      ? navigator.userAgentData?.platform || navigator.platform || ""
      : "";
  const uaString =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isIOSPlatform = /iP(ad|hone|od)/i.test(uaPlatform);
  const isIOSDevice = isIOSPlatform || (!uaPlatform && /iP(ad|hone|od)/i.test(uaString));
  const isStandaloneDisplay =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator?.standalone);
  const isSecureContext =
    typeof window !== "undefined" && Boolean(window.isSecureContext);
  const hasNotificationApi =
    typeof window !== "undefined" && "Notification" in window;
  const isMobileUa = /Android|iPhone|iPad|iPod/i.test(uaString);
  const mobileRequiresStandalone = isMobileUa && !isStandaloneDisplay;
  const notificationsSupported =
    hasNotificationApi && isSecureContext && !mobileRequiresStandalone;
  const notificationsAllowed = notificationPermission === "granted";
  const notificationsActive = notificationsEnabled && notificationsAllowed;
  const notificationStatusLabel = !isSecureContext
    ? "Connection is not secure."
    : mobileRequiresStandalone
      ? "Require Home screen installation."
      : !hasNotificationApi
        ? "Not supported in this browser."
        : notificationPermission === "denied"
          ? "Blocked in browser settings."
          : "";
  const notificationsDisabled = Boolean(notificationStatusLabel);
  const notificationsDebugLine = `secure:${isSecureContext ? "yes" : "no"} | support:${
    notificationsSupported ? "yes" : "no"
  } | perm:${notificationPermission} | sw:${pushSwReady ? "ready" : "no"} | vapid:${
    pushVapidReady === null ? "..." : pushVapidReady ? "ok" : "missing"
  }${pushVapidLength ? "(" + pushVapidLength + ")" : ""} | sub:${
    pushSubscribeStatus || "..."
  }${pushSubscribeError ? " | err:" + pushSubscribeError : ""}`;
  const pushRegistrationRef = useRef(null);
  const lastPushRefreshRef = useRef(0);
  const PUSH_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const PUSH_RESUBSCRIBE_DEBOUNCE_MS = 2 * 60 * 1000;

  const persistNotificationsEnabled = (value) => {
    setNotificationsEnabled(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, value ? "1" : "0");
    }
  };

  const requestNotificationPermission = async () => {
    if (!notificationsSupported) return;
    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
    } catch {
      // ignore
    }
  };

  const toBase64 = (value) =>
    String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = toBase64(base64String) + padding;
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const getVapidKeyLength = (key) => {
    try {
      const arr = urlBase64ToUint8Array(String(key || ""));
      return arr?.length || 0;
    } catch {
      return 0;
    }
  };

  const ensurePushSubscription = async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) {
      setPushSubscribeStatus("no-sw");
      return;
    }
    if (!notificationsSupported) {
      setPushSubscribeStatus("unsupported");
      return;
    }
    if (notificationPermission !== "granted") {
      setPushSubscribeStatus("no-perm");
      return;
    }
    try {
      setPushSubscribeStatus("...");
      setPushSubscribeError("");
      const reg =
        pushRegistrationRef.current ||
        (await navigator.serviceWorker.ready);
      if (!reg?.pushManager) {
        setPushSubscribeStatus("no-push");
        return;
      }
      const keyRes = await fetchPushPublicKey();
      const keyData = await keyRes.json();
      if (!keyRes.ok || !keyData?.publicKey) {
        setPushSubscribeStatus("no-key");
        return;
      }
      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
      setPushVapidLength(getVapidKeyLength(keyData.publicKey));
      if (!applicationServerKey || applicationServerKey.length < 1) {
        setPushSubscribeStatus("bad-key");
        return;
      }
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }
      if (!subscription) {
        setPushSubscribeStatus("no-sub");
        return;
      }
      const json = subscription.toJSON();
      const res = await subscribePush({
        username: user.username,
        subscription: json,
      });
      if (!res.ok) {
        setPushSubscribeStatus("err");
        setPushSubscribeError(String(res.status || "err"));
        return;
      }
      setPushSubscribeStatus("ok");
    } catch (err) {
      setPushSubscribeStatus("err");
      const message = String(err?.message || err || "subscribe failed");
      setPushSubscribeError(message);
    }
  };

  const maybeRefreshPushSubscription = async (reason = "resume") => {
    if (typeof window === "undefined") return;
    if (!notificationsSupported) return;
    if (notificationPermission !== "granted") return;
    if (!notificationsEnabled) return;
    const now = Date.now();
    const minInterval =
      reason === "interval" ? PUSH_REFRESH_INTERVAL_MS : PUSH_RESUBSCRIBE_DEBOUNCE_MS;
    if (now - lastPushRefreshRef.current < minInterval) return;
    lastPushRefreshRef.current = now;
    await ensurePushSubscription();
  };

  const removePushSubscription = async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    try {
      const reg =
        pushRegistrationRef.current ||
        (await navigator.serviceWorker.ready);
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (endpoint) {
        await unsubscribePush({ username: user.username, endpoint });
      }
    } catch {
      // ignore
    }
  };

  const handleToggleNotifications = async () => {
    if (!notificationsSupported) return;
    if (notificationPermission === "denied") {
      persistNotificationsEnabled(false);
      return;
    }
    if (notificationsActive) {
      persistNotificationsEnabled(false);
      await removePushSubscription();
      return;
    }
    if (!notificationsEnabled) {
      persistNotificationsEnabled(true);
    }
    if (notificationPermission !== "granted") {
      await requestNotificationPermission();
    }
    await ensurePushSubscription();
  };

  const handleTestPush = async () => {
    if (!notificationsSupported) return;
    setTestNotificationSent(true);
    window.setTimeout(() => setTestNotificationSent(false), 12000);
    if (notificationPermission !== "granted") {
      await requestNotificationPermission();
    }
    await ensurePushSubscription();
    try {
      let res = await sendPushTest({ username: user.username });
      let data = await res.json();
      if (!res.ok && String(data?.error || "").toLowerCase().includes("no push subscription")) {
        await ensurePushSubscription();
        res = await sendPushTest({ username: user.username });
        data = await res.json();
      }
      if (!res.ok) {
        if (typeof window !== "undefined") {
          window.alert(data?.error || "Unable to send test notification.");
        }
        return;
      }
      try {
        const reg =
          pushRegistrationRef.current ||
          (await navigator.serviceWorker.ready);
        if (reg?.showNotification) {
          await reg.showNotification("Songbird", {
            body: "Test notification",
            badge: "/icons/icon-192.png",
            icon: "/icons/icon-192.png",
            data: { url: "/" },
          });
        }
      } catch {
        // ignore local test notification failures
      }
    } catch {
      if (typeof window !== "undefined") {
        window.alert("Unable to send test notification.");
      }
    }
  };

  const summarizeFiles = (files = []) => {
    if (!Array.isArray(files) || files.length === 0) return "";
    const videoCount = files.filter((file) =>
      String(file?.mimeType || "").toLowerCase().startsWith("video/"),
    ).length;
    const imageCount = files.filter((file) =>
      String(file?.mimeType || "").toLowerCase().startsWith("image/"),
    ).length;
    const audioCount = files.filter((file) =>
      String(file?.mimeType || "").toLowerCase().startsWith("audio/"),
    ).length;
    const docCount = Math.max(0, files.length - videoCount - imageCount - audioCount);
    if (files.length === 1) {
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
    if (imageCount > 0 && videoCount > 0 && docCount === 0) {
      return `Sent ${files.length} media files`;
    }
    return `Sent ${files.length} files`;
  };

  const resolveReplyPreview = (msg) => {
    if (!msg) return { text: "", icon: null };
    const rawBody = normalizeMessageBody(msg.body).trim();
    const files = Array.isArray(msg.files)
      ? msg.files
      : Array.isArray(msg._files)
        ? msg._files
        : [];
    const videoCount = files.filter((file) =>
      String(file?.mimeType || "").toLowerCase().startsWith("video/"),
    ).length;
    const imageCount = files.filter((file) =>
      String(file?.mimeType || "").toLowerCase().startsWith("image/"),
    ).length;
    const audioCount = files.filter((file) =>
      String(file?.mimeType || "").toLowerCase().startsWith("audio/"),
    ).length;
    const docCount = Math.max(0, files.length - videoCount - imageCount - audioCount);
    const isMixedMedia = imageCount > 0 && videoCount > 0 && docCount === 0;
    const hasVoiceOnly = audioCount > 0 && videoCount === 0 && imageCount === 0 && docCount === 0;
    const icon = hasVoiceOnly
      ? "voice"
      : isMixedMedia
        ? "image"
        : videoCount > 0
          ? "video"
          : imageCount > 0
            ? "image"
            : files.length
              ? "document"
              : null;
    let summary = summarizeFiles(files);
    if (!summary && /^Sent a media file$/i.test(rawBody)) {
      if (videoCount === 1 && imageCount === 0) summary = "Sent a video";
      if (imageCount === 1 && videoCount === 0) summary = "Sent a photo";
    }
    const isGenericBody =
      !rawBody ||
      /^Sent (a media file|a document|a voice message|\d+ files|\d+ media files|\d+ voice messages)$/i.test(
        rawBody,
      );
    if (isMixedMedia && (isGenericBody || /^Sent \d+ files$/i.test(rawBody))) {
      summary = `Sent ${files.length} media files`;
    }
    const text = isGenericBody && summary ? summary : rawBody || summary || "Message";
    return { text, icon: icon || (docCount > 0 ? "document" : null) };
  };

  const clearUnreadAlignTimers = () => {
    unreadAlignTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    unreadAlignTimersRef.current = [];
  };

  const handleStartReply = (msg) => {
    if (!msg) return;
    const targetId = Number(msg.id || msg._serverId || 0);
    if (!targetId) return;
    const replyName =
      msg.nickname || msg.username || msg.replyTo?.nickname || msg.replyTo?.username || "";
    const preview = resolveReplyPreview(msg);
    setReplyTarget({
      id: targetId,
      username: msg.username || "",
      nickname: msg.nickname || "",
      body: preview.text,
      icon: preview.icon,
      displayName: replyName || "Unknown",
      color: msg.color || "#10b981",
    });
    if (!userScrolledUpRef.current) {
      pendingScrollToBottomRef.current = true;
      scrollChatToBottom("auto");
      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
      });
      window.setTimeout(() => {
        scrollChatToBottom("auto");
      }, 80);
    }
  };

  const handleClearReply = () => {
    setReplyTarget(null);
    if (!userScrolledUpRef.current) {
      pendingScrollToBottomRef.current = true;
      scrollChatToBottom("auto");
      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
      });
      window.setTimeout(() => {
        scrollChatToBottom("auto");
      }, 80);
    }
  };

  const scheduleUnreadAnchorAlignment = (unreadId) => {
    clearUnreadAlignTimers();
    const attempt = () => {
      const divider =
        document.getElementById(`unread-divider-${unreadId}`) ||
        document.getElementById(`message-${unreadId}`);
      if (!divider) return false;
      const scroller = chatScrollRef.current;
      if (scroller) {
        const dividerRect = divider.getBoundingClientRect();
        const containerRect = scroller.getBoundingClientRect();
        const offsetTop =
          scroller.scrollTop + (dividerRect.top - containerRect.top) - 12;
        scroller.scrollTo({ top: Math.max(0, offsetTop), behavior: "auto" });
      } else if (typeof divider.scrollIntoView === "function") {
        divider.scrollIntoView({ block: "start", behavior: "auto" });
      }
      return true;
    };
    attempt();
    for (let i = 1; i <= 12; i += 1) {
      const timer = window.setTimeout(() => {
        if (Date.now() > Number(unreadAnchorLockUntilRef.current || 0)) return;
        if (userScrolledUpRef.current === false) return;
        attempt();
      }, i * 80);
      unreadAlignTimersRef.current.push(timer);
    }
  };

  const setPendingUploadProgress = (clientId, progress, chatId = null) => {
    const nextProgress = Math.max(0, Math.min(100, Number(progress || 0)));
    const activeId = Number(activeChatIdRef.current || 0);
    const targetId = Number(chatId || 0);
    if (!targetId || activeId === targetId) {
      setActiveUploadProgress(nextProgress);
    }
    setMessages((prev) =>
      prev.map((msg) =>
        msg._clientId === clientId ? { ...msg, _uploadProgress: nextProgress } : msg,
      ),
    );
  };

  const scheduleMessageRefresh = (chatId, options = {}) => {
    if (!chatId) return;
    if (messageRefreshTimerRef.current) {
      window.clearTimeout(messageRefreshTimerRef.current);
    }
    messageRefreshTimerRef.current = window.setTimeout(() => {
      messageRefreshTimerRef.current = null;
      void loadMessages(chatId, { silent: true, preserveHistory: true, ...options });
    }, 280);
  };

  const fileUploadInProgress = useMemo(
    () =>
      messages.some(
        (msg) =>
          msg?._delivery === "sending" &&
          Array.isArray(msg?._files) &&
          msg._files.length > 0,
      ),
    [messages],
  );
  const canMarkReadInCurrentView = !isMobileViewport || mobileTab === "chat";
  const {
    handleChatScroll,
    handleJumpToLatest,
    handleMessageMediaLoaded,
    scrollChatToBottom,
  } = useChatScroll({
    activeChatId,
    canMarkReadInCurrentView,
    chatScrollRef,
    clearUnreadAlignTimers,
    messages,
    user,
    isAppActive,
    markMessagesRead,
    pendingScrollToUnreadRef,
    isAtBottomRef,
    userScrolledUpRef,
    unreadAnchorLockUntilRef,
    suppressScrolledUpRef,
    mediaLoadSnapTimerRef,
    activeChatIdRef,
    isMarkingReadRef,
    setUnreadInChat,
    setIsAtBottom,
    setUserScrolledUp,
  });


  useEffect(() => {
    pendingUploadFilesRef.current = pendingUploadFiles;
  }, [pendingUploadFiles]);

  useEffect(() => {
    pendingVoiceMessageRef.current = pendingVoiceMessage;
  }, [pendingVoiceMessage]);

  useEffect(() => {
    usernameRef.current = String(user?.username || "");
  }, [user?.username]);

  useEffect(() => {
    return () => {
      pendingUploadFilesRef.current.forEach((file) => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
      if (pendingVoiceMessageRef.current?.previewUrl) {
        URL.revokeObjectURL(pendingVoiceMessageRef.current.previewUrl);
      }
      if (pendingGroupAvatarFile?.previewUrl) {
        URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
      }
      clearUnreadAlignTimers();
    };
  }, [pendingGroupAvatarFile]);

  useEffect(() => {
    if (user) {
      if (pendingAvatarFile?.previewUrl) {
        URL.revokeObjectURL(pendingAvatarFile.previewUrl);
      }
      setPendingAvatarFile(null);
      setProfileForm({
        nickname: user.nickname || "",
        username: user.username || "",
        avatarUrl: user.avatarUrl || "",
      });
      setAvatarPreview(user.avatarUrl || "");
      setStatusSelection(
        user.status === "idle" ? "online" : user.status || "online",
      );
    }
  }, [user]);

  useEffect(() => {
    if (!user?.username) return;
    const cached = readChatListCache(user.username);
    if (!cached) return;
    if (!Array.isArray(cached.chats) || cached.chats.length === 0) return;
    const normalizedCached = cached.chats.map((chat) => ({
      ...chat,
      last_message: normalizeMessageBody(chat.last_message),
    }));
    setChats((prev) => (prev.length ? prev : normalizedCached));
    setLoadingChats(false);
  }, [user?.username]);

  useEffect(() => {
    if (!user?.username) return;
    const index = readMessagesIndex(user.username);
    if (!index.length) return;
    const now = Date.now();
    const filtered = index.filter((entry) => {
      const chatId = Number(entry?.chatId);
      const updatedAt = Number(entry?.updatedAt);
      if (!chatId || !Number.isFinite(updatedAt)) return false;
      if (now - updatedAt > CHAT_PAGE_CONFIG.cacheTtlMs) {
        removeLocalCache(buildMessagesCacheKey(user.username, chatId));
        return false;
      }
      return true;
    });
    const trimmed = pruneMessagesIndex(user.username, filtered);
    if (trimmed.length !== index.length) {
      writeMessagesIndex(user.username, trimmed);
    }
  }, [user?.username]);

  useEffect(() => {
    if (user) {
      void loadChats({ showUpdating: true });
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (mediaLoadSnapTimerRef.current) {
        window.clearTimeout(mediaLoadSnapTimerRef.current);
      }
      if (messageRefreshTimerRef.current) {
        window.clearTimeout(messageRefreshTimerRef.current);
      }
      if (channelSeenTimerRef.current) {
        window.clearTimeout(channelSeenTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!notificationsSupported) return;
    const syncPermission = () => {
      setNotificationPermission(Notification.permission);
    };
    syncPermission();
    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);
    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, [notificationsSupported]);


  useEffect(() => {
    const totalUnreadCount = chats.reduce(
      (sum, chat) =>
        sum + (chat?._muted ? 0 : Number(chat?.unread_count || 0)),
      0,
    );
    const totalUnread = totalUnreadCount > 999 ? "+999" : totalUnreadCount;

    document.title =
      totalUnreadCount > 0
        ? `Songbird | ${totalUnread} new message${totalUnread === 1 ? "" : "s"}`
        : "Songbird";
    if (navigator?.setAppBadge) {
      if (totalUnreadCount > 0) {
        navigator.setAppBadge(totalUnreadCount).catch(() => null);
      } else if (navigator.clearAppBadge) {
        navigator.clearAppBadge().catch(() => null);
      }
    }
  }, [chats]);

  useEffect(() => {
    if (!user || sseConnected) return;
    const interval = setInterval(() => {
      void loadChats({ silent: true });
    }, CHAT_PAGE_CONFIG.chatsRefreshIntervalMs);
    return () => clearInterval(interval);
  }, [user, sseConnected]);

  useEffect(() => {
    if (!user) return;
    if (!isAppActive) return;
    const ping = async () => {
      try {
        await pingPresence(user.username);
      } catch {
        // ignore
      }
    };
    ping();
    const interval = setInterval(ping, CHAT_PAGE_CONFIG.presencePingIntervalMs);
    return () => clearInterval(interval);
  }, [user, isAppActive]);

  useEffect(() => {
    const usernames = new Set();
    (chats || []).forEach((chat) => {
      if (chat.type !== "dm") return;
      const members = Array.isArray(chat.members) ? chat.members : [];
      const other =
        members.find(
          (member) =>
            String(member?.username || "").toLowerCase() !==
            String(user.username || "").toLowerCase(),
        ) || null;
      const otherUsername = String(
        other?.username ||
          chat?.username ||
          chat?.peer_username ||
          chat?.dm_username ||
          "",
      )
        .toLowerCase()
        .trim();
      if (otherUsername && otherUsername !== String(user.username || "").toLowerCase()) {
        usernames.add(otherUsername);
      }
    });
    dmUsernamesRef.current = usernames;
  }, [chats, user.username]);

  useEffect(() => {
    if (!newChatOpen) return;
    if (!newChatUsername.trim()) {
      setNewChatResults([]);
      setNewChatSelection(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setNewChatLoading(true);
        const res = await searchUsers({
          exclude: user.username,
          query: newChatUsername.trim().toLowerCase(),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to search users.");
        }
        const dmUsernames = dmUsernamesRef.current;
        const users = (data.users || [])
          .filter(
            (candidate) =>
              !dmUsernames.has(String(candidate.username || "").toLowerCase()),
          )
          .slice(0, CHAT_PAGE_CONFIG.newChatSearchMaxResults);
        setNewChatResults(users);
      } catch (err) {
        setNewChatError(err.message);
      } finally {
        setNewChatLoading(false);
      }
    }, NEW_CHAT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [newChatUsername, newChatOpen, user.username]);

  useEffect(() => {
    if (!newGroupOpen) return;
    if (!newGroupSearch.trim()) {
      setNewGroupSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        setNewGroupSearchLoading(true);
        const res = await searchUsers({
          exclude: user.username,
          query: newGroupSearch.trim().toLowerCase(),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to search users.");
        }
        const selectedUsernames = new Set(
          newGroupMembers.map((member) => String(member?.username || "")),
        );
        const currentEditingChat = chats.find(
          (chat) => Number(chat.id) === Number(activeChatId),
        );
        if (editingGroup && ["group", "channel"].includes(currentEditingChat?.type)) {
          (currentEditingChat.members || []).forEach((member) => {
            const memberUsername = String(member?.username || "").toLowerCase();
            if (
              memberUsername &&
              memberUsername !== String(user.username || "").toLowerCase()
            ) {
              selectedUsernames.add(memberUsername);
            }
          });
        }
        const users = (data.users || [])
          .filter(
            (candidate) =>
              !selectedUsernames.has(String(candidate.username || "").toLowerCase()),
          )
          .slice(0, CHAT_PAGE_CONFIG.newChatSearchMaxResults);
        setNewGroupSearchResults(users);
      } catch (err) {
        setNewGroupError(err.message);
      } finally {
        setNewGroupSearchLoading(false);
      }
    }, NEW_CHAT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [newGroupSearch, newGroupOpen, newGroupMembers, user.username, editingGroup, chats, activeChatId]);

  useEffect(() => {
    const query = String(chatsSearchQuery || "").trim();
    if (!query) {
      setDiscoverLoading(false);
      setDiscoverUsers([]);
      setDiscoverGroups([]);
      setDiscoverChannels([]);
      setDiscoverSaved(false);
      return;
    }
    const normalizedQuery = query.toLowerCase();
    const savedMatch =
      normalizedQuery.includes("saved") || normalizedQuery.includes("bookmark");
    setDiscoverSaved(savedMatch);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        setDiscoverLoading(true);
        const res = await discoverUsersAndGroups({
          username: user.username,
          query: normalizedQuery,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to search.");
        }
        if (cancelled) return;
        setDiscoverUsers(
          (Array.isArray(data?.users) ? data.users : []).slice(
            0,
            CHAT_PAGE_CONFIG.newChatSearchMaxResults,
          ),
        );
        setDiscoverGroups(
          (Array.isArray(data?.groups) ? data.groups : []).slice(
            0,
            CHAT_PAGE_CONFIG.newChatSearchMaxResults,
          ),
        );
        setDiscoverChannels(
          (Array.isArray(data?.channels) ? data.channels : []).slice(
            0,
            CHAT_PAGE_CONFIG.newChatSearchMaxResults,
          ),
        );
      } catch {
        if (cancelled) return;
        setDiscoverUsers([]);
        setDiscoverGroups([]);
        setDiscoverChannels([]);
      } finally {
        if (!cancelled) {
          setDiscoverLoading(false);
        }
      }
    }, NEW_CHAT_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatsSearchQuery, user.username]);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetchHealth();
        if (!res.ok) throw new Error("Not connected");
        const data = await res.json();
        if (isMounted) {
          setIsConnected(Boolean(data?.ok));
        }
      } catch {
        if (isMounted) {
          setIsConnected(false);
        }
      }
    };
    checkHealth();
    const interval = setInterval(
      checkHealth,
      CHAT_PAGE_CONFIG.healthCheckIntervalMs,
    );
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobileViewport(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (user && activeChatId) {
      const openedChatId = Number(activeChatId);
      const openedChat = chats.find((chat) => chat.id === openedChatId);
      let cached = messagesCacheRef.current.get(openedChatId) || null;
      if (!cached && user?.username) {
        const persisted = readMessagesCache(user.username, openedChatId);
        if (persisted && Array.isArray(persisted.messages)) {
          cached = persisted;
          messagesCacheRef.current.set(openedChatId, persisted);
        }
      }
      const hasCachedMessages = Array.isArray(cached?.messages) && cached.messages.length > 0;
      openingHadUnreadRef.current = Boolean((openedChat?.unread_count || 0) > 0);
      openingUnreadCountRef.current = Number(openedChat?.unread_count || 0);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setLoadingMessages(!hasCachedMessages);
      setMessages(hasCachedMessages ? normalizeMessagesForRender(cached.messages) : []);
      setHasOlderMessages(Boolean(cached?.hasOlderMessages));
      setLoadingOlderMessages(false);
      lastMessageIdRef.current = Number(cached?.lastMessageId || 0) || null;
      setUnreadInChat(0);
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      setUnreadMarkerId(null);
      unreadMarkerIdRef.current = null;
      pendingScrollToUnreadRef.current = null;
      allowStartReachedRef.current = false;
      unreadAnchorLockUntilRef.current = 0;
      shouldAutoMarkReadRef.current = true;
      openingChatRef.current = true;
      pendingScrollToBottomRef.current = false;
      suppressScrolledUpRef.current = true;
      setChats((prev) =>
        prev.map((chat) =>
            chat.id === openedChatId ? { ...chat, unread_count: 0 } : chat,
        ),
      );
      const unreadCount = Number(openedChat?.unread_count || 0);
      const mobileFloor = isMobileViewport ? 10000 : CHAT_PAGE_CONFIG.messageFetchLimit;
      const initialLimit = Math.min(
        10000,
        Math.max(
          CHAT_PAGE_CONFIG.messageFetchLimit,
          mobileFloor,
          unreadCount > 0 ? unreadCount + 120 : 0,
        ),
      );
      const canMarkReadNow = !isMobileViewport || mobileTab === "chat";
      const isAppActiveNow =
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        document.hasFocus();
        void (async () => {
          const shouldFetchInitial =
            openingUnreadCountRef.current > 0 || !cached || !sseConnected || !hasCachedMessages;
          if (shouldFetchInitial) {
            await loadMessages(openedChatId, { initialLoad: true, limit: initialLimit });
          } else {
            const hasOpeningUnread = openingUnreadCountRef.current > 0;
            if (!hasOpeningUnread) {
              pendingScrollToBottomRef.current = true;
              scrollChatToBottom("auto");
            }
            // Refresh to reconcile cached messages (e.g., deleted files).
            void loadMessages(openedChatId, {
              initialLoad: true,
              silent: true,
              preserveHistory: true,
              limit: initialLimit,
            });
          }
        if (
          canMarkReadNow &&
          isAppActiveNow &&
          isAtBottomRef.current &&
          !userScrolledUpRef.current
        ) {
          await markMessagesRead({ chatId: openedChatId, username: user.username }).catch(
            () => null,
          );
        }
        if (!sseConnected) {
          await loadChats({ silent: true });
        }
      })();
    }
  }, [user, activeChatId, isMobileViewport, sseConnected, mobileTab]);

  useEffect(() => {
    if (!activeChatId) {
      setUnreadInChat(0);
    }
  }, [activeChatId]);

  useEffect(() => {
    clearPendingUploads();
    clearPendingVoiceMessage();
    setActiveUploadProgress(null);
    setReplyTarget(null);
  }, [activeChatId]);

  useEffect(() => {
    const prev = prevUploadProgressRef.current;
    const now = activeUploadProgress;
    // When upload bar closes, force a final snap to bottom.
    if (activeChatId && prev !== null && now === null) {
      pendingScrollToBottomRef.current = true;
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
        requestAnimationFrame(() => {
          scrollChatToBottom("auto");
        });
      });
    }
    prevUploadProgressRef.current = now;
  }, [activeUploadProgress, activeChatId]);

  const activeId = activeChatId ? Number(activeChatId) : null;
  activeChatIdRef.current = activeId;
  const visibleChats = useMemo(() => {
    const query = String(chatsSearchQuery || "").trim().toLowerCase();
    if (!query) return chats;
    return chats.filter((chat) => {
      const members = Array.isArray(chat?.members) ? chat.members : [];
      const chatType = String(chat?.type || "").toLowerCase();
      if (chatType === "group" || chatType === "channel") {
        const groupName = String(chat?.name || "").toLowerCase();
        const groupUsername = String(chat?.group_username || "").toLowerCase();
        return groupName.includes(query) || groupUsername.includes(query);
      }
      if (chatType === "saved") {
        const label = String(chat?.name || "saved messages").toLowerCase();
        return label.includes(query) || "saved messages".includes(query);
      }
      const other = members.find(
        (member) =>
          String(member?.username || "").toLowerCase() !==
          String(user?.username || "").toLowerCase(),
      );
      const nickname = String(other?.nickname || "").toLowerCase();
      const username = String(other?.username || "").toLowerCase();
      return nickname.includes(query) || username.includes(query);
    });
  }, [chats, chatsSearchQuery, user?.username]);
  const activeChat =
    visibleChats.find((conv) => conv.id === activeId) ||
    chats.find((conv) => conv.id === activeId);

  useEffect(() => {
    activeChatTypeRef.current = activeChat?.type || null;
  }, [activeChat?.type]);
  const activeMembers = activeChat?.members || [];
  const isActiveGroupChat = activeChat?.type === "group";
  const isActiveChannelChat = activeChat?.type === "channel";
  const isActiveSavedChat = activeChat?.type === "saved";
  const isActiveOwner = activeMembers.some(
    (member) =>
      Number(member.id) === Number(user?.id || 0) &&
      String(member.role || "").toLowerCase() === "owner",
  );
  const canSendInActiveChat = !isActiveChannelChat || isActiveOwner;
  const activeGroupMemberUsernames = useMemo(() => {
    if (!isActiveGroupChat && !isActiveChannelChat) return [];
    return (activeMembers || [])
      .map((member) => String(member?.username || "").toLowerCase())
      .filter(Boolean)
      .sort();
  }, [isActiveGroupChat, isActiveChannelChat, activeMembers]);
  const activeGroupMemberUsernamesKey = activeGroupMemberUsernames.join("|");
  const activeDmMember =
    activeChat?.type === "dm"
      ? activeMembers.find((member) => member.username !== user.username)
      : null;
  const isDeletedDm = activeChat?.type === "dm" && !activeDmMember;
  const deletedDmPeer = isDeletedDm
    ? {
        nickname: "Deleted account",
        username: "",
        color: "#94a3b8",
        avatar_url: "",
        isDeleted: true,
      }
    : null;
  const activeHeaderPeer = activePeer || activeDmMember || deletedDmPeer;
  const activeFallbackTitle = isActiveGroupChat || isActiveChannelChat
    ? activeChat?.name || (isActiveChannelChat ? "Channel" : "Group")
    : isActiveSavedChat
      ? "Saved messages"
      : activeHeaderPeer?.nickname || activeHeaderPeer?.username || "Select a chat";
  const activeHeaderAvatar = isActiveGroupChat || isActiveChannelChat || isActiveSavedChat
    ? null
    : activeHeaderPeer;
  const activeGroupAvatarColor = isActiveGroupChat || isActiveChannelChat
    ? activeChat?.group_color || "#10b981"
    : null;
  const activeGroupAvatarUrl = isActiveGroupChat || isActiveChannelChat
    ? activeChat?.group_avatar_url || ""
    : "";
  const activeHeaderAvatarIcon = isActiveSavedChat ? (
    <Bookmark size={18} className="text-white" />
  ) : null;
  const headerAvatarColor = isActiveSavedChat ? "#10b981" : activeGroupAvatarColor;

  const getVisibleChannelMessageIds = useCallback(() => {
    if (!chatScrollRef.current) return [];
    const containerRect = chatScrollRef.current.getBoundingClientRect();
    const ids = [];
    messages.forEach((msg) => {
      const messageId = Number(msg?._serverId || msg?.id || 0);
      if (!messageId) return;
      const element = document.getElementById(`message-${messageId}`);
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.bottom >= containerRect.top && rect.top <= containerRect.bottom) {
        ids.push(messageId);
      }
    });
    return ids;
  }, [messages]);

  const processChannelSeenQueue = useCallback(() => {
    if (!isActiveChannelChat) return;
    if (channelSeenActiveRef.current) return;
    const nextId = channelSeenQueueRef.current.shift();
    if (!nextId) return;
    const activeId = Number(activeChatIdRef.current || 0);
    if (!activeId) return;
    channelSeenActiveRef.current = true;
    getMessageReadCounts({
      chatId: activeId,
      username: String(usernameRef.current || ""),
      messageIds: [nextId],
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) return;
        const count = Number(data?.counts?.[nextId] || 0);
        setChannelSeenCounts((prev) => ({
          ...prev,
          [nextId]: count,
        }));
      })
      .catch(() => null)
      .finally(() => {
        channelSeenLoadedRef.current.add(nextId);
        channelSeenActiveRef.current = false;
        if (channelSeenTimerRef.current) {
          window.clearTimeout(channelSeenTimerRef.current);
        }
        channelSeenTimerRef.current = window.setTimeout(() => {
          processChannelSeenQueue();
        }, 140);
      });
  }, [isActiveChannelChat]);

  const enqueueChannelSeenCounts = useCallback((forceLatest = false) => {
    if (!isActiveChannelChat || loadingMessages) return;
    const visible = Array.from(new Set(getVisibleChannelMessageIds())).sort(
      (a, b) => b - a,
    );
    if (!visible.length) return;
    const latestId = visible[0];
    const now = Date.now();
    if (latestId) {
      const shouldForce =
        forceLatest || now - Number(channelSeenLatestRefreshRef.current || 0) > 2500;
      if (shouldForce && !channelSeenQueueRef.current.includes(latestId)) {
        channelSeenQueueRef.current.push(latestId);
        channelSeenLatestRefreshRef.current = now;
      }
    }
    visible.slice(1).forEach((id) => {
      if (channelSeenLoadedRef.current.has(id)) return;
      if (channelSeenQueueRef.current.includes(id)) return;
      channelSeenQueueRef.current.push(id);
    });
    processChannelSeenQueue();
  }, [getVisibleChannelMessageIds, isActiveChannelChat, loadingMessages, processChannelSeenQueue]);

  useEffect(() => {
    if (!isActiveChannelChat) {
      channelSeenQueueRef.current = [];
      channelSeenLoadedRef.current = new Set();
      setChannelSeenCounts({});
      return;
    }
    channelSeenQueueRef.current = [];
    channelSeenLoadedRef.current = new Set();
    setChannelSeenCounts(readChannelSeenCache(user?.username, activeChatId));
    requestAnimationFrame(() => {
      enqueueChannelSeenCounts();
    });
  }, [isActiveChannelChat, activeChatId, enqueueChannelSeenCounts]);

  useEffect(() => {
    if (!isActiveChannelChat || loadingMessages) return;
    requestAnimationFrame(() => {
      enqueueChannelSeenCounts();
    });
  }, [messages, loadingMessages, isActiveChannelChat, enqueueChannelSeenCounts]);

  useEffect(() => {
    if (!isActiveChannelChat) return;
    const interval = setInterval(() => {
      enqueueChannelSeenCounts(true);
    }, 4500);
    return () => clearInterval(interval);
  }, [isActiveChannelChat, enqueueChannelSeenCounts]);

  useEffect(() => {
    if (!isActiveChannelChat || !activeChatId) return;
    writeChannelSeenCache(user?.username, activeChatId, channelSeenCounts);
  }, [channelSeenCounts, isActiveChannelChat, activeChatId, user?.username]);

  const handleChatScrollWithSeen = useCallback(
    (event) => {
      handleChatScroll(event);
      enqueueChannelSeenCounts();
    },
    [handleChatScroll, enqueueChannelSeenCounts],
  );
  const canStartChat = Boolean(newChatSelection);
  const userColor = user?.color || "#10b981";
  const handleExitEdit = () => {
    setEditMode(false);
    setSelectedChats([]);
  };
  const handleEnterEdit = () => {
    if (!visibleChats.length) return;
    setEditMode(true);
  };
  const handleDeleteChats = () => requestDeleteChats(selectedChats);
  const handleOpenSettings = () => setShowSettings((prev) => !prev);

  const displayName = user.nickname || user.username;
  const displayInitials = getAvatarInitials(displayName);
  const statusValueRaw = user.status || "online";
  const statusValue = statusValueRaw === "idle" ? "online" : statusValueRaw;
  const statusDotClass =
    statusValue === "invisible"
      ? "bg-slate-400"
      : statusValue === "online"
        ? "bg-emerald-400"
        : "";

  const parsePresenceDate = (value) => {
    if (!value) return null;
    if (typeof value === "string") {
      const normalized = value.includes("T") ? value : value.replace(" ", "T");
      return normalized.endsWith("Z")
        ? new Date(normalized)
        : new Date(`${normalized}Z`);
    }
    return new Date(value);
  };
  const resolveOnlineOffline = (status, lastSeenInput) => {
    const normalizedStatus = String(status || "").toLowerCase();
    if (normalizedStatus !== "online") return "offline";
    const parsed = parsePresenceDate(lastSeenInput);
    const seenAt = parsed?.getTime?.() || 0;
    if (!Number.isFinite(seenAt) || seenAt <= 0) return "offline";
    return Date.now() - seenAt <= PRESENCE_IDLE_THRESHOLD_MS ? "online" : "offline";
  };
  const applyPresenceUpdate = (payload = {}) => {
    const targetUsername = String(payload?.username || "").toLowerCase();
    if (!targetUsername) return;
    const status = String(payload?.status || "").toLowerCase();
    const rawLastSeen = String(payload?.lastSeen || "").trim();
    const parsedLastSeen = parsePresenceDate(rawLastSeen);
    const normalizedLastSeen = parsedLastSeen?.toISOString?.() || new Date().toISOString();
    const onlineStatus = resolveOnlineOffline(status, normalizedLastSeen);
    presenceStateRef.current.set(targetUsername, {
      status,
      lastSeen: normalizedLastSeen,
    });
    setChats((prev) =>
      prev.map((chat) => {
        const members = Array.isArray(chat?.members) ? chat.members : [];
        if (
          !members.some(
            (member) => String(member?.username || "").toLowerCase() === targetUsername,
          )
        ) {
          return chat;
        }
        return {
          ...chat,
          members: members.map((member) => {
            if (String(member?.username || "").toLowerCase() !== targetUsername) {
              return member;
            }
            return {
              ...member,
              status: onlineStatus,
            };
          }),
        };
      }),
    );
    if (String(activeHeaderPeer?.username || "").toLowerCase() === targetUsername) {
      setPeerPresence({
        status: onlineStatus,
        lastSeen: normalizedLastSeen,
      });
    }
  };
  const lastSeenAt = peerPresence.lastSeen
    ? parsePresenceDate(peerPresence.lastSeen)?.getTime() || null
    : null;
  const effectivePeerIdleThreshold = PRESENCE_IDLE_THRESHOLD_MS;
  const isIdle =
    lastSeenAt !== null && Date.now() - lastSeenAt > effectivePeerIdleThreshold;
  const peerStatusLabel = !activeHeaderPeer || activeHeaderPeer?.isDeleted
    ? "offline"
    : isIdle
      ? "offline"
      : peerPresence.status === "invisible" || peerPresence.status === "offline"
        ? "offline"
        : peerPresence.status === "online"
          ? "online"
          : "offline";
  const activeMembersLabel = Number(activeMembers.length || 0)
    .toLocaleString("en-US");
  const activeHeaderSubtitle = isActiveGroupChat || isActiveChannelChat
    ? `${activeMembersLabel} member${activeMembers.length === 1 ? "" : "s"}`
    : isActiveSavedChat
      ? ""
      : peerStatusLabel;
  const activeChatMuted = Boolean(activeChat?._muted);
  const mentionProfileUser =
    mentionProfile?.kind === "user"
      ? {
          username: mentionProfile.username,
          nickname: mentionProfile.nickname || mentionProfile.username,
          avatar_url: mentionProfile.avatarUrl || "",
          color: mentionProfile.color || "#10b981",
          status: "online",
        }
      : null;
  const mentionProfileChat =
    mentionProfile && mentionProfile.kind !== "user"
      ? {
          type: mentionProfile.kind,
          id: Number(mentionProfile.chatId || 0) || null,
          name: mentionProfile.name || mentionProfile.username || "Chat",
          group_username: mentionProfile.username || "",
          group_visibility: mentionProfile.visibility || "public",
          group_color: mentionProfile.color || "#10b981",
          group_avatar_url: mentionProfile.avatarUrl || null,
          inviteToken: mentionProfile.inviteToken || "",
          members: [],
          membersCount: Number(mentionProfile.membersCount || 0),
          isMember: Boolean(mentionProfile.isMember),
        }
      : null;
  const profileTargetUser = mentionProfileUser || profileModalMember || activeHeaderPeer || null;
  const canJoinMentionChat = Boolean(
    mentionProfileChat && !mentionProfileChat.isMember,
  );
  const shouldShowMembersList = !mentionProfile;
  const canCurrentUserEditGroup = Boolean(
    (isActiveGroupChat || isActiveChannelChat) &&
      activeMembers.some(
        (member) =>
          Number(member.id) === Number(user?.id || 0) &&
          String(member.role || "").toLowerCase() === "owner",
      ),
  );
  const canCurrentUserViewInvite = Boolean(
    !mentionProfile &&
    (isActiveGroupChat || isActiveChannelChat) &&
      (canCurrentUserEditGroup || Boolean(Number(activeChat?.allow_member_invites || 0))),
  );

  const toggleSelectChat = (chatId) => {
    setSelectedChats((prev) =>
      prev.includes(chatId)
        ? prev.filter((id) => id !== chatId)
        : [...prev, chatId],
    );
  };

  const requestDeleteChats = (ids) => {
    if (!ids.length) return;
    setPendingDeleteIds(ids);
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteChats = async () => {
    const idsToHide = pendingDeleteIds.length
      ? pendingDeleteIds
      : selectedChats;
    if (!idsToHide.length) return;
    try {
      const groupsToLeave = chats.filter(
        (chat) =>
          idsToHide.includes(Number(chat.id)) &&
          (chat.type === "group" || chat.type === "channel"),
      );
      await Promise.all(
        groupsToLeave.map(async (groupChat) => {
          try {
            await leaveGroupChat(groupChat.id, { username: user.username });
          } catch {
            // ignore leave failures and still proceed with hide
          }
        }),
      );
      await hideChats({ username: user.username, chatIds: idsToHide });
    } catch {
      // ignore
    }
    if (idsToHide.includes(activeId)) {
      // close with animation on mobile, then clear active
      setMobileTab("chats");
      setTimeout(() => {
        setActiveChatId(null);
        setActivePeer(null);
      }, MOBILE_CLOSE_ANIMATION_MS);
    }
    setSelectedChats([]);
    setPendingDeleteIds([]);
    setEditMode(false);
    setConfirmDeleteOpen(false);
    await loadChats();
  };

  // Messages are updated via SSE events and explicit send/read actions.
  // Avoid periodic full message fetches to reduce unnecessary reflows/fetches.

  // Helper to close conversation after mobile slide animation completes
  const closeChat = () => {
    setMobileTab("chats");
    setTimeout(() => {
      setActiveChatId(null);
      setActivePeer(null);
    }, MOBILE_CLOSE_ANIMATION_MS);
  };

  useEffect(() => {
    if (!activeHeaderPeer?.username) return;
    let isMounted = true;
    setPeerPresence({ status: "offline", lastSeen: null });
    const fetchPeerPresence = async () => {
      try {
        const res = await fetchPresence(activeHeaderPeer.username);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to fetch presence.");
        }
        if (isMounted) {
          const normalizedUsername = String(data?.username || activeHeaderPeer.username || "")
            .toLowerCase();
          const normalizedLastSeen = String(data?.lastSeen || "").trim() || new Date().toISOString();
          presenceStateRef.current.set(normalizedUsername, {
            status: String(data?.status || "online").toLowerCase(),
            lastSeen: normalizedLastSeen,
          });
          const status = resolveOnlineOffline(data?.status, normalizedLastSeen);
          setPeerPresence({
            status,
            lastSeen: normalizedLastSeen,
          });
        }
      } catch {
        if (isMounted) {
          setPeerPresence({ status: "offline", lastSeen: null });
        }
      }
    };
    void fetchPeerPresence();
    return () => {
      isMounted = false;
    };
  }, [activeHeaderPeer?.username]);

  useEffect(() => {
    if (
      !profileModalOpen ||
      profileModalMember ||
      !["group", "channel"].includes(activeChat?.type)
    ) {
      return;
    }
    const memberUsernames = activeGroupMemberUsernames;
    if (!memberUsernames.length) return;
    let cancelled = false;

    setChats((prev) =>
      prev.map((chat) => {
        if (Number(chat?.id) !== Number(activeChat?.id)) return chat;
        return {
          ...chat,
          members: (chat.members || []).map((member) => {
            const username = String(member?.username || "").toLowerCase();
            const snapshot = presenceStateRef.current.get(username);
            const nextStatus = snapshot
              ? resolveOnlineOffline(snapshot.status, snapshot.lastSeen)
              : "offline";
            return { ...member, status: nextStatus };
          }),
        };
      }),
    );

    const bootstrapMembersPresence = async () => {
      await Promise.all(
        memberUsernames.map(async (username) => {
          try {
            const res = await fetchPresence(username);
            const data = await res.json();
            if (!res.ok || cancelled) return;
            applyPresenceUpdate({
              type: "presence_update",
              username: data?.username || username,
              status: data?.status || "offline",
              lastSeen: data?.lastSeen || null,
            });
          } catch {
            // ignore bootstrap failures for individual users
          }
        }),
      );
    };

    void bootstrapMembersPresence();
    return () => {
      cancelled = true;
    };
  }, [
    profileModalOpen,
    profileModalMember,
    activeChat?.id,
    activeChat?.type,
    activeGroupMemberUsernamesKey,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      let changed = false;
      setChats((prev) =>
        prev.map((chat) => {
          if (!Array.isArray(chat?.members) || chat.members.length === 0) return chat;
          let chatChanged = false;
          const nextMembers = chat.members.map((member) => {
            const username = String(member?.username || "").toLowerCase();
            if (!username) return member;
            const snapshot = presenceStateRef.current.get(username);
            if (!snapshot) return member;
            const nextStatus = resolveOnlineOffline(snapshot.status, snapshot.lastSeen);
            if (String(member?.status || "").toLowerCase() === nextStatus) return member;
            chatChanged = true;
            return { ...member, status: nextStatus };
          });
          if (!chatChanged) return chat;
          changed = true;
          return { ...chat, members: nextMembers };
        }),
      );

      if (activeHeaderPeer?.username) {
        const snapshot = presenceStateRef.current.get(
          String(activeHeaderPeer.username || "").toLowerCase(),
        );
        if (snapshot) {
          const nextStatus = resolveOnlineOffline(snapshot.status, snapshot.lastSeen);
          setPeerPresence((prev) => {
            if (
              String(prev?.status || "").toLowerCase() === nextStatus &&
              String(prev?.lastSeen || "") === String(snapshot.lastSeen || "")
            ) {
              return prev;
            }
            return { status: nextStatus, lastSeen: snapshot.lastSeen || null };
          });
        }
      }

      if (!changed) {
        // no-op: we still refresh peerPresence above
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [activeHeaderPeer?.username]);

  useEffect(() => {
    if (!activeChatId) return;
    pendingScrollToUnreadRef.current = null;
    clearUnreadAlignTimers();
  }, [activeChatId]);

  useLayoutEffect(() => {
    if (!activeChatId) return;
    const pendingUnread = pendingScrollToUnreadRef.current;
    if (pendingUnread === null || pendingUnread === undefined) return;
    if (loadingMessages || messages.length === 0) return;

    requestAnimationFrame(() => {
      const unreadId = Number(pendingUnread);
      const scroller = chatScrollRef.current;
      if (scroller) {
        scheduleUnreadAnchorAlignment(unreadId);
      }
      pendingScrollToUnreadRef.current = null;
      pendingScrollToBottomRef.current = false;
      isAtBottomRef.current = false;
      setIsAtBottom(false);
      userScrolledUpRef.current = true;
      setUserScrolledUp(true);
      unreadAnchorLockUntilRef.current = Date.now() + 4000;
      shouldAutoMarkReadRef.current = true;
        if (scroller) {
          window.setTimeout(() => {
            if (unreadMarkerIdRef.current !== null) {
              return;
            }
            const distance =
              scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
            if (distance <= 120) {
              isAtBottomRef.current = true;
            setIsAtBottom(true);
            userScrolledUpRef.current = false;
            setUserScrolledUp(false);
            unreadAnchorLockUntilRef.current = 0;
          }
        }, 90);
      }
    });
  }, [activeChatId, messages, loadingMessages]);

  useLayoutEffect(() => {
    if (!activeChatId) return;
    if (!unreadMarkerIdRef.current) return;
    if (loadingMessages || messages.length === 0) return;
    const unreadId = Number(unreadMarkerIdRef.current || 0);
    if (!unreadId) return;
    requestAnimationFrame(() => {
      scheduleUnreadAnchorAlignment(unreadId);
      pendingScrollToBottomRef.current = false;
      isAtBottomRef.current = false;
      setIsAtBottom(false);
      userScrolledUpRef.current = true;
      setUserScrolledUp(true);
      unreadAnchorLockUntilRef.current = Date.now() + 5000;
    });
  }, [activeChatId, unreadMarkerId, messages.length, loadingMessages]);

  useLayoutEffect(() => {
    if (!activeChatId) return;
    if (!pendingScrollToBottomRef.current) return;
    if (
      pendingScrollToUnreadRef.current !== null ||
      unreadMarkerIdRef.current !== null ||
      Date.now() < Number(unreadAnchorLockUntilRef.current || 0)
    ) {
      pendingScrollToBottomRef.current = false;
      return;
    }
    if (loadingMessages && messages.length === 0) return;
    requestAnimationFrame(() => {
      scrollChatToBottom("auto");
      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
      });
      window.setTimeout(() => {
        scrollChatToBottom("auto");
      }, 120);
      pendingScrollToBottomRef.current = false;
    });
  }, [activeChatId, messages, loadingMessages]);

  useEffect(() => {
    if (!activeChatId) return;
    const chatId = Number(activeChatId);
    return () => {
      if (!chatId || !user || !canMarkReadInCurrentView) return;
      shouldAutoMarkReadRef.current = true;
      setUnreadMarkerId(null);
      unreadMarkerIdRef.current = null;
      pendingScrollToUnreadRef.current = null;
    };
  }, [activeChatId, user, canMarkReadInCurrentView]);

  useEffect(() => {
    if (!showSettings || settingsPanel) return;
    const handleOutside = (event) => {
      const target = event.target;
      if (settingsMenuRef.current && settingsMenuRef.current.contains(target))
        return;
      if (
        settingsButtonRef.current &&
        settingsButtonRef.current.contains(target)
      )
        return;
      setShowSettings(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showSettings, settingsPanel]);

  useEffect(() => {
    const syncActiveState = () => {
      setIsAppActive(
        document.visibilityState === "visible" && document.hasFocus(),
      );
    };
    syncActiveState();
    document.addEventListener("visibilitychange", syncActiveState);
    window.addEventListener("focus", syncActiveState);
    window.addEventListener("blur", syncActiveState);
    return () => {
      document.removeEventListener("visibilitychange", syncActiveState);
      window.removeEventListener("focus", syncActiveState);
      window.removeEventListener("blur", syncActiveState);
    };
  }, []);

  useEffect(() => {
    if (!user?.username) {
      wasAppActiveRef.current = isAppActive;
      return;
    }
    const becameActive = isAppActive && !wasAppActiveRef.current;
    wasAppActiveRef.current = isAppActive;
    if (!becameActive) return;
    loadChatsRef.current?.({ silent: true, showUpdating: true });
    const activeId = Number(activeChatIdRef.current || 0);
    if (activeId > 0) {
      scheduleMessageRefreshRef.current?.(activeId, {
        delayMs: 120,
        preserveHistory: true,
      });
    }
  }, [isAppActive, user?.username]);

  useEffect(() => {
    const activeId = activeChatIdRef.current;
    if (
      !activeId ||
      !user?.username ||
      isMarkingReadRef.current ||
      !isAppActive ||
      !canMarkReadInCurrentView ||
      !isAtBottomRef.current ||
      userScrolledUpRef.current
    ) {
      return;
    }
    const hasUnreadFromOthers = messages.some(
      (msg) => msg.username !== user.username && !msg._readByMe,
    );
    if (!hasUnreadFromOthers) return;

    isMarkingReadRef.current = true;
    markMessagesRead({ chatId: activeId, username: user.username })
      .catch(() => null)
      .finally(() => {
        isMarkingReadRef.current = false;
      });
  }, [messages, user?.username, isAppActive, canMarkReadInCurrentView]);

  useChatEvents({
    username: user?.username,
    getSseStreamUrl,
    sseReconnectDelayMs: CHAT_PAGE_CONFIG.sseReconnectDelayMs,
    setSseConnected,
    loadChatsRef,
    scheduleMessageRefreshRef,
    activeChatIdRef,
    usernameRef,
    userScrolledUpRef,
    isAtBottomRef,
    pendingScrollToBottomRef,
    setUnreadInChat,
    setMessages,
    setChats,
    sseReconnectRef,
    onIncomingMessage: (payload, meta = {}) => {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (!notificationsActive) return;
      const sender = String(payload?.username || "").trim();
      const isOwnEvent =
        sender.toLowerCase() === String(user?.username || "").toLowerCase();
      if (isOwnEvent) return;
      const payloadChatId = Number(payload?.chatId || 0);
      const currentActiveId = activeChatIdRef.current;
      const appVisible =
        document.visibilityState === "visible" && document.hasFocus();
      if (appVisible) {
        return;
      }
      const chat = chats.find((conv) => Number(conv.id) === payloadChatId);
      if (chat?._muted) return;
      let title = "New message";
      if (chat) {
        if (chat.type === "dm") {
          const other = (chat.members || []).find(
            (member) => member.username !== user?.username,
          );
          title = other?.nickname || other?.username || "Deleted account";
        } else {
          title = chat.name || "Chat";
        }
      } else if (sender) {
        title = sender;
      }
      const messageBody = normalizeMessageBody(meta?.body ?? payload?.body).trim();
      const summaryText = String(payload?.summaryText || "").trim();
      const derivedSummary = chat ? summarizeFiles(chat.last_message_files) : "";
      const isGenericBody =
        !messageBody || /^Sent (a media file|a document|\d+ files)$/i.test(messageBody);
      const baseBody =
        summaryText && isGenericBody
          ? summaryText
          : derivedSummary && isGenericBody
            ? derivedSummary
            : messageBody;
        const body = baseBody
          ? truncateText(baseBody, NOTIFICATION_PREVIEW_MAX_CHARS)
          : sender
            ? `New message from ${sender}.`
            : "New message.";
      try {
        const notification = new Notification(title, {
          body,
          tag: payloadChatId ? `chat-${payloadChatId}` : undefined,
          renotify: true,
        });
        notification.onclick = () => {
          window.focus();
        };
      } catch {
        // ignore notification errors
      }
    },
    onChatRead: (payload) => {
      const payloadChatId = Number(payload?.chatId || 0);
      const currentActiveId = Number(activeChatIdRef.current || 0);
      if (!payloadChatId || payloadChatId !== currentActiveId) return;
      if (!isActiveChannelChat) return;
      const visible = getVisibleChannelMessageIds();
      if (visible.length) {
        visible.forEach((id) => {
          channelSeenLoadedRef.current.delete(id);
        });
      }
      enqueueChannelSeenCounts(true);
    },
    onPresenceUpdate: (payload) => {
      applyPresenceUpdate(payload);
    },
    onChatListChanged: () => {
      setMentionRefreshToken((prev) => prev + 1);
    },
  });

  useEffect(() => {
    loadChatsRef.current = loadChats;
    scheduleMessageRefreshRef.current = scheduleMessageRefresh;
  });

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        pushRegistrationRef.current = reg;
        setPushSwReady(true);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!notificationsModalOpen && settingsPanel !== "notifications") return;
    if (typeof window === "undefined") return;
    let active = true;
    fetchPushPublicKey()
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const key = data?.publicKey ? String(data.publicKey) : "";
        setPushVapidReady(Boolean(key));
        setPushVapidLength(key ? getVapidKeyLength(key) : 0);
      })
      .catch(() => {
        if (!active) return;
        setPushVapidReady(false);
        setPushVapidLength(0);
      });
    return () => {
      active = false;
    };
  }, [notificationsModalOpen, settingsPanel]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    if (notificationPermission !== "granted") return;
    ensurePushSubscription();
  }, [notificationsEnabled, notificationPermission]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    if (notificationPermission !== "granted") return;
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => {
      void maybeRefreshPushSubscription("interval");
    }, PUSH_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [notificationsEnabled, notificationPermission]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void maybeRefreshPushSubscription("resume");
      }
    };
    const handleFocus = () => {
      void maybeRefreshPushSubscription("focus");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [notificationsEnabled, notificationPermission, notificationsSupported]);

  const uploadPendingMessageWithProgress = (pendingMessage, targetChatId) =>
    new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("username", user.username);
      form.append("chatId", String(targetChatId));
      form.append("body", pendingMessage.body || "");
      form.append("uploadType", pendingMessage._uploadType || "document");
      if (pendingMessage.replyTo?.id) {
        form.append("replyToMessageId", String(pendingMessage.replyTo.id));
      }
      const fileMeta = [];
      pendingMessage._files.forEach((item) => {
        if (item?.file instanceof Blob) {
          const filename = item.name || item.file.name || "upload.bin";
          form.append("files", item.file, filename);
          fileMeta.push({
            width: Number.isFinite(Number(item.width)) ? Number(item.width) : null,
            height: Number.isFinite(Number(item.height)) ? Number(item.height) : null,
            durationSeconds: Number.isFinite(Number(item.durationSeconds))
              ? Number(item.durationSeconds)
              : null,
          });
        }
      });
      form.append("fileMeta", JSON.stringify(fileMeta));

      const xhr = new XMLHttpRequest();
      xhr.open("POST", getMessagesUploadUrl());
      xhr.timeout = CHAT_PAGE_CONFIG.pendingFileTimeoutMs;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.max(
          0,
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        );
        setPendingUploadProgress(pendingMessage._clientId, percent, targetChatId);
      };

      xhr.onerror = () => reject(new Error("Network error during file upload."));
      xhr.ontimeout = () => reject(new Error("Upload timed out."));
      xhr.onload = async () => {
        const data = (() => {
          try {
            return JSON.parse(xhr.responseText || "{}");
          } catch {
            return {};
          }
        })();
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }
        if (data?.error) {
          reject(new Error(String(data.error)));
          return;
        }
        if (xhr.status === 413) {
          reject(
            new Error(
              "Upload rejected (HTTP 413): request is too large. Increase proxy upload limit.",
            ),
          );
          return;
        }
        reject(new Error(`Unable to send message (HTTP ${xhr.status || "unknown"}).`));
      };

      xhr.send(form);
    });

  const sendPendingMessage = async (pendingMessage) => {
    if (!pendingMessage || pendingMessage._delivery !== "sending") return;
    if (pendingMessage._awaitingServerEcho) return;

    const clientId = pendingMessage._clientId;
    const hasFiles = Array.isArray(pendingMessage._files) && pendingMessage._files.length > 0;
    if (!clientId || sendingClientIdsRef.current.has(clientId)) return;

    const maxMessageChars = APP_CONFIG.messageMaxChars;
    if (!hasFiles && String(pendingMessage.body || "").length > maxMessageChars) {
      setUploadError(`Message must be ${maxMessageChars} characters or less.`);
      setMessages((prev) =>
        prev.map((msg) =>
          msg?._clientId === clientId ? { ...msg, _delivery: "failed" } : msg,
        ),
      );
      return;
    }

    sendingClientIdsRef.current.add(clientId);
    let isTargetActive = false;
    try {
      const targetChatId = Number(pendingMessage._chatId || activeChatId);
      if (!targetChatId) return;
      isTargetActive = Number(activeChatIdRef.current) === Number(targetChatId);
      const chatType =
        chats.find((chat) => Number(chat.id) === Number(targetChatId))?.type ||
        activeChatTypeRef.current ||
        null;
      const isSavedChat = String(chatType || "").toLowerCase() === "saved";
      let data = null;
      if (hasFiles) {
        if (isTargetActive) {
          setActiveUploadProgress(0);
        }
        data = await uploadPendingMessageWithProgress(pendingMessage, targetChatId);
      } else {
        const res = await sendMessage({
          username: user.username,
          body: pendingMessage.body,
          chatId: targetChatId,
          replyToMessageId: pendingMessage.replyTo?.id || null,
        });
        data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to send message.");
        }
      }

      if (isTargetActive) {
        setMessages((prev) => {
          const uploadType = String(pendingMessage?._uploadType || "").toLowerCase();
          const files = Array.isArray(pendingMessage?._files) ? pendingMessage._files : [];
          const hasMediaVideo = files.some((file) =>
            String(file?.mimeType || "").toLowerCase().startsWith("video/"),
          );
          const keepPendingUntilServerEcho = hasFiles && uploadType === "media" && hasMediaVideo;
          const serverId = Number(data.id) || null;
          const index = prev.findIndex((msg) => msg?._clientId === clientId);
          if (index >= 0) {
            return prev.map((msg) =>
              msg._clientId === clientId
                ? {
                    ...msg,
                    _serverId: serverId || msg._serverId || null,
                    _delivery: keepPendingUntilServerEcho ? "sending" : "sent",
                    _processingPending:
                      keepPendingUntilServerEcho || Boolean(msg?._processingPending),
                    _awaitingServerEcho: true,
                    _uploadProgress: 100,
                    read_at:
                      isSavedChat && !msg.read_at
                        ? msg.created_at || new Date().toISOString()
                        : msg.read_at,
                    read_by_user_id:
                      isSavedChat && !msg.read_by_user_id
                        ? Number(user?.id || 0)
                        : msg.read_by_user_id,
                  }
                : msg,
            );
          }
          const createdAt = pendingMessage?._createdAt || new Date().toISOString();
          const pendingDate = parseServerDate(createdAt);
          const pendingDayKey = `${pendingDate.getFullYear()}-${pendingDate.getMonth()}-${pendingDate.getDate()}`;
          const pendingBody = String(pendingMessage?.body || "").trim() || "Sent a file";
          const messageFiles = files.map((file) => ({
            id: file.id,
            _localId: file._localId || file.id,
            kind: file.kind,
            name: file.name,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            width: Number.isFinite(Number(file.width)) ? Number(file.width) : null,
            height: Number.isFinite(Number(file.height)) ? Number(file.height) : null,
            durationSeconds: Number.isFinite(Number(file.durationSeconds))
              ? Number(file.durationSeconds)
              : null,
            url: file.url || null,
            processing:
              keepPendingUntilServerEcho &&
              String(file?.mimeType || "").toLowerCase().startsWith("video/"),
          }));
          return [
            ...prev,
            {
              id: clientId,
              username: user.username,
              body: pendingBody,
              created_at: createdAt,
              read_at: isSavedChat ? createdAt : null,
              read_by_user_id: isSavedChat ? Number(user?.id || 0) : null,
              _clientId: clientId,
              _chatId: Number(targetChatId),
              _queuedAt: Number(pendingMessage?._queuedAt || Date.now()),
              _delivery: keepPendingUntilServerEcho ? "sending" : "sent",
              _dayKey: pendingDayKey,
              _dayLabel: formatDayLabel(createdAt),
              _timeLabel: formatTime(createdAt),
              _uploadType: uploadType || "document",
              _files: files,
              _uploadProgress: 100,
              _awaitingServerEcho: true,
              _processingPending: keepPendingUntilServerEcho,
              _serverId: serverId,
              replyTo: pendingMessage.replyTo || null,
              files: messageFiles,
            },
          ];
        });
      }
      if (hasFiles) {
        if (isTargetActive) {
          setActiveUploadProgress(100);
          setTimeout(() => setActiveUploadProgress(null), UPLOAD_PROGRESS_HIDE_DELAY_MS);
        }
      }
      pendingScrollToBottomRef.current = false;
      await loadChats({ silent: true });
      // Keep optimistic row stable and rely on SSE/polling for server echo.
      // Immediate forced refetch here can race and cause first-message flicker.
    } catch (error) {
      if (hasFiles) {
        if (isTargetActive) {
          setActiveUploadProgress(null);
          setUploadError(String(error?.message || "Unable to upload files."));
          setMessages((prev) =>
            prev.map((msg) =>
              msg._clientId === clientId
                ? {
                    ...msg,
                    _delivery: "failed",
                    _uploadProgress: null,
                  }
                : msg,
            ),
          );
        }
      } else {
        if (isTargetActive) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg._clientId === clientId ? { ...msg, _delivery: "failed" } : msg,
            ),
          );
        }
      }
    } finally {
      sendingClientIdsRef.current.delete(clientId);
    }
  };

  useEffect(() => {
    if (!activeChatId) return;
    const pending = messages.filter((msg) => msg._delivery === "sending");
    if (!pending.length) return;
    pending.forEach((msg) => {
      void sendPendingMessage(msg);
    });
  }, [activeChatId, messages]);

  useEffect(() => {
    if (!activeChatId) return;
    const interval = setInterval(() => {
      setMessages((prev) => {
        const now = Date.now();
        let changed = false;
        const next = prev.map((msg) => {
          if (msg._delivery !== "sending") return msg;
          const queuedAt = Number(msg._queuedAt || 0);
          const isFileMessage =
            Array.isArray(msg._files) && msg._files.length > 0;
          const timeoutMs = isFileMessage
            ? CHAT_PAGE_CONFIG.pendingFileTimeoutMs
            : CHAT_PAGE_CONFIG.pendingTextTimeoutMs;
          if (!queuedAt || now - queuedAt < timeoutMs) {
            return msg;
          }
          changed = true;
          return { ...msg, _delivery: "failed" };
        });
        return changed ? next : prev;
      });
    }, CHAT_PAGE_CONFIG.pendingStatusCheckIntervalMs);
    return () => clearInterval(interval);
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId) return;
    const interval = setInterval(() => {
      const pending = messages.filter(
        (msg) => msg._delivery === "sending" && !msg._awaitingServerEcho,
      );
      if (!pending.length) return;
      pending.forEach((msg) => {
        void sendPendingMessage(msg);
      });
    }, CHAT_PAGE_CONFIG.pendingRetryIntervalMs);
    return () => clearInterval(interval);
  }, [activeChatId, messages]);

  useEffect(() => {
    if (!activeChatId) return;
    const needsMediaSync = messages.some((msg) => {
      const isOwn = msg.username === user.username;
      if (!isOwn) return false;
      const hasFiles = Array.isArray(msg.files) ? msg.files.length > 0 : false;
      if (!hasFiles) return false;
      if (msg._processingPending) return true;
      if (msg._awaitingServerEcho) return true;
      if (msg._delivery === "sending") return true;
      return false;
    });
    if (!needsMediaSync) return;
    const interval = setInterval(() => {
      void loadMessages(activeChatId, { silent: true, preserveHistory: true });
    }, 2500);
    return () => clearInterval(interval);
  }, [activeChatId, messages, user.username, isMobileViewport, sseConnected]);

  useEffect(() => {
    if (!activeChatId) return;
    const cachePayload = {
      version: CHAT_CACHE_VERSION,
      messages,
      hasOlderMessages,
      lastMessageId: messages.length ? Number(messages[messages.length - 1]?.id || 0) : 0,
      updatedAt: Date.now(),
    };
    messagesCacheRef.current.set(Number(activeChatId), cachePayload);
    if (user?.username) {
      const storagePayload = {
        ...cachePayload,
        messages: sanitizeMessagesForCache(messages),
      };
      writeLocalCache(
        buildMessagesCacheKey(user.username, activeChatId),
        storagePayload,
      );
      updateMessagesIndex(user.username, activeChatId, cachePayload.updatedAt);
    }
  }, [activeChatId, messages, hasOlderMessages, user?.username]);

  useEffect(() => {
    if (settingsPanel !== "profile" && profileError) {
      setProfileError("");
    }
    if (settingsPanel !== "security" && passwordError) {
      setPasswordError("");
    }
  }, [settingsPanel, profileError, passwordError]);

  async function loadChats(options = {}) {
    const showUpdating = Boolean(options.showUpdating);
    if (!options.silent) {
      setLoadingChats(true);
    }
    if (showUpdating) {
      setIsUpdatingChats(true);
    }
    try {
      const res = await listChatsForUser(user.username, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load chats.");
      }
      const list = (data.chats || []).map((conv) => ({
        ...conv,
        id: Number(conv.id),
        message_count: Number(conv.message_count || 0),
        last_message: normalizeMessageBody(conv.last_message),
        members: (conv.members || []).map((member) => ({
          ...member,
          id: Number(member.id),
        })),
      }));
      list.sort((a, b) => {
        const aTime = a.last_time ? parseServerDate(a.last_time).getTime() : 0;
        const bTime = b.last_time ? parseServerDate(b.last_time).getTime() : 0;
        return bTime - aTime;
      });
      const deduped = [];
      const dmByPeer = new Map();
      list.forEach((chat) => {
        if (chat.type !== "dm") {
          deduped.push(chat);
          return;
        }
        const peer = (chat.members || []).find(
          (member) => member.username !== user.username,
        );
        const peerKey = (peer?.username || "").toLowerCase();
        if (!peerKey) {
          deduped.push(chat);
          return;
        }
        const existing = dmByPeer.get(peerKey);
        if (!existing) {
          dmByPeer.set(peerKey, chat);
          return;
        }
        const existingCount = Number(existing.message_count || 0);
        const nextCount = Number(chat.message_count || 0);
        if (nextCount !== existingCount) {
          if (nextCount > existingCount) {
            dmByPeer.set(peerKey, chat);
          }
          return;
        }
        const existingTime = existing.last_time
          ? parseServerDate(existing.last_time).getTime()
          : 0;
        const nextTime = chat.last_time
          ? parseServerDate(chat.last_time).getTime()
          : 0;
        if (nextTime > existingTime || (nextTime === existingTime && chat.id > existing.id)) {
          dmByPeer.set(peerKey, chat);
        }
      });
      const dmList = Array.from(dmByPeer.values());
      const merged = [...deduped, ...dmList];
      merged.sort((a, b) => {
        const aTime = a.last_time ? parseServerDate(a.last_time).getTime() : 0;
        const bTime = b.last_time ? parseServerDate(b.last_time).getTime() : 0;
        return bTime - aTime;
      });
      const patched = merged.map((chat) => {
        const muted = Boolean(Number(chat?.muted || 0));
        const files = Array.isArray(chat?.last_message_files) ? chat.last_message_files : [];
        const hasProcessingVideo = files.some(
          (file) =>
            String(file?.mimeType || "").toLowerCase().startsWith("video/") &&
            file?.processing === true &&
            !String(file?.url || "").includes("-h264-"),
        );
        const lastSender = String(chat?.last_sender_username || "").toLowerCase();
        const isFromSelf = lastSender && lastSender === String(user.username || "").toLowerCase();
        const isFromOther = lastSender && lastSender !== String(user.username || "").toLowerCase();
        if (hasProcessingVideo && isFromSelf) {
          return {
            ...chat,
            _lastMessagePending: true,
            last_message_read_at: null,
            _muted: muted,
          };
        }
        if (!hasProcessingVideo || !isFromOther) {
          return {
            ...chat,
            _muted: muted,
          };
        }
        const previous = chats.find((existing) => Number(existing.id) === Number(chat.id));
        if (!previous) {
          return {
            ...chat,
            unread_count: 0,
            _muted: muted,
          };
        }
        return {
          ...chat,
          last_message_id: previous.last_message_id,
          last_message: previous.last_message,
          last_time: previous.last_time,
          last_sender_id: previous.last_sender_id,
          last_sender_username: previous.last_sender_username,
          last_sender_nickname: previous.last_sender_nickname,
          last_sender_avatar_url: previous.last_sender_avatar_url,
          last_message_files: previous.last_message_files || [],
          unread_count: previous.unread_count || 0,
          _muted: muted,
        };
      });
      const normalizedPatched = patched.map((chat) => ({
        ...chat,
        last_message: normalizeMessageBody(chat.last_message),
      }));
      setChats(normalizedPatched);
      writeLocalCache(buildChatListCacheKey(user.username), {
        version: CHAT_CACHE_VERSION,
        updatedAt: Date.now(),
        chats: normalizedPatched,
      });

      const pendingOpenChatId = Number(
        typeof window !== "undefined"
          ? window.sessionStorage.getItem(OPEN_CHAT_ID_KEY)
          : 0,
      );
      if (pendingOpenChatId > 0) {
        const pendingChat = patched.find((item) => Number(item.id) === pendingOpenChatId);
        if (pendingChat) {
          setActiveChatId(pendingOpenChatId);
          if (pendingChat.type === "dm") {
            const nextOther = (pendingChat.members || []).find(
              (member) => member.username !== user.username,
            );
            setActivePeer(nextOther || null);
          } else {
            setActivePeer(null);
          }
          setMobileTab("chat");
          window.sessionStorage.removeItem(OPEN_CHAT_ID_KEY);
        }
      }
    } catch {
      // Keep sidebar usable even when polling fails.
    } finally {
      if (!options.silent) {
        setLoadingChats(false);
      }
      if (showUpdating) {
        setIsUpdatingChats(false);
      }
    }
  }

  async function loadMessages(chatId, options = {}) {
    const requestChatId = Number(chatId);
    if (!options.silent) {
      setLoadingMessages(true);
    }
    if (
      messageFetchInFlightRef.current &&
      options.silent &&
      options.preserveHistory &&
      !options.prepend
    ) {
      queuedSilentMessageRefreshRef.current = {
        chatId: Number(chatId),
        options: { ...options, silent: true, preserveHistory: true },
      };
      return;
    }
    messageFetchInFlightRef.current = true;
    try {
      const fetchLimit = Number(options.limit || CHAT_PAGE_CONFIG.messageFetchLimit);
      const query = new URLSearchParams({
        chatId: String(chatId),
        username: user.username,
        limit: String(fetchLimit),
      });
      if (options.beforeId) {
        query.set("beforeId", String(options.beforeId));
      }
      if (options.beforeCreatedAt) {
        query.set("beforeCreatedAt", String(options.beforeCreatedAt));
      }
      const res = await listMessagesByQuery(
        Object.fromEntries(query.entries()),
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load messages.");
      }
      if (activeChatIdRef.current !== requestChatId) {
        return;
      }
      setHasOlderMessages((prev) =>
        options.prepend
          ? Boolean(data?.hasMore)
          : options.preserveHistory
            ? prev || Boolean(data?.hasMore)
            : Boolean(data?.hasMore),
      );
      const chatType =
        chats.find((chat) => Number(chat.id) === Number(requestChatId))?.type ||
        activeChatTypeRef.current ||
        null;
      const allowSystemEvents = String(chatType || "").toLowerCase() !== "channel";
      const nextMessages = (data.messages || []).map((msg) => {
        const date = parseServerDate(msg.created_at);
        const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const readByMe =
          Number(msg?.user_id || 0) === Number(user.id) || Boolean(msg.read_by_me);
        const hasProcessingVideo = Array.isArray(msg?.files)
          ? msg.files.some(
              (file) =>
                String(file?.mimeType || "").toLowerCase().startsWith("video/") &&
                file?.processing === true &&
                !String(file?.url || "").includes("-h264-"),
            )
          : false;
        const isOwnProcessingVideo = hasProcessingVideo && msg.username === user.username;
        const normalizedBody = normalizeMessageBody(msg?.body);
        const normalizedReply =
          msg?.replyTo && typeof msg.replyTo === "object"
            ? {
                ...msg.replyTo,
                body: normalizeMessageBody(msg.replyTo?.body),
              }
            : msg?.replyTo || null;
        const bodyText = normalizedBody;
        const systemMatch = bodyText.match(/^\[\[system:(join|joined|left|removed):(.+)\]\]$/i);
        const rawTargetName = systemMatch?.[2] ? String(systemMatch[2]).trim() : "";
        const maxNameLength = 13;
        const shortTargetName =
          rawTargetName.length > maxNameLength
            ? `${rawTargetName.slice(0, maxNameLength)}...`
            : rawTargetName;
        const normalizedSystemType = String(systemMatch?.[1] || "").toLowerCase();
        const systemText =
          normalizedSystemType === "left"
            ? `${shortTargetName || "A member"} left the group`
            : normalizedSystemType === "removed"
              ? `${shortTargetName || "A member"} was removed from the group`
              : normalizedSystemType
                ? `${shortTargetName || "A member"} joined the group`
                : "";
        return {
          ...msg,
          body: normalizedBody,
          replyTo: normalizedReply,
          _readByMe: readByMe,
          _dayKey: dayKey,
          _dayLabel: formatDayLabel(msg.created_at),
          _timeLabel: formatTime(msg.created_at),
          _processingPending: isOwnProcessingVideo,
          _systemEvent:
            allowSystemEvents && normalizedSystemType
              ? { type: normalizedSystemType, text: systemText }
              : null,
        };
      });
      const replyIconByMessageId = new Map(
        nextMessages
          .map((message) => [Number(message?.id || 0), resolveReplyPreview(message).icon || null])
          .filter(([id, icon]) => Number.isFinite(id) && id > 0 && Boolean(icon)),
      );
      const replyColorByMessageId = new Map(
        nextMessages
          .map((message) => [Number(message?.id || 0), message?.color || null])
          .filter(([id, color]) => Number.isFinite(id) && id > 0 && Boolean(color)),
      );
      const nextMessagesWithReplyIcons = nextMessages.map((message) => {
        if (!message?.replyTo) return message;
        const replyId = Number(message.replyTo.id || 0);
        if (!replyId) return message;
        const resolvedIcon = replyIconByMessageId.get(replyId) || null;
        const resolvedColor = replyColorByMessageId.get(replyId) || null;
        if (!resolvedIcon && !resolvedColor) return message;
        return {
          ...message,
          replyTo: {
            ...message.replyTo,
            icon: resolvedIcon || message.replyTo.icon || null,
            color: resolvedColor || message.replyTo.color || null,
          },
        };
      });
      if (options.prepend) {
        setMessages((prev) => {
          if (activeChatIdRef.current !== requestChatId) return prev;
          const seen = new Set(prev.map((msg) => Number(msg.id)));
          const older = nextMessagesWithReplyIcons.filter((msg) => !seen.has(Number(msg.id)));
          return older.length ? [...older, ...prev] : prev;
        });
        return;
      }
      setMessages((prev) => {
        if (activeChatIdRef.current !== requestChatId) return prev;
        if (isActiveChannelChat) {
          const nextCounts = nextMessagesWithReplyIcons.reduce((acc, msg) => {
            const id = Number(msg?.id || 0);
            if (!id) return acc;
            if (Number.isFinite(Number(msg?.seenCount))) {
              acc[id] = Math.max(1, Number(msg.seenCount));
            }
            return acc;
          }, {});
          if (Object.keys(nextCounts).length) {
            setChannelSeenCounts((prevCounts) => ({ ...prevCounts, ...nextCounts }));
          }
        }
        let basePrev = prev;
        if (options.pruneMissing) {
          const serverIds = new Set(
            nextMessagesWithReplyIcons
              .map((msg) => Number(msg?.id || 0))
              .filter((id) => Number.isFinite(id) && id > 0),
          );
          basePrev = prev.filter((msg) => {
            if (msg?._delivery === "sending" || msg?._delivery === "failed") return true;
            if (msg?._clientId) return true;
            const serverId = Number(msg?._serverId || msg?.id || 0);
            return serverIds.has(serverId);
          });
        }
        const prevLatestVisibleTime = basePrev.reduce((max, msg) => {
          const t = Number(msg?._visibilityTime || parseServerDate(msg?.created_at).getTime());
          return Number.isFinite(t) ? Math.max(max, t) : max;
        }, 0);
        const prevByServerId = new Map(
          basePrev
            .filter((msg) => Number.isFinite(Number(msg._serverId || msg.id)))
            .map((msg) => [Number(msg._serverId || msg.id), msg]),
        );
        const prevLocalCandidates = basePrev.filter((msg) => Boolean(msg?._clientId));
        const nextMessagesWithLocalIdentity = nextMessagesWithReplyIcons.map((serverMsg) => {
          let existingLocal = prevByServerId.get(Number(serverMsg.id));
          if (!existingLocal) {
            existingLocal = prevLocalCandidates.find((localMsg) => {
              if (!localMsg?._clientId) return false;
              if ((localMsg.username || "") !== (serverMsg.username || "")) return false;
              if ((localMsg.body || "") !== (serverMsg.body || "")) return false;
              const localFiles = Array.isArray(localMsg.files) ? localMsg.files : [];
              const serverFiles = Array.isArray(serverMsg.files) ? serverMsg.files : [];
              if (localFiles.length !== serverFiles.length) return false;
              const localTime = parseServerDate(localMsg.created_at).getTime();
              const serverTime = parseServerDate(serverMsg.created_at).getTime();
              return Math.abs(localTime - serverTime) < 2 * 60 * 1000;
            });
          }
          if (!existingLocal?._clientId) return serverMsg;
          const serverFiles = Array.isArray(serverMsg.files) ? serverMsg.files : [];
          const localFiles = Array.isArray(existingLocal.files) ? existingLocal.files : [];
          const mergedFiles =
            serverFiles.length && localFiles.length === serverFiles.length
              ? serverFiles.map((file, idx) => ({
                  ...file,
                  _localId: localFiles[idx]?._localId || localFiles[idx]?.id || null,
                  _localUrl: localFiles[idx]?.url || localFiles[idx]?._localUrl || null,
                }))
              : serverFiles;
          return {
            ...serverMsg,
            files: mergedFiles,
            _clientId: existingLocal._clientId,
            _serverId: Number(serverMsg.id),
            _chatId: existingLocal._chatId,
            _delivery: undefined,
            _awaitingServerEcho: false,
            _visibilityTime: existingLocal?._visibilityTime,
          };
        });
        const nextMessagesWithVisibility = nextMessagesWithLocalIdentity.map((serverMsg) => {
          if (serverMsg?._visibilityTime) return serverMsg;
          const hasVideo = Array.isArray(serverMsg?.files)
            ? serverMsg.files.some((file) =>
                String(file?.mimeType || "").toLowerCase().startsWith("video/"),
              )
            : false;
          const isFromOther = String(serverMsg?.username || "") !== String(user.username || "");
          const createdAtMs = parseServerDate(serverMsg?.created_at).getTime();
          const revealedLate =
            isFromOther &&
            hasVideo &&
            Number.isFinite(createdAtMs) &&
            prevLatestVisibleTime > 0 &&
            createdAtMs < prevLatestVisibleTime;
          if (!revealedLate) return serverMsg;
          return {
            ...serverMsg,
            _visibilityTime: Date.now(),
          };
        });

        if (
          nextMessages.length === 0 &&
          basePrev.some((msg) => {
            if (Number(msg._chatId || chatId) !== Number(chatId)) return false;
            return Boolean(
              msg._clientId || msg._awaitingServerEcho || msg._delivery,
            );
          })
        ) {
          // Prevent one-frame disappearance when first local message exists
          // and a transient fetch returns empty before server echo settles.
          return basePrev;
        }
        const isPendingMessageAcknowledged = (pending, serverMessages) => {
          if (!pending || !serverMessages.length) return false;
          const pendingHasFiles = Array.isArray(pending.files) && pending.files.length > 0;
          const pendingProgress = Number(pending._uploadProgress ?? 100);
          if (
            pending._delivery === "sending" &&
            pendingHasFiles &&
            pendingProgress < 100
          ) {
            return false;
          }
          const pendingCreatedAt = parseServerDate(
            pending.created_at || new Date().toISOString(),
          ).getTime();
          const pendingFiles = Array.isArray(pending.files) ? pending.files : [];
          return serverMessages.some((serverMsg) => {
            if (serverMsg.username !== pending.username) return false;
            if ((serverMsg.body || "") !== (pending.body || "")) return false;
            const serverFiles = Array.isArray(serverMsg.files) ? serverMsg.files : [];
            if (serverFiles.length !== pendingFiles.length) return false;
            const serverCreatedAt = parseServerDate(serverMsg.created_at).getTime();
            const minMatchTime = pendingCreatedAt - 3000;
            const maxMatchTime = pendingCreatedAt + 2 * 60 * 1000;
            return serverCreatedAt >= minMatchTime && serverCreatedAt <= maxMatchTime;
          });
        };

        const isServerMessageShadowedByPendingUpload = (
          serverMsg,
          pendingMessages,
        ) => {
          return pendingMessages.some((pending) => {
            if (!pending || pending._delivery !== "sending") return false;
            const pendingFiles = Array.isArray(pending.files) ? pending.files : [];
            if (!pendingFiles.length) return false;
            const pendingProgress = Number(pending._uploadProgress || 0);
            if (pendingProgress >= 100) return false;
            if (serverMsg.username !== pending.username) return false;
            if ((serverMsg.body || "") !== (pending.body || "")) return false;
            const serverFiles = Array.isArray(serverMsg.files) ? serverMsg.files : [];
            if (serverFiles.length !== pendingFiles.length) return false;
            const pendingCreatedAt = parseServerDate(
              pending.created_at || new Date().toISOString(),
            ).getTime();
            const serverCreatedAt = parseServerDate(serverMsg.created_at).getTime();
            const minMatchTime = pendingCreatedAt - 3000;
            const maxMatchTime = pendingCreatedAt + 2 * 60 * 1000;
            return serverCreatedAt >= minMatchTime && serverCreatedAt <= maxMatchTime;
          });
        };

        const pendingLocal = basePrev.filter(
          (msg) =>
            (msg._delivery === "sending" || msg._delivery === "failed") &&
            Number(msg._chatId || chatId) === Number(chatId) &&
            !isPendingMessageAcknowledged(msg, nextMessages),
        );
        const optimisticSentLocal = basePrev.filter((msg) => {
          if (!msg?._awaitingServerEcho) return false;
          if (Number(msg._chatId || chatId) !== Number(chatId)) return false;
          return !nextMessagesWithVisibility.some(
            (serverMsg) =>
              Number(serverMsg.id) === Number(msg._serverId || msg.id),
          );
        });
        const nextMessagesVisible = nextMessagesWithVisibility.filter(
          (msg) => !isServerMessageShadowedByPendingUpload(msg, pendingLocal),
        );
        const compareMessages = (left, right) => {
          const leftIsPending =
            left?._delivery === "sending" || Boolean(left?._processingPending);
          const rightIsPending =
            right?._delivery === "sending" || Boolean(right?._processingPending);
          if (leftIsPending !== rightIsPending) {
            return leftIsPending ? 1 : -1;
          }
          if (leftIsPending && rightIsPending) {
            const leftQueuedAt = Number(left?._queuedAt || 0);
            const rightQueuedAt = Number(right?._queuedAt || 0);
            if (leftQueuedAt !== rightQueuedAt) {
              return leftQueuedAt - rightQueuedAt;
            }
          }
          const leftServerId = Number(left?._serverId || left?.id);
          const rightServerId = Number(right?._serverId || right?.id);
          const leftHasServerId = Number.isFinite(leftServerId) && leftServerId > 0;
          const rightHasServerId = Number.isFinite(rightServerId) && rightServerId > 0;
          if (leftHasServerId && rightHasServerId) {
            return leftServerId - rightServerId;
          }
          const leftTime = Number(left?._visibilityTime || parseServerDate(left?.created_at).getTime());
          const rightTime = Number(right?._visibilityTime || parseServerDate(right?.created_at).getTime());
          if (leftTime !== rightTime) {
            return leftTime - rightTime;
          }
          const leftId = Number(left?.id);
          const rightId = Number(right?.id);
          const leftHasNumericId = Number.isFinite(leftId);
          const rightHasNumericId = Number.isFinite(rightId);
          if (leftHasNumericId && rightHasNumericId) {
            return leftId - rightId;
          }
          return String(left?._clientId || "").localeCompare(String(right?._clientId || ""));
        };

        let mergedNext = [
          ...nextMessagesVisible,
          ...optimisticSentLocal,
          ...pendingLocal,
        ].sort(compareMessages);

        const nowMs = Date.now();
        const rescuedOptimistic = basePrev.filter((msg) => {
          if (!msg?._clientId) return false;
          if (Number(msg._chatId || chatId) !== Number(chatId)) return false;
          const queuedAt = Number(msg?._queuedAt || 0);
          if (!queuedAt || nowMs - queuedAt > 2 * 60 * 1000) return false;
          const hasClientMatch = mergedNext.some(
            (item) => String(item?._clientId || "") === String(msg._clientId),
          );
          if (hasClientMatch) return false;
          const optimisticServerId = Number(msg?._serverId || 0);
          if (optimisticServerId) {
            const hasServerMatch = mergedNext.some(
              (item) => Number(item?._serverId || item?.id || 0) === optimisticServerId,
            );
            if (hasServerMatch) return false;
          }
          return true;
        });
        if (rescuedOptimistic.length) {
          mergedNext = [...mergedNext, ...rescuedOptimistic].sort(compareMessages);
        }

        if (options.preserveHistory) {
          const mergedById = new Map();
          mergedNext.forEach((msg) => {
            const key = Number(msg?._serverId || msg?.id);
            if (Number.isFinite(key)) {
              mergedById.set(key, msg);
            }
          });
          const carriedOlder = prev.filter((msg) => {
            const key = Number(msg?._serverId || msg?.id);
            if (!Number.isFinite(key)) return false;
            return !mergedById.has(key);
          });
          if (carriedOlder.length) {
            mergedNext = [...carriedOlder, ...mergedNext].sort(compareMessages);
          }
        }
        return mergedNext;
      });
      const lastMsg = nextMessages[nextMessages.length - 1];
      const lastId = lastMsg?.id || null;
      const hasUnreadFromOthers = nextMessages.some(
        (msg) => msg.username !== user.username && !msg._readByMe,
      );
      const hasNew =
        lastId &&
        lastMessageIdRef.current &&
        lastId !== lastMessageIdRef.current;
      const newFromSelf = hasNew && lastMsg?.username === user.username;
      lastMessageIdRef.current = lastId;

      if (openingChatRef.current) {
        const firstUnreadIndex = nextMessages.findIndex(
          (msg) => msg.username !== user.username && !msg._readByMe,
        );
        const firstUnreadMessage =
          firstUnreadIndex >= 0 ? nextMessages[firstUnreadIndex] : null;

        shouldAutoMarkReadRef.current = true;
        pendingScrollToUnreadRef.current = null;

        if (!firstUnreadMessage?.id && openingUnreadCountRef.current > 0 && !options.forceUnreadFetch) {
          const boostedLimit = Math.min(
            10000,
            Math.max(
              CHAT_PAGE_CONFIG.messageFetchLimit,
              Number(openingUnreadCountRef.current || 0) + 200,
              Number(options.limit || 0) + 200,
            ),
          );
          void loadMessages(chatId, {
            silent: true,
            preserveHistory: true,
            limit: boostedLimit,
            forceUnreadFetch: true,
          });
          return;
        }

        if (firstUnreadMessage?.id) {
          shouldAutoMarkReadRef.current = false;
          const unreadId = Number(firstUnreadMessage.id);
          setUnreadMarkerId(unreadId);
          unreadMarkerIdRef.current = unreadId;
          pendingScrollToUnreadRef.current = unreadId;
          pendingScrollToBottomRef.current = false;
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
          isAtBottomRef.current = false;
          setIsAtBottom(false);
        } else {
          setUnreadMarkerId(null);
          unreadMarkerIdRef.current = null;
          pendingScrollToBottomRef.current = true;
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
          isAtBottomRef.current = true;
          setIsAtBottom(true);
          shouldAutoMarkReadRef.current = true;
        }

        openingHadUnreadRef.current = false;
        openingUnreadCountRef.current = 0;
        openingChatRef.current = false;
      }

      if (options.forceBottom) {
        pendingScrollToBottomRef.current = true;
        isAtBottomRef.current = true;
        setIsAtBottom(true);
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);
      }

      if (!options.silent) {
        setUnreadInChat(0);
      }

        const hasPendingUnreadAnchor =
          pendingScrollToUnreadRef.current !== null ||
          unreadMarkerIdRef.current !== null;
        const keepUnreadAnchor =
          hasPendingUnreadAnchor ||
          (Boolean(options.initialLoad) &&
            Number(openingUnreadCountRef.current || 0) > 0);
      const unreadAnchorLocked =
        unreadMarkerIdRef.current !== null &&
        Date.now() < Number(unreadAnchorLockUntilRef.current || 0);
      if (!keepUnreadAnchor && !unreadAnchorLocked) {
        if (newFromSelf) {
          pendingScrollToBottomRef.current = true;
          isAtBottomRef.current = true;
          setIsAtBottom(true);
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
        } else if (hasNew && !userScrolledUpRef.current) {
          pendingScrollToBottomRef.current = true;
          isAtBottomRef.current = true;
          setIsAtBottom(true);
        }
      }
      if (
        activeChat?.type === "dm" &&
        hasUnreadFromOthers &&
        isAppActive &&
        (!isMobileViewport || mobileTab === "chat") &&
        isAtBottomRef.current &&
        !userScrolledUpRef.current &&
        (shouldAutoMarkReadRef.current || options.initialLoad)
      ) {
        await markMessagesRead({ chatId, username: user.username }).catch(() => null);
      }
    } catch {
      // Keep chat window free of transient fetch errors.
    } finally {
      messageFetchInFlightRef.current = false;
      if (queuedSilentMessageRefreshRef.current) {
        const queued = queuedSilentMessageRefreshRef.current;
        queuedSilentMessageRefreshRef.current = null;
        void loadMessages(queued.chatId, queued.options);
      }
      if (!options.silent) {
        setLoadingMessages(false);
      }
    }
  }

  function clearPendingUploads() {
    setPendingUploadFiles((prev) => {
      prev.forEach((file) => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
      return [];
    });
    setPendingUploadType("");
    setUploadError("");
    if (!userScrolledUpRef.current) {
      pendingScrollToBottomRef.current = true;
      scrollChatToBottom("auto");
      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
      });
      window.setTimeout(() => {
        scrollChatToBottom("auto");
      }, 80);
    }
  }

  function clearPendingVoiceMessage() {
    setPendingVoiceMessage((prev) => {
      if (prev?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return null;
    });
  }

  function handleVoiceRecorded(payload) {
    if (!payload?.file) return;
    if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
      setUploadError("File uploads are disabled on this server.");
      return;
    }
    if (fileUploadInProgress || activeUploadProgress !== null) {
      setUploadError("Please wait for the current upload to finish.");
      return;
    }
    if (pendingVoiceMessage) {
      setUploadError("Remove the voice message before attaching files.");
      return;
    }
    if (pendingUploadFiles.length) {
      setUploadError("Remove attachments before adding a voice message.");
      return;
    }
    const file = payload.file;
    const sizeBytes = Number(file.size || 0);
    if (sizeBytes > CHAT_PAGE_CONFIG.maxFileSizeBytes) {
      setUploadError(
        `Each file must be smaller than ${formatBytesAsMb(
          CHAT_PAGE_CONFIG.maxFileSizeBytes,
        )}.`,
      );
      return;
    }
    if (sizeBytes > CHAT_PAGE_CONFIG.maxTotalUploadBytes) {
      setUploadError(
        `Total upload size cannot exceed ${formatBytesAsMb(
          CHAT_PAGE_CONFIG.maxTotalUploadBytes,
        )}.`,
      );
      return;
    }
    setUploadError("");
    clearPendingVoiceMessage();
    const previewUrl = URL.createObjectURL(file);
    setPendingVoiceMessage({
      id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name: file.name || "voice-message",
      mimeType: payload.mimeType || file.type || "audio/webm",
      sizeBytes,
      durationSeconds: Number(payload.durationSeconds || 0) || null,
      previewUrl,
      kind: "voice",
    });
    if (activeChatId) {
      pendingScrollToBottomRef.current = true;
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      scrollChatToBottom("auto");
      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
      });
      window.setTimeout(() => {
        scrollChatToBottom("auto");
      }, 80);
    }
  }

  function removePendingUpload(id) {
    setPendingUploadFiles((prev) => {
      const next = prev.filter((file) => {
        if (file.id === id) {
          if (file.previewUrl) {
            URL.revokeObjectURL(file.previewUrl);
          }
          return false;
        }
        return true;
      });
      if (!next.length) {
        setPendingUploadType("");
      }
      return next;
    });
  }

  function getMediaFileMetadata(file) {
    const mimeType = String(file?.type || "").toLowerCase();
    if (mimeType.startsWith("image/")) {
      if (typeof window.createImageBitmap !== "function") {
        return Promise.resolve({ width: null, height: null, durationSeconds: null });
      }
      return window.createImageBitmap(file)
        .then((bitmap) => {
          const metadata = {
            width: Number.isFinite(Number(bitmap.width)) ? Number(bitmap.width) : null,
            height: Number.isFinite(Number(bitmap.height)) ? Number(bitmap.height) : null,
            durationSeconds: null,
          };
          if (typeof bitmap.close === "function") {
            bitmap.close();
          }
          return metadata;
        })
        .catch(() => ({ width: null, height: null, durationSeconds: null }));
    }
    if (mimeType.startsWith("video/")) {
      return new Promise((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        let reader = null;
        let resolved = false;

        const resolveOnce = (metadata) => {
          if (resolved) return;
          resolved = true;
          resolve(metadata);
        };

        const cleanup = () => {
          try {
            video.pause();
          } catch {
            // no-op
          }
          if ("srcObject" in video) {
            video.srcObject = null;
          }
          video.removeAttribute("src");
          video.load();
          if (reader?.readyState === FileReader.LOADING) {
            reader.abort();
          }
          reader = null;
        };

        video.onloadedmetadata = () => {
          resolveOnce({
            width: video.videoWidth || null,
            height: video.videoHeight || null,
            durationSeconds: Number.isFinite(Number(video.duration))
              ? Number(video.duration)
              : null,
          });
          cleanup();
        };
        video.onerror = () => {
          resolveOnce({ width: null, height: null, durationSeconds: null });
          cleanup();
        };

        try {
          if ("srcObject" in video) {
            video.srcObject = file;
            return;
          }
          reader = new FileReader();
          reader.onload = () => {
            const dataUrl = typeof reader?.result === "string" ? reader.result : "";
            if (!dataUrl) {
              resolveOnce({ width: null, height: null, durationSeconds: null });
              cleanup();
              return;
            }
            video.src = dataUrl;
          };
          reader.onerror = () => {
            resolveOnce({ width: null, height: null, durationSeconds: null });
            cleanup();
          };
          reader.readAsDataURL(file);
        } catch {
          resolveOnce({ width: null, height: null, durationSeconds: null });
          cleanup();
        }
      });
    }
    if (mimeType.startsWith("audio/")) {
      return new Promise((resolve) => {
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        let reader = null;
        let resolved = false;

        const resolveOnce = (metadata) => {
          if (resolved) return;
          resolved = true;
          resolve(metadata);
        };

        const cleanup = () => {
          if ("srcObject" in audio) {
            audio.srcObject = null;
          }
          audio.removeAttribute("src");
          audio.load();
          if (reader?.readyState === FileReader.LOADING) {
            reader.abort();
          }
          reader = null;
        };

        audio.onloadedmetadata = () => {
          resolveOnce({
            width: null,
            height: null,
            durationSeconds: Number.isFinite(Number(audio.duration))
              ? Number(audio.duration)
              : null,
          });
          cleanup();
        };
        audio.onerror = () => {
          resolveOnce({ width: null, height: null, durationSeconds: null });
          cleanup();
        };

        try {
          reader = new FileReader();
          reader.onload = () => {
            const dataUrl = typeof reader?.result === "string" ? reader.result : "";
            if (!dataUrl) {
              resolveOnce({ width: null, height: null, durationSeconds: null });
              cleanup();
              return;
            }
            audio.src = dataUrl;
          };
          reader.onerror = () => {
            resolveOnce({ width: null, height: null, durationSeconds: null });
            cleanup();
          };
          reader.readAsDataURL(file);
        } catch {
          resolveOnce({ width: null, height: null, durationSeconds: null });
          cleanup();
        }
      });
    }
    return Promise.resolve({ width: null, height: null, durationSeconds: null });
  }

  async function handleUploadFilesSelected(fileList, uploadType, append = false) {
    if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
      setUploadError("File uploads are disabled on this server.");
      return;
    }
    if (fileUploadInProgress || activeUploadProgress !== null) {
      setUploadError("Please wait for the current upload to finish.");
      return;
    }
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setUploadError("");
    if (
      append &&
      pendingUploadType &&
      uploadType !== pendingUploadType
    ) {
      setUploadError("You can only add one type per message.");
      return;
    }
    const existing = append ? pendingUploadFiles : [];
    const combinedCount = existing.length + incoming.length;

    if (combinedCount > CHAT_PAGE_CONFIG.maxFilesPerMessage) {
      setUploadError(
        `Maximum ${CHAT_PAGE_CONFIG.maxFilesPerMessage} files per message.`,
      );
      return;
    }
    const oversize = incoming.find(
      (file) => Number(file.size || 0) > CHAT_PAGE_CONFIG.maxFileSizeBytes,
    );
    if (oversize) {
      setUploadError(
        `Each file must be smaller than ${formatBytesAsMb(
          CHAT_PAGE_CONFIG.maxFileSizeBytes,
        )}.`,
      );
      return;
    }
    const existingBytes = existing.reduce(
      (sum, file) => sum + Number(file.sizeBytes || file.size || 0),
      0,
    );
    const incomingBytes = incoming.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const totalBytes = existingBytes + incomingBytes;
    if (totalBytes > CHAT_PAGE_CONFIG.maxTotalUploadBytes) {
      setUploadError(
        `Total upload size cannot exceed ${formatBytesAsMb(
          CHAT_PAGE_CONFIG.maxTotalUploadBytes,
        )}.`,
      );
      return;
    }
    if (uploadType === "media") {
      const invalid = incoming.find(
        (file) =>
          !String(file.type || "").startsWith("image/") &&
          !String(file.type || "").startsWith("video/"),
      );
      if (invalid) {
        setUploadError("Photo or Video only accepts image/video files.");
        return;
      }
    }

    if (!append) {
      clearPendingUploads();
    }

    const metadata = await Promise.all(
      incoming.map((file) => getMediaFileMetadata(file)),
    );
    const nextItems = incoming.map((file, index) => ({
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: Number(file.size || 0),
      width: metadata[index]?.width || null,
      height: metadata[index]?.height || null,
      durationSeconds: metadata[index]?.durationSeconds ?? null,
      previewUrl:
        String(file.type || "").startsWith("image/") ||
        String(file.type || "").startsWith("video/") ||
        String(file.type || "").startsWith("audio/")
        ? URL.createObjectURL(file)
        : null,
    }));

    setPendingUploadFiles((prev) => (append ? [...prev, ...nextItems] : nextItems));
    setPendingUploadType(uploadType);
    if (activeChatId) {
      pendingScrollToBottomRef.current = true;
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      scrollChatToBottom("auto");
      requestAnimationFrame(() => {
        scrollChatToBottom("auto");
      });
      window.setTimeout(() => {
        scrollChatToBottom("auto");
      }, 80);
    }
  }

  const handleMessageInput = useCallback(
    (value) => {
      if (!uploadError) return;
      if (!String(uploadError).toLowerCase().includes("message must be")) return;
      const trimmed = String(value || "").trim();
      if (trimmed.length <= APP_CONFIG.messageMaxChars) {
        setUploadError("");
      }
    },
    [uploadError],
  );

  async function handleSend(event) {
    event.preventDefault();
    if (!activeChatId) return;
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    shouldAutoMarkReadRef.current = true;
    setUnreadMarkerId(null);
    unreadMarkerIdRef.current = null;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = formData.get("message")?.toString() || "";
    if (body === "[object Object]") {
      setUploadError("Invalid message body.");
      return;
    }
    const trimmedBody = body.trim();
    const hasPendingFiles = pendingUploadFiles.length > 0;
    const hasPendingVoice = Boolean(pendingVoiceMessage);
    const hasAnyPendingFiles = hasPendingFiles || hasPendingVoice;
    if (!trimmedBody && !hasAnyPendingFiles) return;
    const maxMessageChars = APP_CONFIG.messageMaxChars;
    if (String(body).length > maxMessageChars) {
      setUploadError(`Message must be ${maxMessageChars} characters or less.`);
      return;
    }
    if (uploadError) {
      setUploadError("");
    }

    const pendingFilesSummary = hasAnyPendingFiles
      ? summarizeFiles([
          ...pendingUploadFiles,
          ...(hasPendingVoice && pendingVoiceMessage ? [pendingVoiceMessage] : []),
        ])
      : "";
    const isSavedChat = isActiveSavedChat;

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const queuedAt = Date.now();
    const pendingDate = parseServerDate(createdAt);
    const pendingDayKey = `${pendingDate.getFullYear()}-${pendingDate.getMonth()}-${pendingDate.getDate()}`;
    const fallbackBody =
      trimmedBody ||
      (hasPendingFiles
        ? pendingFilesSummary || `Sent ${pendingUploadFiles.length} files`
        : "");
    const pendingFiles = hasAnyPendingFiles
      ? [
          ...pendingUploadFiles.map((item) => {
            const localUrl =
              item.file instanceof Blob &&
              (String(item.mimeType || "").startsWith("image/") ||
                String(item.mimeType || "").startsWith("video/") ||
                String(item.mimeType || "").startsWith("audio/"))
                ? URL.createObjectURL(item.file)
                : item.previewUrl || null;
            return {
              id: item.id,
              _localId: item.id,
              kind: pendingUploadType === "document" ? "document" : "media",
              name: item.name,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              width: Number.isFinite(Number(item.width)) ? Number(item.width) : null,
              height: Number.isFinite(Number(item.height)) ? Number(item.height) : null,
              durationSeconds: Number.isFinite(Number(item.durationSeconds))
                ? Number(item.durationSeconds)
                : null,
              url: localUrl,
              _localUrl: localUrl,
              file: item.file,
            };
          }),
          ...(hasPendingVoice && pendingVoiceMessage
            ? [
                (() => {
                  const localUrl = pendingVoiceMessage.file instanceof Blob
                    ? URL.createObjectURL(pendingVoiceMessage.file)
                    : pendingVoiceMessage.previewUrl || null;
                  return {
                    id: pendingVoiceMessage.id,
                    _localId: pendingVoiceMessage.id,
                    kind: "voice",
                    name: pendingVoiceMessage.name,
                    mimeType: pendingVoiceMessage.mimeType,
                    sizeBytes: pendingVoiceMessage.sizeBytes,
                    width: null,
                    height: null,
                    durationSeconds: Number.isFinite(Number(pendingVoiceMessage.durationSeconds))
                      ? Number(pendingVoiceMessage.durationSeconds)
                      : null,
                    url: localUrl,
                    _localUrl: localUrl,
                    file: pendingVoiceMessage.file,
                  };
                })(),
              ]
            : []),
        ]
      : [];
    const replyPayload = replyTarget
      ? {
          id: replyTarget.id,
          username: replyTarget.username,
          nickname: replyTarget.nickname,
          body: replyTarget.body,
          icon: replyTarget.icon || null,
          displayName: replyTarget.displayName,
          color: replyTarget.color || null,
        }
      : null;

    const effectiveUploadType = hasPendingFiles
      ? pendingUploadType
      : hasPendingVoice
        ? "media"
        : pendingUploadType;

    if (hasAnyPendingFiles) {
      form.reset();
      clearPendingUploads();
      clearPendingVoiceMessage();
      pendingScrollToBottomRef.current = true;

      const pendingMessage = {
        _clientId: tempId,
        _chatId: Number(activeChatId),
        _queuedAt: queuedAt,
        _delivery: "sending",
        _uploadType: effectiveUploadType,
        _files: pendingFiles,
        _createdAt: createdAt,
        _dayKey: pendingDayKey,
        body: fallbackBody,
        replyTo: replyPayload,
        read_at: isSavedChat ? createdAt : null,
        read_by_user_id: isSavedChat ? Number(user?.id || 0) : null,
      };
      await sendPendingMessage(pendingMessage);
      setReplyTarget(null);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        username: user.username,
        body: fallbackBody,
        created_at: createdAt,
        read_at: isSavedChat ? createdAt : null,
        read_by_user_id: isSavedChat ? Number(user?.id || 0) : null,
        _clientId: tempId,
        _chatId: Number(activeChatId),
        _queuedAt: queuedAt,
        _delivery: "sending",
        _dayKey: pendingDayKey,
        _dayLabel: formatDayLabel(createdAt),
        _timeLabel: formatTime(createdAt),
        _uploadType: effectiveUploadType,
        _files: pendingFiles,
        _uploadProgress: hasAnyPendingFiles ? 0 : null,
        _awaitingServerEcho: false,
        replyTo: replyPayload,
        files: pendingFiles.map((file) => ({
          id: file.id,
          _localId: file._localId || file.id,
          kind: file.kind,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          width: file.width,
          height: file.height,
          durationSeconds: file.durationSeconds,
          url: file.url,
        })),
      },
    ]);
    form.reset();
    clearPendingUploads();
    clearPendingVoiceMessage();
    pendingScrollToBottomRef.current = true;
    setReplyTarget(null);

    if (!isConnected) {
      return;
    }

    const pendingMessage = {
      _clientId: tempId,
      _chatId: Number(activeChatId),
      _queuedAt: queuedAt,
      _delivery: "sending",
      _uploadType: effectiveUploadType,
      _files: pendingFiles,
      body: fallbackBody,
      replyTo: replyPayload,
    };
    await sendPendingMessage(pendingMessage);
  }

  async function startDirectMessage() {
    if (!newChatUsername.trim()) return;
    setNewChatError("");
    try {
      if (!isConnected) {
        setNewChatError("Server not reachable.");
        return;
      }
      const matched = newChatSelection;
      if (!matched) {
        setNewChatError("Pick a user from the search results.");
        return;
      }
      const target = matched.username;
      const res = await createDmChat({ from: user.username, to: target });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Unable to start chat (${res.status}).`);
      }
      if (!data?.id) {
        throw new Error("Server did not return a chat id.");
      }
      setActiveChatId(Number(data.id));
      setActivePeer(matched);
      setNewChatUsername("");
      setNewChatOpen(false);
      setMobileTab("chat");
      await loadChats();
    } catch (err) {
      setNewChatError(err.message);
    }
  }

  async function handleStatusUpdate(nextStatus) {
    if (!user || user.status === nextStatus) return;
    try {
      const res = await updateStatusRequest({
        username: user.username,
        status: nextStatus,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update status.");
      }
      const nextUser = { ...user, status: data.status };
      setUser(nextUser);
    } catch {}
  }

  async function handleAvatarChange(event) {
    if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
      setProfileError("File uploads are disabled on this server.");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setProfileError("Profile photo must be an image file.");
      event.target.value = "";
      return;
    }
    if (Number(file.size || 0) > CHAT_PAGE_CONFIG.maxFileSizeBytes) {
      setProfileError(
        `Profile photo must be smaller than ${formatBytesAsMb(
          CHAT_PAGE_CONFIG.maxFileSizeBytes,
        )}.`,
      );
      event.target.value = "";
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setProfileError("");
    if (pendingAvatarFile?.previewUrl) {
      URL.revokeObjectURL(pendingAvatarFile.previewUrl);
    }
    setPendingAvatarFile({ file, previewUrl });
    setAvatarPreview(previewUrl);
    event.target.value = "";
  }

  function handleAvatarRemove() {
    setProfileError("");
    if (pendingAvatarFile?.previewUrl) {
      URL.revokeObjectURL(pendingAvatarFile.previewUrl);
    }
    setPendingAvatarFile(null);
    setAvatarPreview("");
    setProfileForm((prev) => ({ ...prev, avatarUrl: "" }));
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setProfileError("");
    const trimmedNickname = profileForm.nickname.trim();
    const trimmedUsername = profileForm.username.trim().toLowerCase();
    if (trimmedNickname.length > NICKNAME_MAX) {
      setProfileError(`Nickname must be ${NICKNAME_MAX} characters or less.`);
      return;
    }
    if (trimmedUsername.length > USERNAME_MAX) {
      setProfileError(`Username must be ${USERNAME_MAX} characters or less.`);
      return;
    }
    if (trimmedUsername.length < 3) {
      setProfileError("Username must be at least 3 characters.");
      return;
    }
    if (!usernamePattern.test(trimmedUsername)) {
      setProfileError(
        "Username can only include english letters, numbers, dot (.), and underscore (_).",
      );
      return;
    }
    try {
      let avatarUrlToSave = profileForm.avatarUrl;
      if (pendingAvatarFile?.file) {
        if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
          throw new Error("File uploads are disabled on this server.");
        }
        const payload = new FormData();
        payload.append("avatar", pendingAvatarFile.file);
        payload.append("currentUsername", user.username);
        const uploadRes = await uploadAvatar(payload);
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData?.error || "Unable to upload profile photo.");
        }
        avatarUrlToSave = uploadData.avatarUrl || "";
      }
      const res = await updateProfile({
        currentUsername: user.username,
        username: trimmedUsername,
        nickname: trimmedNickname,
        avatarUrl: avatarUrlToSave,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update profile.");
      }
      const nextUser = {
        ...user,
        username: data.username,
        nickname: data.nickname,
        avatarUrl: data.avatarUrl,
        color: data.color || user.color || null,
        status: data.status,
      };
      let updatedUser = nextUser;

      if (statusSelection && statusSelection !== (user.status || "online")) {
        await handleStatusUpdate(statusSelection);
        updatedUser = { ...updatedUser, status: statusSelection };
      }

      setUser(updatedUser);
      if (pendingAvatarFile?.previewUrl) {
        URL.revokeObjectURL(pendingAvatarFile.previewUrl);
      }
      setPendingAvatarFile(null);
      setSettingsPanel(null);
    } catch (err) {
      setProfileError(err.message);
    }
  }

  async function handlePasswordSave(event) {
    event.preventDefault();
    setPasswordError("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      const message = "Passwords do not match.";
      setPasswordError(message);
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      const message = "Password must be at least 6 characters.";
      setPasswordError(message);
      return;
    }
    try {
      const res = await updatePassword({
        username: user.username,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update password.");
      }
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setSettingsPanel(null);
    } catch (err) {
      setPasswordError(err.message);
    }
  }

  function handleLogout() {
    logout().catch(() => null);
    setUser(null);
    setShowSettings(false);
    setMobileTab("chats");
  }

  const formatBytes = (bytes) => {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    const kb = 1024;
    const mb = kb * 1024;
    if (value >= mb) return `${(value / mb).toFixed(2)} MB`;
    if (value >= kb) return `${Math.round(value / kb)} KB`;
    return `${Math.max(1, Math.round(value))} B`;
  };

  const getCacheStats = useCallback(() => {
    if (typeof window === "undefined") {
      return {
        totalBytes: 0,
        totalLabel: "0 B",
        chatList: {
          count: 0,
          sizeBytes: 0,
          sizeLabel: "0 B",
          updatedAt: null,
          entries: [],
        },
        messageCaches: {
          count: 0,
          sizeBytes: 0,
          sizeLabel: "0 B",
          entries: [],
        },
        mediaThumbs: {
          count: 0,
          sizeBytes: 0,
          sizeLabel: "0 B",
          updatedAt: null,
        },
        mediaPosters: {
          count: 0,
          sizeBytes: 0,
          sizeLabel: "0 B",
          updatedAt: null,
        },
        voiceWaveforms: {
          count: 0,
          sizeBytes: 0,
          sizeLabel: "0 B",
          updatedAt: null,
        },
      };
    }

    const username = String(user?.username || "").toLowerCase();
    let totalBytes = 0;
    let chatListSizeBytes = 0;
    let messageCacheSizeBytes = 0;
    let mediaThumbSizeBytes = 0;
    let mediaPosterSizeBytes = 0;
    let voiceWaveformSizeBytes = 0;
    let chatListUpdatedAt = null;
    let mediaThumbUpdatedAt = null;
    let mediaPosterUpdatedAt = null;
    let voiceWaveformUpdatedAt = null;
    const chatListEntries = [];
    const messageCacheEntries = [];
    const chatNameById = new Map();

    const addSize = (value) => {
      if (typeof value !== "string") return;
      const bytes = new Blob([value]).size;
      totalBytes += bytes;
      return bytes;
    };

    const chatListKey = buildChatListCacheKey(username);
    const messagesIndexKey = buildMessagesIndexKey(username);
    let mediaThumbParsed = null;
    let mediaPosterParsed = null;
    let voiceWaveformParsed = null;

    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      const value = window.localStorage.getItem(key);
      if (key === chatListKey) {
        const size = addSize(value);
        const parsed = safeParseJson(value);
        const chats = Array.isArray(parsed?.chats) ? parsed.chats : [];
        chatListSizeBytes += size || 0;
        chatListUpdatedAt = parsed?.updatedAt || null;
        chats.forEach((chat) => {
          const chatId = Number(chat?.id || 0);
          if (chatId) {
            chatNameById.set(chatId, String(chat?.name || chat?.group_username || chat?.username || "Chat"));
          }
          chatListEntries.push({
            id: chatId,
            name: String(chat?.name || chat?.group_username || chat?.username || "Chat"),
            type: String(chat?.type || "").toLowerCase() || "chat",
            lastTime: chat?.last_time || null,
            avatar_url: chat?.group_avatar_url || null,
            color: chat?.group_color || null,
            members: Array.isArray(chat?.members) ? chat.members : [],
          });
        });
        continue;
      }
      if (key === messagesIndexKey) {
        addSize(value);
        continue;
      }
      if (key.startsWith(`${CHAT_MESSAGES_CACHE_KEY}:${username}:`)) {
        const size = addSize(value);
        messageCacheSizeBytes += size || 0;
        const parsed = safeParseJson(value);
        const chatId = Number(parsed?.chatId || key.split(":").pop() || 0);
        const messageCount = Array.isArray(parsed?.messages) ? parsed.messages.length : 0;
        const updatedAt = parsed?.updatedAt || null;
        messageCacheEntries.push({
          chatId,
          chatName: chatNameById.get(chatId) || `Chat ${chatId || ""}`.trim(),
          messageCount,
          updatedAt,
          sizeBytes: size || 0,
        });
        continue;
      }
      if (key === MEDIA_THUMB_CACHE_KEY) {
        const size = addSize(value);
        mediaThumbSizeBytes += size || 0;
        mediaThumbParsed = safeParseJson(value);
        mediaThumbUpdatedAt = mediaThumbParsed?.updatedAt || null;
        continue;
      }
      if (key === MEDIA_POSTER_CACHE_KEY) {
        const size = addSize(value);
        mediaPosterSizeBytes += size || 0;
        mediaPosterParsed = safeParseJson(value);
        mediaPosterUpdatedAt = mediaPosterParsed?.updatedAt || null;
        continue;
      }
      if (key === VOICE_WAVEFORM_CACHE_KEY) {
        const size = addSize(value);
        voiceWaveformSizeBytes += size || 0;
        voiceWaveformParsed = safeParseJson(value);
        voiceWaveformUpdatedAt = voiceWaveformParsed?.updatedAt || null;
        continue;
      }
    }

    return {
      totalBytes,
      totalLabel: formatBytes(totalBytes),
      chatList: {
        count: chatListEntries.length,
        sizeBytes: chatListSizeBytes,
        sizeLabel: formatBytes(chatListSizeBytes),
        updatedAt: chatListUpdatedAt,
        entries: chatListEntries,
      },
      messageCaches: {
        count: messageCacheEntries.length,
        sizeBytes: messageCacheSizeBytes,
        sizeLabel: formatBytes(messageCacheSizeBytes),
        entries: messageCacheEntries.map((entry) => ({
          ...entry,
          sizeLabel: formatBytes(entry.sizeBytes),
        })),
      },
      mediaThumbs: {
        count: Array.isArray(mediaThumbParsed?.items) ? mediaThumbParsed.items.length : 0,
        sizeBytes: mediaThumbSizeBytes,
        sizeLabel: formatBytes(mediaThumbSizeBytes),
        updatedAt: mediaThumbUpdatedAt,
      },
      mediaPosters: {
        count: mediaPosterParsed?.posters ? Object.keys(mediaPosterParsed.posters || {}).length : 0,
        sizeBytes: mediaPosterSizeBytes,
        sizeLabel: formatBytes(mediaPosterSizeBytes),
        updatedAt: mediaPosterUpdatedAt,
      },
      voiceWaveforms: {
        count: Array.isArray(voiceWaveformParsed?.entries)
          ? voiceWaveformParsed.entries.length
          : 0,
        sizeBytes: voiceWaveformSizeBytes,
        sizeLabel: formatBytes(voiceWaveformSizeBytes),
        updatedAt: voiceWaveformUpdatedAt,
      },
    };
  }, [user?.username]);

  useEffect(() => {
    if (settingsPanel !== "data") return;
    setDataCacheStats(getCacheStats());
  }, [getCacheStats, settingsPanel, user?.username]);

  const handleClearCache = useCallback(() => {
    if (typeof window === "undefined") return;
    const username = String(user?.username || "").toLowerCase();
    if (username) {
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (
          key === buildChatListCacheKey(username) ||
          key === buildMessagesIndexKey(username) ||
          key.startsWith(`${CHAT_MESSAGES_CACHE_KEY}:${username}:`)
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => removeLocalCache(key));
    }

    [
      MEDIA_THUMB_CACHE_KEY,
      MEDIA_POSTER_CACHE_KEY,
      VOICE_WAVEFORM_CACHE_KEY,
      "chat-media-thumbs",
      "chat-video-posters-v2",
    ].forEach((key) => removeLocalCache(key));

    try {
      window.sessionStorage.removeItem("chat-media-thumbs");
      window.sessionStorage.removeItem("chat-video-posters-v2");
    } catch {
      // ignore storage failures
    }

    messagesCacheRef.current.clear();
    setDataCacheStats(getCacheStats());
  }, [getCacheStats, user?.username]);

  const closeNewChatModal = () => {
    setNewChatOpen(false);
    setNewChatUsername("");
    setNewChatResults([]);
    setNewChatSelection(null);
    setNewChatError("");
  };
  const toggleMuteChat = async (chatId) => {
    const id = Number(chatId || 0);
    if (!id) return;
    const existing = chats.find((chat) => Number(chat.id) === id);
    const previousMuted = Boolean(existing?._muted);
    const nextMuted = !previousMuted;

    setChats((prev) =>
      prev.map((chat) =>
        Number(chat.id) === id ? { ...chat, _muted: nextMuted } : chat,
      ),
    );

    try {
      const res = await setChatMute(id, {
        username: user.username,
        muted: nextMuted,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update mute state.");
      }
      const serverMuted = Boolean(data?.muted);
      setChats((prev) =>
        prev.map((chat) =>
          Number(chat.id) === id ? { ...chat, _muted: serverMuted } : chat,
        ),
      );
    } catch {
      setChats((prev) =>
        prev.map((chat) =>
          Number(chat.id) === id ? { ...chat, _muted: previousMuted } : chat,
        ),
      );
    }
  };

  const openNewGroupModal = () => {
    setEditingGroup(false);
    setGroupModalType("group");
    setNewGroupOpen(true);
    setNewGroupError("");
  };

  const openNewChannelModal = () => {
    setEditingGroup(false);
    setGroupModalType("channel");
    setNewGroupOpen(true);
    setNewGroupError("");
  };

  const closeNewGroupModal = () => {
    setNewGroupOpen(false);
    setCreatingGroup(false);
    setEditingGroup(false);
    setGroupModalType("group");
    setNewGroupForm({
      nickname: "",
      username: "",
      visibility: "public",
      allowMemberInvites: true,
    });
    setNewGroupSearch("");
    setNewGroupSearchResults([]);
    setNewGroupMembers([]);
    if (pendingGroupAvatarFile?.previewUrl) {
      URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
    }
    setPendingGroupAvatarFile(null);
    setGroupAvatarPreview("");
    setEditGroupInviteLink("");
    setRegeneratingGroupInviteLink(false);
    setNewGroupError("");
  };

  const openOwnProfileModal = () => {
    setProfileModalMember({
      id: Number(user?.id || 0) || null,
      username: user?.username || "",
      nickname: user?.nickname || "",
      avatar_url: user?.avatarUrl || "",
      color: user?.color || "#10b981",
      status: user?.status || "online",
      role: "",
    });
    setProfileInviteLink("");
    setProfileModalOpen(true);
  };

  const openActiveChatProfile = async () => {
    if (!activeChat) return;
    setProfileModalMember(null);
    setProfileModalOpen(true);
    if (activeChat.type === "group" || activeChat.type === "channel") {
      try {
        const res = await getGroupInviteLink(activeChat.id);
        const data = await res.json();
        if (res.ok) {
          setProfileInviteLink(String(data?.inviteLink || ""));
        } else {
          setProfileInviteLink("");
        }
      } catch {
        setProfileInviteLink("");
      }
    } else {
      setProfileInviteLink("");
    }
  };

  const openMemberProfileFromMessage = (msg) => {
    if (!msg) return;
    const selected = {
      id: Number(msg.user_id || 0) || null,
      username: msg.username || "",
      nickname: msg.nickname || "",
      avatar_url: msg.avatar_url || "",
      color: msg.color || "#10b981",
      status: "online",
      role: "",
    };
    setProfileModalMember(selected);
    setProfileModalOpen(true);
  };

  const openMemberProfileFromList = (member) => {
    if (!member) return;
    setProfileModalMember(member);
    setProfileModalOpen(true);
  };

  const openMentionProfile = (mention) => {
    if (!mention) return;
    setMentionProfile(mention);
    setProfileModalOpen(true);
  };

  const handleJoinMentionChat = async () => {
    if (!mentionProfileChat?.id) return;
    const token = String(mentionProfileChat.inviteToken || "").trim();
    if (!token) return;
    if (typeof window !== "undefined") {
      window.location.href = `/invite/${token}`;
    }
  };

  const handleOpenProfileChat = () => {
    if (mentionProfileChat?.id) {
      setActiveChatId(Number(mentionProfileChat.id));
      setActivePeer(null);
      setMobileTab("chat");
      closeProfileModal();
      return;
    }
    const targetForChat = profileModalMember || profileTargetUser;
    if (targetForChat?.username) {
      if (
        String(targetForChat.username).toLowerCase() ===
        String(user.username).toLowerCase()
      ) {
        closeProfileModal();
        return;
      }
      void openOrCreateDmFromMember(targetForChat);
      return;
    }
    if (!profileModalMember && activeChat?.type === "group") {
      setMobileTab("chat");
      closeProfileModal();
      return;
    }
    closeProfileModal();
  };

  const handleLeaveGroupById = async (chatId) => {
    const id = Number(chatId || 0);
    if (!id) return;
    try {
      const res = await leaveGroupChat(id, { username: user.username });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to leave group.");
      }
      closeProfileModal();
      if (Number(activeChat?.id || 0) === id) {
        closeChat();
      }
      await loadChats();
    } catch {
      // ignore
    }
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setProfileModalMember(null);
    setProfileInviteLink("");
    setMentionProfile(null);
  };

  const openSelfProfileEditor = () => {
    closeProfileModal();
    setShowSettings(false);
    setSettingsPanel("profile");
    if (isMobileViewport) {
      setMobileTab("settings");
    }
  };

  const openSavedMessages = async () => {
    try {
      setShowSettings(false);
      setSettingsPanel(null);
      let savedChat = chats.find((chat) => chat.type === "saved");
      let chatId = Number(savedChat?.id || 0);
      if (!chatId) {
        const res = await getSavedMessagesChat(user.username);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to open saved messages.");
        }
        chatId = Number(data?.id || 0);
        await loadChats({ silent: true });
      }
      if (!chatId) return;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, String(chatId));
      }
      setActiveChatId(chatId);
      setActivePeer(null);
      setMobileTab("chat");
      setSidebarScrollEpoch((prev) => prev + 1);
    } catch {
      // ignore
    }
  };

  const openEditGroupFromProfile = async () => {
    if (!activeChat || !["group", "channel"].includes(activeChat.type)) return;
    if (!canCurrentUserEditGroup) return;
    setEditingGroup(true);
    setGroupModalType(activeChat.type === "channel" ? "channel" : "group");
    setProfileModalOpen(false);
    setNewGroupForm({
      nickname: activeChat.name || "",
      username: activeChat.group_username || "",
      visibility: activeChat.group_visibility || "public",
      allowMemberInvites: Boolean(Number(activeChat.allow_member_invites || 0)),
    });
    setNewGroupMembers([]);
    setNewGroupSearch("");
    setGroupAvatarPreview(activeChat.group_avatar_url || "");
    if (pendingGroupAvatarFile?.previewUrl) {
      URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
    }
    setPendingGroupAvatarFile(null);
    setEditGroupInviteLink("");
    setNewGroupOpen(true);
    try {
      const res = await getGroupInviteLink(activeChat.id);
      const data = await res.json();
      if (res.ok) {
        setEditGroupInviteLink(String(data?.inviteLink || ""));
      }
    } catch {
      // ignore invite fetch errors in edit modal
    }
  };

  const handleGroupAvatarChange = (event) => {
    if (!CHAT_PAGE_CONFIG.fileUploadEnabled) {
      setNewGroupError("File uploads are disabled on this server.");
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    if (!String(file.type || "").toLowerCase().startsWith("image/")) {
      setNewGroupError("Group avatar must be an image file.");
      event.target.value = "";
      return;
    }
    if (Number(file.size || 0) > CHAT_PAGE_CONFIG.maxFileSizeBytes) {
      setNewGroupError(
        `Group avatar must be smaller than ${formatBytesAsMb(
          CHAT_PAGE_CONFIG.maxFileSizeBytes,
        )}.`,
      );
      event.target.value = "";
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    if (pendingGroupAvatarFile?.previewUrl) {
      URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
    }
    setPendingGroupAvatarFile({ file, previewUrl });
    setGroupAvatarPreview(previewUrl);
    setNewGroupError("");
    event.target.value = "";
  };

  const handleGroupAvatarRemove = () => {
    if (pendingGroupAvatarFile?.previewUrl) {
      URL.revokeObjectURL(pendingGroupAvatarFile.previewUrl);
    }
    setPendingGroupAvatarFile(null);
    setGroupAvatarPreview("");
  };

  const handleRegenerateGroupInvite = async () => {
    if (!editingGroup || !activeChat?.id) return;
    try {
      setRegeneratingGroupInviteLink(true);
      const res = await regenerateGroupInviteLink(activeChat.id, {
        username: user.username,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to regenerate invite link.");
      }
      const nextLink = String(data?.inviteLink || "");
      setEditGroupInviteLink(nextLink);
      setProfileInviteLink(nextLink);
    } catch (err) {
      setNewGroupError(err.message || "Unable to regenerate invite link.");
    } finally {
      setRegeneratingGroupInviteLink(false);
    }
  };

  async function handleCreateGroup() {
    const isChannel = groupModalType === "channel";
    const label = isChannel ? "Channel" : "Group";
    const nickname = newGroupForm.nickname.trim();
    const username = newGroupForm.username.trim().toLowerCase();
    if (!nickname) {
      setNewGroupError(`${label} nickname is required.`);
      return;
    }
    if (nickname.length > NICKNAME_MAX) {
      setNewGroupError(`${label} nickname must be ${NICKNAME_MAX} characters or less.`);
      return;
    }
    if (username.length > USERNAME_MAX) {
      setNewGroupError(`${label} username must be ${USERNAME_MAX} characters or less.`);
      return;
    }
    if (username.length < 3) {
      setNewGroupError(`${label} username must be at least 3 characters.`);
      return;
    }
    if (!usernamePattern.test(username)) {
      setNewGroupError(
        `${label} username can only include english letters, numbers, dot (.), and underscore (_).`,
      );
      return;
    }
    try {
      setCreatingGroup(true);
      setNewGroupError("");
      const payload = {
        creator: user.username,
        nickname,
        username,
        visibility: newGroupForm.visibility,
        allowMemberInvites: newGroupForm.allowMemberInvites !== false,
        members: editingGroup
          ? Array.from(
              new Set([
                ...((activeChat?.members || [])
                  .map((member) => String(member?.username || "").toLowerCase())
                  .filter(
                    (memberUsername) =>
                      memberUsername &&
                      memberUsername !== String(user.username || "").toLowerCase(),
                  )),
                ...newGroupMembers
                  .map((member) => String(member?.username || "").toLowerCase())
                  .filter(Boolean),
              ]),
            )
          : newGroupMembers.map((member) => member.username),
      };
      const res = editingGroup && activeChat?.id
        ? await (isChannel ? updateChannelChat : updateGroupChat)(activeChat.id, {
            username: user.username,
            nickname: payload.nickname,
            groupUsername: payload.username,
            visibility: payload.visibility,
            allowMemberInvites: payload.allowMemberInvites,
            members: payload.members,
          })
        : await (isChannel ? createChannelChat : createGroupChat)(payload);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to create group.");
      }
      const nextChatId = Number(data?.id || activeChat?.id || 0);
      if (!nextChatId) {
        throw new Error("Server did not return a group id.");
      }
      if (editingGroup && pendingGroupAvatarFile?.file) {
        const form = new FormData();
        form.append("username", user.username);
        form.append("avatar", pendingGroupAvatarFile.file);
        const avatarRes = await uploadGroupAvatar(nextChatId, form);
        const avatarData = await avatarRes.json();
        if (!avatarRes.ok) {
          throw new Error(avatarData?.error || "Unable to upload group avatar.");
        }
      }
      if (!editingGroup) {
        setCreatedGroupInviteLink(String(data?.inviteLink || ""));
        setGroupInviteOpen(Boolean(data?.inviteLink));
      }
      closeNewGroupModal();
      setEditingGroup(false);
      await loadChats();
      if (editingGroup) {
        setSidebarScrollEpoch((prev) => prev + 1);
      }
      setActiveChatId(nextChatId);
      setActivePeer(null);
      setMobileTab("chat");
    } catch (err) {
      setNewGroupError(err.message);
    } finally {
      setCreatingGroup(false);
    }
  }

  async function openOrCreateDmFromMember(member) {
    const targetUsername = String(member?.username || "").toLowerCase();
    if (!targetUsername) return;
    if (targetUsername === String(user.username || "").toLowerCase()) return;
    try {
      const existingDm = chats.find((chat) => {
        if (chat?.type !== "dm") return false;
        return (chat.members || []).some(
          (chatMember) =>
            String(chatMember?.username || "").toLowerCase() === targetUsername,
        );
      });
      let nextChatId = Number(existingDm?.id || 0);
      if (!nextChatId) {
        const res = await createDmChat({ from: user.username, to: targetUsername });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to open direct chat.");
        }
        nextChatId = Number(data?.id || 0);
      }

      if (!nextChatId) {
        throw new Error("Unable to resolve direct chat.");
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, String(nextChatId));
      }
      setActiveChatId(nextChatId);
      setMobileTab("chat");
      closeProfileModal();
      await loadChats({ silent: true });

      const refreshedDm = chats.find((chat) => Number(chat.id) === nextChatId);
      const nextPeer = (refreshedDm?.members || []).find(
        (chatMember) =>
          String(chatMember?.username || "").toLowerCase() === targetUsername,
      );
      setActivePeer(nextPeer || member || null);
    } catch (err) {
      setProfileError(err.message || "Unable to open direct chat.");
    }
  }

  async function openDiscoverUser(member) {
    if (!member) return;
    await openOrCreateDmFromMember(member);
    setSidebarScrollEpoch((prev) => prev + 1);
  }

  async function openDiscoverGroup(group) {
    const inviteToken = String(group?.inviteToken || "").trim();
    const chatId = Number(group?.id || 0);
    const alreadyMember =
      group?.isMember === true ||
      group?.isMember === 1 ||
      String(group?.isMember || "").toLowerCase() === "true";
    if (alreadyMember && chatId > 0) {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(OPEN_CHAT_ID_KEY, String(chatId));
      }
      await loadChats({ silent: true });
      setActiveChatId(chatId);
      setActivePeer(null);
      setMobileTab("chat");
      setSidebarScrollEpoch((prev) => prev + 1);
      return;
    }
    if (!inviteToken) return;
    try {
      if (typeof window !== "undefined") {
        window.history.pushState({}, "", `/invite/${inviteToken}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    } catch (err) {
      setNewChatError(err.message || "Unable to open group.");
    }
  }

  async function handleLeaveActiveGroup() {
    if (!activeChat || !["group", "channel"].includes(activeChat.type)) return;
    try {
      const res = await leaveGroupChat(activeChat.id, { username: user.username });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to leave group.");
      }
      closeProfileModal();
      closeChat();
      await loadChats();
    } catch {
      // ignore
    }
  }

  async function handleRemoveGroupMember(member) {
    if (!activeChat || !["group", "channel"].includes(activeChat.type) || !member?.username)
      return;
    try {
      const res = await removeGroupMember(activeChat.id, {
        username: user.username,
        targetUsername: member.username,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to remove member.");
      }
      await loadChats({ silent: true });
    } catch {
      // ignore
    }
  }

  async function handleDeleteAccount(password) {
    if (!user?.username) return;
    const trimmed = String(password || "").trim();
    if (!trimmed) {
      throw new Error("Password is required.");
    }
    const res = await deleteAccount({ username: user.username, password: trimmed });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Unable to delete account.");
    }
    setSettingsPanel(null);
    setShowSettings(false);
    handleLogout();
  }

  async function handleDeleteActiveGroup(password) {
    if (!activeChat || !["group", "channel"].includes(activeChat.type)) return;
    const trimmed = String(password || "").trim();
    if (!trimmed) {
      throw new Error("Password is required.");
    }
    const res = await deleteGroupChat(activeChat.id, {
      username: user.username,
      password: trimmed,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "Unable to delete chat.");
    }
    closeProfileModal();
    closeNewGroupModal();
    closeChat();
    await loadChats();
  }

  const handleStartReached = async () => {
    if (isMobileViewport) return;
    if (!activeChatId || loadingMessages || loadingOlderMessages || !hasOlderMessages) return;
    if (!allowStartReachedRef.current) return;
    const oldestMessage = messages[0];
    const oldestId = Number(oldestMessage?.id || 0);
    const oldestCreatedAt = oldestMessage?.created_at || "";
    if (!oldestId || !oldestCreatedAt) return;
    const scroller = chatScrollRef.current;
    let anchorId = "";
    let anchorOffset = 0;
    if (scroller) {
      const scrollerTop = scroller.getBoundingClientRect().top;
      const messageNodes = Array.from(
        scroller.querySelectorAll("[id^='message-']"),
      );
      const firstVisible = messageNodes.find(
        (node) => node.getBoundingClientRect().bottom > scrollerTop + 1,
      );
      const anchorNode = firstVisible || messageNodes[0];
      if (anchorNode) {
        anchorId = anchorNode.id;
        anchorOffset = anchorNode.getBoundingClientRect().top - scrollerTop;
      }
    }
    setLoadingOlderMessages(true);
    try {
      await loadMessages(activeChatId, {
        silent: true,
        prepend: true,
        beforeId: oldestId,
        beforeCreatedAt: oldestCreatedAt,
        limit: CHAT_PAGE_CONFIG.messagePageSize,
      });
      requestAnimationFrame(() => {
        if (!scroller || !anchorId) return;
        const sameNode = document.getElementById(anchorId);
        if (!sameNode) return;
        const scrollerTop = scroller.getBoundingClientRect().top;
        const nextOffset = sameNode.getBoundingClientRect().top - scrollerTop;
        scroller.scrollTop += nextOffset - anchorOffset;
      });
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const exitSearchMode = () => {
    setChatsSearchFocused(false);
    setChatsSearchQuery("");
    setDiscoverLoading(false);
    setDiscoverUsers([]);
    setDiscoverGroups([]);
    setDiscoverChannels([]);
    setDiscoverSaved(false);
    setSidebarScrollEpoch((prev) => prev + 1);
    if (typeof document !== "undefined") {
      const activeEl = document.activeElement;
      if (activeEl && typeof activeEl.blur === "function") {
        activeEl.blur();
      }
    }
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 0);
    }
  };
  const handleUserScrollIntent = () => {
    allowStartReachedRef.current = true;
  };
  const usernamePattern = /^[a-z0-9._]+$/;

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden md:flex-row md:gap-0"
      style={{
        height: "100%",
        paddingTop: "max(0px, env(safe-area-inset-top))",
        paddingLeft: "max(0px, env(safe-area-inset-left))",
        paddingRight: "max(0px, env(safe-area-inset-right))",
      }}
    >
      <ChatSidebar
        mobileTab={mobileTab}
        isConnected={isConnected}
        isUpdating={isUpdatingChats}
        scrollEpoch={sidebarScrollEpoch}
        editMode={editMode}
        visibleChats={visibleChats}
        selectedChats={selectedChats}
        loadingChats={loadingChats}
        activeChatId={activeChatId}
        user={user}
        formatChatTimestamp={formatChatCardTimestamp}
        requestDeleteChats={requestDeleteChats}
        toggleSelectChat={toggleSelectChat}
        setActiveChatId={setActiveChatId}
        setActivePeer={setActivePeer}
        setMobileTab={setMobileTab}
        setIsAtBottom={setIsAtBottom}
        setUnreadInChat={setUnreadInChat}
        lastMessageIdRef={lastMessageIdRef}
        isAtBottomRef={isAtBottomRef}
        onOpenNewChat={() => setNewChatOpen(true)}
        onOpenNewGroup={openNewGroupModal}
        onOpenNewChannel={openNewChannelModal}
        chatsSearchQuery={chatsSearchQuery}
        onChatsSearchChange={setChatsSearchQuery}
        onChatsSearchFocus={() => {
          if (editMode) {
            handleExitEdit();
          }
          setChatsSearchFocused(true);
        }}
        onChatsSearchBlur={() => {}}
        chatsSearchFocused={chatsSearchFocused}
        onCloseSearch={exitSearchMode}
        discoverLoading={discoverLoading}
        discoverUsers={discoverUsers}
        discoverGroups={discoverGroups}
        discoverChannels={discoverChannels}
        discoverSaved={discoverSaved}
        isSavedChatActive={isActiveSavedChat}
        onOpenDiscoveredUser={openDiscoverUser}
        onOpenDiscoveredGroup={openDiscoverGroup}
        showSettings={showSettings}
        settingsMenuRef={settingsMenuRef}
        setSettingsPanel={setSettingsPanel}
        toggleTheme={toggleTheme}
        setIsDark={setIsDark}
        isDark={isDark}
        handleLogout={handleLogout}
        settingsPanel={settingsPanel}
        displayName={displayName}
        statusDotClass={statusDotClass}
        statusValue={statusValue}
        handleProfileSave={handleProfileSave}
        avatarPreview={avatarPreview}
        profileForm={profileForm}
        handleAvatarChange={handleAvatarChange}
        handleAvatarRemove={handleAvatarRemove}
        setProfileForm={setProfileForm}
        statusSelection={statusSelection}
        setStatusSelection={setStatusSelection}
        handlePasswordSave={handlePasswordSave}
        passwordForm={passwordForm}
        setPasswordForm={setPasswordForm}
        userColor={userColor}
        profileError={profileError}
        passwordError={passwordError}
        fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
        notificationsSupported={notificationsSupported}
        notificationPermission={notificationPermission}
        notificationsEnabled={notificationsEnabled}
        notificationsDisabled={notificationsDisabled}
        notificationStatusLabel={notificationStatusLabel}
        onToggleNotifications={handleToggleNotifications}
        onOpenNotifications={() => setNotificationsModalOpen(true)}
        onTestPush={handleTestPush}
        testNotificationSent={testNotificationSent}
        notificationsDebugLine={notificationsDebugLine}
        onOpenSavedMessages={openSavedMessages}
        onClearCache={handleClearCache}
        dataCacheStats={dataCacheStats}
        onDeleteAccount={handleDeleteAccount}
        onExitEdit={handleExitEdit}
        onEnterEdit={handleEnterEdit}
        onDeleteChats={handleDeleteChats}
        onOpenSettings={handleOpenSettings}
        onOpenOwnProfile={openOwnProfileModal}
        settingsButtonRef={settingsButtonRef}
        displayInitials={displayInitials}
      />

      <ChatWindowPanel
        mobileTab={mobileTab}
        activeChatId={activeChatId}
        closeChat={closeChat}
        activeHeaderPeer={activeHeaderAvatar}
        activeFallbackTitle={activeFallbackTitle}
        peerStatusLabel={activeHeaderSubtitle}
        isGroupChat={isActiveGroupChat}
        isChannelChat={isActiveChannelChat}
        isSavedChat={isActiveSavedChat}
        groupAvatarColor={activeGroupAvatarColor}
        groupAvatarUrl={activeGroupAvatarUrl}
        channelSeenCounts={channelSeenCounts}
        chatScrollRef={chatScrollRef}
        onChatScroll={handleChatScrollWithSeen}
        onStartReached={handleStartReached}
        messages={messages}
        user={user}
        formatTime={formatTime}
        unreadMarkerId={unreadMarkerId}
        loadingMessages={loadingMessages}
        loadingOlderMessages={loadingOlderMessages}
        hasOlderMessages={hasOlderMessages}
        handleSend={handleSend}
        userScrolledUp={userScrolledUp}
        unreadInChat={unreadInChat}
        onJumpToLatest={handleJumpToLatest}
        isConnected={isConnected}
        isDark={isDark}
        insecureConnection={
          typeof window !== "undefined" && window.location.protocol !== "https:"
        }
        pendingUploadFiles={pendingUploadFiles}
        pendingUploadType={pendingUploadType}
        pendingVoiceMessage={pendingVoiceMessage}
        uploadError={uploadError}
        activeUploadProgress={activeUploadProgress}
        messageMaxChars={APP_CONFIG.messageMaxChars}
        onMessageMediaLoaded={handleMessageMediaLoaded}
        onUploadFilesSelected={handleUploadFilesSelected}
        onRemovePendingUpload={removePendingUpload}
        onClearPendingUploads={clearPendingUploads}
        onVoiceRecorded={handleVoiceRecorded}
        onClearPendingVoiceMessage={clearPendingVoiceMessage}
        onMessageInput={handleMessageInput}
        replyTarget={replyTarget}
        onClearReply={handleClearReply}
        onReplyToMessage={handleStartReply}
        onOpenHeaderProfile={openActiveChatProfile}
        onOpenMessageSenderProfile={openMemberProfileFromMessage}
        onOpenMention={openMentionProfile}
        onUserScrollIntent={handleUserScrollIntent}
        fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
        fileUploadInProgress={fileUploadInProgress || activeUploadProgress !== null}
        showComposer={canSendInActiveChat}
        headerClickable={!isActiveSavedChat}
        showStatus={!isActiveSavedChat}
        headerAvatarIcon={activeHeaderAvatarIcon}
        headerAvatarColor={headerAvatarColor}
        mentionRefreshToken={mentionRefreshToken}
      />

      <MobileTabMenu
        hidden={mobileTab === "chat" && activeChatId}
        mobileTab={mobileTab}
        onChats={() => {
          setMobileTab("chats");
          setSettingsPanel(null);
        }}
        onSettings={() => setMobileTab("settings")}
      />

      <NewChatModal
        open={newChatOpen}
        newChatUsername={newChatUsername}
        setNewChatUsername={setNewChatUsername}
        newChatError={newChatError}
        setNewChatError={setNewChatError}
        newChatResults={newChatResults}
        newChatSelection={newChatSelection}
        setNewChatSelection={setNewChatSelection}
        newChatLoading={newChatLoading}
        canStartChat={canStartChat}
        startDirectMessage={startDirectMessage}
        onClose={closeNewChatModal}
      />

      <DeleteChatsModal
        open={confirmDeleteOpen}
        pendingDeleteIds={pendingDeleteIds}
        selectedChats={selectedChats}
        setConfirmDeleteOpen={setConfirmDeleteOpen}
        confirmDeleteChats={confirmDeleteChats}
      />

      <NewGroupModal
        open={newGroupOpen}
        groupForm={newGroupForm}
        setGroupForm={setNewGroupForm}
        groupSearchQuery={newGroupSearch}
        setGroupSearchQuery={setNewGroupSearch}
        groupSearchResults={newGroupSearchResults}
        groupSearchLoading={newGroupSearchLoading}
        selectedGroupMembers={newGroupMembers}
        setSelectedGroupMembers={setNewGroupMembers}
        groupError={newGroupError}
        setGroupError={setNewGroupError}
        creatingGroup={creatingGroup}
        onCreate={handleCreateGroup}
        onClose={closeNewGroupModal}
        title={
          editingGroup
            ? `Edit ${groupModalType === "channel" ? "channel" : "group"}`
            : `New ${groupModalType === "channel" ? "channel" : "group"}`
        }
        submitLabel={editingGroup ? "Save" : "Create"}
        avatarPreview={groupAvatarPreview}
        avatarColor={editingGroup ? activeChat?.group_color || "#10b981" : "#10b981"}
        avatarName={
          newGroupForm.nickname ||
          newGroupForm.username ||
          (groupModalType === "channel" ? "Channel" : "Group")
        }
        onAvatarChange={handleGroupAvatarChange}
        onAvatarRemove={handleGroupAvatarRemove}
        showAvatarField={editingGroup}
        hideSelectedMemberChips={false}
        fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
        showInviteManagement={editingGroup}
        currentInviteLink={editGroupInviteLink}
        regeneratingInviteLink={regeneratingGroupInviteLink}
        onRegenerateInvite={handleRegenerateGroupInvite}
        entityLabel={groupModalType === "channel" ? "Channel" : "Group"}
        onDeleteChat={editingGroup ? handleDeleteActiveGroup : null}
      />

      <GroupInviteLinkModal
        open={groupInviteOpen}
        inviteLink={createdGroupInviteLink}
        onClose={() => setGroupInviteOpen(false)}
      />

      <ChatProfileModal
        open={profileModalOpen}
        chat={
          mentionProfileChat ||
          ((mentionProfileUser || profileModalMember)
            ? { ...(activeChat || {}), type: "dm" }
            : activeChat)
        }
        targetUser={profileTargetUser}
        currentUser={user}
        muted={activeChatMuted}
        inviteLink={profileInviteLink}
        canViewInvite={canCurrentUserViewInvite}
        readOnly={Boolean(
          mentionProfile &&
            mentionProfile.kind !== "user" &&
            !mentionProfileChat?.isMember,
        )}
        showJoinAction={canJoinMentionChat}
        onJoinChat={handleJoinMentionChat}
        showMembers={shouldShowMembersList}
        membersBatchSize={CHAT_PAGE_CONFIG.newChatSearchMaxResults}
        onClose={closeProfileModal}
        onOpenChat={handleOpenProfileChat}
        onToggleMute={() =>
          toggleMuteChat(mentionProfileChat?.id || activeChat?.id)
        }
        onLeaveGroup={() =>
          handleLeaveGroupById(mentionProfileChat?.id || activeChat?.id)
        }
        onOpenMember={openMemberProfileFromList}
        onRemoveMember={handleRemoveGroupMember}
        onEditGroup={openEditGroupFromProfile}
        onEditSelfProfile={openSelfProfileEditor}
      />

      <NotificationsSettingsModal
        open={notificationsModalOpen}
        onClose={() => setNotificationsModalOpen(false)}
        notificationsActive={notificationsActive}
        notificationsDisabled={notificationsDisabled}
        notificationStatusLabel={notificationStatusLabel}
        onToggleNotifications={handleToggleNotifications}
        onTestPush={handleTestPush}
        testNotificationSent={testNotificationSent}
        notificationsEnabled={notificationsEnabled}
        debugLine={notificationsDebugLine}
      />

        {settingsPanel && mobileTab !== "settings" ? (
        <DesktopSettingsModal
          settingsPanel={settingsPanel}
          setSettingsPanel={setSettingsPanel}
          handleProfileSave={handleProfileSave}
          avatarPreview={avatarPreview}
          profileForm={profileForm}
          handleAvatarChange={handleAvatarChange}
          handleAvatarRemove={handleAvatarRemove}
          setProfileForm={setProfileForm}
          statusSelection={statusSelection}
          setStatusSelection={setStatusSelection}
          handlePasswordSave={handlePasswordSave}
          passwordForm={passwordForm}
          setPasswordForm={setPasswordForm}
          userColor={userColor}
          profileError={profileError}
          passwordError={passwordError}
          fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
          onClearCache={handleClearCache}
          dataCacheStats={dataCacheStats}
          currentUser={user}
          onDeleteAccount={handleDeleteAccount}
        />
      ) : null}
    </div>
  );
}







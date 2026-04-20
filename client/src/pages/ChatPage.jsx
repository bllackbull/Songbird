import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MobileTabMenu from "../components/navigation/MobileTabMenu.jsx";
import ChatWindowPanel from "../components/chat/ChatWindowPanel.jsx";
import { ChatSidebar } from "../components/sidebar/index.js";
import AppContextMenu from "../components/context-menu/AppContextMenu.jsx";
import { useAppContextMenu } from "../components/context-menu/useAppContextMenu.js";
import { CHAT_PAGE_CONFIG } from "../settings/chatPageConfig.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import { NICKNAME_MAX, USERNAME_MAX } from "../utils/nameLimits.js";
import { resolveReplyPreview, summarizeFiles, truncateText } from "../utils/messagePreview.js";
import {
  formatBytesAsMb,
  formatChatCardTimestamp,
  formatDayLabel,
  formatTime,
  parseServerDate,
} from "../utils/chatFormat.js";
import { useChatEvents } from "../hooks/chat/useChatEvents.js";
import { useChatScroll } from "../hooks/chat/useChatScroll.js";
import { useChatCacheStats } from "../hooks/chat/useChatCacheStats.js";
import { useChatNotifications } from "../hooks/chat/useChatNotifications.js";
import { useDiscoverSearch } from "../hooks/chat/useDiscoverSearch.js";
import { useActiveChatState } from "../hooks/chat/useActiveChatState.js";
import { useAppActivity } from "../hooks/chat/useAppActivity.js";
import { useDmUsernames } from "../hooks/chat/useDmUsernames.js";
import { useHealthCheck } from "../hooks/chat/useHealthCheck.js";
import { useMessagesLoader } from "../hooks/chat/useMessagesLoader.js";
import { useMobileViewport } from "../hooks/chat/useMobileViewport.js";
import { useNewChatSearch } from "../hooks/chat/useNewChatSearch.js";
import { useNewGroupModal } from "../hooks/chat/useNewGroupModal.js";
import { usePerfTelemetry } from "../hooks/chat/usePerfTelemetry.js";
import { useResumeRefresh } from "../hooks/chat/useResumeRefresh.js";
import { useAppReleaseInfo } from "../hooks/useAppReleaseInfo.js";
import { Bookmark } from "../icons/lucide.js";
import { CLIPBOARD_COPY_EVENT } from "../utils/clipboard.js";
import { CACHE_STORES } from "../utils/cacheDb.js";
import { downloadMessageFiles } from "../utils/fileDownload.js";
import {
  CHAT_CACHE_VERSION,
  buildChatListCacheKey,
  buildMessagesCacheKey,
  canUseIdb,
  deleteIdbCache,
  normalizeMessageBody,
  normalizeMessagesForRender,
  pruneMessagesIndex,
  readChatListCacheAsync,
  readMessagesCacheAsync,
  readMessagesIndexAsync,
  sanitizeMessagesForCache,
  readChannelSeenCacheAsync,
  writeChannelSeenCacheAsync,
  writeIdbCache,
  migrateLocalCacheToIdb,
  updateMessagesIndex,
  writeMessagesIndex,
} from "../utils/chatCache.js";
import { getMessageFiles } from "../utils/messageContent.js";
import {
  createDmChat,
  discoverUsersAndGroups,
  createChannelChat,
  createGroupChat,
  deleteMessage,
  deleteAccount,
  deleteGroupChat,
  editMessage,
  fetchHealth,
  fetchPresence,
  getChatPreview,
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
  sendTypingIndicator,
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
  forwardMessage,
  subscribePush,
  unsubscribePush,
  sendPushTest,
  updatePassword,
  updateProfile,
  updateStatus as updateStatusRequest,
  uploadAvatar,
} from "../api/chatApi.js";
import { APP_CONFIG } from "../settings/appConfig.js";
import {
  MOBILE_CLOSE_ANIMATION_MS,
  NEW_CHAT_SEARCH_DEBOUNCE_MS,
  NOTIFICATION_PREVIEW_MAX_CHARS,
  OPEN_CHAT_ID_KEY,
  PRESENCE_IDLE_THRESHOLD_MS,
  UPLOAD_PROGRESS_HIDE_DELAY_MS,
} from "../utils/chatPageConstants.js";

const loadChatProfileModal = () => import("../components/modals/ChatProfileModal.jsx");
const loadDeleteChatsModal = () => import("../components/modals/DeleteChatsModal.jsx");
const loadDeleteMessageScopeModal = () =>
  import("../components/modals/DeleteMessageScopeModal.jsx");
const loadForwardMessageModal = () =>
  import("../components/modals/ForwardMessageModal.jsx");
const loadLeaveGroupModal = () => import("../components/modals/LeaveGroupModal.jsx");
const loadGroupInviteLinkModal = () => import("../components/modals/GroupInviteLinkModal.jsx");
const loadNewChatModal = () => import("../components/modals/NewChatModal.jsx");
const loadNewGroupModal = () => import("../components/modals/NewGroupModal.jsx");
const loadDesktopSettingsModal = () =>
  import("../components/settings/modals/DesktopSettingsModal.jsx").then((mod) => ({
    default: mod.DesktopSettingsModal,
  }));
const loadNotificationsSettingsModal = () =>
  import("../components/settings/modals/NotificationsSettingsModal.jsx").then((mod) => ({
    default: mod.NotificationsSettingsModal,
  }));
const loadWhatsNewModal = () => import("../components/modals/WhatsNewModal.jsx");

const ChatProfileModal = lazy(loadChatProfileModal);
const DeleteChatsModal = lazy(loadDeleteChatsModal);
const DeleteMessageScopeModal = lazy(loadDeleteMessageScopeModal);
const ForwardMessageModal = lazy(loadForwardMessageModal);
const LeaveGroupModal = lazy(loadLeaveGroupModal);
const GroupInviteLinkModal = lazy(loadGroupInviteLinkModal);
const NewChatModal = lazy(loadNewChatModal);
const NewGroupModal = lazy(loadNewGroupModal);
const DesktopSettingsModal = lazy(loadDesktopSettingsModal);
const NotificationsSettingsModal = lazy(loadNotificationsSettingsModal);
const WhatsNewModal = lazy(loadWhatsNewModal);

const preloadChatPageCriticalChunks = () =>
  Promise.allSettled([
    loadNewChatModal(),
    loadDesktopSettingsModal(),
    loadNotificationsSettingsModal(),
    loadWhatsNewModal(),
  ]);

const preloadChatPageLazyChunks = () =>
  Promise.allSettled([
    loadChatProfileModal(),
    loadDeleteChatsModal(),
    loadDeleteMessageScopeModal(),
    loadForwardMessageModal(),
    loadLeaveGroupModal(),
    loadGroupInviteLinkModal(),
    loadNewChatModal(),
    loadNewGroupModal(),
    loadDesktopSettingsModal(),
    loadNotificationsSettingsModal(),
    loadWhatsNewModal(),
  ]);

const resolveChunkPreloadMode = () => {
  if (typeof navigator === "undefined") return "eager";
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return "eager";
  if (connection.saveData) return "idle";
  const effectiveType = String(connection.effectiveType || "").toLowerCase();
  if (effectiveType === "slow-2g" || effectiveType === "2g") return "idle";
  return "eager";
};

const IN_MEMORY_MESSAGES_CACHE_MAX_CHATS = 8;
const IN_MEMORY_MESSAGES_PER_CHAT = 480;
const IN_MEMORY_MESSAGES_CACHE_STALE_MS = 20 * 60 * 1000;

const pruneMessagesForMemory = (messages) => {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= IN_MEMORY_MESSAGES_PER_CHAT) return list;
  return list.slice(-IN_MEMORY_MESSAGES_PER_CHAT);
};

const normalizeMessagesCachePayloadForMemory = (payload) => {
  if (!payload || !Array.isArray(payload.messages)) return payload;
  const trimmedMessages = pruneMessagesForMemory(payload.messages);
  if (trimmedMessages === payload.messages) return payload;
  const nextLastMessageId = trimmedMessages.length
    ? Number(trimmedMessages[trimmedMessages.length - 1]?.id || 0)
    : 0;
  return {
    ...payload,
    messages: trimmedMessages,
    hasOlderMessages: true,
    lastMessageId: nextLastMessageId,
    updatedAt: Date.now(),
  };
};

const readMessagesCacheMemory = (cacheMap, chatId) => {
  const numericChatId = Number(chatId || 0);
  if (!numericChatId || !cacheMap?.has(numericChatId)) return null;
  const value = cacheMap.get(numericChatId);
  cacheMap.delete(numericChatId);
  cacheMap.set(numericChatId, value);
  return value;
};

const pruneMessagesCacheMemory = (cacheMap, activeChatId = null) => {
  if (!cacheMap || !cacheMap.size) return;
  const activeId = Number(activeChatId || 0);
  const now = Date.now();
  const staleKeys = [];
  cacheMap.forEach((value, key) => {
    const updatedAt = Number(value?.updatedAt || 0);
    if (!updatedAt) return;
    if (activeId && Number(key) === activeId) return;
    if (now - updatedAt > IN_MEMORY_MESSAGES_CACHE_STALE_MS) {
      staleKeys.push(key);
    }
  });
  staleKeys.forEach((key) => cacheMap.delete(key));
  while (cacheMap.size > IN_MEMORY_MESSAGES_CACHE_MAX_CHATS) {
    const oldestKey = cacheMap.keys().next().value;
    if (oldestKey === undefined) break;
    if (activeId && Number(oldestKey) === activeId && cacheMap.size > 1) {
      const activeValue = cacheMap.get(oldestKey);
      cacheMap.delete(oldestKey);
      cacheMap.set(oldestKey, activeValue);
      continue;
    }
    cacheMap.delete(oldestKey);
  }
};

const writeMessagesCacheMemory = (cacheMap, chatId, payload, activeChatId = null) => {
  const numericChatId = Number(chatId || 0);
  if (!numericChatId || !payload || !cacheMap) return;
  const normalized = normalizeMessagesCachePayloadForMemory(payload);
  cacheMap.set(numericChatId, normalized);
  if (cacheMap.size > 1) {
    const current = cacheMap.get(numericChatId);
    cacheMap.delete(numericChatId);
    cacheMap.set(numericChatId, current);
  }
  pruneMessagesCacheMemory(cacheMap, activeChatId || numericChatId);
};

 

export default function ChatPage({ user, setUser, isDark, setIsDark, toggleTheme }) {
  /* eslint-disable react-hooks/exhaustive-deps */
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [channelSeenCounts, setChannelSeenCounts] = useState({});
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileTab, setMobileTab] = useState("chats");
  const [settingsPanel, setSettingsPanel] = useState(null);
  const [chatsSearchFocused, setChatsSearchFocused] = useState(false);
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
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [pendingLeaveChatId, setPendingLeaveChatId] = useState(null);
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
  const [editTarget, setEditTarget] = useState(null);
  const [messageDeleteScopeOpen, setMessageDeleteScopeOpen] = useState(false);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState(null);
  const [forwardMessageTarget, setForwardMessageTarget] = useState(null);
  const [forwardSavedChat, setForwardSavedChat] = useState(null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const updateToastTimerRef = useRef(null);
  const copyToastTimerRef = useRef(null);
  const chatScrollRef = useRef(null);
  const composerInputRef = useRef(null);
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
  const smoothScrollLockRef = useRef(0);
  const pendingUploadFilesRef = useRef([]);
  const pendingVoiceMessageRef = useRef(null);
  const prevUploadProgressRef = useRef(null);
  const mediaLoadSnapTimerRef = useRef(null);
  const messageRefreshTimerRef = useRef(null);
  const channelSeenQueueRef = useRef([]);
  const channelSeenActiveRef = useRef(false);
  const channelSeenLoadedRef = useRef(new Set());
  const channelSeenTimerRef = useRef(null);
  const channelSeenLatestRefreshRef = useRef(0);
  const messagesCacheRef = useRef(new Map());
  const messagesCacheWriteTimerRef = useRef(null);
  const messageBlobUrlsRef = useRef(new Set());
  const [sseConnected, setSseConnected] = useState(false);
  const lazyChunksPreloadedRef = useRef(false);

  useEffect(() => {
    setReplyTarget(null);
    setEditTarget(null);
    setMessageDeleteScopeOpen(false);
    setPendingDeleteMessage(null);
    setForwardMessageTarget(null);
    setForwardSavedChat(null);
  }, [activeChatId]);

  useEffect(() => {
    if (lazyChunksPreloadedRef.current) return;
    let cancelled = false;
    let idleId = null;
    let criticalTimerId = null;
    let timerId = null;
    const mode = resolveChunkPreloadMode();
    const eagerNetwork = mode === "eager";

    const warmCritical = () => {
      if (cancelled) return;
      void preloadChatPageCriticalChunks();
    };

    const warm = () => {
      if (cancelled) return;
      if (lazyChunksPreloadedRef.current) return;
      lazyChunksPreloadedRef.current = true;
      void preloadChatPageLazyChunks();
    };
    const handleFirstIntent = () => {
      warm();
    };
    window.addEventListener("pointerdown", handleFirstIntent, {
      once: true,
      passive: true,
      capture: true,
    });
    window.addEventListener("keydown", handleFirstIntent, {
      once: true,
      passive: true,
      capture: true,
    });

    criticalTimerId = window.setTimeout(warmCritical, eagerNetwork ? 90 : 240);
    if (eagerNetwork) {
      timerId = window.setTimeout(warm, 120);
    } else if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(warm, { timeout: 1500 });
    } else {
      timerId = window.setTimeout(warm, 900);
    }
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", handleFirstIntent, {
        capture: true,
      });
      window.removeEventListener("keydown", handleFirstIntent, {
        capture: true,
      });
      if (
        idleId !== null &&
        typeof window !== "undefined" &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null && typeof window !== "undefined") {
        window.clearTimeout(timerId);
      }
      if (criticalTimerId !== null && typeof window !== "undefined") {
        window.clearTimeout(criticalTimerId);
      }
    };
  }, []);

  const { dataCacheStats, handleClearCache } = useChatCacheStats({
    user,
    settingsPanel,
    messagesCacheRef,
  });
  const {
    appInfo,
    appInfoLoading,
    appInfoError,
    whatsNewOpen,
    openWhatsNew,
    dismissWhatsNew,
  } = useAppReleaseInfo();
  const { isAppActive } = useAppActivity();
  const { isMobileViewport } = useMobileViewport();
  const { isConnected } = useHealthCheck({
    fetchHealth,
    intervalMs: CHAT_PAGE_CONFIG.healthCheckIntervalMs,
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const hasTopLayerModal = Boolean(
      profileModalOpen || (settingsPanel && mobileTab !== "settings"),
    );
    if (hasTopLayerModal) {
      root.style.setProperty("--app-z", "90");
    } else if (isMobileViewport && activeChatId) {
      root.style.setProperty("--app-z", "40");
    } else {
      root.style.setProperty("--app-z", "20");
    }
    return () => {
      root.style.setProperty("--app-z", "20");
    };
  }, [activeChatId, isMobileViewport, mobileTab, profileModalOpen, settingsPanel]);

  const { dmUsernamesRef } = useDmUsernames({ chats, user });
  const {
    notificationsModalOpen,
    setNotificationsModalOpen,
    testNotificationSent,
    notificationsEnabled,
    notificationPermission,
    notificationsSupported,
    notificationsActive,
    notificationsDisabled,
    notificationStatusLabel,
    notificationsDebugLine,
    handleToggleNotifications,
    handleTestPush,
  } = useChatNotifications({
    user,
    settingsPanel,
    fetchPushPublicKey,
    subscribePush,
    unsubscribePush,
    sendPushTest,
  });

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const handleSwMessage = (event) => {
      if (event?.data?.type !== "APP_SHELL_UPDATED") return;
      setIsUpdatingChats(true);
      if (updateToastTimerRef.current) {
        window.clearTimeout(updateToastTimerRef.current);
      }
      updateToastTimerRef.current = window.setTimeout(() => {
        setIsUpdatingChats(false);
      }, 2000);
    };
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      if (updateToastTimerRef.current) {
        window.clearTimeout(updateToastTimerRef.current);
      }
    };
  }, []);

  const showCopiedToast = useCallback(() => {
    setCopyToastVisible(true);
    if (copyToastTimerRef.current) {
      window.clearTimeout(copyToastTimerRef.current);
    }
    copyToastTimerRef.current = window.setTimeout(() => {
      setCopyToastVisible(false);
    }, 1400);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleClipboardCopy = () => {
      showCopiedToast();
    };
    window.addEventListener(CLIPBOARD_COPY_EVENT, handleClipboardCopy);
    return () => {
      window.removeEventListener(CLIPBOARD_COPY_EVENT, handleClipboardCopy);
      if (copyToastTimerRef.current) {
        window.clearTimeout(copyToastTimerRef.current);
      }
    };
  }, [showCopiedToast]);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (activeChatId) {
      window.dispatchEvent(new Event("songbird-hide-install-bar"));
    } else {
      window.dispatchEvent(new Event("songbird-show-install-bar"));
    }
  }, [activeChatId, isMobileViewport]);
  const [microphonePermission, setMicrophonePermission] = useState("unknown");
  const [microphonePermissionSupported, setMicrophonePermissionSupported] =
    useState(false);
  const [permissionPromptDelayUntil, setPermissionPromptDelayUntil] = useState(0);
  const PERMISSION_DISMISS_PREFIX = "songbird-permission-dismiss-";
  const PERMISSION_DISMISS_MS = 3 * 24 * 60 * 60 * 1000;
  const PERMISSION_PROMPT_DELAY_MS = 1000;
  const readPermissionDismissed = (kind) => {
    if (typeof window === "undefined") return false;
    const key = `${PERMISSION_DISMISS_PREFIX}${kind}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= Date.now()) {
      window.localStorage.removeItem(key);
      return false;
    }
    return true;
  };
  const [permissionsDismissed, setPermissionsDismissed] = useState(() => ({
    notification: readPermissionDismissed("notification"),
    microphone: readPermissionDismissed("microphone"),
  }));
  const requestMicrophonePermission = useCallback(async () => {
    if (typeof navigator === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream?.getTracks?.().forEach((track) => track.stop());
      setMicrophonePermission("granted");
    } catch (err) {
      const message = String(err?.name || err?.message || "");
      if (message.toLowerCase().includes("notallowed")) {
        setMicrophonePermission("denied");
      }
    }
  }, []);
  const dismissPermissionsPrompt = useCallback(
    (mode) => {
      if (typeof window === "undefined") return;
      const kind = mode || "notification";
      const key = `${PERMISSION_DISMISS_PREFIX}${kind}`;
      const until = Date.now() + PERMISSION_DISMISS_MS;
      window.localStorage.setItem(key, String(until));
      setPermissionsDismissed((prev) => ({ ...prev, [kind]: true }));
      setPermissionPromptDelayUntil(Date.now() + PERMISSION_PROMPT_DELAY_MS);
    },
    [PERMISSION_DISMISS_MS, PERMISSION_PROMPT_DELAY_MS],
  );
  const requestNotificationsPermission = useCallback(async () => {
    if (notificationPermission !== "default") return;
    await handleToggleNotifications();
  }, [handleToggleNotifications, notificationPermission]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    let active = true;
    let permissionStatus = null;
    const handlePermissionChange = () => {
      if (!active || !permissionStatus) return;
      setMicrophonePermission(permissionStatus.state || "prompt");
    };
    const refresh = async () => {
      const supported = Boolean(navigator.mediaDevices?.getUserMedia);
      if (!active) return;
      setMicrophonePermissionSupported(supported);
      if (!supported) {
        setMicrophonePermission("unsupported");
        return;
      }
      if (!navigator.permissions?.query) {
        setMicrophonePermission("prompt");
        return;
      }
      try {
        permissionStatus = await navigator.permissions.query({
          name: "microphone",
        });
        if (!active) return;
        setMicrophonePermission(permissionStatus.state || "prompt");
        permissionStatus.addEventListener?.("change", handlePermissionChange);
      } catch {
        setMicrophonePermission("prompt");
      }
    };
    refresh();
    return () => {
      active = false;
      permissionStatus?.removeEventListener?.("change", handlePermissionChange);
    };
  }, [isAppActive]);
  const {
    newChatOpen,
    setNewChatOpen,
    newChatUsername,
    setNewChatUsername,
    newChatError,
    setNewChatError,
    newChatResults,
    setNewChatResults,
    newChatLoading,
    newChatSelection,
    setNewChatSelection,
  } = useNewChatSearch({
    user,
    dmUsernamesRef,
    searchUsers,
    debounceMs: NEW_CHAT_SEARCH_DEBOUNCE_MS,
    maxResults: CHAT_PAGE_CONFIG.newChatSearchMaxResults,
  });
  const {
    chatsSearchQuery,
    setChatsSearchQuery,
    discoverLoading,
    discoverUsers,
    discoverGroups,
    discoverChannels,
    discoverSaved,
  } = useDiscoverSearch({
    user,
    discoverUsersAndGroups,
    debounceMs: NEW_CHAT_SEARCH_DEBOUNCE_MS,
    maxResults: CHAT_PAGE_CONFIG.newChatSearchMaxResults,
  });
  const {
    newGroupOpen,
    setNewGroupOpen,
    creatingGroup,
    setCreatingGroup,
    groupModalType,
    setGroupModalType,
    newGroupForm,
    setNewGroupForm,
    newGroupSearch,
    setNewGroupSearch,
    newGroupSearchResults,
    setNewGroupSearchResults,
    newGroupSearchLoading,
    newGroupMembers,
    setNewGroupMembers,
    newGroupError,
    setNewGroupError,
    groupInviteOpen,
    setGroupInviteOpen,
    createdGroupInviteLink,
    setCreatedGroupInviteLink,
    editGroupInviteLink,
    setEditGroupInviteLink,
    regeneratingGroupInviteLink,
    setRegeneratingGroupInviteLink,
  } = useNewGroupModal({
    user,
    chats,
    activeChatId,
    editingGroup,
    searchUsers,
    debounceMs: NEW_CHAT_SEARCH_DEBOUNCE_MS,
    maxResults: CHAT_PAGE_CONFIG.newChatSearchMaxResults,
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
  const [isUpdatingChats, setIsUpdatingChats] = useState(false);
  const [sidebarScrollEpoch, setSidebarScrollEpoch] = useState(0);
  const [activePeer, setActivePeer] = useState(null);
  const [peerPresence, setPeerPresence] = useState({
    status: "offline",
    lastSeen: null,
  });
  const [typingByChat, setTypingByChat] = useState({});

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
  const typingStateRef = useRef({
    chatId: 0,
    isTyping: false,
    lastSentAt: 0,
  });
  const typingStopTimerRef = useRef(null);
  const typingExpiryTimersRef = useRef(new Map());
  const loadChatsAbortRef = useRef(null);
  const loadChatsInFlightRef = useRef(false);
  const queuedLoadChatsOptionsRef = useRef(null);

  const clearUnreadAlignTimers = () => {
    unreadAlignTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    unreadAlignTimersRef.current = [];
  };

  const TYPING_IDLE_TIMEOUT_MS = 3000;
  const TYPING_SIGNAL_THROTTLE_MS = 1500;
  const TYPING_REMOTE_TTL_MS = 5000;

  const clearTypingExpiryTimer = useCallback((chatId, username) => {
    const key = `${Number(chatId || 0)}:${String(username || "").toLowerCase()}`;
    const timer = typingExpiryTimersRef.current.get(key);
    if (timer) {
      window.clearTimeout(timer);
      typingExpiryTimersRef.current.delete(key);
    }
  }, []);

  const removeTypingUser = useCallback((chatId, username) => {
    const normalizedUsername = String(username || "").toLowerCase();
    const numericChatId = Number(chatId || 0);
    if (!numericChatId || !normalizedUsername) return;
    setTypingByChat((prev) => {
      const chatTyping = prev?.[numericChatId];
      if (!chatTyping || !chatTyping[normalizedUsername]) return prev;
      const nextChatTyping = { ...chatTyping };
      delete nextChatTyping[normalizedUsername];
      if (!Object.keys(nextChatTyping).length) {
        const next = { ...prev };
        delete next[numericChatId];
        return next;
      }
      return {
        ...prev,
        [numericChatId]: nextChatTyping,
      };
    });
  }, []);

  const setTypingUser = useCallback(
    (chatId, username, nickname = "") => {
      const normalizedUsername = String(username || "").toLowerCase();
      const numericChatId = Number(chatId || 0);
      if (!numericChatId || !normalizedUsername) return;
      setTypingByChat((prev) => {
        const chatTyping = prev?.[numericChatId] || {};
        const nextChatTyping = {
          ...chatTyping,
          [normalizedUsername]: {
            username: normalizedUsername,
            nickname: String(nickname || "").trim() || normalizedUsername,
            updatedAt: Date.now(),
          },
        };
        return {
          ...prev,
          [numericChatId]: nextChatTyping,
        };
      });
    },
    [],
  );

  const scheduleTypingExpiry = useCallback(
    (chatId, username) => {
      const normalizedUsername = String(username || "").toLowerCase();
      const numericChatId = Number(chatId || 0);
      if (!numericChatId || !normalizedUsername) return;
      clearTypingExpiryTimer(numericChatId, normalizedUsername);
      const key = `${numericChatId}:${normalizedUsername}`;
      const timer = window.setTimeout(() => {
        typingExpiryTimersRef.current.delete(key);
        removeTypingUser(numericChatId, normalizedUsername);
      }, TYPING_REMOTE_TTL_MS);
      typingExpiryTimersRef.current.set(key, timer);
    },
    [clearTypingExpiryTimer, removeTypingUser, TYPING_REMOTE_TTL_MS],
  );

  const sendTypingSignal = useCallback(
    (chatId, isTyping) => {
      const numericChatId = Number(chatId || 0);
      const currentUsername = String(usernameRef.current || "").toLowerCase();
      if (!numericChatId || !currentUsername) return;
      const activeChatType = String(activeChatTypeRef.current || "").toLowerCase();
      if (Boolean(isTyping) && activeChatType === "channel") return;
      const canBroadcastTyping =
        String(user?.status || "").toLowerCase() === "online";
      if (!canBroadcastTyping && Boolean(isTyping)) return;
      sendTypingIndicator({
        chatId: numericChatId,
        username: currentUsername,
        isTyping: Boolean(isTyping),
      }).catch(() => null);
    },
    [user?.status],
  );

  const clearLocalTypingStopTimer = useCallback(() => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
  }, []);

  const stopTypingIndicator = useCallback(
    (chatIdOverride = null) => {
      const targetChatId =
        Number(chatIdOverride || 0) ||
        Number(typingStateRef.current.chatId || activeChatIdRef.current || 0);
      if (!targetChatId) return;
      clearLocalTypingStopTimer();
      if (typingStateRef.current.isTyping) {
        sendTypingSignal(targetChatId, false);
      }
      typingStateRef.current = {
        chatId: targetChatId,
        isTyping: false,
        lastSentAt: Date.now(),
      };
    },
    [clearLocalTypingStopTimer, sendTypingSignal],
  );

  const handleStartReply = (msg) => {
    if (!msg) return;
    const targetId = Number(msg.id || msg._serverId || 0);
    if (!targetId) return;
    setEditTarget(null);
    // In channel chats, show the channel name instead of the message author's name
    const replyName = isActiveChannelChat
      ? (activeChat?.name || "Channel")
      : (msg.nickname || msg.username || msg.replyTo?.nickname || msg.replyTo?.username || "");
    const replyColor = isActiveChannelChat
      ? (activeChat?.group_color || "#10b981")
      : (msg.color || "#10b981");
    const preview = resolveReplyPreview(msg);
    setReplyTarget({
      id: targetId,
      username: msg.username || "",
      nickname: msg.nickname || "",
      body: preview.text,
      icon: preview.icon,
      displayName: replyName || "Unknown",
      color: replyColor,
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

  const handleStartEdit = (msg) => {
    if (!msg) return;
    const targetId = Number(msg.id || msg._serverId || 0);
    if (!targetId) return;
    setReplyTarget(null);
    setEditTarget({
      id: targetId,
      username: msg.username || "",
      nickname: msg.nickname || "",
      displayName:
        msg.nickname || msg.username || activeChat?.name || "Unknown",
      body: msg.body || "",
      files: Array.isArray(msg.files) ? msg.files : [],
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

  const handleClearEdit = () => {
    setEditTarget(null);
  };

  const handleOpenForwardModal = (message) => {
    if (!message) return;
    void (async () => {
      try {
        let savedChat = chats.find((chat) => String(chat?.type || "").toLowerCase() === "saved");
        if (!savedChat) {
          const res = await getSavedMessagesChat(user.username);
          const data = await res.json();
          if (res.ok && Number(data?.id || 0)) {
            savedChat = {
              id: Number(data.id),
              type: "saved",
              name: "Saved messages",
              members: [],
              group_color: "#10b981",
              group_avatar_url: "",
              last_outgoing_time: null,
              last_time: null,
            };
          }
        }
        setForwardSavedChat(savedChat || null);
      } catch {
        // ignore
      } finally {
        setForwardMessageTarget(message);
      }
    })();
  };

  const handleSaveMessageFiles = useCallback((message) => {
    const files = getMessageFiles(message);
    if (!files.length) return;
    downloadMessageFiles(files);
  }, []);

  const handleOpenForwardOrigin = async (target) => {
    if (!target) return;
    if (target.kind === "self") {
      openOwnProfileModal();
      return;
    }
    if (target.kind === "user") {
      openMemberProfileFromList({
        id: Number(target.userId || 0) || null,
        username: target.username || "",
        nickname: target.nickname || "",
        avatar_url: target.avatar_url || "",
        color: target.color || "#10b981",
        status: "online",
        role: "",
      });
      return;
    }
    const numericChatId = Number(target.chatId || 0);
    if (!numericChatId) return;
    let targetChat = chats.find((chat) => Number(chat.id) === numericChatId);
    if (!targetChat) {
      try {
        const res = await getChatPreview({
          chatId: numericChatId,
          username: user.username,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to open forwarded chat.");
        }
        targetChat = {
          id: Number(data?.id || numericChatId),
          type: data?.type || "group",
          name: data?.name || "Chat",
          group_username: data?.username || "",
          group_visibility: data?.visibility || "public",
          group_color: data?.color || "#10b981",
          group_avatar_url: data?.avatarUrl || "",
          invite_token: data?.inviteToken || "",
          membersCount: Number(data?.membersCount || 0),
          members: [],
          _previewOnly: true,
          _isMember: Boolean(data?.isMember),
        };
      } catch {
        return;
      }
    }
    if (String(targetChat.type || "").toLowerCase() === "dm") {
      const peer = (targetChat.members || []).find(
        (member) =>
          String(member?.username || "").toLowerCase() !==
          String(user?.username || "").toLowerCase(),
      );
      if (peer) {
        openMemberProfileFromList(peer);
      }
      return;
    }
    setMentionProfile({
      kind: String(targetChat.type || "group").toLowerCase(),
      chatId: Number(targetChat.id || 0),
      name: targetChat.name || "Chat",
      username: targetChat.group_username || "",
      visibility: targetChat.group_visibility || "public",
      color: targetChat.group_color || "#10b981",
      avatarUrl: targetChat.group_avatar_url || "",
      inviteToken: targetChat.invite_token || "",
      membersCount:
        Array.isArray(targetChat.members) && targetChat.members.length
          ? targetChat.members.length
          : Number(targetChat.membersCount || 0),
      isMember:
        targetChat._previewOnly === true
          ? Boolean(targetChat._isMember)
          : true,
    });
    setProfileModalOpen(true);
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
    cancelSmoothScroll,
  } = useChatScroll({
    activeChatId,
    canMarkReadInCurrentView,
    chatScrollRef,
    clearUnreadAlignTimers,
    smoothScrollLockRef,
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
    const nextBlobUrls = new Set();
    const appendIfBlob = (value) => {
      const url = String(value || "");
      if (url.startsWith("blob:")) {
        nextBlobUrls.add(url);
      }
    };
    messages.forEach((msg) => {
      const pendingFiles = Array.isArray(msg?._files) ? msg._files : [];
      pendingFiles.forEach((file) => {
        appendIfBlob(file?._localUrl);
        appendIfBlob(file?.url);
      });
      const messageFiles = Array.isArray(msg?.files) ? msg.files : [];
      messageFiles.forEach((file) => {
        appendIfBlob(file?._localUrl);
        appendIfBlob(file?.url);
      });
    });

    messageBlobUrlsRef.current.forEach((url) => {
      if (nextBlobUrls.has(url)) return;
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore invalid/revoked object URLs
      }
    });
    messageBlobUrlsRef.current = nextBlobUrls;
  }, [messages]);

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
      messageBlobUrlsRef.current.forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore invalid/revoked object URLs
        }
      });
      messageBlobUrlsRef.current.clear();
      clearUnreadAlignTimers();
    };
  }, [pendingGroupAvatarFile]);

  useEffect(() => {
    if (!user) return;
    setPendingAvatarFile(null);
    setProfileForm({
      nickname: user.nickname || "",
      username: user.username || "",
      avatarUrl: user.avatarUrl || "",
    });
    setAvatarPreview(user.avatarUrl || "");
    setStatusSelection(user.status || "online");
  }, [user]);

  useEffect(() => {
    if (!user?.username) return;
    if (!canUseIdb()) return;
    let isActive = true;
    void (async () => {
      const idbCached = await readChatListCacheAsync(user.username);
      if (!isActive || !idbCached) return;
      if (!Array.isArray(idbCached.chats) || idbCached.chats.length === 0)
        return;
      const normalizedCached = idbCached.chats.map((chat) => ({
        ...chat,
        last_message: normalizeMessageBody(chat.last_message),
      }));
      setChats((prev) => (prev.length ? prev : normalizedCached));
      setLoadingChats(false);
    })();
    return () => {
      isActive = false;
    };
  }, [user?.username]);

  useEffect(() => {
    if (!user?.username) return;
    void migrateLocalCacheToIdb(user.username);
  }, [user?.username]);

  useEffect(() => {
    if (!user?.username) return;
    pruneMessagesCacheMemory(messagesCacheRef.current, activeChatIdRef.current);
  }, [user?.username]);

  useEffect(() => {
    pruneMessagesCacheMemory(messagesCacheRef.current, activeChatId);
  }, [activeChatId, chats.length]);

  useEffect(() => {
    if (!user?.username) return;
    const pruneIndex = (items) => {
      if (!items.length) return;
      const now = Date.now();
      const filtered = items.filter((entry) => {
        const chatId = Number(entry?.chatId);
        const updatedAt = Number(entry?.updatedAt);
        if (!chatId || !Number.isFinite(updatedAt)) return false;
        if (now - updatedAt > CHAT_PAGE_CONFIG.cacheTtlMs) {
          void deleteIdbCache(CACHE_STORES.messages, buildMessagesCacheKey(user.username, chatId));
          return false;
        }
        return true;
      });
      const trimmed = pruneMessagesIndex(user.username, filtered);
      if (trimmed.length !== items.length) {
        writeMessagesIndex(user.username, trimmed);
      }
    };
    if (!canUseIdb()) return;
    let isActive = true;
    void (async () => {
      const idbIndex = await readMessagesIndexAsync(user.username);
      if (!isActive || !idbIndex.length) return;
      pruneIndex(idbIndex);
    })();
    return () => {
      isActive = false;
    };
  }, [user?.username]);

  useEffect(() => {
    if (user) {
      void loadChats({ showUpdating: true });
    }
  }, [user]);

  useEffect(() => {
    return () => {
      messagesCacheRef.current.clear();
      if (mediaLoadSnapTimerRef.current) {
        window.clearTimeout(mediaLoadSnapTimerRef.current);
      }
      if (messageRefreshTimerRef.current) {
        window.clearTimeout(messageRefreshTimerRef.current);
      }
      if (channelSeenTimerRef.current) {
        window.clearTimeout(channelSeenTimerRef.current);
      }
      if (loadChatsAbortRef.current) {
        loadChatsAbortRef.current.abort();
        loadChatsAbortRef.current = null;
      }
      loadChatsInFlightRef.current = false;
      queuedLoadChatsOptionsRef.current = null;
    };
  }, []);

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

  const getNetworkBackoffMultiplier = () => {
    if (typeof navigator === "undefined") return 1;
    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return 1;
    let factor = 1;
    if (connection.saveData) {
      factor = Math.max(factor, 2.2);
    }
    const effectiveType = String(connection.effectiveType || "").toLowerCase();
    if (effectiveType === "slow-2g" || effectiveType === "2g") {
      factor = Math.max(factor, 2.5);
    } else if (effectiveType === "3g") {
      factor = Math.max(factor, 1.6);
    }
    return factor;
  };

  useEffect(() => {
    if (!user || sseConnected || !isAppActive) return;
    const backoff = getNetworkBackoffMultiplier();
    const intervalMs = Math.max(
      3000,
      Math.round(CHAT_PAGE_CONFIG.chatsRefreshIntervalMs * backoff),
    );
    const interval = setInterval(() => {
      void loadChats({ silent: true });
    }, intervalMs);
    return () => clearInterval(interval);
  }, [user, sseConnected, isAppActive]);

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
    if (user && activeChatId) {
      const openedChatId = Number(activeChatId);
      const openedChat = chats.find((chat) => chat.id === openedChatId);
      let cached = readMessagesCacheMemory(messagesCacheRef.current, openedChatId) || null;
      // IDB async load below will hydrate if needed.
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
      // MOBILE FIX: Always respect messageFetchLimit, even on mobile.
      // Loading 10,000 messages causes severe performance issues on mobile devices.
      // Messages will be paginated as user scrolls - no need to load everything at once.
      const initialLimit = Math.min(
        CHAT_PAGE_CONFIG.messageFetchLimit,
        Math.max(
          CHAT_PAGE_CONFIG.messageFetchLimit,
          unreadCount > 0 ? Math.min(unreadCount + 120, CHAT_PAGE_CONFIG.messageFetchLimit) : 0,
        ),
      );
      const canMarkReadNow = !isMobileViewport || mobileTab === "chat";
      const isAppActiveNow =
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        document.hasFocus();
      if (user?.username && canUseIdb()) {
        const activeId = openedChatId;
        void (async () => {
          const idbCached = await readMessagesCacheAsync(user.username, activeId);
          if (!idbCached || !Array.isArray(idbCached.messages)) return;
          if (Number(activeChatIdRef.current) !== activeId) return;
          writeMessagesCacheMemory(
            messagesCacheRef.current,
            activeId,
            idbCached,
            activeChatIdRef.current,
          );
          setMessages((prev) =>
            prev.length ? prev : normalizeMessagesForRender(idbCached.messages),
          );
          setHasOlderMessages(Boolean(idbCached?.hasOlderMessages));
          lastMessageIdRef.current =
            Number(idbCached?.lastMessageId || 0) || lastMessageIdRef.current;
          setLoadingMessages(false);
        })();
      }
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
    return () => {
      const current = typingStateRef.current;
      if (current.isTyping && current.chatId) {
        sendTypingSignal(current.chatId, false);
      }
      clearLocalTypingStopTimer();
      typingExpiryTimersRef.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
      typingExpiryTimersRef.current.clear();
    };
  }, [clearLocalTypingStopTimer, sendTypingSignal]);

  useEffect(() => {
    const status = String(user?.status || "").toLowerCase();
    if (status !== "online") {
      stopTypingIndicator(activeChatIdRef.current);
    }
  }, [stopTypingIndicator, user?.status]);

  useEffect(() => {
    const currentState = typingStateRef.current;
    const currentChatId = Number(activeChatId || 0);
    if (!currentState.isTyping) return;
    if (!currentState.chatId || currentState.chatId === currentChatId) return;
    sendTypingSignal(currentState.chatId, false);
    clearLocalTypingStopTimer();
    typingStateRef.current = {
      chatId: currentState.chatId,
      isTyping: false,
      lastSentAt: Date.now(),
    };
  }, [activeChatId, clearLocalTypingStopTimer, sendTypingSignal]);

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

  const {
    activeId,
    visibleChats,
    activeChat,
    activeMembers,
    isActiveGroupChat,
    isActiveChannelChat,
    isActiveSavedChat,
    canSendInActiveChat,
    activeGroupMemberUsernames,
    activeGroupMemberUsernamesKey,
    activeHeaderPeer,
    activeFallbackTitle,
    activeHeaderAvatar,
    activeGroupAvatarColor,
    activeGroupAvatarUrl,
    headerAvatarColor,
  } = useActiveChatState({
    chats,
    chatsSearchQuery,
    user,
    activeChatId,
    activeChatIdRef,
    activeChatTypeRef,
    activePeer,
  });
  const activeHeaderAvatarIcon = isActiveSavedChat ? (
    <Bookmark size={18} className="text-white" />
  ) : null;

  useEffect(() => {
    if (canSendInActiveChat) return;
    stopTypingIndicator(activeChatIdRef.current);
  }, [canSendInActiveChat, stopTypingIndicator]);

  const {
    loadMessages,
    loadingMessages,
    setLoadingMessages,
    hasOlderMessages,
    setHasOlderMessages,
  } = useMessagesLoader({
    user,
    chats,
    activeChat,
    activeChatIdRef,
    activeChatTypeRef,
    isActiveChannelChat,
    isAppActive,
    isMobileViewport,
    mobileTab,
    setMessages,
    setUnreadInChat,
    setUnreadMarkerId,
    setUserScrolledUp,
    setIsAtBottom,
    setChannelSeenCounts,
    lastMessageIdRef,
    openingChatRef,
    openingUnreadCountRef,
    openingHadUnreadRef,
    pendingScrollToUnreadRef,
    unreadMarkerIdRef,
    pendingScrollToBottomRef,
    userScrolledUpRef,
    isAtBottomRef,
    unreadAnchorLockUntilRef,
    shouldAutoMarkReadRef,
    allowStartReachedRef,
    formatDayLabel,
    formatTime,
    parseServerDate,
    resolveReplyPreview,
    normalizeMessageBody,
    CHAT_PAGE_CONFIG,
    listMessagesByQuery,
    markMessagesRead,
  });
  usePerfTelemetry({
    activeChatId,
    messagesLength: messages.length,
    loadingMessages,
  });

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
    if (canUseIdb()) {
      let isActive = true;
      void (async () => {
        const counts = await readChannelSeenCacheAsync(
          user?.username,
          activeChatId,
        );
        if (isActive) {
          setChannelSeenCounts(counts);
        }
      })();
      requestAnimationFrame(() => {
        enqueueChannelSeenCounts();
      });
      return () => {
        isActive = false;
      };
    }
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
    if (!canUseIdb()) return;
    void writeChannelSeenCacheAsync(
      user?.username,
      activeChatId,
      channelSeenCounts,
    );
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
  const handleOpenWhatsNew = () => {
    setShowSettings(false);
    openWhatsNew();
  };

  const displayName = user.nickname || user.username;
  const displayInitials = getAvatarInitials(displayName);
  const statusValue = user.status || "online";
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
  const activeTypingUsers = useMemo(() => {
    const chatId = Number(activeChatId || 0);
    if (!chatId) return [];
    const typingMap = typingByChat?.[chatId];
    if (!typingMap || typeof typingMap !== "object") return [];
    const selfUsername = String(user?.username || "").toLowerCase();
    const membersByUsername = new Map(
      (Array.isArray(activeMembers) ? activeMembers : []).map((member) => [
        String(member?.username || "").toLowerCase(),
        member,
      ]),
    );
    return Object.values(typingMap)
      .map((entry) => ({
        username: String(entry?.username || "").toLowerCase(),
        nickname: String(entry?.nickname || "").trim(),
      }))
      .filter((entry) => entry.username && entry.username !== selfUsername)
      .filter((entry) => {
        if (isActiveGroupChat || isActiveChannelChat) return true;
        const peerUsername = String(activeHeaderPeer?.username || "").toLowerCase();
        return peerUsername && entry.username === peerUsername;
      })
      .map((entry) => {
        const member = membersByUsername.get(entry.username);
        const displayName =
          String(member?.nickname || "").trim() ||
          String(entry.nickname || "").trim() ||
          String(member?.username || "").trim() ||
          entry.username;
        return {
          username: entry.username,
          displayName,
        };
      });
  }, [
    activeChatId,
    activeHeaderPeer?.username,
    activeMembers,
    isActiveChannelChat,
    isActiveGroupChat,
    typingByChat,
    user?.username,
  ]);
  const buildTypingDisplayName = useCallback((value, maxChars = 22) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }, []);
  const typingIndicator = useMemo(() => {
    if (!activeTypingUsers.length) return null;
    if (isActiveChannelChat) return null;
    if (isActiveGroupChat) {
      if (activeTypingUsers.length === 1) {
        const name = buildTypingDisplayName(activeTypingUsers[0].displayName, 28);
        return {
          type: "group_single",
          name,
          label: name,
          fullLabel: activeTypingUsers[0].displayName,
        };
      }
      if (activeTypingUsers.length === 2) {
        const first = buildTypingDisplayName(activeTypingUsers[0].displayName, 16);
        const second = buildTypingDisplayName(activeTypingUsers[1].displayName, 16);
        return {
          type: "group_pair",
          firstName: first,
          secondName: second,
          label: `${first} and ${second}`,
          fullLabel: `${activeTypingUsers[0].displayName} and ${activeTypingUsers[1].displayName}`,
        };
      }
      const first = buildTypingDisplayName(activeTypingUsers[0].displayName, 18);
      const othersCount = activeTypingUsers.length - 1;
      return {
        type: "group_multi",
        label: `${first} and ${othersCount.toLocaleString("en-US")} others`,
        fullLabel: `${activeTypingUsers[0].displayName} and ${othersCount.toLocaleString("en-US")} others`,
      };
    }
    return {
      type: "dm",
      label: "typing",
    };
  }, [activeTypingUsers, buildTypingDisplayName, isActiveChannelChat, isActiveGroupChat]);
  const activeMembersLabel = Number(activeMembers.length || 0)
    .toLocaleString("en-US");
  const activeHeaderSubtitle = isActiveGroupChat || isActiveChannelChat
    ? `${activeMembersLabel} member${activeMembers.length === 1 ? "" : "s"}`
    : isActiveSavedChat
      ? ""
      : peerStatusLabel;
  const resolvedHeaderSubtitle =
    !isActiveSavedChat && typingIndicator?.label
      ? typingIndicator.label
      : activeHeaderSubtitle;
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
  const canSwipeReply = !isActiveChannelChat || canCurrentUserEditGroup;
  const canCurrentUserViewInvite = Boolean(
    !mentionProfile &&
    (isActiveGroupChat || isActiveChannelChat) &&
      (canCurrentUserEditGroup || Boolean(Number(activeChat?.allow_member_invites || 0))),
  );

  const handleMarkChatSeen = useCallback(
    async (chat) => {
      const chatId = Number(chat?.id || 0);
      if (!chatId) return;
      setChats((prev) =>
        prev.map((item) =>
          Number(item.id) === chatId ? { ...item, unread_count: 0 } : item,
        ),
      );
      if (Number(activeChatId || 0) === chatId) {
        setUnreadInChat(0);
      }
      try {
        await markMessagesRead({ chatId, username: user.username });
      } catch {
        // Keep the UI quiet for now; this menu is intentionally lightweight.
      }
    },
    [activeChatId, user.username],
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

  const canDeleteMessageForEveryone = useCallback(
    (message) => {
      if (String(activeChat?.type || "").toLowerCase() === "saved") return false;
      const messageAuthor = String(message?.username || "").toLowerCase();
      const currentUsername = String(user?.username || "").toLowerCase();
      if (!messageAuthor) return false;
      if (messageAuthor === currentUsername) return true;
      return canCurrentUserEditGroup;
    },
    [activeChat?.type, canCurrentUserEditGroup, user?.username],
  );

  const canEditMessageFromContext = useCallback(
    (message) =>
      String(message?.username || "").toLowerCase() ===
      String(user?.username || "").toLowerCase(),
    [user?.username],
  );

  function handleDeleteMessageRequest(message, options = {}) {
    if (!message) return;
    const allowDeleteForEveryone =
      options?.allowDeleteForEveryone ?? canDeleteMessageForEveryone(message);
    setPendingDeleteMessage(message);
    setMessageDeleteScopeOpen(true);
  }

  async function handleForwardMessageSubmit(targetChatIds = []) {
    const sourceMessageId = Number(
      forwardMessageTarget?._serverId || forwardMessageTarget?.id || 0,
    );
    if (!sourceMessageId || !user?.username || !activeChatId) return;

    const originalAuthorLabel = String(
      forwardMessageTarget?.nickname ||
        forwardMessageTarget?.username ||
        user?.nickname ||
        user?.username ||
        "yourself",
    ).trim();
    const originalForwardLabel = isActiveChannelChat
      ? String(activeChat?.name || activeFallbackTitle || "Channel").trim()
      : originalAuthorLabel;

    const body = String(forwardMessageTarget?.body || "");

    try {
      const res = await forwardMessage({
        username: user.username,
        sourceMessageId,
        targetChatIds,
        body,
        forwardedFromChatId: isActiveChannelChat ? Number(activeChatId) : null,
        forwardedFromLabel: originalForwardLabel,
        forwardedFromUserId: isActiveChannelChat
          ? null
          : Number(forwardMessageTarget?.user_id || 0) || Number(user?.id || 0) || null,
        forwardedFromUsername: isActiveChannelChat
          ? ""
          : String(
              forwardMessageTarget?.username || user?.username || "",
            ).trim(),
        forwardedFromAvatarUrl: isActiveChannelChat
          ? ""
          : String(
              forwardMessageTarget?.avatar_url || user?.avatarUrl || "",
            ).trim(),
        forwardedFromColor: isActiveChannelChat
          ? ""
          : String(
              forwardMessageTarget?.color || user?.color || "#10b981",
            ).trim(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to forward message.");
      }
      setForwardMessageTarget(null);
      setForwardSavedChat(null);
      await loadChats({ silent: true });
    } catch (error) {
      setUploadError(String(error?.message || "Unable to forward message."));
    }
  }

  const requestLeaveGroupById = (chatId) => {
    const id = Number(chatId || 0);
    if (!id) return;
    setPendingLeaveChatId(id);
    setConfirmLeaveOpen(true);
  };

  const confirmLeaveGroupById = async () => {
    const id = Number(pendingLeaveChatId || 0);
    if (!id) return;
    setConfirmLeaveOpen(false);
    setPendingLeaveChatId(null);
    await handleLeaveGroupById(id);
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

  useResumeRefresh({
    isAppActive,
    user,
    loadChatsRef,
    scheduleMessageRefreshRef,
    activeChatIdRef,
  });

  const pruneDeletedMessagesFromCache = useCallback(
    (chatId, messageIds = []) => {
      const numericChatId = Number(chatId || 0);
      const deletedIds = Array.from(
        new Set(
          (Array.isArray(messageIds) ? messageIds : [])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      );
      if (!numericChatId || !deletedIds.length) return;
      const deletedSet = new Set(deletedIds);

      const pruneCachePayload = (cached) => {
        if (!cached || !Array.isArray(cached.messages)) {
          return { changed: false, value: cached };
        }
        const nextMessages = cached.messages.filter((msg) => {
          const serverId = Number(msg?._serverId || msg?.id || 0);
          return !deletedSet.has(serverId);
        });
        if (nextMessages.length === cached.messages.length) {
          return { changed: false, value: cached };
        }
        return {
          changed: true,
          value: {
            ...cached,
            messages: nextMessages,
            lastMessageId: nextMessages.length
              ? Number(nextMessages[nextMessages.length - 1]?.id || 0)
              : 0,
            updatedAt: Date.now(),
          },
        };
      };

      const memoryCached = readMessagesCacheMemory(
        messagesCacheRef.current,
        numericChatId,
      );
      const nextMemory = pruneCachePayload(memoryCached);
      if (nextMemory.changed) {
        writeMessagesCacheMemory(
          messagesCacheRef.current,
          numericChatId,
          nextMemory.value,
          activeChatIdRef.current,
        );
      }

      if (!user?.username || !canUseIdb()) return;
      const key = buildMessagesCacheKey(user.username, numericChatId);
      void (async () => {
        const idbCached = await readMessagesCacheAsync(user.username, numericChatId);
        const nextIdb = pruneCachePayload(idbCached);
        if (!nextIdb.changed) return;
        await writeIdbCache(CACHE_STORES.messages, key, nextIdb.value);
        await updateMessagesIndex(
          user.username,
          numericChatId,
          Number(nextIdb.value?.updatedAt || Date.now()),
        );
      })();
    },
    [user?.username],
  );

  function applyDeletedMessageLocally(messageId) {
    const numericMessageId = Number(messageId || 0);
    if (!numericMessageId) return;
    setMessages((prev) =>
      prev.filter((msg) => Number(msg?._serverId || msg?.id || 0) !== numericMessageId),
    );
    if (activeChatId) {
      pruneDeletedMessagesFromCache(activeChatId, [numericMessageId]);
    }
  }

  async function performDeleteMessage(message, scope = "self") {
    const messageId = Number(message?.id || message?._serverId || 0);
    if (!activeChatId || !messageId || !user?.username) return;
    try {
      const res = await deleteMessage({
        chatId: Number(activeChatId),
        username: user.username,
        messageId,
        scope,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to delete message.");
      }
      applyDeletedMessageLocally(messageId);
      await loadChats({ silent: true });
    } catch (error) {
      setUploadError(String(error?.message || "Unable to delete message."));
    } finally {
      setMessageDeleteScopeOpen(false);
      setPendingDeleteMessage(null);
    }
  }

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
      const payloadChatId = Number(payload?.chatId || 0);
      const sender = String(payload?.username || "").trim().toLowerCase();
      if (payloadChatId && sender) {
        clearTypingExpiryTimer(payloadChatId, sender);
        removeTypingUser(payloadChatId, sender);
      }
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (!notificationsActive) return;
      const senderName = String(payload?.username || "").trim();
      const isOwnEvent =
        senderName.toLowerCase() === String(user?.username || "").toLowerCase();
      if (isOwnEvent) return;
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
        } else if (chat.type === "group") {
          const groupName = chat.name || "Group";
          const senderLabel = senderName
            ? (() => {
                const senderMember = (chat.members || []).find(
                  (member) =>
                    String(member?.username || "").toLowerCase() ===
                    String(senderName || "").toLowerCase(),
                );
                return (
                  senderMember?.nickname ||
                  senderMember?.username ||
                  String(payload?.nickname || "").trim() ||
                  senderName
                );
              })()
            : "";
          title = senderLabel ? `${groupName} (${senderLabel})` : groupName;
        } else {
          title = chat.name || "Chat";
        }
      } else if (senderName) {
        title = senderName;
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
          : senderName
            ? `New message from ${senderName}.`
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
    onMessageDeleted: (payload) => {
      const payloadChatId = Number(payload?.chatId || 0);
      const messageIds = Array.isArray(payload?.messageIds)
        ? payload.messageIds
        : [];
      pruneDeletedMessagesFromCache(payloadChatId, messageIds);
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
    onTypingUpdate: (payload) => {
      const payloadChatId = Number(payload?.chatId || 0);
      const sender = String(payload?.username || "").toLowerCase();
      if (!payloadChatId || !sender) return;
      if (sender === String(user?.username || "").toLowerCase()) return;
      const chat = chats.find((item) => Number(item?.id) === payloadChatId);
      if (String(chat?.type || "").toLowerCase() === "channel") {
        clearTypingExpiryTimer(payloadChatId, sender);
        removeTypingUser(payloadChatId, sender);
        return;
      }
      const isTyping = Boolean(payload?.isTyping);
      if (!isTyping) {
        clearTypingExpiryTimer(payloadChatId, sender);
        removeTypingUser(payloadChatId, sender);
        return;
      }
      setTypingUser(payloadChatId, sender, payload?.nickname || payload?.username || sender);
      scheduleTypingExpiry(payloadChatId, sender);
    },
    onChatListChanged: (payload) => {
      const deletedChatId = Number(payload?.chatId || 0);
      const currentActiveId = Number(activeChatIdRef.current || 0);
      if (deletedChatId) {
        setTypingByChat((prev) => {
          if (!prev?.[deletedChatId]) return prev;
          const next = { ...prev };
          delete next[deletedChatId];
          return next;
        });
      }
      // If the deleted/changed chat is the active one, close it
      if (deletedChatId && deletedChatId === currentActiveId) {
        closeChat();
      }
    },
    onSessionRevoked: () => {
      handleLogout();
    },
  });

  useEffect(() => {
    loadChatsRef.current = loadChats;
    scheduleMessageRefreshRef.current = scheduleMessageRefresh;
  });

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
      if (pendingMessage._editMessageId) {
        form.append("editMessageId", String(pendingMessage._editMessageId));
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
    const isEditingExistingMessage = Number(pendingMessage?._editMessageId || 0) > 0;
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
        const res = isEditingExistingMessage
          ? await editMessage({
              username: user.username,
              body: pendingMessage.body,
              chatId: targetChatId,
              messageId: pendingMessage._editMessageId,
            })
          : await sendMessage({
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

      if (isEditingExistingMessage) {
        if (hasFiles && isTargetActive) {
          setActiveUploadProgress(100);
          setTimeout(() => setActiveUploadProgress(null), UPLOAD_PROGRESS_HIDE_DELAY_MS);
        }
        if (isTargetActive) {
          scheduleMessageRefreshRef.current?.(targetChatId, {
            preserveHistory: true,
            pruneMissing: true,
          });
        }
        await loadChats({ silent: true });
        setEditTarget(null);
        return;
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
          const awaitingServerEcho = Boolean(serverId);
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
                    _awaitingServerEcho: awaitingServerEcho,
                    _uploadProgress: 100,
                    expiresAt:
                      hasFiles
                        ? msg.expiresAt
                        : data?.expiresAt || msg.expiresAt || null,
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
          const pendingBody = String(pendingMessage?.body || "").trim();
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
              _awaitingServerEcho: awaitingServerEcho,
              _processingPending: keepPendingUntilServerEcho,
              _serverId: serverId,
              expiresAt: hasFiles ? null : data?.expiresAt || null,
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
      // Keep optimistic row stable and let SSE/polling reconcile the final server row.
      // Avoid forcing a full sidebar refresh on every successful send.
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
    if (!activeChatId || !isAppActive) return;
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
  }, [activeChatId, messages, isAppActive]);

  useEffect(() => {
    if (!activeChatId || !isAppActive) return;
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
    const backoff = getNetworkBackoffMultiplier();
    const mediaSyncIntervalMs = Math.max(2000, Math.round(2500 * backoff));
    const interval = setInterval(() => {
      void loadMessages(activeChatId, { silent: true, preserveHistory: true });
    }, mediaSyncIntervalMs);
    return () => clearInterval(interval);
  }, [activeChatId, messages, user.username, isMobileViewport, sseConnected, isAppActive]);

  useEffect(() => {
    if (!activeChatId) return;
    const cachePayload = {
      chatId: Number(activeChatId),
      version: CHAT_CACHE_VERSION,
      messages,
      hasOlderMessages,
      lastMessageId: messages.length ? Number(messages[messages.length - 1]?.id || 0) : 0,
      updatedAt: Date.now(),
    };
    writeMessagesCacheMemory(
      messagesCacheRef.current,
      Number(activeChatId),
      cachePayload,
      activeChatIdRef.current,
    );
    if (user?.username) {
      const storagePayload = {
        ...cachePayload,
        messages: sanitizeMessagesForCache(messages),
      };
      if (messagesCacheWriteTimerRef.current) {
        clearTimeout(messagesCacheWriteTimerRef.current);
      }
      messagesCacheWriteTimerRef.current = setTimeout(() => {
        const key = buildMessagesCacheKey(user.username, activeChatId);
        void writeIdbCache(CACHE_STORES.messages, key, storagePayload);
        void updateMessagesIndex(user.username, activeChatId, cachePayload.updatedAt);
      }, 600);
    }
    return () => {
      if (messagesCacheWriteTimerRef.current) {
        clearTimeout(messagesCacheWriteTimerRef.current);
      }
    };
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
    if (loadChatsInFlightRef.current) {
      const queued = {
        silent: Boolean(options.silent),
        showUpdating: Boolean(options.showUpdating),
      };
      if (queuedLoadChatsOptionsRef.current) {
        queuedLoadChatsOptionsRef.current = {
          silent:
            queuedLoadChatsOptionsRef.current.silent && queued.silent,
          showUpdating:
            queuedLoadChatsOptionsRef.current.showUpdating || queued.showUpdating,
        };
      } else {
        queuedLoadChatsOptionsRef.current = queued;
      }
      return;
    }
    loadChatsInFlightRef.current = true;
    if (loadChatsAbortRef.current) {
      loadChatsAbortRef.current.abort();
    }
    const controller = new AbortController();
    loadChatsAbortRef.current = controller;
    const showUpdating = Boolean(options.showUpdating);
    if (!options.silent) {
      setLoadingChats(true);
    }
    if (showUpdating) {
      setIsUpdatingChats(true);
    }
    try {
      const res = await listChatsForUser(user.username, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load chats.");
      }
      const list = (data.chats || []).map((conv) => ({
        ...conv,
        id: Number(conv.id),
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
        const existingLastMessageId = Number(existing.last_message_id || 0);
        const nextLastMessageId = Number(chat.last_message_id || 0);
        if (nextLastMessageId !== existingLastMessageId) {
          if (nextLastMessageId > existingLastMessageId) {
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
      const chatListPayload = {
        version: CHAT_CACHE_VERSION,
        updatedAt: Date.now(),
        chats: normalizedPatched,
      };
      void writeIdbCache(
        CACHE_STORES.chatList,
        buildChatListCacheKey(user.username),
        chatListPayload,
      );

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
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      // Keep sidebar usable even when polling fails.
    } finally {
      if (loadChatsAbortRef.current === controller) {
        loadChatsAbortRef.current = null;
      }
      loadChatsInFlightRef.current = false;
      const queued = queuedLoadChatsOptionsRef.current;
      queuedLoadChatsOptionsRef.current = null;
      if (!options.silent) {
        setLoadingChats(false);
      }
      if (showUpdating) {
        setIsUpdatingChats(false);
      }
      if (queued) {
        void loadChats(queued);
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
    if (activeChatId && !userScrolledUpRef.current) {
      pendingScrollToBottomRef.current = true;
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
    if (activeChatId && !userScrolledUpRef.current) {
      pendingScrollToBottomRef.current = true;
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
      const trimmed = String(value || "").trim();
      if (
        uploadError &&
        String(uploadError).toLowerCase().includes("message must be") &&
        trimmed.length <= APP_CONFIG.messageMaxChars
      ) {
        setUploadError("");
      }

      const chatId = Number(activeChatId || 0);
      const activeType = String(activeChatTypeRef.current || "").toLowerCase();
      if (!chatId || !canSendInActiveChat || activeType === "channel") {
        stopTypingIndicator(chatId);
        return;
      }

      const shouldType = Boolean(trimmed.length);
      const typingState = typingStateRef.current;
      const now = Date.now();

      if (typingState.chatId !== chatId && typingState.isTyping) {
        stopTypingIndicator(typingState.chatId);
      }

      if (!shouldType) {
        stopTypingIndicator(chatId);
        return;
      }

      clearLocalTypingStopTimer();
      typingStopTimerRef.current = window.setTimeout(() => {
        stopTypingIndicator(chatId);
      }, TYPING_IDLE_TIMEOUT_MS);

      const shouldSendTypingSignal =
        !typingState.isTyping ||
        typingState.chatId !== chatId ||
        now - Number(typingState.lastSentAt || 0) >= TYPING_SIGNAL_THROTTLE_MS;

      if (shouldSendTypingSignal) {
        sendTypingSignal(chatId, true);
        typingStateRef.current = {
          chatId,
          isTyping: true,
          lastSentAt: now,
        };
      }
    },
    [
      activeChatId,
      canSendInActiveChat,
      clearLocalTypingStopTimer,
      sendTypingSignal,
      stopTypingIndicator,
      uploadError,
      TYPING_IDLE_TIMEOUT_MS,
      TYPING_SIGNAL_THROTTLE_MS,
    ],
  );

  async function handleSend(event) {
    event.preventDefault();
    if (!activeChatId) return;
    stopTypingIndicator(activeChatId);
    const isEditingMessage = Number(editTarget?.id || 0) > 0;
    const shouldSnapToBottom = !(isEditingMessage && userScrolledUpRef.current);
    if (shouldSnapToBottom) {
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
    }
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
      ? summarizeFiles(
          [
            ...pendingUploadFiles,
            ...(hasPendingVoice && pendingVoiceMessage
              ? [pendingVoiceMessage]
              : []),
          ],
          hasPendingFiles ? pendingUploadType : "",
        )
      : "";
    const isSavedChat = isActiveSavedChat;

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const queuedAt = Date.now();
    const pendingDate = parseServerDate(createdAt);
    const pendingDayKey = `${pendingDate.getFullYear()}-${pendingDate.getMonth()}-${pendingDate.getDate()}`;
    const fallbackBody = trimmedBody || "";
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
    const replyPayload = !isEditingMessage && replyTarget
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
      pendingScrollToBottomRef.current = shouldSnapToBottom;

      const pendingMessage = {
        _clientId: tempId,
        _chatId: Number(activeChatId),
        _queuedAt: queuedAt,
        _delivery: "sending",
        _editMessageId: isEditingMessage ? Number(editTarget.id) : null,
        _uploadType: effectiveUploadType,
        _files: pendingFiles,
        _createdAt: createdAt,
        _dayKey: pendingDayKey,
        body: trimmedBody || (isEditingMessage ? String(editTarget?.body || "") : ""),
        replyTo: replyPayload,
        read_at: isSavedChat ? createdAt : null,
        read_by_user_id: isSavedChat ? Number(user?.id || 0) : null,
      };
      await sendPendingMessage(pendingMessage);
      setReplyTarget(null);
      setEditTarget(null);
      return;
    }

    if (isEditingMessage) {
      form.reset();
      clearPendingUploads();
      clearPendingVoiceMessage();
      pendingScrollToBottomRef.current = shouldSnapToBottom;
      const pendingMessage = {
        _clientId: tempId,
        _chatId: Number(activeChatId),
        _queuedAt: queuedAt,
        _delivery: "sending",
        _editMessageId: Number(editTarget.id),
        _uploadType: effectiveUploadType,
        _files: pendingFiles,
        body: trimmedBody,
      };
      await sendPendingMessage(pendingMessage);
      setReplyTarget(null);
      setEditTarget(null);
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        username: user.username,
        body: trimmedBody,
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
    pendingScrollToBottomRef.current = shouldSnapToBottom;
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
      body: trimmedBody,
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

  const { contextMenu, closeContextMenu, openContextMenu } = useAppContextMenu({
    activeChatId,
    chats,
    currentUsername: user?.username,
    canCurrentUserEditGroup,
    canEditMessage: canEditMessageFromContext,
    canDeleteMessageForEveryone,
    onReplyToMessage: handleStartReply,
    onEditMessage: handleStartEdit,
    onDeleteMessage: handleDeleteMessageRequest,
    onForwardMessage: handleOpenForwardModal,
    onSaveMessageFiles: handleSaveMessageFiles,
    onOpenOrCreateDm: openOrCreateDmFromMember,
    onOpenProfile: openMemberProfileFromList,
    onRemoveGroupMember: handleRemoveGroupMember,
    onMarkChatSeen: handleMarkChatSeen,
    onToggleChatMute: toggleMuteChat,
    onDeleteChats: requestDeleteChats,
  });

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
    // FIXED: Pagination should work on mobile too!
    // The scroll threshold detection in ChatWindowPanel works fine on mobile.
    // This function just needed to actually execute on mobile instead of returning early.
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
    cancelSmoothScroll?.();
    allowStartReachedRef.current = true;
  };
  const usernamePattern = /^[a-z0-9._]+$/;
  const shouldPromptNotifications =
    notificationsSupported &&
    notificationPermission === "default" &&
    !permissionsDismissed.notification;
  const shouldPromptMicrophone =
    microphonePermissionSupported &&
    microphonePermission === "prompt" &&
    !permissionsDismissed.microphone;
  const permissionPromptDelayActive =
    permissionPromptDelayUntil > Date.now();
  const activePermissionPrompt = shouldPromptNotifications
    ? "notification"
    : shouldPromptMicrophone
      ? "microphone"
      : null;
  const showPermissionsPrompt = Boolean(
    activePermissionPrompt && !permissionPromptDelayActive,
  );

  useEffect(() => {
    if (!permissionPromptDelayUntil) return undefined;
    const remainingMs = permissionPromptDelayUntil - Date.now();
    if (remainingMs <= 0) {
      setPermissionPromptDelayUntil(0);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setPermissionPromptDelayUntil(0);
    }, remainingMs);
    return () => window.clearTimeout(timer);
  }, [permissionPromptDelayUntil]);

  useEffect(() => {
    setPermissionsDismissed({
      notification: readPermissionDismissed("notification"),
      microphone: readPermissionDismissed("microphone"),
    });
  }, [isAppActive, notificationPermission, microphonePermission]);

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
        onOpenUserProfileContext={openMemberProfileFromList}
        onOpenUserContextMenu={openContextMenu}
        onOpenChatContextMenu={openContextMenu}
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
        appInfo={appInfo}
        appInfoLoading={appInfoLoading}
        appInfoError={appInfoError}
        onExitEdit={handleExitEdit}
        onEnterEdit={handleEnterEdit}
        onDeleteChats={handleDeleteChats}
        onOpenSettings={handleOpenSettings}
        onOpenOwnProfile={openOwnProfileModal}
        settingsButtonRef={settingsButtonRef}
        displayInitials={displayInitials}
        onOpenWhatsNew={handleOpenWhatsNew}
      />

      <ChatWindowPanel
        mobileTab={mobileTab}
        activeChatId={activeChatId}
        activeChat={activeChat}
        closeChat={closeChat}
        activeHeaderPeer={activeHeaderAvatar}
        activeFallbackTitle={activeFallbackTitle}
        peerStatusLabel={resolvedHeaderSubtitle}
        typingIndicator={typingIndicator}
        isGroupChat={isActiveGroupChat}
        isChannelChat={isActiveChannelChat}
        isSavedChat={isActiveSavedChat}
        groupAvatarColor={activeGroupAvatarColor}
        groupAvatarUrl={activeGroupAvatarUrl}
        channelSeenCounts={channelSeenCounts}
        chatScrollRef={chatScrollRef}
        composerInputRef={composerInputRef}
        smoothScrollLockRef={smoothScrollLockRef}
        isAtBottomRef={isAtBottomRef}
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
        editTarget={editTarget}
        onClearEdit={handleClearEdit}
        onReplyToMessage={handleStartReply}
        onOpenHeaderProfile={openActiveChatProfile}
        onOpenMessageSenderProfile={openMemberProfileFromMessage}
        onOpenMention={openMentionProfile}
        onOpenForwardOrigin={handleOpenForwardOrigin}
        onForwardMessage={handleOpenForwardModal}
        onOpenContextMenu={openContextMenu}
        onUserScrollIntent={handleUserScrollIntent}
        canSwipeReply={canSwipeReply}
        fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
        fileUploadInProgress={fileUploadInProgress || activeUploadProgress !== null}
        showComposer={canSendInActiveChat}
        isChannelMuted={activeChatMuted}
        onToggleChannelMute={() => toggleMuteChat(activeChat?.id)}
        headerClickable={!isActiveSavedChat}
        showStatus={!isActiveSavedChat}
        headerAvatarIcon={activeHeaderAvatarIcon}
        headerAvatarColor={headerAvatarColor}
        mentionRefreshToken={mentionRefreshToken}
        copyToastVisible={copyToastVisible}
        microphonePermissionStatus={microphonePermission}
        onRequestMicrophonePermission={requestMicrophonePermission}
        permissionsPrompt={{
          show: showPermissionsPrompt,
          mode: activePermissionPrompt,
          notification: {
            show: shouldPromptNotifications,
            status: notificationPermission,
            onRequest: requestNotificationsPermission,
          },
          microphone: {
            show: shouldPromptMicrophone,
            status: microphonePermission,
            onRequest: requestMicrophonePermission,
          },
          onDismiss: (mode) =>
            dismissPermissionsPrompt(mode || activePermissionPrompt),
        }}
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

      {newChatOpen ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}

      {confirmDeleteOpen ? (
        <Suspense fallback={null}>
          <DeleteChatsModal
            open={confirmDeleteOpen}
            pendingDeleteIds={pendingDeleteIds}
            selectedChats={selectedChats}
            setConfirmDeleteOpen={setConfirmDeleteOpen}
            confirmDeleteChats={confirmDeleteChats}
          />
        </Suspense>
      ) : null}

      {messageDeleteScopeOpen ? (
        <Suspense fallback={null}>
          <DeleteMessageScopeModal
            open={messageDeleteScopeOpen}
            allowDeleteForEveryone={canDeleteMessageForEveryone(
              pendingDeleteMessage,
            )}
            onClose={() => {
              setMessageDeleteScopeOpen(false);
              setPendingDeleteMessage(null);
            }}
            onConfirm={(deleteForEveryone) =>
              performDeleteMessage(
                pendingDeleteMessage,
                deleteForEveryone ? "everyone" : "self",
              )
            }
          />
        </Suspense>
      ) : null}

      {forwardMessageTarget ? (
        <Suspense fallback={null}>
          <ForwardMessageModal
            open={Boolean(forwardMessageTarget)}
            chats={chats}
            savedChat={forwardSavedChat}
            currentUser={user}
            sourceChatId={activeChatId}
            onClose={() => {
              setForwardMessageTarget(null);
              setForwardSavedChat(null);
            }}
            onSubmit={handleForwardMessageSubmit}
          />
        </Suspense>
      ) : null}

      {confirmLeaveOpen ? (
        <Suspense fallback={null}>
          <LeaveGroupModal
            open={confirmLeaveOpen}
            onClose={() => {
              setConfirmLeaveOpen(false);
              setPendingLeaveChatId(null);
            }}
            onConfirm={confirmLeaveGroupById}
            isChannel={(() => {
              const leaveId = Number(pendingLeaveChatId || 0);
              if (!leaveId) return false;
              return chats.some(
                (chat) => Number(chat.id) === leaveId && chat.type === "channel",
              );
            })()}
          />
        </Suspense>
      ) : null}

      {newGroupOpen ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}

      {groupInviteOpen ? (
        <Suspense fallback={null}>
          <GroupInviteLinkModal
            open={groupInviteOpen}
            inviteLink={createdGroupInviteLink}
            onClose={() => setGroupInviteOpen(false)}
          />
        </Suspense>
      ) : null}

      {profileModalOpen ? (
        <Suspense fallback={null}>
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
              requestLeaveGroupById(mentionProfileChat?.id || activeChat?.id)
            }
            onOpenMember={openMemberProfileFromList}
            onRemoveMember={handleRemoveGroupMember}
            onOpenUserContextMenu={openContextMenu}
            onEditGroup={openEditGroupFromProfile}
            onEditSelfProfile={openSelfProfileEditor}
          />
        </Suspense>
      ) : null}

      {notificationsModalOpen ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : null}

      {settingsPanel && mobileTab !== "settings" ? (
        <Suspense fallback={null}>
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
            appInfo={appInfo}
            appInfoLoading={appInfoLoading}
            appInfoError={appInfoError}
            onOpenWhatsNew={handleOpenWhatsNew}
          />
        </Suspense>
      ) : null}

      {whatsNewOpen ? (
        <Suspense fallback={null}>
          <WhatsNewModal
            open={whatsNewOpen}
            version={appInfo?.version || ""}
            changelog={appInfo?.changelog || ""}
            onClose={() => dismissWhatsNew(true)}
          />
        </Suspense>
      ) : null}

      <AppContextMenu menu={contextMenu} onClose={closeContextMenu} />
    </div>
  );
}

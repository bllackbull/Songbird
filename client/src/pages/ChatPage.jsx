import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MobileTabMenu from "../components/MobileTabMenu.jsx";
import ChatWindowPanel from "../components/ChatWindowPanel.jsx";
import { DeleteChatsModal, NewChatModal } from "../components/ChatModals.jsx";
import { DesktopSettingsModal } from "../components/settings/index.js";
import { ChatSidebar } from "../components/chatpage/index.js";
import { CHAT_PAGE_CONFIG } from "../settings/chatPageConfig.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import {
  formatBytesAsMb,
  formatDayLabel,
  formatTime,
  parseServerDate,
} from "../utils/chatFormat.js";
import { useChatEvents } from "../hooks/useChatEvents.js";
import { useChatScroll } from "../hooks/useChatScroll.js";
import {
  createDmChat,
  fetchHealth,
  fetchPresence,
  getMessagesUploadUrl,
  getSseStreamUrl,
  hideChats,
  listChatsForUser,
  listMessagesByQuery,
  logout,
  markMessagesRead,
  pingPresence,
  searchUsers,
  sendMessage,
  updatePassword,
  updateProfile,
  updateStatus,
  uploadAvatar,
} from "../api/chatApi.js";

const NEW_CHAT_SEARCH_DEBOUNCE_MS = 300;
const MOBILE_CLOSE_ANIMATION_MS = 340;
const UPLOAD_PROGRESS_HIDE_DELAY_MS = 600;
const NOTIFICATION_PREVIEW_MAX_CHARS = 120;
const NOTIFICATIONS_ENABLED_KEY = "songbird-notify-enabled";




export default function ChatPage({ user, setUser, isDark, setIsDark, toggleTheme }) {
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileTab, setMobileTab] = useState("chats");
  const [settingsPanel, setSettingsPanel] = useState(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatUsername, setNewChatUsername] = useState("");
  const [newChatError, setNewChatError] = useState("");
  const [newChatResults, setNewChatResults] = useState([]);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [newChatSelection, setNewChatSelection] = useState(null);
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
  const prevUploadProgressRef = useRef(null);
  const mediaLoadSnapTimerRef = useRef(null);
  const messageRefreshTimerRef = useRef(null);
  const messageFetchInFlightRef = useRef(false);
  const queuedSilentMessageRefreshRef = useRef(null);
  const messagesCacheRef = useRef(new Map());
  const [sseConnected, setSseConnected] = useState(false);
  const [profileForm, setProfileForm] = useState({
    nickname: user?.nickname || "",
    username: user?.username || "",
    avatarUrl: user?.avatarUrl || "",
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || "");
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
  const sseReconnectRef = useRef(null);
  const isMarkingReadRef = useRef(false);
  const sendingClientIdsRef = useRef(new Set());
  const usernameRef = useRef(String(user?.username || ""));
  const loadChatsRef = useRef(null);
  const scheduleMessageRefreshRef = useRef(null);

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
  const iosRequiresStandalone = isIOSDevice && !isStandaloneDisplay;
  const notificationsSupported =
    hasNotificationApi && isSecureContext && !iosRequiresStandalone;
  const notificationsAllowed = notificationPermission === "granted";
  const notificationsActive = notificationsEnabled && notificationsAllowed;
  const notificationStatusLabel = !hasNotificationApi
    ? "Not supported in this browser"
    : !isSecureContext
      ? "Connection is not secure"
      : iosRequiresStandalone
        ? "Requires Home Screen install"
        : notificationPermission === "denied"
          ? "Blocked in browser settings"
          : "";
  const notificationsDisabled = Boolean(notificationStatusLabel);

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

  const handleToggleNotifications = async () => {
    if (!notificationsSupported) return;
    if (notificationPermission === "denied") {
      persistNotificationsEnabled(false);
      return;
    }
    if (notificationsActive) {
      persistNotificationsEnabled(false);
      return;
    }
    if (!notificationsEnabled) {
      persistNotificationsEnabled(true);
    }
    if (notificationPermission !== "granted") {
      await requestNotificationPermission();
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
    const docCount = Math.max(0, files.length - videoCount - imageCount);
    if (files.length === 1) {
      if (videoCount === 1) return "Sent a video";
      if (imageCount === 1) return "Sent a photo";
      return "Sent a document";
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
    return `Sent ${files.length} files`;
  };

  const resolveReplyPreview = (msg) => {
    if (!msg) return { text: "", icon: null };
    const rawBody = String(msg.body || "").trim();
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
    const docCount = Math.max(0, files.length - videoCount - imageCount);
    const icon =
      videoCount > 0 ? "video" : imageCount > 0 ? "image" : files.length ? "document" : null;
    let summary = summarizeFiles(files);
    if (!summary && /^Sent a media file$/i.test(rawBody)) {
      if (videoCount === 1 && imageCount === 0) summary = "Sent a video";
      if (imageCount === 1 && videoCount === 0) summary = "Sent a photo";
    }
    const isGenericBody =
      !rawBody || /^Sent (a media file|a document|\d+ files)$/i.test(rawBody);
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
      if (typeof divider.scrollIntoView === "function") {
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

  const setPendingUploadProgress = (clientId, progress) => {
    const nextProgress = Math.max(0, Math.min(100, Number(progress || 0)));
    setActiveUploadProgress(nextProgress);
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
    usernameRef.current = String(user?.username || "");
  }, [user?.username]);

  useEffect(() => {
    return () => {
      pendingUploadFilesRef.current.forEach((file) => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
      clearUnreadAlignTimers();
    };
  }, []);

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
    if (user) {
      void loadChats();
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
    let totalUnread = chats.reduce(
      (sum, chat) => sum + Number(chat?.unread_count || 0),
      0,
    );

    if (totalUnread > 999) totalUnread = "+999"

    document.title =
      totalUnread > 0
        ? `Songbird | ${totalUnread} new message${totalUnread === 1 ? "" : "s"}`
        : "Songbird";
    if (navigator?.setAppBadge) {
      if (totalUnread > 0) {
        navigator.setAppBadge(totalUnread).catch(() => null);
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
        const users = (data.users || []).slice(
          0,
          CHAT_PAGE_CONFIG.newChatSearchMaxResults,
        );
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
      const cached = messagesCacheRef.current.get(openedChatId) || null;
      openingHadUnreadRef.current = Boolean((openedChat?.unread_count || 0) > 0);
      openingUnreadCountRef.current = Number(openedChat?.unread_count || 0);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setLoadingMessages(!cached);
      setMessages(Array.isArray(cached?.messages) ? cached.messages : []);
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
        const shouldFetchInitial = !cached || !sseConnected;
        if (shouldFetchInitial) {
          await loadMessages(openedChatId, { initialLoad: true, limit: initialLimit });
        } else {
          openingChatRef.current = false;
          pendingScrollToBottomRef.current = true;
          scrollChatToBottom("auto");
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
    activeChatIdRef.current = activeChatId ? Number(activeChatId) : null;
  }, [activeChatId]);

  useEffect(() => {
    clearPendingUploads();
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
  const visibleChats = chats;
  const activeChat =
    visibleChats.find((conv) => conv.id === activeId) ||
    chats.find((conv) => conv.id === activeId);
  const activeMembers = activeChat?.members || [];
  const activeDmMember =
    activeChat?.type === "dm"
      ? activeMembers.find((member) => member.username !== user.username)
      : null;
  const activeHeaderPeer = activePeer || activeDmMember;
  const activeFallbackTitle =
    activeHeaderPeer?.nickname || activeHeaderPeer?.username || "Select a chat";
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
  const lastSeenAt = peerPresence.lastSeen
    ? parsePresenceDate(peerPresence.lastSeen)?.getTime() || null
    : null;
  const effectivePeerIdleThreshold = 12 * 1000;
  const isIdle =
    lastSeenAt !== null && Date.now() - lastSeenAt > effectivePeerIdleThreshold;
  const peerStatusLabel = !activeHeaderPeer
    ? "offline"
    : isIdle
      ? "offline"
      : peerPresence.status === "invisible" || peerPresence.status === "offline"
        ? "offline"
        : peerPresence.status === "online"
          ? "online"
          : "offline";

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
          setPeerPresence({
            status: data.status || "online",
            lastSeen: data.lastSeen || null,
          });
        }
      } catch {
        if (isMounted) {
          setPeerPresence({ status: "offline", lastSeen: null });
        }
      }
    };
    fetchPeerPresence();
    const interval = setInterval(
      fetchPeerPresence,
      CHAT_PAGE_CONFIG.peerPresencePollIntervalMs,
    );
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
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
    });
  }, [activeChatId, messages, loadingMessages]);

  useLayoutEffect(() => {
    if (!activeChatId) return;
    if (!pendingScrollToBottomRef.current) return;
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
      (msg) => msg.username !== user.username && !msg.read_at,
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
      let title = "New message";
      if (chat) {
        if (chat.type === "dm") {
          const other = (chat.members || []).find(
            (member) => member.username !== user?.username,
          );
          title = other?.nickname || other?.username || "Direct message";
        } else {
          title = chat.name || "Chat";
        }
      } else if (sender) {
        title = sender;
      }
      const messageBody = String(meta?.body || payload?.body || "").trim();
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
      const fileMeta = [];
      pendingMessage._files.forEach((item) => {
        if (item?.file instanceof File) {
          form.append("files", item.file, item.name || item.file.name);
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
        setPendingUploadProgress(pendingMessage._clientId, percent);
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

    const clientId = pendingMessage._clientId;
    const hasFiles = Array.isArray(pendingMessage._files) && pendingMessage._files.length > 0;
    if (!clientId || sendingClientIdsRef.current.has(clientId)) return;

    sendingClientIdsRef.current.add(clientId);
    try {
      const targetChatId = Number(pendingMessage._chatId || activeChatId);
      if (!targetChatId) return;
      let data = null;
      if (hasFiles) {
        setActiveUploadProgress(0);
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
            read_at: null,
            read_by_user_id: null,
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
      if (hasFiles) {
        setActiveUploadProgress(100);
        setTimeout(() => setActiveUploadProgress(null), UPLOAD_PROGRESS_HIDE_DELAY_MS);
      }
      pendingScrollToBottomRef.current = false;
      await loadChats({ silent: true });
      // Keep optimistic row stable and rely on SSE/polling for server echo.
      // Immediate forced refetch here can race and cause first-message flicker.
    } catch (error) {
      if (hasFiles) {
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
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg._clientId === clientId ? { ...msg, _delivery: "failed" } : msg,
          ),
        );
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
      const pending = messages.filter((msg) => msg._delivery === "sending");
      if (!pending.length) return;
      pending.forEach((msg) => {
        void sendPendingMessage(msg);
      });
    }, CHAT_PAGE_CONFIG.pendingRetryIntervalMs);
    return () => clearInterval(interval);
  }, [activeChatId, messages]);

  useEffect(() => {
    if (!activeChatId) return;
    if (sseConnected) return;
    const needsMediaSync = messages.some((msg) => {
      const isOwn = msg.username === user.username;
      if (!isOwn) return false;
      const hasFiles = Array.isArray(msg.files) ? msg.files.length > 0 : false;
      if (!hasFiles) return false;
      const hasVideo = msg.files.some((file) =>
        String(file?.mimeType || "").toLowerCase().startsWith("video/"),
      );
      if (!hasVideo) return false;
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
    messagesCacheRef.current.set(Number(activeChatId), {
      messages,
      hasOlderMessages,
      lastMessageId: messages.length ? Number(messages[messages.length - 1]?.id || 0) : 0,
      updatedAt: Date.now(),
    });
  }, [activeChatId, messages, hasOlderMessages]);

  useEffect(() => {
    if (settingsPanel !== "profile" && profileError) {
      setProfileError("");
    }
    if (settingsPanel !== "security" && passwordError) {
      setPasswordError("");
    }
  }, [settingsPanel, profileError, passwordError]);

  async function loadChats(options = {}) {
    if (!options.silent) {
      setLoadingChats(true);
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
          };
        }
        if (!hasProcessingVideo || !isFromOther) return chat;
        const previous = chats.find((existing) => Number(existing.id) === Number(chat.id));
        if (!previous) {
          return {
            ...chat,
            unread_count: 0,
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
        };
      });
      setChats(patched);
    } catch {
      // Keep sidebar usable even when polling fails.
    } finally {
      if (!options.silent) {
        setLoadingChats(false);
      }
    }
  }

  async function loadMessages(chatId, options = {}) {
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
      setHasOlderMessages((prev) =>
        options.prepend
          ? Boolean(data?.hasMore)
          : options.preserveHistory
            ? prev || Boolean(data?.hasMore)
            : Boolean(data?.hasMore),
      );
        const nextMessages = (data.messages || []).map((msg) => {
        const date = parseServerDate(msg.created_at);
        const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const hasProcessingVideo = Array.isArray(msg?.files)
          ? msg.files.some(
              (file) =>
                String(file?.mimeType || "").toLowerCase().startsWith("video/") &&
                file?.processing === true &&
                !String(file?.url || "").includes("-h264-"),
            )
          : false;
        const isOwnProcessingVideo = hasProcessingVideo && msg.username === user.username;
        return {
          ...msg,
          _dayKey: dayKey,
          _dayLabel: formatDayLabel(msg.created_at),
          _timeLabel: formatTime(msg.created_at),
          _processingPending: isOwnProcessingVideo,
        };
      });
      if (options.prepend) {
        setMessages((prev) => {
          const seen = new Set(prev.map((msg) => Number(msg.id)));
          const older = nextMessages.filter((msg) => !seen.has(Number(msg.id)));
          return older.length ? [...older, ...prev] : prev;
        });
        return;
      }
      setMessages((prev) => {
        const prevLatestVisibleTime = prev.reduce((max, msg) => {
          const t = Number(msg?._visibilityTime || parseServerDate(msg?.created_at).getTime());
          return Number.isFinite(t) ? Math.max(max, t) : max;
        }, 0);
        const prevByServerId = new Map(
          prev
            .filter((msg) => Number.isFinite(Number(msg._serverId || msg.id)))
            .map((msg) => [Number(msg._serverId || msg.id), msg]),
        );
        const prevLocalCandidates = prev.filter((msg) => Boolean(msg?._clientId));
        const nextMessagesWithLocalIdentity = nextMessages.map((serverMsg) => {
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
          return {
            ...serverMsg,
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
          prev.some((msg) => {
            if (Number(msg._chatId || chatId) !== Number(chatId)) return false;
            return Boolean(
              msg._clientId || msg._awaitingServerEcho || msg._delivery,
            );
          })
        ) {
          // Prevent one-frame disappearance when first local message exists
          // and a transient fetch returns empty before server echo settles.
          return prev;
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

        const pendingLocal = prev.filter(
          (msg) =>
            (msg._delivery === "sending" || msg._delivery === "failed") &&
            Number(msg._chatId || chatId) === Number(chatId) &&
            !isPendingMessageAcknowledged(msg, nextMessages),
        );
        const optimisticSentLocal = prev.filter((msg) => {
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
        const rescuedOptimistic = prev.filter((msg) => {
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
        (msg) => msg.username !== user.username && !msg.read_at,
      );
      const hasNew =
        lastId &&
        lastMessageIdRef.current &&
        lastId !== lastMessageIdRef.current;
      const newFromSelf = hasNew && lastMsg?.username === user.username;
      lastMessageIdRef.current = lastId;

      if (openingChatRef.current) {
        const firstUnreadIndex = nextMessages.findIndex(
          (msg) => msg.username !== user.username && !msg.read_at,
        );
        const firstUnreadMessage =
          firstUnreadIndex >= 0 ? nextMessages[firstUnreadIndex] : null;

        shouldAutoMarkReadRef.current = true;
        pendingScrollToUnreadRef.current = null;

        if (firstUnreadMessage?.id) {
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

      const keepUnreadAnchor =
        Boolean(options.initialLoad) &&
        (pendingScrollToUnreadRef.current !== null ||
          unreadMarkerIdRef.current !== null ||
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
        if (Number(queued.chatId) === Number(chatId)) {
          void loadMessages(queued.chatId, queued.options);
        }
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
        String(file.type || "").startsWith("video/")
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
    }
  }

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
    const trimmedBody = body.trim();
    const hasPendingFiles = pendingUploadFiles.length > 0;
    if (!trimmedBody && !hasPendingFiles) return;

    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const queuedAt = Date.now();
    const pendingDate = parseServerDate(createdAt);
    const pendingDayKey = `${pendingDate.getFullYear()}-${pendingDate.getMonth()}-${pendingDate.getDate()}`;
    const fallbackBody =
      trimmedBody ||
      (hasPendingFiles
        ? pendingUploadFiles.length === 1
          ? `Sent ${pendingUploadType === "media" ? "a media file" : "a document"}`
          : `Sent ${pendingUploadFiles.length} files`
        : "");
    const pendingFiles = hasPendingFiles
      ? pendingUploadFiles.map((item) => ({
          id: item.id,
          kind: pendingUploadType === "document" ? "document" : "media",
          name: item.name,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          width: Number.isFinite(Number(item.width)) ? Number(item.width) : null,
          height: Number.isFinite(Number(item.height)) ? Number(item.height) : null,
          durationSeconds: Number.isFinite(Number(item.durationSeconds))
            ? Number(item.durationSeconds)
            : null,
          url:
            item.file instanceof File &&
            (String(item.mimeType || "").startsWith("image/") ||
              String(item.mimeType || "").startsWith("video/"))
              ? URL.createObjectURL(item.file)
              : item.previewUrl || null,
          file: item.file,
        }))
      : [];
    const replyPayload = replyTarget
      ? {
          id: replyTarget.id,
          username: replyTarget.username,
          nickname: replyTarget.nickname,
          body: replyTarget.body,
          displayName: replyTarget.displayName,
        }
      : null;

    if (hasPendingFiles) {
      form.reset();
      clearPendingUploads();
      pendingScrollToBottomRef.current = true;

      const pendingMessage = {
        _clientId: tempId,
        _chatId: Number(activeChatId),
        _queuedAt: queuedAt,
        _delivery: "sending",
        _uploadType: pendingUploadType,
        _files: pendingFiles,
        _createdAt: createdAt,
        _dayKey: pendingDayKey,
        body: fallbackBody,
        replyTo: replyPayload,
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
        read_at: null,
        read_by_user_id: null,
        _clientId: tempId,
        _chatId: Number(activeChatId),
        _queuedAt: queuedAt,
        _delivery: "sending",
        _dayKey: pendingDayKey,
        _dayLabel: formatDayLabel(createdAt),
        _timeLabel: formatTime(createdAt),
        _uploadType: pendingUploadType,
        _files: pendingFiles,
        _uploadProgress: hasPendingFiles ? 0 : null,
        _awaitingServerEcho: false,
        replyTo: replyPayload,
        files: pendingFiles.map((file) => ({
          id: file.id,
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
      _uploadType: pendingUploadType,
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

  async function updateStatus(nextStatus) {
    if (!user || user.status === nextStatus) return;
    try {
      const res = await updateStatus({ username: user.username, status: nextStatus });
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
    const trimmedUsername = profileForm.username.trim().toLowerCase();
    if (trimmedUsername.length < 3) {
      setProfileError("Username must be at least 3 characters.");
      return;
    }
    if (!usernamePattern.test(trimmedUsername)) {
      setProfileError(
        "Username can only include english letters, numbers, dot (.), underscore (_), and dash (-).",
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
        nickname: profileForm.nickname,
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
        await updateStatus(statusSelection);
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

  const handleUserScrollIntent = () => {
    allowStartReachedRef.current = true;
  };
  const usernamePattern = /^[a-z0-9._-]+$/;

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
        editMode={editMode}
        visibleChats={visibleChats}
        selectedChats={selectedChats}
        loadingChats={loadingChats}
        activeChatId={activeChatId}
        user={user}
        formatTime={formatTime}
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
        onExitEdit={handleExitEdit}
        onEnterEdit={handleEnterEdit}
        onDeleteChats={handleDeleteChats}
        onOpenSettings={handleOpenSettings}
        settingsButtonRef={settingsButtonRef}
        displayInitials={displayInitials}
      />

      <ChatWindowPanel
        mobileTab={mobileTab}
        activeChatId={activeChatId}
        closeChat={closeChat}
        activeHeaderPeer={activeHeaderPeer}
        activeFallbackTitle={activeFallbackTitle}
        peerStatusLabel={peerStatusLabel}
        chatScrollRef={chatScrollRef}
        onChatScroll={handleChatScroll}
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
        uploadError={uploadError}
        activeUploadProgress={activeUploadProgress}
        onMessageMediaLoaded={handleMessageMediaLoaded}
        onUploadFilesSelected={handleUploadFilesSelected}
        onRemovePendingUpload={removePendingUpload}
        onClearPendingUploads={clearPendingUploads}
        replyTarget={replyTarget}
        onClearReply={handleClearReply}
        onReplyToMessage={handleStartReply}
        onUserScrollIntent={handleUserScrollIntent}
        fileUploadEnabled={CHAT_PAGE_CONFIG.fileUploadEnabled}
        fileUploadInProgress={fileUploadInProgress || activeUploadProgress !== null}
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
        />
      ) : null}
    </div>
  );
}






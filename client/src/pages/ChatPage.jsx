import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Settings,
  X as Close,
  Plus,
  Pencil,
  Trash,
  LoaderCircle,
} from "lucide-react";
import MobileTabMenu from "../components/MobileTabMenu.jsx";
import ChatsListPanel from "../components/ChatsListPanel.jsx";
import ChatWindowPanel from "../components/ChatWindowPanel.jsx";
import { DeleteChatsModal, NewChatModal } from "../components/ChatModals.jsx";
import {
  DesktopSettingsModal,
  MobileSettingsPanel,
  SettingsMenuPopover,
} from "../components/SettingsPanel.jsx";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { hasPersian } from "../utils/fontUtils.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";

const API_BASE = "";
const readEnvNumber = (key, fallback, options = {}) => {
  const keys = Array.isArray(key) ? key : [key];
  const raw = keys
    .map((name) => import.meta.env[name])
    .find((value) => value !== undefined && value !== null && value !== "");
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const integer = options.integer ? Math.trunc(parsed) : parsed;
  if (options.min !== undefined && integer < options.min) return fallback;
  if (options.max !== undefined && integer > options.max) return fallback;
  return integer;
};

const CHAT_PAGE_CONFIG = {
  pendingTextTimeoutMs: readEnvNumber("CHAT_PENDING_TEXT_TIMEOUT_MS", 5 * 60 * 1000, {
    integer: true,
    min: 1000,
  }),
  pendingFileTimeoutMs: readEnvNumber(
    "CHAT_PENDING_FILE_TIMEOUT_MS",
    20 * 60 * 1000,
    { integer: true, min: 1000 },
  ),
  pendingRetryIntervalMs: readEnvNumber(
    "CHAT_PENDING_RETRY_INTERVAL_MS",
    4000,
    { integer: true, min: 250 },
  ),
  pendingStatusCheckIntervalMs: readEnvNumber("CHAT_PENDING_STATUS_CHECK_INTERVAL_MS", 1000, {
    integer: true,
    min: 250,
  }),
  messageFetchLimit: readEnvNumber("CHAT_MESSAGE_FETCH_LIMIT", 300, {
    integer: true,
    min: 1,
  }),
  messagePageSize: readEnvNumber("CHAT_MESSAGE_PAGE_SIZE", 60, {
    integer: true,
    min: 10,
    max: 500,
  }),
  maxFilesPerMessage: readEnvNumber("CHAT_UPLOAD_MAX_FILES", 10, {
    integer: true,
    min: 1,
  }),
  maxFileSizeBytes: readEnvNumber(
    "CHAT_UPLOAD_MAX_FILE_SIZE_BYTES",
    25 * 1024 * 1024,
    {
      integer: true,
      min: 1024,
    },
  ),
  maxTotalUploadBytes: readEnvNumber(
    "CHAT_UPLOAD_MAX_TOTAL_BYTES",
    75 * 1024 * 1024,
    {
      integer: true,
      min: 1024,
    },
  ),
  chatsRefreshIntervalMs: readEnvNumber("CHAT_LIST_REFRESH_INTERVAL_MS", 20000, {
    integer: true,
    min: 1000,
  }),
  presencePingIntervalMs: readEnvNumber("CHAT_PRESENCE_PING_INTERVAL_MS", 5000, {
    integer: true,
    min: 1000,
  }),
  newChatSearchMaxResults: readEnvNumber("CHAT_NEW_CHAT_SEARCH_MAX_RESULTS", 5, {
    integer: true,
    min: 1,
  }),
  healthCheckIntervalMs: readEnvNumber("CHAT_HEALTH_CHECK_INTERVAL_MS", 10000, {
    integer: true,
    min: 1000,
  }),
  peerPresencePollIntervalMs: readEnvNumber("CHAT_PEER_PRESENCE_POLL_INTERVAL_MS", 3000, {
    integer: true,
    min: 500,
  }),
  sseReconnectDelayMs: readEnvNumber("CHAT_SSE_RECONNECT_DELAY_MS", 2000, {
    integer: true,
    min: 250,
  }),
};

const NEW_CHAT_SEARCH_DEBOUNCE_MS = 300;
const MOBILE_CLOSE_ANIMATION_MS = 340;
const SCROLL_BOTTOM_SNAP_TIMEOUT_MS = 90;
const UPLOAD_PROGRESS_HIDE_DELAY_MS = 600;
const CHAT_BOTTOM_THRESHOLD_PX = 120;
const JUMP_TO_LATEST_SECOND_SNAP_DELAY_MS = 320;
const JUMP_TO_LATEST_SECOND_SNAP_THRESHOLD_PX = 24;
const MEDIA_LOAD_SNAP_DEBOUNCE_MS = 110;

const formatBytesAsMb = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;


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
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [unreadInChat, setUnreadInChat] = useState(0);
  const [unreadMarkerId, setUnreadMarkerId] = useState(null);
  const [pendingUploadFiles, setPendingUploadFiles] = useState([]);
  const [pendingUploadType, setPendingUploadType] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [activeUploadProgress, setActiveUploadProgress] = useState(null);
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

  const settingsMenuRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const sseReconnectRef = useRef(null);
  const isMarkingReadRef = useRef(false);
  const sendingClientIdsRef = useRef(new Set());

  const scrollChatToBottom = (behavior = "auto") => {
    const container = chatScrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight + 1000,
      behavior,
    });
  };

  const clearUnreadAlignTimers = () => {
    unreadAlignTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    unreadAlignTimersRef.current = [];
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

  useEffect(() => {
    pendingUploadFilesRef.current = pendingUploadFiles;
  }, [pendingUploadFiles]);

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
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      void loadChats({ silent: true });
    }, CHAT_PAGE_CONFIG.chatsRefreshIntervalMs);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ping = async () => {
      try {
        await fetch(`${API_BASE}/api/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: user.username }),
        });
      } catch (_) {
        // ignore
      }
    };
    ping();
    const interval = setInterval(ping, CHAT_PAGE_CONFIG.presencePingIntervalMs);
    return () => clearInterval(interval);
  }, [user]);

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
        const res = await fetch(
          `${API_BASE}/api/users?exclude=${encodeURIComponent(user.username)}&query=${encodeURIComponent(
            newChatUsername.trim().toLowerCase(),
          )}`,
        );
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
        const res = await fetch(`${API_BASE}/api/health`);
        if (!res.ok) throw new Error("Not connected");
        const data = await res.json();
        if (isMounted) {
          setIsConnected(Boolean(data?.ok));
        }
      } catch (_) {
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
      openingHadUnreadRef.current = Boolean((openedChat?.unread_count || 0) > 0);
      openingUnreadCountRef.current = Number(openedChat?.unread_count || 0);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setLoadingMessages(true);
      setMessages([]);
      setHasOlderMessages(false);
      setLoadingOlderMessages(false);
      lastMessageIdRef.current = null;
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
      void (async () => {
        await loadMessages(openedChatId, { initialLoad: true, limit: initialLimit });
        await fetch(`${API_BASE}/api/messages/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: openedChatId, username: user.username }),
        }).catch(() => null);
        await loadChats({ silent: true });
      })();
    }
  }, [user, activeChatId, isMobileViewport]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const activeTitle = useMemo(() => {
    if (!activeChat) return "Select a chat";
    if (activeChat.type === "dm") {
      return (
        activeDmMember?.nickname || activeDmMember?.username || "Direct message"
      );
    }
    return activeChat.name || "Chat";
  }, [activeChat, activeDmMember, user.username]);
  const activeFallbackTitle =
    activeHeaderPeer?.nickname || activeHeaderPeer?.username || "Select a chat";
  const canStartChat = Boolean(newChatSelection);
  const userColor = user?.color || "#10b981";

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
      await fetch(`${API_BASE}/api/chats/hide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          chatIds: idsToHide,
        }),
      });
    } catch (_) {
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

  const parseServerDate = (value) => {
    if (!value) return new Date();
    if (typeof value === "string") {
      const normalized = value.includes("T") ? value : value.replace(" ", "T");
      const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
      return hasExplicitTimezone
        ? new Date(normalized)
        : new Date(`${normalized}Z`);
    }
    return new Date(value);
  };

  const formatDayLabel = (dateValue) => {
    const now = new Date();
    const date = parseServerDate(dateValue);
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const diffDays = Math.round(
      (startOfToday - startOfDate) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: "long" });
    }
    return date.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (dateValue) =>
    parseServerDate(dateValue).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

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
    const fetchPresence = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/presence?username=${encodeURIComponent(activeHeaderPeer.username)}`,
        );
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
      } catch (_) {
        if (isMounted) {
          setPeerPresence({ status: "offline", lastSeen: null });
        }
      }
    };
    fetchPresence();
    const interval = setInterval(
      fetchPresence,
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
      if (!chatId || !user) return;
      shouldAutoMarkReadRef.current = true;
      setUnreadMarkerId(null);
      unreadMarkerIdRef.current = null;
      pendingScrollToUnreadRef.current = null;
      fetch(`${API_BASE}/api/messages/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, username: user.username }),
      }).catch(() => null);
    };
  }, [activeChatId, user]);

  useEffect(() => {
    if (!showSettings) return;
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
  }, [showSettings]);

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
      !isAppActive
    ) {
      return;
    }
    const hasUnreadFromOthers = messages.some(
      (msg) => msg.username !== user.username && !msg.read_at,
    );
    if (!hasUnreadFromOthers) return;

    isMarkingReadRef.current = true;
    fetch(`${API_BASE}/api/messages/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: activeId, username: user.username }),
    })
      .catch(() => null)
      .finally(() => {
        isMarkingReadRef.current = false;
      });
  }, [messages, user?.username, isAppActive]);

  useEffect(() => {
    if (!user?.username) return;
    let source = null;
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;
      source = new EventSource(
        `${API_BASE}/api/events?username=${encodeURIComponent(user.username)}`,
      );

      source.onmessage = (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch (_) {
          return;
        }
        if (!payload?.type) return;
        if (payload.type !== "chat_message" && payload.type !== "chat_read") {
          return;
        }
        void loadChats({ silent: true });
        const currentActiveId = activeChatIdRef.current;
        if (currentActiveId && Number(payload.chatId) === currentActiveId) {
          if (userScrolledUpRef.current) {
            return;
          }
          void loadMessages(currentActiveId, {
            silent: true,
            preserveHistory: true,
          });
        }
      };

      source.onerror = () => {
        source?.close();
        if (!isMounted) return;
        if (sseReconnectRef.current) {
          clearTimeout(sseReconnectRef.current);
        }
        sseReconnectRef.current = setTimeout(
          connect,
          CHAT_PAGE_CONFIG.sseReconnectDelayMs,
        );
      };
    };

    connect();

    return () => {
      isMounted = false;
      source?.close();
      if (sseReconnectRef.current) {
        clearTimeout(sseReconnectRef.current);
      }
    };
  }, [user?.username]);

  const uploadPendingMessageWithProgress = (pendingMessage, targetChatId) =>
    new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("username", user.username);
      form.append("chatId", String(targetChatId));
      form.append("body", pendingMessage.body || "");
      form.append("uploadType", pendingMessage._uploadType || "document");
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
      xhr.open("POST", `${API_BASE}/api/messages/upload`);
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
          } catch (_) {
            return {};
          }
        })();
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }
        reject(new Error(data?.error || "Unable to send message."));
      };

      xhr.send(form);
    });

  const sendPendingMessage = async (pendingMessage) => {
    if (!pendingMessage || pendingMessage._delivery !== "sending") return;
    if (!isConnected) return;

    const clientId = pendingMessage._clientId;
    if (!clientId || sendingClientIdsRef.current.has(clientId)) return;

    sendingClientIdsRef.current.add(clientId);
    try {
      const targetChatId = Number(pendingMessage._chatId || activeChatId);
      if (!targetChatId) return;
      const hasFiles = Array.isArray(pendingMessage._files) && pendingMessage._files.length > 0;
      let data = null;
      if (hasFiles) {
        setActiveUploadProgress(0);
        data = await uploadPendingMessageWithProgress(pendingMessage, targetChatId);
      } else {
        const res = await fetch(`${API_BASE}/api/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: user.username,
            body: pendingMessage.body,
            chatId: targetChatId,
          }),
        });
        data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to send message.");
        }
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg._clientId === clientId
            ? {
                ...msg,
                _serverId: Number(data.id) || msg._serverId || null,
                _delivery: "sent",
                _awaitingServerEcho: true,
                _uploadProgress: 100,
              }
            : msg,
        ),
      );
      if (hasFiles) {
        setActiveUploadProgress(100);
        setTimeout(() => setActiveUploadProgress(null), UPLOAD_PROGRESS_HIDE_DELAY_MS);
      }
      pendingScrollToBottomRef.current = false;
      await loadChats({ silent: true });
      // Keep optimistic row stable and rely on SSE/polling for server echo.
      // Immediate forced refetch here can race and cause first-message flicker.
    } catch (_) {
      if (hasFiles) {
        setActiveUploadProgress(null);
      }
      // Keep message in pending state and retry after reconnection.
    } finally {
      sendingClientIdsRef.current.delete(clientId);
    }
  };

  useEffect(() => {
    if (!isConnected || !activeChatId) return;
    const pending = messages.filter((msg) => msg._delivery === "sending");
    if (!pending.length) return;
    pending.forEach((msg) => {
      void sendPendingMessage(msg);
    });
  }, [isConnected, activeChatId, messages]);

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
    if (!isConnected || !activeChatId) return;
    const interval = setInterval(() => {
      const pending = messages.filter((msg) => msg._delivery === "sending");
      if (!pending.length) return;
      pending.forEach((msg) => {
        void sendPendingMessage(msg);
      });
    }, CHAT_PAGE_CONFIG.pendingRetryIntervalMs);
    return () => clearInterval(interval);
  }, [isConnected, activeChatId, messages]);

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
      const res = await fetch(
        `${API_BASE}/api/chats?username=${encodeURIComponent(user.username)}`,
      );
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
      setChats(merged);
    } catch (_) {
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
      const res = await fetch(
        `${API_BASE}/api/messages?${query.toString()}`,
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
        return {
          ...msg,
          _dayKey: dayKey,
          _dayLabel: formatDayLabel(msg.created_at),
          _timeLabel: formatTime(msg.created_at),
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
            return Math.abs(serverCreatedAt - pendingCreatedAt) < 2 * 60 * 1000;
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
            return Math.abs(serverCreatedAt - pendingCreatedAt) < 2 * 60 * 1000;
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
          return !nextMessagesWithLocalIdentity.some(
            (serverMsg) =>
              Number(serverMsg.id) === Number(msg._serverId || msg.id),
          );
        });
        const nextMessagesVisible = nextMessagesWithLocalIdentity.filter(
          (msg) => !isServerMessageShadowedByPendingUpload(msg, pendingLocal),
        );
        const compareMessages = (left, right) => {
          const leftTime = parseServerDate(left?.created_at).getTime();
          const rightTime = parseServerDate(right?.created_at).getTime();
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
        const hasLocalTransient = prev.some(
          (msg) => msg._clientId || msg._delivery || msg._files || msg._awaitingServerEcho,
        );
        if (!hasLocalTransient && prev.length === nextMessages.length) {
          const prevLast = prev[prev.length - 1];
          const nextLast = mergedNext[mergedNext.length - 1];
          if (
            prevLast?.id === nextLast?.id &&
            prevLast?.read_at === nextLast?.read_at
          ) {
            return prev;
          }
        }
        return mergedNext;
      });
      const lastMsg = nextMessages[nextMessages.length - 1];
      const lastId = lastMsg?.id || null;
      const hasUnreadFromOthers = nextMessages.some(
        (msg) => msg.username !== user.username && !msg.read_at,
      );
      const prevCount = messages.length;
      const newCount = nextMessages.length - prevCount;
      const hasNew =
        lastId &&
        lastMessageIdRef.current &&
        lastId !== lastMessageIdRef.current;
      const newFromSelf = hasNew && lastMsg?.username === user.username;
      lastMessageIdRef.current = lastId;

      if (openingChatRef.current) {
        const unreadCount = Number(openingUnreadCountRef.current || 0);
        let firstUnreadMessage = null;
        if (unreadCount > 0 && nextMessages.length > 0) {
          const boundaryIndex = Math.max(0, nextMessages.length - unreadCount);
          firstUnreadMessage = nextMessages[boundaryIndex] || null;
        } else {
          const firstUnreadIndex = nextMessages.findIndex(
            (msg) => msg.username !== user.username && !msg.read_at,
          );
          firstUnreadMessage =
            firstUnreadIndex >= 0 ? nextMessages[firstUnreadIndex] : null;
        }

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
      } else if (hasNew && userScrolledUpRef.current && !newFromSelf) {
        setUnreadInChat((prev) => prev + Math.max(newCount, 1));
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
        (shouldAutoMarkReadRef.current || options.initialLoad)
      ) {
        await fetch(`${API_BASE}/api/messages/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, username: user.username }),
        }).catch(() => null);
      }
    } catch (_) {
      // Keep chat window free of transient fetch errors.
    } finally {
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
      return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          resolve({
            width: image.naturalWidth || null,
            height: image.naturalHeight || null,
            durationSeconds: null,
          });
          URL.revokeObjectURL(objectUrl);
        };
        image.onerror = () => {
          resolve({ width: null, height: null, durationSeconds: null });
          URL.revokeObjectURL(objectUrl);
        };
        image.src = objectUrl;
      });
    }
    if (mimeType.startsWith("video/")) {
      return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          resolve({
            width: video.videoWidth || null,
            height: video.videoHeight || null,
            durationSeconds: Number.isFinite(Number(video.duration))
              ? Number(video.duration)
              : null,
          });
          video.removeAttribute("src");
          video.load();
          URL.revokeObjectURL(objectUrl);
        };
        video.onerror = () => {
          resolve({ width: null, height: null, durationSeconds: null });
          video.removeAttribute("src");
          video.load();
          URL.revokeObjectURL(objectUrl);
        };
        video.src = objectUrl;
      });
    }
    return Promise.resolve({ width: null, height: null, durationSeconds: null });
  }

  async function handleUploadFilesSelected(fileList, uploadType, append = false) {
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
      const res = await fetch(`${API_BASE}/api/chats/dm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: user.username, to: target }),
      });
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

  async function updateStatus(nextStatus, markIdle) {
    if (!user || user.status === nextStatus) return;
    try {
      const res = await fetch(`${API_BASE}/api/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to update status.");
      }
      const nextUser = { ...user, status: data.status };
      setUser(nextUser);
    } catch (_) {}
  }

  async function handleAvatarChange(event) {
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
        const payload = new FormData();
        payload.append("avatar", pendingAvatarFile.file);
        payload.append("currentUsername", user.username);
        const uploadRes = await fetch(`${API_BASE}/api/profile/avatar`, {
          method: "POST",
          body: payload,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData?.error || "Unable to upload profile photo.");
        }
        avatarUrlToSave = uploadData.avatarUrl || "";
      }
      const res = await fetch(`${API_BASE}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentUsername: user.username,
          username: trimmedUsername,
          nickname: profileForm.nickname,
          avatarUrl: avatarUrlToSave,
        }),
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
        await updateStatus(statusSelection, false);
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
      const res = await fetch(`${API_BASE}/api/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
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
    fetch(`${API_BASE}/api/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => null);
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

  const handleChatScroll = (event) => {
    const target = event.currentTarget;
    const threshold = CHAT_BOTTOM_THRESHOLD_PX;
    const atBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    if (isAtBottomRef.current !== atBottom) {
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    }
    if (atBottom) {
      suppressScrolledUpRef.current = false;
      unreadAnchorLockUntilRef.current = 0;
      clearUnreadAlignTimers();
      if (userScrolledUpRef.current) {
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);
      }
    } else {
      if (event?.isTrusted) {
        suppressScrolledUpRef.current = false;
        unreadAnchorLockUntilRef.current = 0;
        clearUnreadAlignTimers();
      }
      if (suppressScrolledUpRef.current) {
        return;
      }
      if (!userScrolledUpRef.current) {
        pendingScrollToBottomRef.current = false;
        pendingScrollToUnreadRef.current = null;
        userScrolledUpRef.current = true;
        setUserScrolledUp(true);
        if (mediaLoadSnapTimerRef.current) {
          window.clearTimeout(mediaLoadSnapTimerRef.current);
          mediaLoadSnapTimerRef.current = null;
        }
      }
    }
    if (atBottom) {
      pendingScrollToBottomRef.current = false;
      setUnreadInChat(0);
    }
  };

  const handleJumpToLatest = () => {
    pendingScrollToUnreadRef.current = null;
    suppressScrolledUpRef.current = true;
    scrollChatToBottom("smooth");
    window.setTimeout(() => {
      const next = chatScrollRef.current;
      if (!next) return;
      const distance = next.scrollHeight - (next.scrollTop + next.clientHeight);
      if (distance > JUMP_TO_LATEST_SECOND_SNAP_THRESHOLD_PX) {
        scrollChatToBottom("smooth");
      }
    }, JUMP_TO_LATEST_SECOND_SNAP_DELAY_MS);
    setUnreadInChat(0);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);
  };
  const handleMessageMediaLoaded = () => {
    if (!activeChatId) return;
    // Disable auto-snap on media load in virtualized mode; it causes scroll fights.
    if (mediaLoadSnapTimerRef.current) {
      window.clearTimeout(mediaLoadSnapTimerRef.current);
      mediaLoadSnapTimerRef.current = null;
    }
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
      <aside
        className={
          "relative flex h-full min-h-0 w-full flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-lg shadow-emerald-500/10 dark:border-white/5 dark:bg-slate-900 md:border md:w-[35%] md:shadow-xl md:shadow-emerald-500/15 " +
          (mobileTab === "chat" ? "hidden md:block" : "block")
        }
      >
        <div className="grid h-[72px] grid-cols-[1fr,auto,1fr] items-center border-b border-slate-300/80 bg-white px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900">
          {mobileTab === "settings" ? (
            <div className="col-span-3 text-center text-lg font-semibold md:hidden">
                <span className="inline-flex items-center gap-2">
                {!isConnected ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-emerald-500" />
                ) : null}
                {isConnected ? "Settings" : "Connecting..."}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {editMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditMode(false);
                      setSelectedChats([]);
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="Exit edit mode"
                  >
                    <Close size={18} className="icon-anim-sway" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!visibleChats.length) return;
                      setEditMode(true);
                    }}
                    disabled={!visibleChats.length}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-emerald-200 disabled:hover:shadow-none dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="Edit chat list"
                  >
                    <Pencil size={18} className="icon-anim-sway" />
                  </button>
                )}
              </div>
              <h2 className="text-center text-lg font-semibold">
                <span className="inline-flex items-center gap-2">
                  {!editMode && !isConnected ? (
                    <LoaderCircle className="h-5 w-5 animate-spin text-emerald-500" />
                  ) : null}
                  {editMode ? "Edit" : isConnected ? "Chats" : "Connecting..."}
                </span>
              </h2>
              <div className="flex justify-end">
                {editMode ? (
                  <button
                    type="button"
                    onClick={() => requestDeleteChats(selectedChats)}
                    disabled={!selectedChats.length}
                    className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_16px_rgba(244,63,94,0.22)] disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                    aria-label="Delete chats"
                  >
                    <Trash size={18} className="icon-anim-slide" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewChatOpen(true)}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="New chat"
                  >
                    <Plus size={18} className="icon-anim-pop" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <SettingsMenuPopover
          showSettings={showSettings}
          settingsMenuRef={settingsMenuRef}
          setSettingsPanel={setSettingsPanel}
          toggleTheme={toggleTheme}
          setIsDark={setIsDark}
          isDark={isDark}
          handleLogout={handleLogout}
        />

        <div
          className="min-h-0 flex-1 overflow-hidden py-4"
          style={{ overscrollBehavior: "contain" }}
        >
          {mobileTab === "settings" ? (
            <div className="app-scroll h-full overflow-y-auto overflow-x-hidden px-6 pb-[104px] md:h-[calc(100%-88px)] md:pb-4">
              <MobileSettingsPanel
                settingsPanel={settingsPanel}
                user={user}
                displayName={displayName}
                statusDotClass={statusDotClass}
                statusValue={statusValue}
                setSettingsPanel={setSettingsPanel}
                toggleTheme={toggleTheme}
                setIsDark={setIsDark}
                isDark={isDark}
                handleLogout={handleLogout}
                handleProfileSave={handleProfileSave}
                avatarPreview={avatarPreview}
                profileForm={profileForm}
                handleAvatarChange={handleAvatarChange}
                handleAvatarRemove={handleAvatarRemove}
                setAvatarPreview={setAvatarPreview}
                setProfileForm={setProfileForm}
                statusSelection={statusSelection}
                setStatusSelection={setStatusSelection}
                handlePasswordSave={handlePasswordSave}
                passwordForm={passwordForm}
                setPasswordForm={setPasswordForm}
                userColor={userColor}
                profileError={profileError}
                passwordError={passwordError}
              />
            </div>
          ) : null}

          <div className={mobileTab === "settings" ? "hidden min-h-0 h-full" : "block min-h-0 h-full"}>
            <div className="app-scroll h-full overflow-y-auto overflow-x-hidden px-6 pb-[104px] md:h-[calc(100%-88px)] md:pb-4">
            <ChatsListPanel
              loadingChats={loadingChats}
              visibleChats={visibleChats}
              user={user}
              editMode={editMode}
              activeChatId={activeChatId}
              selectedChats={selectedChats}
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
            />
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 hidden h-[88px] border-t border-slate-300/80 bg-white px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900 md:block">
          <div className="flex h-full items-center justify-between">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${hasPersian(displayInitials) ? "font-fa" : ""}`}
                  style={getAvatarStyle(userColor)}
                >
                  {displayInitials}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">{displayName}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                  {statusValue}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
              aria-label="Open settings"
              ref={settingsButtonRef}
            >
              <Settings size={18} className="icon-anim-spin-dir" />
            </button>
          </div>
        </div>
      </aside>

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
        onUserScrollIntent={handleUserScrollIntent}
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
          setAvatarPreview={setAvatarPreview}
          setProfileForm={setProfileForm}
          statusSelection={statusSelection}
          setStatusSelection={setStatusSelection}
          handlePasswordSave={handlePasswordSave}
          passwordForm={passwordForm}
          setPasswordForm={setPasswordForm}
          userColor={userColor}
          profileError={profileError}
          passwordError={passwordError}
        />
      ) : null}
    </div>
  );
}



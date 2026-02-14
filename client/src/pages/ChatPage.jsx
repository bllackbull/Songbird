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
const PENDING_MESSAGE_TIMEOUT_MS = 5 * 60 * 1000;
const PENDING_RETRY_INTERVAL_MS = 4000;
const MESSAGE_UPLOAD_LIMITS = {
  maxFiles: 10,
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxTotalBytes: 75 * 1024 * 1024,
};


export default function ChatPage({ user, setUser, isDark, setIsDark, toggleTheme }) {
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
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
  const chatScrollRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const userScrolledUpRef = useRef(false);
  const pendingScrollToBottomRef = useRef(false);
  const pendingScrollToUnreadRef = useRef(null);
  const unreadMarkerIdRef = useRef(null);
  const openingHadUnreadRef = useRef(false);
  const shouldAutoMarkReadRef = useRef(true);
  const openingChatRef = useRef(false);
  const pendingUploadFilesRef = useRef([]);
  const [profileForm, setProfileForm] = useState({
    nickname: user?.nickname || "",
    username: user?.username || "",
    avatarUrl: user?.avatarUrl || "",
  });
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || "");
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

  const settingsMenuRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const sseReconnectRef = useRef(null);
  const isMarkingReadRef = useRef(false);
  const sendingClientIdsRef = useRef(new Set());

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
    };
  }, []);

  useEffect(() => {
    if (user) {
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
    if (!user) return;
    const interval = setInterval(() => {
      void loadChats({ silent: true });
    }, 20000);
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
    const interval = setInterval(ping, 5000);
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
        const users = (data.users || []).slice(0, 5);
        setNewChatResults(users);
      } catch (err) {
        setNewChatError(err.message);
      } finally {
        setNewChatLoading(false);
      }
    }, 300);
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
    const interval = setInterval(checkHealth, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (user && activeChatId) {
      const openedChatId = Number(activeChatId);
      const openedChat = chats.find((chat) => chat.id === openedChatId);
      openingHadUnreadRef.current = Boolean((openedChat?.unread_count || 0) > 0);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setLoadingMessages(true);
      setMessages([]);
      lastMessageIdRef.current = null;
      setUnreadInChat(0);
      userScrolledUpRef.current = false;
      setUserScrolledUp(false);
      setUnreadMarkerId(null);
      unreadMarkerIdRef.current = null;
      pendingScrollToUnreadRef.current = null;
      shouldAutoMarkReadRef.current = true;
      openingChatRef.current = true;
      pendingScrollToBottomRef.current = true;
      setChats((prev) =>
        prev.map((chat) =>
            chat.id === openedChatId ? { ...chat, unread_count: 0 } : chat,
        ),
      );
      void (async () => {
        await loadMessages(openedChatId, { initialLoad: true });
        await fetch(`${API_BASE}/api/messages/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: openedChatId, username: user.username }),
        }).catch(() => null);
        await loadChats({ silent: true });
      })();
    }
  }, [user, activeChatId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

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
      }, 340);
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
      return normalized.endsWith("Z")
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

  useEffect(() => {
    if (!user || !activeChatId) return;
    const interval = setInterval(() => {
      void loadMessages(Number(activeChatId), { silent: true });
    }, 20000);
    return () => clearInterval(interval);
  }, [user, activeChatId]);

  // Helper to close conversation after mobile slide animation completes
  const closeChat = () => {
    setMobileTab("chats");
    setTimeout(() => {
      setActiveChatId(null);
      setActivePeer(null);
    }, 340);
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
    const interval = setInterval(fetchPresence, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeHeaderPeer?.username]);

  useLayoutEffect(() => {
    if (!activeChatId) return;
    const container = chatScrollRef.current;
    if (!container) return;
    const snapToBottom = () => {
      const rafIds = [];
      const applyBottom = () => {
        const el = chatScrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight + 1000;
      };
      applyBottom();
      rafIds.push(
        requestAnimationFrame(() => {
          applyBottom();
          rafIds.push(
            requestAnimationFrame(() => {
              applyBottom();
            }),
          );
        }),
      );
      const timeoutId = window.setTimeout(applyBottom, 90);
      return () => {
        rafIds.forEach((id) => cancelAnimationFrame(id));
        window.clearTimeout(timeoutId);
      };
    };
    if (pendingScrollToUnreadRef.current) {
      const target = document.getElementById(
        `message-${pendingScrollToUnreadRef.current}`,
      );
      if (target) {
        const top = target.offsetTop - container.offsetTop - 24;
        container.scrollTop = Math.max(top, 0);
        pendingScrollToUnreadRef.current = null;
      }
      return;
    }
    const shouldScroll =
      pendingScrollToBottomRef.current ||
      (!userScrolledUpRef.current && isAtBottomRef.current);
    if (!shouldScroll) return;
    if (
      pendingScrollToBottomRef.current &&
      loadingMessages &&
      messages.length === 0
    ) {
      return;
    }
    const cleanupSnap = snapToBottom();
    pendingScrollToBottomRef.current = false;
    return cleanupSnap;
  }, [messages, activeChatId, loadingMessages, pendingUploadFiles.length]);

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
          void loadMessages(currentActiveId, { silent: true });
        }
      };

      source.onerror = () => {
        source?.close();
        if (!isMounted) return;
        if (sseReconnectRef.current) {
          clearTimeout(sseReconnectRef.current);
        }
        sseReconnectRef.current = setTimeout(connect, 2000);
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
      const res = hasFiles
        ? await (async () => {
            const form = new FormData();
            form.append("username", user.username);
            form.append("chatId", String(targetChatId));
            form.append("body", pendingMessage.body || "");
            form.append("uploadType", pendingMessage._uploadType || "document");
            pendingMessage._files.forEach((item) => {
              if (item?.file instanceof File) {
                form.append("files", item.file, item.name || item.file.name);
              }
            });
            return fetch(`${API_BASE}/api/messages/upload`, {
              method: "POST",
              body: form,
            });
          })()
        : await fetch(`${API_BASE}/api/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: user.username,
              body: pendingMessage.body,
              chatId: targetChatId,
            }),
          });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to send message.");
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg._clientId === clientId
            ? {
                ...msg,
                id: Number(data.id) || msg.id,
                _delivery: "sent",
              }
            : msg,
        ),
      );
      pendingScrollToBottomRef.current = true;
      await loadChats({ silent: true });
      await loadMessages(targetChatId, { silent: true, forceBottom: true });
    } catch (_) {
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
          if (!queuedAt || now - queuedAt < PENDING_MESSAGE_TIMEOUT_MS) {
            return msg;
          }
          changed = true;
          return { ...msg, _delivery: "failed" };
        });
        return changed ? next : prev;
      });
    }, 1000);
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
    }, PENDING_RETRY_INTERVAL_MS);
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
      setChats(list);
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
      const res = await fetch(
        `${API_BASE}/api/messages?chatId=${chatId}&username=${encodeURIComponent(
          user.username,
        )}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load messages.");
      }
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
      setMessages((prev) => {
        const pendingLocal = prev.filter(
          (msg) =>
            (msg._delivery === "sending" || msg._delivery === "failed") &&
            Number(msg._chatId || chatId) === Number(chatId),
        );
        const mergedNext = pendingLocal.length
          ? [...nextMessages, ...pendingLocal]
          : nextMessages;
        const hasLocalTransient = prev.some(
          (msg) => msg._clientId || msg._delivery || msg._files,
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
      const newFromSelf = lastMsg?.username === user.username;
      lastMessageIdRef.current = lastId;

      if (openingChatRef.current) {
        if (openingHadUnreadRef.current) {
          const firstUnread = nextMessages.find(
            (msg) => msg.username !== user.username && !msg.read_at,
          );
          if (firstUnread) {
            setUnreadMarkerId(firstUnread.id);
            unreadMarkerIdRef.current = firstUnread.id;
            pendingScrollToUnreadRef.current = firstUnread.id;
            pendingScrollToBottomRef.current = false;
            shouldAutoMarkReadRef.current = false;
            userScrolledUpRef.current = true;
            setUserScrolledUp(true);
            isAtBottomRef.current = false;
            setIsAtBottom(false);
          } else {
            setUnreadMarkerId(null);
            unreadMarkerIdRef.current = null;
            pendingScrollToUnreadRef.current = null;
            shouldAutoMarkReadRef.current = true;
            pendingScrollToBottomRef.current = true;
            userScrolledUpRef.current = false;
            setUserScrolledUp(false);
            isAtBottomRef.current = true;
            setIsAtBottom(true);
          }
        } else {
          setUnreadMarkerId(null);
          unreadMarkerIdRef.current = null;
          pendingScrollToUnreadRef.current = null;
          shouldAutoMarkReadRef.current = true;
          pendingScrollToBottomRef.current = true;
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
          isAtBottomRef.current = true;
          setIsAtBottom(true);
        }
        openingHadUnreadRef.current = false;
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

      if (newFromSelf) {
        pendingScrollToBottomRef.current = true;
        isAtBottomRef.current = true;
        setIsAtBottom(true);
        userScrolledUpRef.current = false;
        setUserScrolledUp(false);
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

  function handleUploadFilesSelected(fileList, uploadType, append = false) {
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

    if (combinedCount > MESSAGE_UPLOAD_LIMITS.maxFiles) {
      setUploadError(`Maximum ${MESSAGE_UPLOAD_LIMITS.maxFiles} files per message.`);
      return;
    }
    const oversize = incoming.find(
      (file) => Number(file.size || 0) > MESSAGE_UPLOAD_LIMITS.maxFileSizeBytes,
    );
    if (oversize) {
      setUploadError("Each file must be smaller than 25 MB.");
      return;
    }
    const existingBytes = existing.reduce(
      (sum, file) => sum + Number(file.sizeBytes || file.size || 0),
      0,
    );
    const incomingBytes = incoming.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const totalBytes = existingBytes + incomingBytes;
    if (totalBytes > MESSAGE_UPLOAD_LIMITS.maxTotalBytes) {
      setUploadError("Total upload size cannot exceed 75 MB.");
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

    const nextItems = incoming.map((file) => ({
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: Number(file.size || 0),
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
          name: item.name,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          url: null,
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
        files: pendingFiles.map((file) => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
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

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      setProfileForm((prev) => ({ ...prev, avatarUrl: "" }));
      setAvatarPreview("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setProfileForm((prev) => ({ ...prev, avatarUrl: result }));
      setAvatarPreview(result);
    };
    reader.readAsDataURL(file);
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
      const res = await fetch(`${API_BASE}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentUsername: user.username,
          username: trimmedUsername,
          nickname: profileForm.nickname,
          avatarUrl: profileForm.avatarUrl,
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
    const threshold = 120;
    const atBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < threshold;
    if (isAtBottomRef.current !== atBottom) {
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    }
    if (userScrolledUpRef.current === atBottom) {
      userScrolledUpRef.current = !atBottom;
      setUserScrolledUp(!atBottom);
    }
    if (atBottom) {
      setUnreadInChat(0);
    }
  };

  const handleJumpToLatest = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    setUnreadInChat(0);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);
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
        messages={messages}
        user={user}
        formatTime={formatTime}
        unreadMarkerId={unreadMarkerId}
        loadingMessages={loadingMessages}
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
        onUploadFilesSelected={handleUploadFilesSelected}
        onRemovePendingUpload={removePendingUpload}
        onClearPendingUploads={clearPendingUploads}
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



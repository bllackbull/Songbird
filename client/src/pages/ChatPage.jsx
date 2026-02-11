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

const API_BASE = "";


export default function ChatPage({ user, setUser, isDark, setIsDark, toggleTheme }) {
  const [status, setStatus] = useState("");
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
  const chatScrollRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const userScrolledUpRef = useRef(false);
  const pendingScrollToBottomRef = useRef(false);
  const pendingScrollToUnreadRef = useRef(null);
  const unreadMarkerIdRef = useRef(null);
  const shouldAutoMarkReadRef = useRef(true);
  const openingChatRef = useRef(false);
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

  const settingsMenuRef = useRef(null);
  const settingsButtonRef = useRef(null);

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
    }, 5000);
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
    const interval = setInterval(ping, 20000);
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
        const users = data.users || [];
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
    const interval = setInterval(checkHealth, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (user && activeChatId) {
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
      void loadMessages(Number(activeChatId), { initialLoad: true });
    }
  }, [user, activeChatId]);

  useEffect(() => {
    if (!activeChatId) {
      setUnreadInChat(0);
    }
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
  const statusValueRaw = user.status || "online";
  const statusValue = statusValueRaw === "idle" ? "online" : statusValueRaw;
  const statusDotClass =
    statusValue === "invisible"
      ? "bg-slate-400"
      : statusValue === "online"
        ? "bg-emerald-400"
        : "";

  const lastSeenAt = peerPresence.lastSeen
    ? new Date(peerPresence.lastSeen).getTime()
    : null;
  const peerIdleThreshold = 90 * 1000;
  const isIdle =
    lastSeenAt !== null && Date.now() - lastSeenAt > peerIdleThreshold;
  const peerStatusLabel = !activeHeaderPeer
    ? "offline"
    : isIdle
      ? "offline"
      : peerPresence.status === "invisible"
        ? "invisible"
        : "online";

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
    }, 5000);
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
    const interval = setInterval(fetchPresence, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeHeaderPeer?.username]);

  useLayoutEffect(() => {
    if (!activeChatId) return;
    const container = chatScrollRef.current;
    if (!container) return;
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
    container.scrollTop = container.scrollHeight;
    pendingScrollToBottomRef.current = false;
  }, [messages, activeChatId, loadingMessages]);

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
    } catch (err) {
      if (!options.silent) {
        setStatus(err.message);
      }
    } finally {
      if (!options.silent) {
        setLoadingChats(false);
      }
    }
  }

  async function loadMessages(chatId, options = {}) {
    if (!options.silent) {
      setLoadingMessages(true);
      setStatus("");
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
        if (prev.length === nextMessages.length) {
          const prevLast = prev[prev.length - 1];
          const nextLast = nextMessages[nextMessages.length - 1];
          if (
            prevLast?.id === nextLast?.id &&
            prevLast?.read_at === nextLast?.read_at
          ) {
            return prev;
          }
        }
        return nextMessages;
      });
      const lastMsg = nextMessages[nextMessages.length - 1];
      const lastId = lastMsg?.id || null;
      const prevCount = messages.length;
      const newCount = nextMessages.length - prevCount;
      const hasNew =
        lastId &&
        lastMessageIdRef.current &&
        lastId !== lastMessageIdRef.current;
      const newFromSelf = lastMsg?.username === user.username;
      lastMessageIdRef.current = lastId;

      if (openingChatRef.current) {
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
          shouldAutoMarkReadRef.current = true;
          pendingScrollToBottomRef.current = true;
        }
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
        shouldAutoMarkReadRef.current &&
        (!userScrolledUpRef.current || newFromSelf)
      ) {
        await fetch(`${API_BASE}/api/messages/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, username: user.username }),
        });
      }
    } catch (err) {
      setStatus(err.message);
    } finally {
      if (!options.silent) {
        setLoadingMessages(false);
      }
    }
  }

  async function handleSend(event) {
    event.preventDefault();
    if (!activeChatId) return;
    setStatus("");
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
    if (!body.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: user.username,
          body,
          chatId: activeChatId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to send message.");
      }
      form.reset();
      pendingScrollToBottomRef.current = true;
      await loadMessages(activeChatId, { forceBottom: true });
      await loadChats();
    } catch (err) {
      setStatus(err.message);
    }
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
    } catch (err) {
      setStatus(err.message);
    }
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
    setStatus("");
    try {
      const res = await fetch(`${API_BASE}/api/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentUsername: user.username,
          username: profileForm.username,
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
      setStatus(err.message);
    }
  }

  async function handlePasswordSave(event) {
    event.preventDefault();
    setStatus("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setStatus("Passwords do not match.");
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
      setStatus(err.message);
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

  return (
    <div
      className="flex h-full w-full flex-1 flex-col overflow-hidden md:flex-row md:gap-0"
      style={{
        height: "var(--app-height, 100dvh)",
        paddingTop: "max(0px, env(safe-area-inset-top))",
        paddingLeft: "max(0px, env(safe-area-inset-left))",
        paddingRight: "max(0px, env(safe-area-inset-right))",
      }}
    >
      <aside
        className={
          "relative flex h-full w-full flex-col overflow-hidden border border-emerald-100/70 bg-emerald-50 shadow-lg shadow-emerald-500/10 dark:border-white/5 dark:bg-slate-900 md:w-[35%] md:shadow-xl md:shadow-emerald-500/15 " +
          (mobileTab === "chat" ? "hidden md:block" : "block")
        }
      >
        <div className="grid h-[72px] grid-cols-[1fr,auto,1fr] items-center border-b border-emerald-100/70 bg-emerald-50 px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900">
          {mobileTab === "settings" ? (
            <div className="col-span-3 text-center text-lg font-semibold md:hidden">Settings</div>
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
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="Exit edit mode"
                  >
                    <Close size={18} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditMode(true)}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="Edit chat list"
                  >
                    <Pencil size={18} />
                  </button>
                )}
              </div>
              <h2 className="text-center text-lg font-semibold">
                <span className="inline-flex items-center gap-2">
                  {!editMode && !isConnected ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  {editMode ? "Edit" : isConnected ? "Chats" : "Connecting..."}
                </span>
              </h2>
              <div className="flex justify-end">
                {editMode ? (
                  <button
                    type="button"
                    onClick={() => requestDeleteChats(selectedChats)}
                    disabled={!selectedChats.length}
                    className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                    aria-label="Delete chats"
                  >
                    <Trash size={18} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setNewChatOpen(true)}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="New chat"
                  >
                    <Plus size={18} />
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
          className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 pb-[104px]"
          style={{ overscrollBehavior: "contain" }}
        >
          {mobileTab === "settings" ? (
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
            />
          ) : null}

          <div className={mobileTab === "settings" ? "hidden" : "block"}>
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

        <div className="absolute bottom-0 left-0 right-0 hidden h-[88px] border-t border-emerald-100/70 bg-emerald-50 px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900 md:block">
          <div className="flex h-full items-center justify-between">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: userColor }}
                >
                  {displayName.slice(0, 1).toUpperCase()}
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
              className="flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
              aria-label="Open settings"
              ref={settingsButtonRef}
            >
              <Settings size={18} />
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
        status={status}
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
        />
      ) : null}
    </div>
  );
}

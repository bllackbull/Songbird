import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Close,
  Ghost,
  LoaderCircle,
} from "../icons/lucide.js";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { hasPersian } from "../utils/fontUtils.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import {
  FocusedMediaModal,
  MessageComposer,
  MessageItem,
  MessageTimeline,
  useFocusedMedia,
  useFloatingDayChip,
} from "./chat/index.js";

export default function ChatWindowPanel({
  mobileTab,
  activeChatId,
  closeChat,
  activeHeaderPeer,
  activeFallbackTitle,
  peerStatusLabel,
  isGroupChat = false,
  isChannelChat = false,
  isSavedChat = false,
  groupAvatarColor = null,
  groupAvatarUrl = "",
  channelSeenCounts = null,
  chatScrollRef,
  onChatScroll,
  onStartReached,
  messages,
  user,
  formatTime,
  unreadMarkerId,
  loadingMessages,
  loadingOlderMessages,
  hasOlderMessages,
  handleSend,
  userScrolledUp,
  unreadInChat,
  onJumpToLatest,
  isConnected,
  isDark,
  insecureConnection,
  pendingUploadFiles,
  pendingUploadType,
  pendingVoiceMessage,
  onVoiceRecorded,
  onClearPendingVoiceMessage,
  uploadError,
  activeUploadProgress,
  messageMaxChars = null,
  onMessageInput,
  onMessageMediaLoaded,
  onUploadFilesSelected,
  onRemovePendingUpload,
  onClearPendingUploads,
  replyTarget,
  onClearReply,
  onReplyToMessage,
  onOpenHeaderProfile,
  onOpenMessageSenderProfile,
  onOpenMention,
  mentionRefreshToken = 0,
  onUserScrollIntent,
  fileUploadEnabled = true,
  fileUploadInProgress = false,
  showComposer = true,
  headerClickable = true,
  showStatus = true,
  headerAvatarIcon = null,
  headerAvatarColor = null,
}) {
  const MEDIA_CACHE_VERSION = 1;
  const MEDIA_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MEDIA_THUMB_CACHE_KEY = "chat-media-thumbs-v2";
  const VIDEO_POSTER_CACHE_KEY = "chat-video-posters-v3";
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false,
  );
  const [isMobileTouchDevice, setIsMobileTouchDevice] = useState(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches
      : false,
  );
  const activePeerColor =
    activeHeaderPeer?.color || headerAvatarColor || groupAvatarColor || "#10b981";
  const activePeerInitials = getAvatarInitials(activeFallbackTitle || "S");
  const canOpenHeaderProfile = headerClickable && typeof onOpenHeaderProfile === "function";

  const readMediaCache = useCallback(
    (key) => {
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== MEDIA_CACHE_VERSION) return null;
        const updatedAt = Number(parsed.updatedAt || 0);
        if (!Number.isFinite(updatedAt)) return null;
        if (Date.now() - updatedAt > MEDIA_CACHE_TTL_MS) {
          window.localStorage.removeItem(key);
          return null;
        }
        return parsed;
      } catch (_) {
        return null;
      }
    },
    [MEDIA_CACHE_TTL_MS, MEDIA_CACHE_VERSION],
  );

  const [loadedMediaThumbs, setLoadedMediaThumbs] = useState(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const cached = readMediaCache(MEDIA_THUMB_CACHE_KEY);
      const items = Array.isArray(cached?.items) ? cached.items : [];
      return new Set(items.map((item) => String(item)));
    } catch (_) {
      return new Set();
    }
  });
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchDxRef = useRef(0);
  const touchDyRef = useRef(0);
  const trackingSwipeRef = useRef(false);
  const uploadMenuRef = useRef(null);
  const mediaInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [composerHeight, setComposerHeight] = useState(80);
  const [mediaAspectByKey, setMediaAspectByKey] = useState(() => ({}));
  const [videoPosterByUrl, setVideoPosterByUrl] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      const cached = readMediaCache(VIDEO_POSTER_CACHE_KEY);
      const posters = cached?.posters;
      return posters && typeof posters === "object" ? posters : {};
    } catch (_) {
      return {};
    }
  });
  const uploadBusy = !fileUploadEnabled || fileUploadInProgress;
  const timelineBottomSpacerPx = 4;
  const [hideInsecureTooltip, setHideInsecureTooltip] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("songbird-insecure-dismissed") === "1";
  });
  const isLocalhost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1" ||
      window.location.hostname.endsWith(".localhost"));
  const insecureTooltipRef = useRef(null);
  const [insecureTooltipHeight, setInsecureTooltipHeight] = useState(0);
  useEffect(() => {
    if (!insecureConnection) return;
    if (typeof window === "undefined") return;
    const dismissed =
      window.localStorage.getItem("songbird-insecure-dismissed") === "1";
    setHideInsecureTooltip(dismissed);
  }, [insecureConnection]);
  useLayoutEffect(() => {
    if (!insecureConnection || hideInsecureTooltip) {
      setInsecureTooltipHeight(0);
      return;
    }
    const node = insecureTooltipRef.current;
    if (!node || typeof window === "undefined") return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setInsecureTooltipHeight(Number(rect?.height || 0));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [insecureConnection, hideInsecureTooltip]);
  const {
    focusedMedia,
    setFocusedMedia,
    focusVisible,
    setFocusVisible,
    focusedVideoRef,
    focusedVideoPlaying,
    focusedVideoMuted,
    focusedVideoTime,
    focusedVideoDuration,
    focusedVideoHint,
    focusedMediaLoaded,
    setFocusedMediaLoaded,
    focusedVideoDecodeIssue,
    focusExpiryWarning,
    openFocusMedia,
    closeFocusMedia,
    toggleFocusedVideoPlay,
    toggleFocusedVideoMute,
    seekFocusedVideo,
    handleFocusedVideoLoadedData,
    handleFocusedVideoLoadedMetadata,
    handleFocusedVideoCanPlay,
    handleFocusedVideoError,
    handleFocusTouchStart,
    handleFocusTouchEnd,
    getFocusAspectRatio,
    getFocusFrameStyle,
    formatSeconds,
  } = useFocusedMedia({ isDesktop, isMobileTouchDevice });
  const {
    floatingDay,
    setFloatingDay,
    floatingChipRef,
    floatingDayLockByClickRef,
    floatingDayLockUntilRef,
    isTimelineScrollable,
    setIsTimelineScrollable,
    resetFloatingLocks,
    updateFloatingDayFromScroll,
    handleFloatingChipClick,
  } = useFloatingDayChip();
  const groupedMessages = useMemo(() => {
    const groups = [];
    messages.forEach((msg) => {
      const dayKey = msg?._dayKey || getMessageDayLabel(msg);
      const dayLabel = getMessageDayLabel(msg);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.dayKey !== dayKey) {
        groups.push({
          dayKey,
          dayLabel,
          items: [msg],
        });
      } else {
        lastGroup.items.push(msg);
      }
    });
    return groups;
  }, [messages]);

  const refreshTimelineScrollable = useCallback(() => {
    const scroller = chatScrollRef?.current;
    if (!scroller || !activeChatId) {
      setIsTimelineScrollable(false);
      return;
    }
    const canScroll = scroller.scrollHeight - scroller.clientHeight > 2;
    setIsTimelineScrollable(canScroll);
  }, [activeChatId, chatScrollRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) {
      setFloatingDay({ key: "", label: "" });
      return;
    }
    const key = last?._dayKey || "";
    const label = getMessageDayLabel(last);
    if (key && label) {
      setFloatingDay({ key, label });
    }
  }, [messages]);

  const startReachedLockRef = useRef(false);
  const handlePanelScroll = useCallback((event) => {
    onChatScroll?.(event);
    const target = event?.currentTarget;
    if (target) {
      const isNearBottom =
        target.scrollHeight - (target.scrollTop + target.clientHeight) <= 4;
      if (isNearBottom && floatingDayLockByClickRef.current) {
        resetFloatingLocks();
      }
      const canScroll = target.scrollHeight - target.clientHeight > 2;
      if (canScroll !== isTimelineScrollable) {
        setIsTimelineScrollable(canScroll);
      }
      updateFloatingDayFromScroll(target);
    }
    if (
      !target ||
      !hasOlderMessages ||
      loadingOlderMessages ||
      !onStartReached ||
      startReachedLockRef.current
    ) {
      return;
    }
    if (target.scrollTop <= 80) {
      startReachedLockRef.current = true;
      Promise.resolve(onStartReached())
        .catch(() => null)
        .finally(() => {
          window.setTimeout(() => {
            startReachedLockRef.current = false;
          }, 120);
        });
    }
  }, [
    onChatScroll,
    hasOlderMessages,
    loadingOlderMessages,
    onStartReached,
    isTimelineScrollable,
    resetFloatingLocks,
    updateFloatingDayFromScroll,
  ]);

  const handleScrollIntent = useCallback(() => {
    resetFloatingLocks();
    onUserScrollIntent?.();
  }, [onUserScrollIntent, resetFloatingLocks]);

  const handleComposerResize = useCallback(() => {
    if (!activeChatId || userScrolledUp) return;
    const container = chatScrollRef?.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight + 1000, behavior: "auto" });
  }, [activeChatId, chatScrollRef, userScrolledUp]);

  useEffect(() => {
    if (!activeChatId || !pendingUploadFiles?.length) return;
    const scrollToBottomInstant = () => {
      const container = chatScrollRef?.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight + 1000, behavior: "auto" });
    };
    const raf = requestAnimationFrame(scrollToBottomInstant);
    return () => cancelAnimationFrame(raf);
  }, [activeChatId, pendingUploadFiles?.length, messages.length, chatScrollRef]);

  useEffect(() => {
    if (!activeChatId) {
      setIsTimelineScrollable(false);
      return;
    }
    const run = () => refreshTimelineScrollable();
    const raf1 = requestAnimationFrame(run);
    const raf2 = requestAnimationFrame(run);
    const timer = window.setTimeout(run, 120);
    window.addEventListener("resize", run);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
      window.removeEventListener("resize", run);
    };
  }, [
    activeChatId,
    messages.length,
    groupedMessages.length,
    pendingUploadFiles?.length,
    activeUploadProgress,
    loadingMessages,
    refreshTimelineScrollable,
  ]);

  useEffect(() => {
    if (isDesktop || !activeChatId) return;
    let firstVideoUrl = null;
    for (let i = 0; i < messages.length; i += 1) {
      const files = Array.isArray(messages[i]?.files) ? messages[i].files : [];
      const videoFile = files.find((file) => getFileRenderType(file) === "video" && file?.url);
      if (videoFile?.url) {
        firstVideoUrl = videoFile.url;
        break;
      }
    }
    if (!firstVideoUrl) return;
    const warmupVideo = document.createElement("video");
    warmupVideo.preload = "auto";
    warmupVideo.muted = true;
    warmupVideo.playsInline = true;
    warmupVideo.src = firstVideoUrl;
    warmupVideo.load();
    return () => {
      warmupVideo.removeAttribute("src");
      warmupVideo.load();
    };
  }, [isDesktop, activeChatId, messages]);

  useEffect(() => {
    if (!showUploadMenu) return;
    const handleOutside = (event) => {
      if (uploadMenuRef.current?.contains(event.target)) return;
      setShowUploadMenu(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showUploadMenu]);

  useEffect(() => {
    if (!uploadBusy) return;
    setShowUploadMenu(false);
  }, [uploadBusy]);

  useEffect(() => {
    setFocusedMedia(null);
    setFocusVisible(false);
  }, [activeChatId]);

  useEffect(() => {
    const cached = readMediaCache(MEDIA_THUMB_CACHE_KEY);
    const items = Array.isArray(cached?.items) ? cached.items : [];
    setLoadedMediaThumbs(new Set(items.map((item) => String(item))));
    setMediaAspectByKey({});
  }, [activeChatId, readMediaCache, MEDIA_THUMB_CACHE_KEY]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px) and (pointer: coarse)");
    const update = () => setIsMobileTouchDevice(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);


  function getMessageDayLabel(msg) {
    if (msg?._dayLabel) return msg._dayLabel;
    if (msg?._dayKey) return msg._dayKey;
    if (!msg?.created_at) return "";
    const date = new Date(msg.created_at);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  const handleGroupChipClick = (groupIndex) => {
    const dayKey = groupedMessages[groupIndex]?.dayKey;
    if (!dayKey) return;
    const node = document.getElementById(`day-group-${dayKey}`);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };

  const chatScrollStyle = useMemo(
    () => ({
      backgroundImage: isDark
        ? "radial-gradient(circle at top right, rgba(16,185,129,0.22), transparent 48%), radial-gradient(circle at bottom left, rgba(16,185,129,0.20), transparent 44%)"
        : "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 45%), radial-gradient(circle at bottom left, rgba(16,185,129,0.09), transparent 40%)",
      backgroundColor: isDark ? "#0b1320" : "#dcfce7",
      scrollbarGutter: "stable both-edges",
      paddingTop:
        activeChatId && insecureConnection
          ? insecureConnection
            ? "1.25rem"
            : "0.75rem"
          : undefined,
      paddingBottom: activeChatId
        ? showComposer
          ? `max(1rem, calc(env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px) + ${
              isDesktop ? "1rem" : "1rem"
            }))`
          : `max(1rem, calc(env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px)))`
        : undefined,
      overflowAnchor: "none",
    }),
    [
      activeChatId,
      insecureConnection,
      isDark,
      isDesktop,
    ],
  );

  const handleTouchStart = (event) => {
    if (!activeChatId) return;
    if (isDesktop) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    // Start near left edge to avoid interfering with message scroll/swipes.
    trackingSwipeRef.current = touch.clientX <= 40;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchDxRef.current = 0;
    touchDyRef.current = 0;
  };

  const handleTouchMove = (event) => {
    if (!trackingSwipeRef.current) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    touchDxRef.current = touch.clientX - touchStartXRef.current;
    touchDyRef.current = touch.clientY - touchStartYRef.current;
  };

  const handleTouchEnd = () => {
    if (!trackingSwipeRef.current) return;
    const dx = touchDxRef.current;
    const dy = Math.abs(touchDyRef.current);
    trackingSwipeRef.current = false;
    if (dx > 80 && dy < 70) {
      closeChat?.();
    }
  };

  const getFileRenderType = (file) => {
    const explicitKind = String(file?.kind || "").toLowerCase();
    const mimeType = String(file?.mimeType || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    if (mimeType.startsWith("audio/")) return "audio";
    if (explicitKind === "voice" || explicitKind === "audio") return "audio";
    if (explicitKind === "document") return "document";
    if (explicitKind === "media") {
      const explicitMime = String(file?.mimeType || "").toLowerCase();
      if (explicitMime.startsWith("image/")) return "image";
      if (explicitMime.startsWith("video/")) return "video";
    }
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (/\.(mp3|m4a|aac|wav|ogg|opus|webm)$/.test(name)) return "audio";
    if (/\.(gif|png|jpe?g|webp|bmp|svg)$/.test(name)) return "image";
    if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(name)) return "video";
    return "document";
  };

  const handleVideoThumbLoadedMetadata = (event) => {
    const video = event.currentTarget;
    try {
      if (!isMobileTouchDevice) return;
      const duration = Number(video.duration || 0);
      if (!Number.isFinite(duration) || duration <= 0) return;
      // iOS/Safari can render blank/solid thumbnail at t=0.
      const target = Math.min(0.12, Math.max(duration * 0.02, 0.02));
      if (video.currentTime < target) {
        video.currentTime = target;
      }
    } catch (_) {
      // no-op
    }
  };

  const messageFilesProps = {
    isDesktop,
    loadedMediaThumbs,
    setLoadedMediaThumbs,
    mediaAspectByKey,
    setMediaAspectByKey,
    videoPosterByUrl,
    setVideoPosterByUrl,
    videoPosterCacheKey: VIDEO_POSTER_CACHE_KEY,
    mediaThumbCacheKey: MEDIA_THUMB_CACHE_KEY,
    mediaCacheVersion: MEDIA_CACHE_VERSION,
    openFocusMedia,
    onMessageMediaLoaded,
    handleVideoThumbLoadedMetadata,
    getFileRenderType,
  };

  const renderMessageItem = (msg, options = {}) => (
    <MessageItem
      msg={msg}
      isFirstInGroup={options.isFirstInGroup}
      user={user}
      formatTime={formatTime}
      unreadMarkerId={unreadMarkerId}
      messageFilesProps={messageFilesProps}
      getMessageDayLabel={getMessageDayLabel}
      isDesktop={isDesktop}
      isMobileTouchDevice={isMobileTouchDevice}
      onReply={onReplyToMessage}
      isGroupChat={isGroupChat}
      isChannelChat={isChannelChat}
      seenCount={
        isChannelChat
          ? channelSeenCounts?.[Number(msg?._serverId || msg?.id || 0)] ??
            msg?.seenCount ??
            null
          : null
      }
      onOpenSenderProfile={onOpenMessageSenderProfile}
      onOpenMention={onOpenMention}
      mentionRefreshToken={mentionRefreshToken}
      onJumpToMessage={(messageId) => {
        const target = document.getElementById(`message-${messageId}`);
        if (target && typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        const bubble = target?.querySelector?.("[data-message-bubble]");
        if (!bubble) return;
        let flashed = false;
        const playFlash = () => {
          if (flashed) return;
          flashed = true;
          bubble.classList.remove("reply-flash");
          void bubble.offsetWidth;
          bubble.classList.add("reply-flash");
          window.setTimeout(() => {
            bubble.classList.remove("reply-flash");
          }, 700);
        };
        const scrollRoot = chatScrollRef?.current || null;
        if (!("IntersectionObserver" in window)) {
          window.setTimeout(playFlash, 360);
          return;
        }
        const observer = new IntersectionObserver(
          (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            observer.disconnect();
            playFlash();
          },
          { root: scrollRoot, threshold: 0.5 },
        );
        observer.observe(target);
        window.setTimeout(() => {
          observer.disconnect();
          playFlash();
        }, 900);
      }}
    />
  );

  return (
    <section
      className={
        "fixed inset-0 top-0 z-20 md:relative md:inset-auto md:top-auto md:z-auto flex h-full flex-1 flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-xl shadow-emerald-500/10 dark:border-white/5 dark:bg-slate-900 md:border md:w-[65%] md:shadow-2xl md:shadow-emerald-500/15 transition-transform duration-300 ease-out will-change-transform " +
        (mobileTab === "chat"
          ? "transform-none"
          : "translate-x-full md:transform-none")
      }
      style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {activeChatId ? (
        <>
          <div
            className="fixed inset-x-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-slate-300/80 bg-white px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900 md:sticky md:top-0 md:inset-x-auto md:z-20"
            style={{ top: "max(0px, env(safe-area-inset-top))" }}
          >
            <button
              type="button"
              onClick={closeChat}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 md:invisible md:pointer-events-none"
              aria-label="Back to chats"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1">
              <>
                {activeHeaderPeer?.isDeleted ? (
                  <span
                    className={`block min-w-0 max-w-[60vw] truncate text-center text-lg font-semibold text-slate-500 dark:text-slate-400 sm:max-w-[40vw] md:max-w-[28vw] ${
                      hasPersian(activeFallbackTitle) ? "font-fa" : ""
                    }`}
                    dir="auto"
                    style={{ unicodeBidi: "plaintext" }}
                    title={activeFallbackTitle}
                  >
                    {activeFallbackTitle}
                  </span>
                ) : (
                  canOpenHeaderProfile ? (
                    <button
                      type="button"
                      onClick={onOpenHeaderProfile}
                      className="min-w-0 max-w-[60vw] text-center text-lg font-semibold transition hover:text-emerald-600 dark:hover:text-emerald-300 sm:max-w-[40vw] md:max-w-[28vw]"
                      dir="auto"
                      style={{ unicodeBidi: "plaintext" }}
                      title={activeFallbackTitle}
                    >
                      <span
                        className={`block min-w-0 truncate ${
                          hasPersian(activeFallbackTitle) ? "font-fa" : ""
                        }`}
                        dir="auto"
                        style={{ unicodeBidi: "plaintext" }}
                      >
                        {activeFallbackTitle}
                      </span>
                    </button>
                  ) : (
                    <span
                      className={`block min-w-0 max-w-[60vw] truncate text-center text-lg font-semibold text-slate-700 dark:text-slate-100 sm:max-w-[40vw] md:max-w-[28vw] ${
                        hasPersian(activeFallbackTitle) ? "font-fa" : ""
                      }`}
                      dir="auto"
                      style={{ unicodeBidi: "plaintext" }}
                      title={activeFallbackTitle}
                    >
                      {activeFallbackTitle}
                    </span>
                  )
                )}
                {showStatus ? (
                  <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    {!isConnected ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin text-emerald-500" />
                        Connecting...
                      </>
                    ) : (
                      isGroupChat || isChannelChat ? (
                        <span className="whitespace-nowrap text-[11px] sm:text-xs">
                          {peerStatusLabel}
                        </span>
                      ) : (
                        <>
                          <span
                            className={`h-2 w-2 rounded-full ${
                              peerStatusLabel === "online" ? "bg-emerald-400" : "bg-slate-400"
                            }`}
                          />
                          {peerStatusLabel}
                        </>
                      )
                    )}
                  </p>
                ) : null}
              </>
            </div>
            {headerAvatarIcon ? (
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                style={getAvatarStyle(activePeerColor)}
              >
                {headerAvatarIcon}
              </div>
            ) : activeHeaderPeer ? (
              activeHeaderPeer?.isDeleted ? (
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                  style={getAvatarStyle(activePeerColor)}
                >
                  <Ghost size={18} className="text-slate-600" />
                </div>
              ) : activeHeaderPeer?.avatar_url ? (
                canOpenHeaderProfile ? (
                  <button
                    type="button"
                    onClick={onOpenHeaderProfile}
                    className="group"
                  >
                    <img
                      src={activeHeaderPeer?.avatar_url}
                      alt={activeFallbackTitle}
                      className="h-9 w-9 flex-shrink-0 rounded-full object-cover transition group-hover:ring-2 group-hover:ring-emerald-300"
                    />
                  </button>
                ) : (
                  <img
                    src={activeHeaderPeer?.avatar_url}
                    alt={activeFallbackTitle}
                    className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                  />
                )
              ) : (
                canOpenHeaderProfile ? (
                  <button
                    type="button"
                    onClick={onOpenHeaderProfile}
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition hover:ring-2 hover:ring-emerald-300 ${hasPersian(activePeerInitials) ? "font-fa" : ""}`}
                    style={getAvatarStyle(activePeerColor)}
                  >
                    {activePeerInitials}
                  </button>
                ) : (
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${hasPersian(activePeerInitials) ? "font-fa" : ""}`}
                    style={getAvatarStyle(activePeerColor)}
                  >
                    {activePeerInitials}
                  </div>
                )
              )
            ) : (
              groupAvatarUrl ? (
                canOpenHeaderProfile ? (
                  <button
                    type="button"
                    onClick={onOpenHeaderProfile}
                    className="group"
                  >
                    <img
                      src={groupAvatarUrl}
                      alt={activeFallbackTitle}
                      className="h-9 w-9 flex-shrink-0 rounded-full object-cover transition group-hover:ring-2 group-hover:ring-emerald-300"
                    />
                  </button>
                ) : (
                  <img
                    src={groupAvatarUrl}
                    alt={activeFallbackTitle}
                    className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                  />
                )
              ) : (
                canOpenHeaderProfile ? (
                  <button
                    type="button"
                    onClick={onOpenHeaderProfile}
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition hover:ring-2 hover:ring-emerald-300 ${hasPersian(activePeerInitials) ? "font-fa" : ""}`}
                    style={getAvatarStyle(activePeerColor)}
                  >
                    {activePeerInitials}
                  </button>
                ) : (
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${hasPersian(activePeerInitials) ? "font-fa" : ""}`}
                    style={getAvatarStyle(activePeerColor)}
                  >
                    {activePeerInitials}
                  </div>
                )
              )
            )}
          </div>
          <div className="h-[72px] md:hidden" />
        </>
      ) : null}

      {insecureConnection && activeChatId && !hideInsecureTooltip && !isLocalhost ? (
        <div className="w-full">
          <div
            ref={insecureTooltipRef}
            className="flex w-full items-center justify-between border-y border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 shadow-sm dark:border-rose-500/40 dark:bg-rose-900/40 dark:text-rose-100"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Connection is not secure
            </span>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(
                    "songbird-insecure-dismissed",
                    "1",
                  );
                }
                setHideInsecureTooltip(true);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/40 dark:text-rose-100 dark:hover:bg-rose-900/60"
              aria-label="Dismiss"
            >
              <Close size={14} className="icon-anim-pop relative -left-[0.5px]" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0">
        {activeChatId && floatingDay.key && isTimelineScrollable ? (
          <div
            className="absolute left-1/2 z-[3] -translate-x-1/2"
            style={{
              top: `calc(env(safe-area-inset-top) + 84px + ${
                insecureConnection && activeChatId && !hideInsecureTooltip && !isLocalhost
                  ? Math.max(0, (insecureTooltipHeight || 56) + 16)
                  : 0
              }px)`,
            }}
          >
            <button
              ref={floatingChipRef}
              type="button"
              onClick={(event) =>
                handleFloatingChipClick(event, { chatScrollRef, isDesktop, floatingDay })
              }
              className="inline-flex items-center justify-center rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
            >
              <span className="leading-none">{floatingDay.label}</span>
            </button>
          </div>
        ) : null}

        {!activeChatId ? (
          <div
            ref={chatScrollRef}
            className="chat-scroll flex h-full items-center justify-center overflow-y-auto overflow-x-hidden px-6 py-6"
            style={chatScrollStyle}
          >
            <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
              Select a chat to start
            </div>
          </div>
        ) : (
          <MessageTimeline
            loadingMessages={loadingMessages}
            messages={messages}
            groupedMessages={groupedMessages}
            loadingOlderMessages={loadingOlderMessages}
            handleGroupChipClick={handleGroupChipClick}
            renderMessageItem={renderMessageItem}
            chatScrollRef={chatScrollRef}
            handlePanelScroll={handlePanelScroll}
            handleScrollIntent={handleScrollIntent}
            chatScrollStyle={chatScrollStyle}
            timelineBottomSpacerPx={timelineBottomSpacerPx}
          />
        )}
      </div>

      {showComposer ? (
        <MessageComposer
          activeChatId={activeChatId}
          isDesktop={isDesktop}
          handleSend={handleSend}
          onComposerResize={handleComposerResize}
          replyTarget={replyTarget}
          onClearReply={onClearReply}
          pendingUploadFiles={pendingUploadFiles}
          pendingUploadType={pendingUploadType}
          pendingVoiceMessage={pendingVoiceMessage}
          fileUploadEnabled={fileUploadEnabled}
          mediaInputRef={mediaInputRef}
          documentInputRef={documentInputRef}
          onClearPendingUploads={onClearPendingUploads}
          onRemovePendingUpload={onRemovePendingUpload}
          onUploadFilesSelected={onUploadFilesSelected}
          onVoiceRecorded={onVoiceRecorded}
          onClearPendingVoiceMessage={onClearPendingVoiceMessage}
          uploadError={uploadError}
          activeUploadProgress={activeUploadProgress}
          messageMaxChars={messageMaxChars}
          onMessageInput={onMessageInput}
          uploadBusy={uploadBusy}
          showUploadMenu={showUploadMenu}
          setShowUploadMenu={setShowUploadMenu}
          uploadMenuRef={uploadMenuRef}
          handleVideoThumbLoadedMetadata={handleVideoThumbLoadedMetadata}
          onComposerHeightChange={(value) => {
            setComposerHeight(Math.max(80, Number(value || 80)));
          }}
        />
      ) : null}

      {activeChatId && userScrolledUp ? (
        <button
          type="button"
          onClick={onJumpToLatest}
          className="absolute inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700 shadow-lg transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          style={{
            bottom: isDesktop
              ? `${showComposer ? Math.max(80, composerHeight + 8) : 24}px`
              : `calc(${showComposer ? Math.max(80, composerHeight + 8) : 24}px + env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px))`,
            right: "0.85rem",
            transform: "none",
          }}
          aria-label="Back to latest message"
        >
          <span className="text-lg leading-none">
            <ArrowDown size={18} className="icon-anim-bob" />
          </span>
          {unreadInChat > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white">
              {unreadInChat > 999 ? "+999" : unreadInChat}
            </span>
          ) : null}
        </button>
      ) : null}

      <FocusedMediaModal
        focusedMedia={focusedMedia}
        isDesktop={isDesktop}
        focusVisible={focusVisible}
        closeFocusMedia={closeFocusMedia}
        isMobileTouchDevice={isMobileTouchDevice}
        handleFocusTouchStart={handleFocusTouchStart}
        handleFocusTouchEnd={handleFocusTouchEnd}
        getFocusFrameStyle={getFocusFrameStyle}
        focusedVideoRef={focusedVideoRef}
        toggleFocusedVideoPlay={toggleFocusedVideoPlay}
        handleFocusedVideoLoadedMetadata={handleFocusedVideoLoadedMetadata}
        handleFocusedVideoLoadedData={handleFocusedVideoLoadedData}
        handleFocusedVideoCanPlay={handleFocusedVideoCanPlay}
        handleFocusedVideoError={handleFocusedVideoError}
        focusedMediaLoaded={focusedMediaLoaded}
        onFocusedImageLoad={() => setFocusedMediaLoaded(true)}
        focusedVideoHint={focusedVideoHint}
        focusedVideoDecodeIssue={focusedVideoDecodeIssue}
        focusedVideoPlaying={focusedVideoPlaying}
        focusedVideoMuted={focusedVideoMuted}
        toggleFocusedVideoMute={toggleFocusedVideoMute}
        focusedVideoDuration={focusedVideoDuration}
        focusedVideoTime={focusedVideoTime}
        seekFocusedVideo={seekFocusedVideo}
        formatSeconds={formatSeconds}
        focusExpiryWarning={focusExpiryWarning}
        getFocusAspectRatio={getFocusAspectRatio}
      />

    </section>
  );
}


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock12,
  Download,
  File,
  Image as ImageIcon,
  LoaderCircle,
  Pause,
  Paperclip,
  Play,
  SendHorizonal as Send,
  Volume2,
  VolumeX,
  X as Close,
} from "lucide-react";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { hasPersian } from "../utils/fontUtils.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";

export default function ChatWindowPanel({
  mobileTab,
  activeChatId,
  closeChat,
  activeHeaderPeer,
  activeFallbackTitle,
  peerStatusLabel,
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
  uploadError,
  activeUploadProgress,
  onMessageMediaLoaded,
  onUploadFilesSelected,
  onRemovePendingUpload,
  onClearPendingUploads,
  onUserScrollIntent,
  fileUploadEnabled = true,
  fileUploadInProgress = false,
}) {
  const VIDEO_POSTER_CACHE_KEY = "chat-video-posters-v2";
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false,
  );
  const [isMobileTouchDevice, setIsMobileTouchDevice] = useState(
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px) and (pointer: coarse)").matches
      : false,
  );
  const activePeerColor = activeHeaderPeer?.color || "#10b981";
  const activePeerInitials = getAvatarInitials(activeFallbackTitle || "S");
  const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  const hasUrlPattern = /(?:https?:\/\/|www\.)[^\s<]+/i;
  const isUrlPattern = /^(?:https?:\/\/|www\.)[^\s<]+$/i;
  const [loadedMediaThumbs, setLoadedMediaThumbs] = useState(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.sessionStorage.getItem("chat-media-thumbs");
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((item) => String(item)));
    } catch (_) {
      return new Set();
    }
  });
  const [focusedMedia, setFocusedMedia] = useState(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchDxRef = useRef(0);
  const touchDyRef = useRef(0);
  const trackingSwipeRef = useRef(false);
  const uploadMenuRef = useRef(null);
  const mediaInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const focusedVideoRef = useRef(null);
  const focusUnmountTimerRef = useRef(null);
  const focusEnterRafRef = useRef(null);
  const focusSwipeStartRef = useRef({ x: 0, y: 0, tracking: false });
  const focusedVideoHintTimerRef = useRef(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [mediaAspectByKey, setMediaAspectByKey] = useState(() => ({}));
  const [videoPosterByUrl, setVideoPosterByUrl] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.sessionStorage.getItem(VIDEO_POSTER_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  });
  const [focusedVideoPlaying, setFocusedVideoPlaying] = useState(false);
  const [focusedVideoMuted, setFocusedVideoMuted] = useState(false);
  const [focusedVideoTime, setFocusedVideoTime] = useState(0);
  const [focusedVideoDuration, setFocusedVideoDuration] = useState(0);
  const [focusedVideoHint, setFocusedVideoHint] = useState(null);
  const [focusedMediaLoaded, setFocusedMediaLoaded] = useState(false);
  const [focusedVideoDecodeIssue, setFocusedVideoDecodeIssue] = useState("");
  const [focusNowMs, setFocusNowMs] = useState(Date.now());
  const [floatingDay, setFloatingDay] = useState({ key: "", label: "" });
  const [isTimelineScrollable, setIsTimelineScrollable] = useState(false);
  const uploadBusy = !fileUploadEnabled || fileUploadInProgress;
  const floatingChipRef = useRef(null);
  const floatingDayLockUntilRef = useRef(0);
  const floatingDayLockByClickRef = useRef(false);
  const floatingChipAlignTimerRef = useRef(null);
  const timelineBottomSpacerPx = 4;
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
        floatingDayLockByClickRef.current = false;
        floatingDayLockUntilRef.current = 0;
      }
      const canScroll = target.scrollHeight - target.clientHeight > 2;
      if (canScroll !== isTimelineScrollable) {
        setIsTimelineScrollable(canScroll);
      }
      if (
        floatingDayLockByClickRef.current ||
        Date.now() < Number(floatingDayLockUntilRef.current || 0)
      ) {
        return;
      }
      const scrollerRect = target.getBoundingClientRect();
      const floatingRect = floatingChipRef.current?.getBoundingClientRect();
      const targetTop = floatingRect
        ? floatingRect.top + (floatingRect.height / 2)
        : scrollerRect.top + 108;
      const groups = Array.from(target.querySelectorAll("[id^='day-group-']"));
      if (groups.length) {
        let chosen = groups[0];
        groups.forEach((groupNode) => {
          if (groupNode.getBoundingClientRect().top <= targetTop + 1) {
            chosen = groupNode;
          }
        });
        const key = (chosen.id || "").replace(/^day-group-/, "");
        const labelNode = chosen.querySelector("[data-day-chip]");
        const label = labelNode?.textContent?.trim() || "";
        if (key && label) {
          setFloatingDay((prev) =>
            prev.key === key && prev.label === label ? prev : { key, label },
          );
        }
      }
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
  }, [onChatScroll, hasOlderMessages, loadingOlderMessages, onStartReached, isTimelineScrollable]);

  const handleScrollIntent = useCallback(() => {
    floatingDayLockByClickRef.current = false;
    floatingDayLockUntilRef.current = 0;
    onUserScrollIntent?.();
  }, [onUserScrollIntent]);

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
    setLoadedMediaThumbs(new Set());
    setMediaAspectByKey({});
  }, [activeChatId]);

  useEffect(() => {
    const video = focusedVideoRef.current;
    if (!video || focusedMedia?.type !== "video") return undefined;
    const handleLoaded = () => setFocusedVideoDuration(video.duration || 0);
    const handlePlay = () => setFocusedVideoPlaying(true);
    const handlePause = () => setFocusedVideoPlaying(false);
    const handleTimeUpdate = () => setFocusedVideoTime(video.currentTime || 0);
    const handleEnded = () => setFocusedVideoPlaying(false);
    const handleDurationChange = () => setFocusedVideoDuration(video.duration || 0);
    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("durationchange", handleDurationChange);
    setFocusedVideoMuted(video.muted);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("durationchange", handleDurationChange);
    };
  }, [focusedMedia]);

  useEffect(() => {
    if (focusedMedia?.type !== "video" || !focusVisible) return;
    const video = focusedVideoRef.current;
    if (!video) return;
    video.muted = false;
    setFocusedVideoMuted(false);
    const tryPlay = () => {
      const playPromise = video.play?.();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // user gesture may be required on some devices
        });
      }
    };
    const raf = requestAnimationFrame(tryPlay);
    return () => cancelAnimationFrame(raf);
  }, [focusedMedia, focusVisible]);

  useEffect(() => {
    return () => {
      if (floatingChipAlignTimerRef.current) {
        window.clearTimeout(floatingChipAlignTimerRef.current);
        floatingChipAlignTimerRef.current = null;
      }
      if (focusedVideoHintTimerRef.current) {
        clearTimeout(focusedVideoHintTimerRef.current);
      }
      if (focusUnmountTimerRef.current) {
        clearTimeout(focusUnmountTimerRef.current);
      }
      if (focusEnterRafRef.current) {
        cancelAnimationFrame(focusEnterRafRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    if (!focusedMedia?.expiresAt) return undefined;
    setFocusNowMs(Date.now());
    const timer = window.setInterval(() => {
      setFocusNowMs(Date.now());
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [focusedMedia?.expiresAt]);

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

  const renderMessageItem = (msg, options = {}) => {
    const { isFirstInGroup = false } = options;
    const isOwn = msg.username === user.username;
    const isRead = Boolean(msg.read_at);
    const hasFiles = Array.isArray(msg.files) && msg.files.length > 0;
    const hasUploadInProgress =
      Array.isArray(msg._files) &&
      msg._files.length > 0 &&
      Number(msg._uploadProgress ?? 100) < 100;
    const isSending = msg._delivery === "sending" || hasUploadInProgress || Boolean(msg._processingPending);
    const isFailed = msg._delivery === "failed";
    const dayLabel = getMessageDayLabel(msg);

    return (
      <div
        id={`message-${msg.id}`}
        data-msg-day={dayLabel}
        data-msg-day-key={msg?._dayKey || ""}
        className={`w-full max-w-full overflow-x-hidden px-0 pb-3 md:px-3 ${isFirstInGroup ? "pt-2" : ""}`}
      >
        {Number(unreadMarkerId) === Number(msg.id) ? (
          <div
            id={`unread-divider-${msg.id}`}
            className="flex items-center gap-3 py-3"
            style={{ scrollMarginTop: "96px" }}
          >
            <span className="h-px flex-1 bg-emerald-200/70 dark:bg-emerald-500/30" />
            <span className="rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
              Unread Messages
            </span>
            <span className="h-px flex-1 bg-emerald-200/70 dark:bg-emerald-500/30" />
          </div>
        ) : null}
        <div
          className={`flex w-full max-w-full px-3 md:px-0 ${
            isOwn ? "justify-end" : "justify-start"
          }`}
        >
          <div
            className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
              hasFiles
                ? "w-[min(52vw,18rem)] max-w-[68%] md:w-[min(44vw,22rem)] md:max-w-[62%] md:min-w-[12rem]"
                : "max-w-[82%] md:max-w-[75%]"
            } ${
              isOwn
                ? "rounded-br-md bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-white"
                : "bg-white/90 text-slate-800 rounded-bl-md dark:bg-slate-800/75 dark:text-slate-100"
            }`}
          >
            {renderMessageFiles(msg.files || [])}
            {!(
              (msg.files || []).length &&
              /^Sent (a media file|a document|\d+ files)$/i.test((msg.body || "").trim())
            ) ? (
              <p className={`mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${hasPersian(msg.body) ? "font-fa" : ""}`}>
                {renderMessageBody(msg.body)}
              </p>
            ) : null}
            <div
              className={`mt-2 flex items-center gap-1 text-[10px] ${
                isOwn
                  ? "text-emerald-900/80 dark:text-emerald-50/80"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <span>{msg._timeLabel || formatTime(msg.created_at)}</span>
              {isOwn ? (
                <span
                  className={`inline-flex items-center ${
                    isSending
                      ? "text-emerald-900/80 dark:text-emerald-50/80"
                      : isFailed
                        ? "text-rose-500"
                        : isRead
                          ? "text-sky-400"
                          : "text-emerald-900/80 dark:text-emerald-50/80"
                  }`}
                >
                  {isSending ? (
                    <Clock12
                      size={15}
                      strokeWidth={2.4}
                      className="animate-spin"
                      aria-hidden="true"
                    />
                  ) : isFailed ? (
                    <AlertCircle size={15} strokeWidth={2.4} aria-hidden="true" />
                  ) : isRead ? (
                    <CheckCheck size={15} strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                  )}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

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
        ? `max(1rem, calc(env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px) + ${
            isDesktop ? "1rem" : "1rem"
          }))`
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

  const renderMessageBody = (body) => {
    const text = body || "";
    if (!hasUrlPattern.test(text)) {
      return text;
    }
    const parts = text.split(urlPattern);
    return parts.map((part, index) => {
      if (!part) return null;
      if (isUrlPattern.test(part)) {
        const href = part.startsWith("http://") || part.startsWith("https://") ? part : `https://${part}`;
        return (
          <a
            key={`msg-link-${index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sky-400 underline decoration-sky-400 underline-offset-2 [overflow-wrap:anywhere]"
          >
            {part}
          </a>
        );
      }
      return <span key={`msg-part-${index}`}>{part}</span>;
    });
  };

  const getFileRenderType = (file) => {
    const explicitKind = String(file?.kind || "").toLowerCase();
    if (explicitKind === "document") return "document";
    if (explicitKind === "media") {
      const explicitMime = String(file?.mimeType || "").toLowerCase();
      if (explicitMime.startsWith("image/")) return "image";
      if (explicitMime.startsWith("video/")) return "video";
    }
    const mimeType = String(file?.mimeType || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (/\.(gif|png|jpe?g|webp|bmp|svg)$/.test(name)) return "image";
    if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(name)) return "video";
    return "document";
  };

  const getMediaAspectRatio = (file) => {
    const key = file?.id || `${file?.name || ""}-${file?.sizeBytes || 0}`;
    const cached = Number(mediaAspectByKey[key]);
    if (Number.isFinite(cached) && cached > 0) {
      return Math.min(2.4, Math.max(0.42, cached));
    }
    const width = Number(file?.width);
    const height = Number(file?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      const renderType = getFileRenderType(file);
      // Stable fallback boxes on mobile to avoid layout shifts while media metadata loads.
      return renderType === "video" ? 16 / 9 : 1;
    }
    const ratio = width / height;
    // Clamp extreme values to keep bubble layout usable.
    return Math.min(2.4, Math.max(0.42, ratio));
  };

  const cacheMediaAspectRatio = (file, width, height) => {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    const ratio = Math.min(2.4, Math.max(0.42, w / h));
    const key = file?.id || `${file?.name || ""}-${file?.sizeBytes || 0}`;
    setMediaAspectByKey((prev) => {
      if (prev[key] === ratio) return prev;
      return { ...prev, [key]: ratio };
    });
  };

  const getFocusAspectRatio = () => {
    const width = Number(focusedMedia?.width);
    const height = Number(focusedMedia?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return focusedMedia?.type === "video" ? 16 / 9 : 1;
    }
    const ratio = width / height;
    return Math.min(2.4, Math.max(0.42, ratio));
  };
  const getFocusFrameStyle = () => {
    const ratio = getFocusAspectRatio();
    if (isDesktop) {
      return {
        aspectRatio: `${ratio}`,
        width: `min(92vw, ${Math.max(42, Math.round(78 * ratio))}vh)`,
        maxWidth: "92vw",
        maxHeight: "78vh",
      };
    }
    return {
      aspectRatio: `${ratio}`,
      width: `min(92vw, ${Math.max(44, Math.round(62 * ratio))}vh)`,
      maxWidth: "92vw",
      maxHeight: "calc(100vh - 13rem)",
    };
  };

  const formatFileSize = (sizeBytes) => {
    const bytes = Number(sizeBytes || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    if (bytes >= gb) return `${(bytes / gb).toFixed(2)} GB`;
    if (bytes >= mb) return `${(bytes / mb).toFixed(2)} MB`;
    return `${Math.max(1, Math.round(bytes / kb))} KB`;
  };

  const cacheVideoPoster = (videoUrl, videoEl) => {
    if (!videoUrl || !videoEl || videoPosterByUrl[videoUrl]) return;
    try {
      if (Number(videoEl.readyState || 0) < 2) return;
      const sourceWidth = Number(videoEl.videoWidth || 0);
      const sourceHeight = Number(videoEl.videoHeight || 0);
      if (sourceWidth <= 0 || sourceHeight <= 0) return;
      const maxWidth = 320;
      const scale = Math.min(1, maxWidth / sourceWidth);
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
      const posterDataUrl = canvas.toDataURL("image/jpeg", 0.62);
      setVideoPosterByUrl((prev) => {
        if (prev[videoUrl]) return prev;
        const next = { ...prev, [videoUrl]: posterDataUrl };
        if (typeof window !== "undefined") {
          try {
            const compact = Object.fromEntries(Object.entries(next).slice(-80));
            window.sessionStorage.setItem(VIDEO_POSTER_CACHE_KEY, JSON.stringify(compact));
            return compact;
          } catch (_) {
            return prev;
          }
        }
        return next;
      });
    } catch (_) {
      // no-op
    }
  };

  const renderMessageFiles = (files = []) => {
    if (!files.length) return null;
    const markMediaThumbLoaded = (thumbKey) => {
      setLoadedMediaThumbs((prev) => {
        if (prev.has(thumbKey)) return prev;
        const next = new Set(prev);
        next.add(thumbKey);
        if (typeof window !== "undefined") {
          try {
            const persisted = Array.from(next);
            window.sessionStorage.setItem(
              "chat-media-thumbs",
              JSON.stringify(persisted.slice(-250)),
            );
          } catch (_) {
            // ignore cache failures
          }
        }
        return next;
      });
      onMessageMediaLoaded?.();
    };
  const handleVideoThumbReady = (event, thumbKey, videoUrl) => {
      const video = event.currentTarget;
      if (!video) return;
      cacheVideoPoster(videoUrl, video);
      // Mobile Safari sometimes paints first frame only after a decode/play step.
      if (!isDesktop) {
        const playPromise = video.play?.();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(() => {
              const duration = Number(video.duration || 0);
              if (Number.isFinite(duration) && duration > 0) {
                const target = Math.min(0.16, Math.max(duration * 0.02, 0.02));
                if (video.currentTime < target) {
                  try {
                    video.currentTime = target;
                  } catch (_) {
                    // no-op
                  }
                }
              }
              video.pause?.();
              cacheVideoPoster(videoUrl, video);
              markMediaThumbLoaded(thumbKey);
            })
            .catch(() => {
              // Even when autoplay is blocked, try to finalize poster from current decoded frame.
              cacheVideoPoster(videoUrl, video);
              markMediaThumbLoaded(thumbKey);
            });
          return;
        }
      }
      markMediaThumbLoaded(thumbKey);
    };
    return (
      <div className="mt-1 space-y-2">
        {files.map((file, fileIndex) => {
          const renderType = getFileRenderType(file);
          const isImage = renderType === "image";
          const isVideo = renderType === "video";
          const videoUrl = String(file?.url || "");
          const isTranscodedOutput = videoUrl.includes("-h264-");
          const isProcessingVideo =
            isVideo && file?.processing === true && !isTranscodedOutput;
          const key = file.id || `${file.name}-${file.sizeBytes || 0}`;
          const thumbKey = `thumb-${key}`;
          const cachedPoster = isVideo && file.url ? videoPosterByUrl[file.url] : "";
          const thumbLoaded = loadedMediaThumbs.has(thumbKey) || Boolean(cachedPoster);
          const mediaAspectRatio = getMediaAspectRatio(file);
          const mediaFrameStyle = mediaAspectRatio
            ? { aspectRatio: `${mediaAspectRatio}` }
            : { minHeight: isDesktop ? "190px" : "160px" };
          const mobileImageFrameClass = "relative flex w-full items-center justify-center overflow-hidden";
          const desktopImageFrameClass = "relative flex w-full items-center justify-center overflow-hidden";
          const imageFrameClass = isDesktop ? desktopImageFrameClass : mobileImageFrameClass;
          const imageClass = isDesktop
            ? `absolute inset-0 block h-full w-full object-cover transition-opacity duration-150 ${
                thumbLoaded ? "opacity-100" : "opacity-0"
              }`
            : "absolute inset-0 block h-full w-full object-cover";
          const mobileVideoFrameClass = "relative flex w-full items-center justify-center overflow-hidden";
          const desktopVideoFrameClass = "relative flex w-full items-center justify-center overflow-hidden";
          const videoFrameClass = isDesktop ? desktopVideoFrameClass : mobileVideoFrameClass;
          const videoClass = isDesktop
            ? `absolute inset-0 block h-full w-full object-cover transition-opacity duration-150 ${
                thumbLoaded ? "opacity-100" : "opacity-0"
              }`
            : "absolute inset-0 block h-full w-full object-cover";
          if (isImage && file.url) {
            return (
              <button
                type="button"
                key={key}
                onClick={() =>
                  openFocusMedia({
                    url: file.url,
                    name: file.name,
                    type: "image",
                    width: file.width,
                    height: file.height,
                    expiresAt: file.expiresAt || null,
                  })
                }
                className="relative block w-full overflow-hidden rounded-xl border border-emerald-200/70 bg-white/70 dark:border-emerald-500/30 dark:bg-slate-900/50"
              >
                <div className={imageFrameClass} style={mediaFrameStyle}>
                  <img
                    src={file.url}
                    alt={file.name || "image"}
                    onLoad={(event) => {
                      cacheMediaAspectRatio(
                        file,
                        event.currentTarget?.naturalWidth,
                        event.currentTarget?.naturalHeight,
                      );
                      markMediaThumbLoaded(thumbKey);
                    }}
                    loading={isDesktop ? "lazy" : "eager"}
                    decoding={isDesktop ? "async" : "sync"}
                    fetchPriority={!isDesktop && fileIndex === 0 ? "high" : "auto"}
                    className={imageClass}
                  />
                  {isDesktop && !thumbLoaded ? (
                    <div className="pointer-events-none absolute inset-0 animate-pulse bg-emerald-100/70 dark:bg-slate-800/80" />
                  ) : null}
                  {!mediaAspectRatio ? (
                    <div className="pointer-events-none w-full animate-pulse bg-emerald-100/70 dark:bg-slate-800/80" style={{ height: "180px" }} />
                  ) : null}
                </div>
              </button>
            );
          }
          if (isProcessingVideo) {
            return (
              <div
                key={key}
                className="relative block w-full overflow-hidden rounded-xl border border-emerald-200/70 bg-slate-200/70 dark:border-emerald-500/30 dark:bg-slate-800/70"
              >
                <div className={videoFrameClass} style={mediaFrameStyle}>
                  <div className="absolute inset-0 animate-pulse bg-slate-200/80 dark:bg-slate-800/80" />
                </div>
              </div>
            );
          }
          if (isVideo && file.url) {
            return (
              <button
                type="button"
                key={key}
                onClick={() =>
                  openFocusMedia({
                    url: file.url,
                    name: file.name,
                    type: "video",
                    processing: Boolean(file.processing),
                    width: file.width,
                    height: file.height,
                    expiresAt: file.expiresAt || null,
                  })
                }
                className="relative block w-full overflow-hidden rounded-xl border border-emerald-200/70 bg-black/60 dark:border-emerald-500/30"
                aria-label={`Open video ${file.name || ""}`.trim()}
              >
                <div className={videoFrameClass} style={mediaFrameStyle}>
                  {cachedPoster ? (
                    <img
                      src={cachedPoster}
                      alt={file.name || "video thumbnail"}
                      onLoad={() => markMediaThumbLoaded(thumbKey)}
                      className={videoClass}
                    />
                  ) : (
                    <video
                      key={file.url}
                      autoPlay={!isDesktop}
                      loop={!isDesktop}
                      muted
                      playsInline
                      preload={isDesktop ? "auto" : "auto"}
                      poster={videoPosterByUrl[file.url] || undefined}
                      onLoadedMetadata={(event) => {
                        cacheMediaAspectRatio(
                          file,
                          event.currentTarget?.videoWidth,
                          event.currentTarget?.videoHeight,
                        );
                        handleVideoThumbLoadedMetadata(event);
                        if (!isDesktop) {
                          markMediaThumbLoaded(thumbKey);
                        }
                      }}
                      onCanPlay={(event) => handleVideoThumbReady(event, thumbKey, file.url)}
                      onLoadedData={(event) => handleVideoThumbReady(event, thumbKey, file.url)}
                      onError={() => {
                        if (!isDesktop) {
                          markMediaThumbLoaded(thumbKey);
                        }
                      }}
                      src={file.url}
                      className={videoClass}
                    />
                  )}
                  {!thumbLoaded && isDesktop ? (
                    <div className="pointer-events-none absolute inset-0 animate-pulse bg-slate-200/80 dark:bg-slate-800/80" />
                  ) : null}
                  {!mediaAspectRatio ? (
                    <div className="pointer-events-none w-full animate-pulse bg-slate-200/80 dark:bg-slate-800/80" style={{ height: "180px" }} />
                  ) : null}
                </div>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white">
                    <Play size={18} className="translate-x-[1px]" />
                  </span>
                </span>
              </button>
            );
          }
          return (
            file.url ? (
              <a
                key={key}
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-white hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70 dark:hover:shadow-[0_0_16px_rgba(16,185,129,0.14)]"
              >
                <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
                  <File size={18} className="absolute text-emerald-600 transition-opacity duration-150 group-hover:opacity-0 dark:text-emerald-300" />
                  <Download size={18} className="absolute text-emerald-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-emerald-300" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{file.name || "document"}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                    {formatFileSize(file.sizeBytes)}
                  </span>
                </span>
              </a>
            ) : (
              <div
                key={key}
                className="flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 text-xs text-slate-700 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200"
              >
                <File size={18} className="shrink-0 text-emerald-600 dark:text-emerald-300" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{file.name || "document"}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                    {formatFileSize(file.sizeBytes)}
                  </span>
                </span>
              </div>
            )
          );
        })}
      </div>
    );
  };

  const toggleFocusedVideoPlay = () => {
    const video = focusedVideoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setFocusedVideoHint("play");
    } else {
      video.pause();
      setFocusedVideoHint("pause");
    }
    if (focusedVideoHintTimerRef.current) {
      clearTimeout(focusedVideoHintTimerRef.current);
    }
    focusedVideoHintTimerRef.current = setTimeout(() => {
      setFocusedVideoHint(null);
    }, 420);
  };

  const toggleFocusedVideoMute = () => {
    const video = focusedVideoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setFocusedVideoMuted(video.muted);
  };

  const seekFocusedVideo = (nextValue) => {
    const video = focusedVideoRef.current;
    if (!video) return;
    const value = Number(nextValue || 0);
    video.currentTime = value;
    setFocusedVideoTime(value);
  };

  const handleFocusedVideoLoadedData = () => {
    const video = focusedVideoRef.current;
    if (!video) return;
    setFocusedVideoDuration(video.duration || 0);
    setFocusedVideoTime(video.currentTime || 0);
    setFocusedMediaLoaded(true);
    if (Number(video.videoWidth || 0) <= 0 && Number(video.videoHeight || 0) <= 0) {
      setFocusedVideoDecodeIssue(
        "Video track could not be decoded in this browser. Audio may still play.",
      );
    } else {
      setFocusedVideoDecodeIssue("");
    }
    if (!focusVisible) return;
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // user gesture may be required on some devices
      });
    }
  };

  const handleFocusedVideoLoadedMetadata = () => {
    const video = focusedVideoRef.current;
    if (!video) return;
    setFocusedVideoDuration(video.duration || 0);
    setFocusedVideoTime(video.currentTime || 0);
    setFocusedMediaLoaded(true);
    if (Number(video.videoWidth || 0) <= 0 && Number(video.videoHeight || 0) <= 0) {
      setFocusedVideoDecodeIssue(
        "Video track could not be decoded in this browser. Audio may still play.",
      );
    } else {
      setFocusedVideoDecodeIssue("");
    }
  };

  const handleFocusedVideoCanPlay = () => {
    const video = focusedVideoRef.current;
    if (!video || !focusVisible) return;
    if (!video.paused) return;
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // user gesture may be required on some devices
      });
    }
  };

  const handleFocusedVideoError = () => {
    setFocusedVideoDecodeIssue(
      "This video format or codec is not supported by your browser.",
    );
  };

  const formatSeconds = (seconds) => {
    const safe = Math.max(0, Math.floor(Number(seconds || 0)));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
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

  const getExpiryWarning = useCallback(
    (expiresAt) => {
      if (!expiresAt) return null;
      const expiryMs = new Date(expiresAt).getTime();
      if (!Number.isFinite(expiryMs)) return null;
      const diffMs = expiryMs - focusNowMs;
      if (diffMs <= 0) return null;
      const minuteMs = 60 * 1000;
      const hourMs = 60 * minuteMs;
      const dayMs = 24 * hourMs;

      if (diffMs < hourMs) {
        const minutes = Math.max(1, Math.ceil(diffMs / minuteMs));
        return {
          danger: true,
          text: `This file will be deleted in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        };
      }
      if (diffMs < dayMs) {
        const hours = Math.max(1, Math.ceil(diffMs / hourMs));
        return {
          danger: true,
          text: `This file will be deleted in ${hours} hour${hours === 1 ? "" : "s"}.`,
        };
      }
      const days = Math.max(1, Math.ceil(diffMs / dayMs));
      return {
        danger: days <= 1,
        text: `This file will be deleted in ${days} day${days === 1 ? "" : "s"}.`,
      };
    },
    [focusNowMs],
  );
  const focusExpiryWarning = useMemo(
    () => getExpiryWarning(focusedMedia?.expiresAt),
    [getExpiryWarning, focusedMedia?.expiresAt],
  );
  const openFocusMedia = (media) => {
    if (focusUnmountTimerRef.current) {
      clearTimeout(focusUnmountTimerRef.current);
      focusUnmountTimerRef.current = null;
    }
    if (focusEnterRafRef.current) {
      cancelAnimationFrame(focusEnterRafRef.current);
      focusEnterRafRef.current = null;
    }
    setFocusedMedia(media);
    setFocusedMediaLoaded(false);
    if (media?.type === "video") {
      setFocusedVideoPlaying(false);
      setFocusedVideoTime(0);
      setFocusedVideoDuration(0);
      setFocusedVideoMuted(false);
      setFocusedVideoHint(null);
    }
    setFocusedVideoDecodeIssue("");
    setFocusVisible(false);
    focusEnterRafRef.current = requestAnimationFrame(() => {
      setFocusVisible(true);
    });
  };

  const closeFocusMedia = () => {
    if (!focusedMedia) return;
    setFocusVisible(false);
    if (focusUnmountTimerRef.current) {
      clearTimeout(focusUnmountTimerRef.current);
    }
    focusUnmountTimerRef.current = setTimeout(() => {
      setFocusedMedia(null);
      setFocusedVideoDecodeIssue("");
      focusUnmountTimerRef.current = null;
    }, 230);
  };

  const handleFocusTouchStart = (event) => {
    if (isDesktop || !isMobileTouchDevice) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    focusSwipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      tracking: true,
    };
  };

  const handleFocusTouchEnd = (event) => {
    if (isDesktop || !isMobileTouchDevice) return;
    const start = focusSwipeStartRef.current;
    if (!start.tracking) return;
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - start.x);
    const dy = touch.clientY - start.y;
    if (dy > 120 && dx < 90) {
      closeFocusMedia();
    }
  };

  return (
    <section
      className={
        "fixed inset-0 top-0 z-20 md:relative md:inset-auto md:top-auto md:z-auto flex h-full flex-1 flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-xl shadow-emerald-500/10 dark:border-white/5 dark:bg-slate-900 md:border md:w-[65%] md:shadow-2xl md:shadow-emerald-500/15 transition-transform duration-300 ease-out will-change-transform " +
        (mobileTab === "chat"
          ? "translate-x-0"
          : "translate-x-full md:translate-x-0")
      }
      style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {activeChatId ? (
        <div className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 border-b border-slate-300/80 bg-white px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900">
          <button
            type="button"
            onClick={closeChat}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 md:invisible md:pointer-events-none"
            aria-label="Back to chats"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-1 flex-col items-center justify-center gap-1">
            {activeHeaderPeer ? (
              <>
                <h2 className="text-center text-lg font-semibold">
                  <span className={hasPersian(activeFallbackTitle) ? "font-fa" : ""}>
                    {activeFallbackTitle}
                  </span>
                </h2>
                <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  {!isConnected ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin text-emerald-500" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <span
                        className={`h-2 w-2 rounded-full ${
                          peerStatusLabel === "online" ? "bg-emerald-400" : "bg-slate-400"
                        }`}
                      />
                      {peerStatusLabel}
                    </>
                  )}
                </p>
              </>
            ) : null}
          </div>
          {activeHeaderPeer ? (
            activeHeaderPeer?.avatar_url ? (
              <img
                src={activeHeaderPeer?.avatar_url}
                alt={activeFallbackTitle}
                className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${hasPersian(activePeerInitials) ? "font-fa" : ""}`}
                style={getAvatarStyle(activePeerColor)}
              >
                {activePeerInitials}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {insecureConnection && activeChatId ? (
        <div
          className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2"
          style={{ top: "calc(env(safe-area-inset-top) + 122px)" }}
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-semibold leading-none text-rose-700 dark:border-rose-500 dark:bg-rose-900 dark:text-rose-100">
            <AlertCircle className="h-[13px] w-[13px] shrink-0 -translate-y-[0.5px]" />
            <span className="leading-none">Connection is not secure.</span>
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0">
        {activeChatId && floatingDay.key && isTimelineScrollable ? (
          <div
            className="absolute left-1/2 z-[3] -translate-x-1/2"
            style={{ top: "calc(env(safe-area-inset-top) + 84px)" }}
          >
            <button
              ref={floatingChipRef}
              type="button"
              onClick={(event) => {
                const node = document.getElementById(`day-group-${floatingDay.key}`);
                const scroller = chatScrollRef?.current;
                if (!node || !scroller) return;
                const floatingChip = event.currentTarget;
                const currentKey = floatingDay.key;
                const currentLabel = floatingDay.label;
                floatingDayLockByClickRef.current = true;
                floatingDayLockUntilRef.current = Date.now() + 1800;
                setFloatingDay({ key: currentKey, label: currentLabel });
                if (floatingChipAlignTimerRef.current) {
                  window.clearTimeout(floatingChipAlignTimerRef.current);
                  floatingChipAlignTimerRef.current = null;
                }

                const stickyChip =
                  node.querySelector("[data-day-chip]")?.parentElement || node;
                const stickyRect = stickyChip.getBoundingClientRect();
                const floatingRect = floatingChip.getBoundingClientRect();
                // Device-specific alignment nudge tuned to match visual chip overlap.
                const alignOffsetPx = isDesktop ? 0 : -1;
                const desiredStickyTopInViewport = floatingRect.top + alignOffsetPx;
                const delta = stickyRect.top - desiredStickyTopInViewport;
                const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
                const targetTop = Math.max(
                  0,
                  Math.min(maxTop, scroller.scrollTop + delta),
                );

                scroller.scrollTo({ top: targetTop, behavior: "smooth" });

                const runFinalAlign = (releaseLock = false) => {
                  const nextStickyChip =
                    node.querySelector("[data-day-chip]")?.parentElement || node;
                  const nextStickyRect = nextStickyChip.getBoundingClientRect();
                  const nextFloatingRect = floatingChip.getBoundingClientRect();
                  const nextDesiredTop = nextFloatingRect.top + alignOffsetPx;
                  const nextDelta = nextStickyRect.top - nextDesiredTop;
                  if (Math.abs(nextDelta) > 0.5) {
                    const finalMaxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
                    const finalTop = Math.max(
                      0,
                      Math.min(finalMaxTop, scroller.scrollTop + nextDelta),
                    );
                    scroller.scrollTo({ top: finalTop, behavior: "auto" });
                  }
                  if (releaseLock) {
                    floatingDayLockByClickRef.current = false;
                    floatingDayLockUntilRef.current = Date.now() + 120;
                  }
                };

                if (isDesktop) {
                  // Desktop: no post-correction jump; just unlock after smooth scroll finishes.
                  floatingChipAlignTimerRef.current = window.setTimeout(() => {
                    floatingDayLockByClickRef.current = false;
                    floatingDayLockUntilRef.current = Date.now() + 120;
                    floatingChipAlignTimerRef.current = null;
                  }, 420);
                } else {
                  // Mobile: one final correction removes the tiny residual offset.
                  floatingChipAlignTimerRef.current = window.setTimeout(() => {
                    runFinalAlign(true);
                    floatingChipAlignTimerRef.current = null;
                  }, 380);
                }
              }}
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
        ) : loadingMessages || (!isConnected && messages.length === 0) ? (
          <div
            ref={chatScrollRef}
            className="chat-scroll h-full space-y-3 overflow-y-auto overflow-x-hidden px-6 py-6"
            onScroll={handlePanelScroll}
            style={chatScrollStyle}
          >
            {Array.from({ length: 7 }).map((_, index) => {
              const own = index % 2 === 0;
              return (
                <div
                  key={`message-skeleton-${index}`}
                  className={`flex ${own ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`animate-pulse rounded-2xl ${
                      own
                        ? "h-12 w-40 bg-emerald-300/70 dark:bg-emerald-700/60"
                        : "h-14 w-52 bg-white/80 dark:bg-slate-800/80"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        ) : messages.length ? (
          <div
            ref={chatScrollRef}
            onScroll={handlePanelScroll}
            onTouchStartCapture={handleScrollIntent}
            onWheelCapture={handleScrollIntent}
            className="chat-scroll h-full overflow-y-auto overflow-x-hidden px-0 pb-3 pt-1 md:px-2"
            style={chatScrollStyle}
          >
            {loadingOlderMessages ? (
              <div className="px-3 pb-3 pt-1 md:px-0">
                <div className="mx-auto h-10 w-40 animate-pulse rounded-2xl bg-white/80 dark:bg-slate-800/80" />
              </div>
            ) : null}
            {groupedMessages.map((group, groupIndex) => (
              <div id={`day-group-${group.dayKey || groupIndex}`} key={`single-group-${group.dayKey || groupIndex}`}>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleGroupChipClick(groupIndex)}
                    className="inline-flex w-max items-center justify-center rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                  >
                    <span data-day-chip={group.dayLabel || ""} className="leading-none">
                      {group.dayLabel || ""}
                    </span>
                  </button>
                </div>
                {group.items.map((msg, index) => (
                  <div key={String(msg?._clientId ?? msg?.id ?? `single-msg-${index}`)}>
                    {renderMessageItem(msg, { isFirstInGroup: index === 0 })}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ height: `${timelineBottomSpacerPx}px` }} />
          </div>
        ) : (
          <div
            ref={chatScrollRef}
            className="chat-scroll flex h-full items-center justify-center overflow-y-auto overflow-x-hidden px-6 py-6"
            onScroll={handlePanelScroll}
            style={chatScrollStyle}
          >
            <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
              Say something to start
            </div>
          </div>
        )}
      </div>

      {activeChatId ? (
        <form
          className="sticky bottom-0 z-30 flex flex-col gap-3 border-t border-slate-300/80 bg-white px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-900 sm:px-6 md:static md:mt-auto md:shrink-0"
          style={{
            bottom: isDesktop ? undefined : "max(0px, var(--mobile-bottom-offset, 0px))",
            paddingBottom: isDesktop
              ? "0.75rem"
              : "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
          }}
          onSubmit={handleSend}
        >
          {pendingUploadFiles?.length ? (
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-2 dark:border-emerald-500/30 dark:bg-slate-950/70">
              <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                <span>{pendingUploadType === "media" ? "Photo or Video" : "Document"} ({pendingUploadFiles.length})</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!fileUploadEnabled}
                    onClick={() => {
                      if (!fileUploadEnabled) return;
                      if (pendingUploadType === "media") {
                        mediaInputRef.current?.click();
                      } else {
                        documentInputRef.current?.click();
                      }
                    }}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition ${
                      fileUploadEnabled
                        ? "border-emerald-200/70 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                        : "cursor-not-allowed border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-500"
                    }`}
                  >
                    <Paperclip size={12} />
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={onClearPendingUploads}
                    className="inline-flex items-center gap-1 rounded-full border border-rose-200/70 px-2 py-0.5 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-900/30"
                  >
                    <Close size={12} />
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {pendingUploadFiles.map((item) => {
                  const forceDocPreview = pendingUploadType === "document";
                  const isImage = !forceDocPreview && item.mimeType?.startsWith("image/");
                  const isVideo = !forceDocPreview && item.mimeType?.startsWith("video/");
                  return (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-xl border border-emerald-200/70 bg-white/90 p-2 text-[11px] dark:border-emerald-500/30 dark:bg-slate-900/70"
                    >
                      <button
                        type="button"
                        onClick={() => onRemovePendingUpload(item.id)}
                        className="absolute right-1 top-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                        aria-label="Remove file"
                      >
                        <Close size={11} />
                      </button>
                      {isImage ? (
                        <div className="mb-1 flex h-24 items-center justify-center rounded-md">
                          <img
                            src={item.previewUrl}
                            alt={item.name}
                            className="h-24 w-auto max-w-full rounded-md object-contain"
                          />
                        </div>
                      ) : isVideo ? (
                        <div className="relative mb-1 flex h-24 items-center justify-center rounded-md">
                          <video
                            src={item.previewUrl}
                            muted
                            playsInline
                            preload="auto"
                            onLoadedMetadata={handleVideoThumbLoadedMetadata}
                            onLoadedData={handleVideoThumbLoadedMetadata}
                            onCanPlay={handleVideoThumbLoadedMetadata}
                            className="h-24 w-auto max-w-full rounded-md object-contain"
                          />
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white">
                              <Play size={14} className="translate-x-[1px]" />
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div className="mb-1 flex h-24 w-full items-center justify-center rounded-md bg-slate-100 text-emerald-700 dark:bg-slate-800 dark:text-emerald-200">
                          <File size={16} />
                        </div>
                      )}
                      <p className="truncate pr-5 text-slate-700 dark:text-slate-200">{item.name}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {uploadError ? (
            <p className="text-xs text-rose-600 dark:text-rose-300">{uploadError}</p>
          ) : null}
          {activeUploadProgress !== null ? (
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3 py-2 dark:border-emerald-500/30 dark:bg-slate-950/70">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                <span>Uploading files...</span>
                <span>{Math.round(activeUploadProgress)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-emerald-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-150"
                  style={{ width: `${activeUploadProgress}%` }}
                />
              </div>
            </div>
          ) : null}
          <div className="flex flex-row gap-3">
            <div className="relative" ref={uploadMenuRef}>
              <button
                type="button"
                disabled={uploadBusy}
                onClick={() => {
                  if (uploadBusy) return;
                  setShowUploadMenu((prev) => !prev);
                }}
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent bg-transparent transition ${
                  !uploadBusy
                    ? "text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                    : "cursor-not-allowed text-slate-400 dark:text-slate-500"
                }`}
                aria-label="Attach file"
              >
                <Paperclip size={18} className="icon-anim-sway" />
              </button>
              {showUploadMenu && !uploadBusy ? (
                <div className="absolute bottom-12 left-0 z-40 w-44 rounded-xl border border-emerald-200/80 bg-white p-1.5 shadow-lg dark:border-emerald-500/30 dark:bg-slate-950">
                  <button
                    type="button"
                    onClick={() => {
                      mediaInputRef.current?.click();
                      setShowUploadMenu(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                  >
                    <ImageIcon size={15} className="icon-anim-sway" />
                    Photo or Video
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      documentInputRef.current?.click();
                      setShowUploadMenu(false);
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                  >
                    <File size={15} className="icon-anim-lift" />
                    Document
                  </button>
                </div>
              ) : null}
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="sr-only"
                disabled={uploadBusy}
                onChange={(event) => {
                  onUploadFilesSelected(event.target.files, "media", pendingUploadType === "media");
                  event.target.value = "";
                }}
              />
              <input
                ref={documentInputRef}
                type="file"
                multiple
                className="sr-only"
                disabled={uploadBusy}
                onChange={(event) => {
                  onUploadFilesSelected(event.target.files, "document", pendingUploadType === "document");
                  event.target.value = "";
                }}
              />
            </div>
            <input
              name="message"
              type="text"
              placeholder="Type a message"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
                if (!pendingUploadFiles?.length) return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
              className="min-w-0 flex-1 rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/40"
            >
              <Send className="icon-anim-slide" />
            </button>
          </div>
        </form>
      ) : null}

      {activeChatId && userScrolledUp ? (
        <button
          type="button"
          onClick={onJumpToLatest}
          className="absolute inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700 shadow-lg transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          style={{
            bottom: "max(80px + 0.05rem, calc(80px + env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px) + 0.05rem))",
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
              {unreadInChat}
            </span>
          ) : null}
        </button>
      ) : null}

      {focusedMedia ? (
        <div
          className={`fixed inset-0 z-[200] transition-opacity duration-200 ${isDesktop ? "bg-black/80" : "bg-black"} ${focusVisible ? "opacity-100" : "opacity-0"}`}
          onClick={() => {
            if (isDesktop) {
              closeFocusMedia();
            }
          }}
        >
          {!isDesktop ? (
            <div
              className={`absolute left-0 right-0 z-10 flex items-center justify-between px-6 py-4 transition-all duration-200 ${focusVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}
              style={{ top: "max(0px, env(safe-area-inset-top))" }}
            >
              <button
                type="button"
                onClick={closeFocusMedia}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white transition hover:border-white/50 hover:bg-black/55"
                aria-label="Close"
              >
                <Close size={18} className="icon-anim-sway" />
              </button>
              <a
                href={focusedMedia.url}
                download={focusedMedia.name || "media"}
                className="group inline-flex h-9 items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_22px_rgba(16,185,129,0.45)]"
              >
                <Download size={15} className="icon-anim-drop" />
                Save
              </a>
            </div>
          ) : null}
          {isDesktop ? (
            <>
              <div className={`absolute left-6 top-4 z-10 transition-all duration-200 ${focusVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}>
                <button
                  type="button"
                  onClick={closeFocusMedia}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/40 text-white transition hover:border-white/50 hover:bg-black/55"
                  aria-label="Close"
                >
                  <Close size={18} className="icon-anim-sway" />
                </button>
              </div>
              <div className={`absolute right-6 top-4 z-10 transition-all duration-200 ${focusVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}>
              <a
                href={focusedMedia.url}
                download={focusedMedia.name || "media"}
                className="group inline-flex h-9 items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_22px_rgba(16,185,129,0.45)]"
              >
                <Download size={15} className="icon-anim-drop" />
                Save
              </a>
            </div>
            </>
          ) : null}
          <div
            className={`flex h-full justify-center p-3 md:p-6 ${
              isDesktop ? "items-center" : "items-center"
            }`}
            style={
              isDesktop
                ? undefined
                : {
                    paddingTop: "max(4.25rem, calc(env(safe-area-inset-top) + 3rem))",
                    paddingBottom: "max(7.5rem, calc(env(safe-area-inset-bottom) + 6.5rem))",
                  }
            }
            onClick={(event) => {
              if (!isDesktop) {
                event.stopPropagation();
              }
            }}
          >
            <div
              className={`mx-auto transition-all duration-200 ${
                isDesktop
                  ? focusVisible
                    ? "opacity-100"
                    : "opacity-0"
                  : focusVisible
                    ? "translate-y-0 scale-100 opacity-100"
                    : "translate-y-2 scale-95 opacity-0"
              }`}
              style={{
                width: "fit-content",
                maxWidth: "92vw",
                maxHeight: isDesktop ? "min(86vh, 820px)" : "calc(100vh - 13rem)",
              }}
            >
              {focusedMedia.type === "video" ? (
                <div
                  className="relative mx-auto flex w-fit max-w-full flex-col items-center"
                  onClick={(event) => event.stopPropagation()}
                  onTouchStart={isMobileTouchDevice && !isDesktop ? handleFocusTouchStart : undefined}
                  onTouchEnd={isMobileTouchDevice && !isDesktop ? handleFocusTouchEnd : undefined}
                >
                  {focusedMedia.processing ? (
                    <div
                      className="mx-auto flex items-center justify-center overflow-hidden rounded-2xl bg-slate-200/80 dark:bg-slate-800/80"
                      style={getFocusFrameStyle()}
                    >
                      <div className="h-full w-full animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
                    </div>
                  ) : (
                    <div className="relative mx-auto flex w-fit max-w-full items-center justify-center">
                      <video
                        key={focusedMedia.url}
                        ref={focusedVideoRef}
                        autoPlay
                        playsInline
                        preload="auto"
                        src={focusedMedia.url}
                        onClick={toggleFocusedVideoPlay}
                        onLoadedMetadata={handleFocusedVideoLoadedMetadata}
                        onLoadedData={handleFocusedVideoLoadedData}
                        onCanPlay={handleFocusedVideoCanPlay}
                        onError={handleFocusedVideoError}
                        className="mx-auto block max-h-[72vh] w-auto max-w-full cursor-pointer rounded-2xl bg-transparent object-contain md:max-h-[78vh] md:[transform:translateZ(0)] md:[backface-visibility:hidden]"
                      />
                      {!focusedMediaLoaded ? (
                        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80" />
                      ) : null}
                    </div>
                  )}
                  {focusedVideoHint ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-black/45 text-white">
                        {focusedVideoHint === "play" ? (
                          <Play size={24} className="translate-x-[1px]" />
                        ) : (
                          <Pause size={24} />
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div
                  className="relative mx-auto flex w-fit max-w-full flex-col items-center"
                  onClick={(event) => event.stopPropagation()}
                  onTouchStart={isMobileTouchDevice && !isDesktop ? handleFocusTouchStart : undefined}
                  onTouchEnd={isMobileTouchDevice && !isDesktop ? handleFocusTouchEnd : undefined}
                >
                  <img
                    src={focusedMedia.url}
                    alt={focusedMedia.name || "media"}
                    onLoad={() => {
                      setFocusedMediaLoaded(true);
                    }}
                    className={`mx-auto max-h-[78vh] w-auto max-w-full rounded-2xl object-contain transition-opacity duration-150 ${
                      focusedMediaLoaded ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  {!focusedMediaLoaded ? (
                    <div
                      className="absolute inset-0 min-h-[240px] w-[min(92vw,920px)] animate-pulse rounded-2xl bg-slate-200/80 dark:bg-slate-800/80"
                      style={{
                        aspectRatio: `${getFocusAspectRatio()}`,
                      }}
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>
          {focusedMedia?.type === "video" ? (
            <div
              className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 md:px-6"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
              onClick={(event) => event.stopPropagation()}
            >
              {focusedVideoDecodeIssue ? (
                <div className="mb-2 flex justify-center">
                  <div
                    className="rounded-xl border border-amber-300/60 bg-amber-500/20 px-3 py-2 text-center text-xs text-amber-100"
                    style={{ width: "min(92vw, 760px)" }}
                  >
                    {focusedVideoDecodeIssue}
                  </div>
                </div>
              ) : null}
              <div
                className="mx-auto rounded-xl bg-black/70 p-2 text-white"
                style={{ width: "min(92vw, 760px)" }}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFocusedVideoPlay}
                    disabled={Boolean(focusedMedia.processing) || !focusedMediaLoaded}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10"
                    aria-label={focusedVideoPlaying ? "Pause" : "Play"}
                  >
                    {focusedVideoPlaying ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleFocusedVideoMute}
                    disabled={Boolean(focusedMedia.processing) || !focusedMediaLoaded}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10"
                    aria-label={focusedVideoMuted ? "Unmute" : "Mute"}
                  >
                    {focusedVideoMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(focusedVideoDuration, 0)}
                    step={0.1}
                    value={Math.min(focusedVideoTime, focusedVideoDuration || 0)}
                    onChange={(event) => seekFocusedVideo(event.target.value)}
                    disabled={Boolean(focusedMedia.processing) || !focusedMediaLoaded}
                    className="h-1.5 flex-1 accent-emerald-400"
                    aria-label="Seek video"
                  />
                  <span className="w-20 text-right text-[11px]">
                    {formatSeconds(focusedVideoTime)} / {formatSeconds(focusedVideoDuration)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
          {focusExpiryWarning ? (
            <div
              className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-16 md:px-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold leading-none ${
                  focusExpiryWarning.danger
                    ? "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-500 dark:bg-rose-900 dark:text-rose-100"
                    : "border-white/20 bg-black/65 text-white"
                }`}
              >
                <AlertCircle className="h-[13px] w-[13px] shrink-0" />
                <span className="leading-none">{focusExpiryWarning.text}</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

    </section>
  );
}

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
import { Virtuoso } from "react-virtuoso";
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
  virtuosoRef,
  onChatScroll,
  messages,
  user,
  formatTime,
  unreadMarkerId,
  loadingMessages,
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
}) {
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
  const [floatingDayLabel, setFloatingDayLabel] = useState(null);
  const [showFloatingDayChip, setShowFloatingDayChip] = useState(false);
  const [isHoveringFloatingDayChip, setIsHoveringFloatingDayChip] = useState(false);
  const [loadedMediaThumbs, setLoadedMediaThumbs] = useState(() => new Set());
  const [focusedMedia, setFocusedMedia] = useState(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const isHoveringFloatingDayChipRef = useRef(false);
  const scrollIdleTimeoutRef = useRef(null);
  const scrollLabelRafRef = useRef(null);
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
  const focusedVideoRafRef = useRef(null);
  const focusedVideoHintTimerRef = useRef(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [focusedVideoPlaying, setFocusedVideoPlaying] = useState(false);
  const [focusedVideoMuted, setFocusedVideoMuted] = useState(false);
  const [focusedVideoTime, setFocusedVideoTime] = useState(0);
  const [focusedVideoDuration, setFocusedVideoDuration] = useState(0);
  const [focusedVideoHint, setFocusedVideoHint] = useState(null);
  const virtuosoBottomSpacerPx = 8;

  const updateFloatingDayLabel = useCallback((preferVisibleLabel = false) => {
    const container = chatScrollRef?.current;
    if (!container || !activeChatId || !messages.length) {
      setFloatingDayLabel(null);
      return;
    }

    const scrollTop = container.scrollTop;
    const containerPaddingTop =
      Number.parseFloat(window.getComputedStyle(container).paddingTop || "0") || 0;
    const messageNodes = Array.from(container.querySelectorAll("[data-msg-day]"));
    const dayChips = Array.from(container.querySelectorAll("[data-day-chip]"));
    if (!messageNodes.length) {
      setFloatingDayLabel(null);
      return;
    }

    const anchorTop = scrollTop + containerPaddingTop + 8;
    const firstVisibleMessage =
      messageNodes.find(
        (node) => node.offsetTop + node.offsetHeight >= anchorTop,
      ) || messageNodes[messageNodes.length - 1];
    let currentLabel = firstVisibleMessage?.getAttribute("data-msg-day") || null;
    if (!currentLabel) {
      const fallbackNode =
        messageNodes.find((node) => node.getAttribute("data-msg-day")) ||
        messageNodes[messageNodes.length - 1];
      currentLabel = fallbackNode?.getAttribute("data-msg-day") || null;
    }
    if (!currentLabel) {
      setFloatingDayLabel(null);
      return;
    }

    if (!dayChips.length) {
      setFloatingDayLabel(currentLabel);
      return;
    }

    const matchingChips = dayChips.filter(
      (chip) => chip.getAttribute("data-day-chip") === currentLabel,
    );
    if (!matchingChips.length) {
      setFloatingDayLabel(currentLabel);
      return;
    }

    let currentChip = matchingChips[0];
    for (let index = 0; index < matchingChips.length; index += 1) {
      const chip = matchingChips[index];
      if (chip.offsetTop <= firstVisibleMessage.offsetTop + 1) {
        currentChip = chip;
      } else {
        break;
      }
    }

    const chipTop = currentChip.offsetTop;
    const chipBottom = chipTop + currentChip.offsetHeight;
    const viewportTop = scrollTop + containerPaddingTop + 8;
    const viewportBottom = scrollTop + container.clientHeight - 8;
    const inlineChipVisible =
      chipBottom >= viewportTop && chipTop <= viewportBottom;
    setFloatingDayLabel(inlineChipVisible && !preferVisibleLabel ? null : currentLabel);
  }, [activeChatId, chatScrollRef, messages]);

  useEffect(() => {
    updateFloatingDayLabel();
  }, [messages, activeChatId, loadingMessages, updateFloatingDayLabel]);

  useEffect(() => {
    setShowFloatingDayChip(false);
  }, [activeChatId]);

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

  const handlePanelScroll = useCallback((event) => {
    onChatScroll?.(event);
    updateFloatingDayLabel(true);
    if (scrollLabelRafRef.current) {
      cancelAnimationFrame(scrollLabelRafRef.current);
    }
    scrollLabelRafRef.current = requestAnimationFrame(() => {
      scrollLabelRafRef.current = null;
      updateFloatingDayLabel(true);
    });
    setShowFloatingDayChip(true);
    if (scrollIdleTimeoutRef.current) {
      clearTimeout(scrollIdleTimeoutRef.current);
    }
    scrollIdleTimeoutRef.current = setTimeout(() => {
      if (!isHoveringFloatingDayChipRef.current) {
        setShowFloatingDayChip(false);
      }
    }, 1500);
  }, [onChatScroll, updateFloatingDayLabel]);

  useEffect(() => {
    if (isDesktop || !activeChatId || !pendingUploadFiles?.length) return;
    const scrollToBottomInstant = () => {
      if (virtuosoRef?.current?.scrollToIndex && messages.length > 0) {
        virtuosoRef.current.scrollToIndex({
          index: Math.max(0, messages.length - 1),
          align: "end",
          behavior: "auto",
        });
        return;
      }
      const container = chatScrollRef?.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight + 1000, behavior: "auto" });
    };
    const raf = requestAnimationFrame(scrollToBottomInstant);
    return () => cancelAnimationFrame(raf);
  }, [isDesktop, activeChatId, pendingUploadFiles?.length, virtuosoRef, messages.length, chatScrollRef]);

  const handleFloatingDayChipClick = () => {
    if (!floatingDayLabel) return;
    const firstIndexForDay = messages.findIndex(
      (msg) => getMessageDayLabel(msg) === floatingDayLabel,
    );
    if (firstIndexForDay >= 0 && virtuosoRef?.current?.scrollToIndex) {
      virtuosoRef.current.scrollToIndex({
        index: firstIndexForDay,
        align: "start",
        behavior: "smooth",
      });
      return;
    }
    if (!chatScrollRef?.current) return;
    const container = chatScrollRef.current;
    const dayChips = Array.from(container.querySelectorAll("[data-day-chip]"));
    const targetChip = dayChips.find(
      (chip) => chip.getAttribute("data-day-chip") === floatingDayLabel,
    );
    if (!targetChip) return;
    const containerRect = container.getBoundingClientRect();
    const chipRect = targetChip.getBoundingClientRect();
    const top = container.scrollTop + (chipRect.top - containerRect.top);
    container.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
  };

  useEffect(() => {
    return () => {
      if (scrollIdleTimeoutRef.current) {
        clearTimeout(scrollIdleTimeoutRef.current);
      }
      if (scrollLabelRafRef.current) {
        cancelAnimationFrame(scrollLabelRafRef.current);
      }
    };
  }, []);

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
    setFocusedMedia(null);
    setFocusVisible(false);
  }, [activeChatId]);

  useEffect(() => {
    setLoadedMediaThumbs(new Set());
  }, [activeChatId]);

  useEffect(() => {
    const video = focusedVideoRef.current;
    if (!video || focusedMedia?.type !== "video") return undefined;
    const handleLoaded = () => setFocusedVideoDuration(video.duration || 0);
    const handlePlay = () => setFocusedVideoPlaying(true);
    const handlePause = () => setFocusedVideoPlaying(false);
    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    setFocusedVideoMuted(video.muted);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
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
          // Autoplay with sound can be blocked depending on browser policy.
        });
      }
    };
    const raf = requestAnimationFrame(tryPlay);
    return () => cancelAnimationFrame(raf);
  }, [focusedMedia, focusVisible]);

  useEffect(() => {
    if (!focusedVideoPlaying) {
      if (focusedVideoRafRef.current) {
        cancelAnimationFrame(focusedVideoRafRef.current);
        focusedVideoRafRef.current = null;
      }
      return undefined;
    }
    const tick = () => {
      const video = focusedVideoRef.current;
      if (!video) return;
      setFocusedVideoTime(video.currentTime || 0);
      focusedVideoRafRef.current = requestAnimationFrame(tick);
    };
    focusedVideoRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (focusedVideoRafRef.current) {
        cancelAnimationFrame(focusedVideoRafRef.current);
        focusedVideoRafRef.current = null;
      }
    };
  }, [focusedVideoPlaying]);

  useEffect(() => {
    return () => {
      if (focusedVideoHintTimerRef.current) {
        clearTimeout(focusedVideoHintTimerRef.current);
      }
      if (focusedVideoRafRef.current) {
        cancelAnimationFrame(focusedVideoRafRef.current);
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

  const scheduleFloatingChipHide = () => {
    if (scrollIdleTimeoutRef.current) {
      clearTimeout(scrollIdleTimeoutRef.current);
    }
    scrollIdleTimeoutRef.current = setTimeout(() => {
      if (!isHoveringFloatingDayChipRef.current) {
        setShowFloatingDayChip(false);
      }
    }, 1500);
  };

  const getMessageDayLabel = (msg) => {
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
  };

  const renderMessageItem = (msg, index) => {
    const isOwn = msg.username === user.username;
    const isRead = Boolean(msg.read_at);
    const hasFiles = Array.isArray(msg.files) && msg.files.length > 0;
    const hasUploadInProgress =
      Array.isArray(msg._files) &&
      msg._files.length > 0 &&
      Number(msg._uploadProgress ?? 100) < 100;
    const isSending = msg._delivery === "sending" || hasUploadInProgress;
    const isFailed = msg._delivery === "failed";
    const currentDayKey = msg._dayKey || "";
    const prevDayKey = index > 0 ? messages[index - 1]?._dayKey || "" : "";
    const isNewDay = !prevDayKey || currentDayKey !== prevDayKey;
    const dayLabel = getMessageDayLabel(msg);

    return (
      <div
        id={`message-${msg.id}`}
        data-msg-day={dayLabel}
        className="w-full max-w-full overflow-x-hidden px-0 pb-3 md:px-3"
      >
        {isNewDay ? (
          <div className="my-3 flex w-full items-center justify-center">
            <div
              data-day-chip={dayLabel}
              className="inline-flex w-max rounded-full border border-emerald-200/60 bg-white/80 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
            >
              {dayLabel}
            </div>
          </div>
        ) : null}
        {unreadMarkerId === msg.id ? (
          <div className="my-3 flex items-center gap-3">
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

  const chatScrollStyle = useMemo(
    () => ({
      backgroundImage: isDark
        ? "radial-gradient(circle at top right, rgba(16,185,129,0.22), transparent 48%), radial-gradient(circle at bottom left, rgba(16,185,129,0.20), transparent 44%)"
        : "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 45%), radial-gradient(circle at bottom left, rgba(16,185,129,0.09), transparent 40%)",
      backgroundColor: isDark ? "#0b1320" : "#dcfce7",
      paddingTop:
        activeChatId && insecureConnection
          ? insecureConnection
            ? "6.5rem"
            : "4.5rem"
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

  const virtuosoComponents = useMemo(
    () => ({
      Footer: () => <div style={{ height: `${virtuosoBottomSpacerPx}px` }} />,
    }),
    [virtuosoBottomSpacerPx],
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
    const width = Number(file?.width);
    const height = Number(file?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    if (width <= 0 || height <= 0) return null;
    const ratio = width / height;
    // Clamp extreme values to keep bubble layout usable.
    return Math.min(2.4, Math.max(0.42, ratio));
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

  const renderMessageFiles = (files = []) => {
    if (!files.length) return null;
    const markMediaThumbLoaded = (thumbKey) => {
      setLoadedMediaThumbs((prev) => {
        if (prev.has(thumbKey)) return prev;
        const next = new Set(prev);
        next.add(thumbKey);
        return next;
      });
      onMessageMediaLoaded?.();
    };
    const handleVideoThumbReady = (event, thumbKey) => {
      handleVideoThumbLoadedMetadata(event);
      const video = event.currentTarget;
      if (!video) return;
      // Mobile Safari sometimes paints first frame only after a decode/play step.
      if (!isDesktop) {
        const playPromise = video.play?.();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(() => {
              video.pause?.();
              markMediaThumbLoaded(thumbKey);
            })
            .catch(() => {
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
          const key = file.id || `${file.name}-${file.sizeBytes || 0}`;
          const thumbKey = `thumb-${key}`;
          const thumbLoaded = loadedMediaThumbs.has(thumbKey);
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
                onClick={() => openFocusMedia({ url: file.url, name: file.name, type: "image" })}
                className="relative block w-full overflow-hidden rounded-xl border border-emerald-200/70 bg-white/70 dark:border-emerald-500/30 dark:bg-slate-900/50"
              >
                <div className={imageFrameClass} style={mediaFrameStyle}>
                  <img
                    src={file.url}
                    alt={file.name || "image"}
                    onLoad={() => markMediaThumbLoaded(thumbKey)}
                    loading="lazy"
                    decoding="async"
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
          if (isVideo && file.url) {
            return (
              <button
                type="button"
                key={key}
                onClick={() => openFocusMedia({ url: file.url, name: file.name, type: "video" })}
                className="relative block w-full overflow-hidden rounded-xl border border-emerald-200/70 bg-black/60 dark:border-emerald-500/30"
                aria-label={`Open video ${file.name || ""}`.trim()}
              >
                <div className={videoFrameClass} style={mediaFrameStyle}>
                  <video
                    muted
                    playsInline
                    preload={isDesktop ? (fileIndex < 2 ? "auto" : "metadata") : "auto"}
                    onLoadedMetadata={(event) => handleVideoThumbReady(event, thumbKey)}
                    onLoadedData={(event) => handleVideoThumbReady(event, thumbKey)}
                    src={file.url}
                    className={videoClass}
                  />
                  {isDesktop && !thumbLoaded ? (
                    <div className="pointer-events-none absolute inset-0 animate-pulse bg-slate-800/80" />
                  ) : null}
                  {!mediaAspectRatio ? (
                    <div className="pointer-events-none w-full animate-pulse bg-slate-800/80" style={{ height: "180px" }} />
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
    if (!focusVisible) return;
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // browser policy can block autoplay with audio
      });
    }
  };

  const handleFocusedVideoLoadedMetadata = () => {
    const video = focusedVideoRef.current;
    if (!video) return;
    setFocusedVideoDuration(video.duration || 0);
    // Force first decodable frame, helps black-video issue on some desktop renderers.
    try {
      const duration = Number(video.duration || 0);
      if (Number.isFinite(duration) && duration > 0 && video.currentTime < 0.05) {
        video.currentTime = Math.min(0.08, Math.max(duration * 0.02, 0.02));
      }
    } catch (_) {
      // ignore
    }
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
          className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
          style={{ top: "calc(env(safe-area-inset-top) + 80px)" }}
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-semibold leading-none text-rose-700 dark:border-rose-500 dark:bg-rose-900 dark:text-rose-100">
            <AlertCircle className="h-[13px] w-[13px] shrink-0 -translate-y-[0.5px]" />
            <span className="leading-none">Connection is not secure.</span>
          </div>
        </div>
      ) : null}

      {activeChatId && floatingDayLabel && showFloatingDayChip ? (
        <div
          className="absolute left-1/2 z-20 -translate-x-1/2"
          style={{
            top: insecureConnection
              ? "calc(env(safe-area-inset-top) + 116px)"
              : "calc(env(safe-area-inset-top) + 80px)",
          }}
        >
          <button
            type="button"
            onClick={handleFloatingDayChipClick}
            onMouseEnter={() => {
              isHoveringFloatingDayChipRef.current = true;
              setIsHoveringFloatingDayChip(true);
              if (scrollIdleTimeoutRef.current) {
                clearTimeout(scrollIdleTimeoutRef.current);
              }
            }}
            onMouseLeave={() => {
              isHoveringFloatingDayChipRef.current = false;
              setIsHoveringFloatingDayChip(false);
              scheduleFloatingChipHide();
            }}
            className="rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          >
            {floatingDayLabel}
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0">
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
          <Virtuoso
            ref={virtuosoRef}
            data={messages}
            scrollerRef={(el) => {
              chatScrollRef.current = el;
            }}
            onScroll={handlePanelScroll}
            className="chat-scroll h-full overflow-x-hidden px-0 py-6 md:pl-1 md:pr-4"
            style={chatScrollStyle}
            overscan={140}
            components={virtuosoComponents}
            followOutput={userScrolledUp ? false : "smooth"}
            initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
            computeItemKey={(index, msg) =>
              String(msg.id ?? `${msg.created_at || "na"}-${msg.username || "na"}-${index}`)
            }
            itemContent={(index, msg) => renderMessageItem(msg, index)}
          />
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
                    onClick={() => {
                      if (pendingUploadType === "media") {
                        mediaInputRef.current?.click();
                      } else {
                        documentInputRef.current?.click();
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 px-2 py-0.5 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
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
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
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
                            preload="metadata"
                            onLoadedMetadata={handleVideoThumbLoadedMetadata}
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
                onClick={() => setShowUploadMenu((prev) => !prev)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-transparent bg-transparent text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                aria-label="Attach file"
              >
                <Paperclip size={18} className="icon-anim-sway" />
              </button>
              {showUploadMenu ? (
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
          className={`fixed inset-0 z-[70] transition-opacity duration-200 ${isDesktop ? "bg-black/80" : "bg-black"} ${focusVisible ? "opacity-100" : "opacity-0"}`}
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
            className="flex h-full items-center justify-center p-3 md:p-6"
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
                maxHeight: isDesktop ? "min(86vh, 820px)" : "calc(100vh - 1.5rem)",
              }}
            >
              {focusedMedia.type === "video" ? (
                <div
                  className="relative mx-auto flex w-fit max-w-full flex-col items-center"
                  onClick={(event) => event.stopPropagation()}
                  onTouchStart={isMobileTouchDevice && !isDesktop ? handleFocusTouchStart : undefined}
                  onTouchEnd={isMobileTouchDevice && !isDesktop ? handleFocusTouchEnd : undefined}
                >
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
                    className="mx-auto block max-h-[72vh] w-auto max-w-full cursor-pointer rounded-2xl bg-transparent object-contain md:max-h-[78vh] md:[transform:translateZ(0)] md:[backface-visibility:hidden]"
                  />
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
                  <div className="mt-2 w-full rounded-xl bg-black/70 p-2 text-white">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleFocusedVideoPlay}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10"
                        aria-label={focusedVideoPlaying ? "Pause" : "Play"}
                      >
                        {focusedVideoPlaying ? <Pause size={15} /> : <Play size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={toggleFocusedVideoMute}
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
                        className="h-1.5 flex-1 accent-emerald-400"
                        aria-label="Seek video"
                      />
                      <span className="w-20 text-right text-[11px]">
                        {formatSeconds(focusedVideoTime)} / {formatSeconds(focusedVideoDuration)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={focusedMedia.url}
                  alt={focusedMedia.name || "media"}
                  className="mx-auto max-h-[78vh] w-auto max-w-full rounded-2xl object-contain"
                  onClick={(event) => event.stopPropagation()}
                  onTouchStart={isMobileTouchDevice && !isDesktop ? handleFocusTouchStart : undefined}
                  onTouchEnd={isMobileTouchDevice && !isDesktop ? handleFocusTouchEnd : undefined}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

    </section>
  );
}

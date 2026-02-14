import { useCallback, useEffect, useRef, useState } from "react";
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
  Video,
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
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const [focusedMedia, setFocusedMedia] = useState(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const isHoveringFloatingDayChipRef = useRef(false);
  const scrollIdleTimeoutRef = useRef(null);
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
  const previewExtraOffset = pendingUploadFiles?.length ? (isDesktop ? 170 : 190) : 0;

  const updateFloatingDayLabel = useCallback(() => {
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
    if (!messageNodes.length || !dayChips.length) {
      setFloatingDayLabel(null);
      return;
    }

    const anchorTop = scrollTop + containerPaddingTop + 8;
    const firstVisibleMessage =
      messageNodes.find(
        (node) => node.offsetTop + node.offsetHeight >= anchorTop,
      ) || messageNodes[messageNodes.length - 1];
    const currentLabel = firstVisibleMessage?.getAttribute("data-msg-day") || null;
    if (!currentLabel) {
      setFloatingDayLabel(null);
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
    setFloatingDayLabel(inlineChipVisible ? null : currentLabel);
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

  useEffect(() => {
    const container = chatScrollRef?.current;
    if (!container) return;
    const update = () => {
      const width = Math.max(0, container.offsetWidth - container.clientWidth);
      setScrollbarWidth(width);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [chatScrollRef, activeChatId, messages.length]);

  const handlePanelScroll = (event) => {
    onChatScroll?.(event);
    updateFloatingDayLabel();
    setShowFloatingDayChip(true);
    if (scrollIdleTimeoutRef.current) {
      clearTimeout(scrollIdleTimeoutRef.current);
    }
    scrollIdleTimeoutRef.current = setTimeout(() => {
      if (!isHoveringFloatingDayChipRef.current) {
        setShowFloatingDayChip(false);
      }
    }, 1500);
  };

  const handleFloatingDayChipClick = () => {
    if (!floatingDayLabel || !chatScrollRef?.current) return;
    const container = chatScrollRef.current;
    const dayChips = Array.from(container.querySelectorAll("[data-day-chip]"));
    const targetChip = dayChips.find(
      (chip) => chip.getAttribute("data-day-chip") === floatingDayLabel,
    );
    if (!targetChip) return;
    const containerRect = container.getBoundingClientRect();
    const chipRect = targetChip.getBoundingClientRect();
    const top =
      container.scrollTop + (chipRect.top - containerRect.top);
    container.scrollTo({
      top: Math.max(top, 0),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    return () => {
      if (scrollIdleTimeoutRef.current) {
        clearTimeout(scrollIdleTimeoutRef.current);
      }
    };
  }, []);

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
    const mimeType = String(file?.mimeType || "").toLowerCase();
    const name = String(file?.name || "").toLowerCase();
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (/\.(gif|png|jpe?g|webp|bmp|svg)$/.test(name)) return "image";
    if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(name)) return "video";
    return "document";
  };

  const renderMessageFiles = (files = []) => {
    if (!files.length) return null;
    return (
      <div className="mt-1 space-y-2">
        {files.map((file) => {
          const renderType = getFileRenderType(file);
          const isImage = renderType === "image";
          const isVideo = renderType === "video";
          const key = file.id || `${file.name}-${file.sizeBytes || 0}`;
          if (isImage && file.url) {
            return (
              <button
                type="button"
                key={key}
                onClick={() => openFocusMedia({ url: file.url, name: file.name, type: "image" })}
                className="block overflow-hidden rounded-xl border border-emerald-200/70 bg-white/70 dark:border-emerald-500/30 dark:bg-slate-900/50"
              >
                <img src={file.url} alt={file.name || "image"} className="max-h-52 w-full object-cover" />
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
                <video
                  muted
                  playsInline
                  src={file.url}
                  className="max-h-56 w-full object-cover"
                />
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
                className="group flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2 text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-white hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70 dark:hover:shadow-[0_0_16px_rgba(16,185,129,0.14)]"
              >
                <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                  <File size={15} className="absolute text-emerald-600 transition-opacity duration-150 group-hover:opacity-0 dark:text-emerald-300" />
                  <Download size={15} className="absolute text-emerald-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100 dark:text-emerald-300" />
                </span>
                <span className="min-w-0 flex-1 truncate">{file.name || "document"}</span>
              </a>
            ) : (
              <div
                key={key}
                className="flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2 text-xs text-slate-700 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200"
              >
                <File size={15} className="shrink-0 text-emerald-600 dark:text-emerald-300" />
                <span className="min-w-0 flex-1 truncate">{file.name || "document"}</span>
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

  const formatSeconds = (seconds) => {
    const safe = Math.max(0, Math.floor(Number(seconds || 0)));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
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
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/80 bg-rose-50 px-3 py-1 text-xs font-semibold leading-none text-rose-700 dark:border-rose-500/40 dark:bg-rose-900/25 dark:text-rose-200">
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

      <div
        ref={chatScrollRef}
        onScroll={handlePanelScroll}
        className="chat-scroll flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-6 py-6"
        style={{
          backgroundImage: isDark
            ? "radial-gradient(circle at top right, rgba(16,185,129,0.22), transparent 48%), radial-gradient(circle at bottom left, rgba(16,185,129,0.20), transparent 44%)"
            : "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 45%), radial-gradient(circle at bottom left, rgba(16,185,129,0.09), transparent 40%)",
          backgroundColor: isDark ? "#0b1320" : "#dcfce7",
          paddingTop:
            activeChatId && (insecureConnection || floatingDayLabel)
              ? insecureConnection
                ? "6.5rem"
                : "4.5rem"
              : undefined,
          marginBottom:
            activeChatId && !isDesktop
              ? "calc(env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px) + 4.25rem - 1px)"
              : undefined,
          paddingBottom: activeChatId
            ? `max(1rem, calc(env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px) + 1rem + ${!isDesktop ? previewExtraOffset : 0}px))`
            : undefined,
        }}
      >
        {!activeChatId ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
              Select a chat to start
            </div>
          </div>
        ) : loadingMessages || (!isConnected && messages.length === 0) ? (
          <div className="space-y-3">
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
          messages.map((msg, index) => {
            const isOwn = msg.username === user.username;
            const isRead = Boolean(msg.read_at);
            const isSending = msg._delivery === "sending";
            const isFailed = msg._delivery === "failed";
            const currentDayKey = msg._dayKey || "";
            const prevDayKey = index > 0 ? messages[index - 1]?._dayKey || "" : "";
            const isNewDay = !prevDayKey || currentDayKey !== prevDayKey;
            const dayLabel = msg._dayLabel || "";
            return (
              <div key={msg.id} id={`message-${msg.id}`} data-msg-day={dayLabel}>
                {isNewDay ? (
                  <div
                    className="relative my-3 h-6"
                    style={{
                      width: "calc(100% + 3rem)",
                      marginLeft: `calc(-1.5rem + ${scrollbarWidth / 2}px)`,
                    }}
                  >
                    <div
                      data-day-chip={dayLabel}
                      className="absolute left-1/2 top-1/2 inline-flex w-max -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-200/60 bg-white/80 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
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
                <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
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
          })
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
              Say something to start
            </div>
          </div>
        )}
      </div>

      {activeChatId ? (
        <form
          className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-3 border-t border-slate-300/80 bg-white px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-900 sm:px-6 md:static md:mt-auto md:shrink-0"
          style={{
            bottom: isDesktop ? undefined : "var(--mobile-bottom-offset, 0px)",
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
                  const isImage = item.mimeType?.startsWith("image/");
                  const isVideo = item.mimeType?.startsWith("video/");
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
                        <img src={item.previewUrl} alt={item.name} className="mb-1 h-20 w-full rounded-md object-contain bg-slate-100 dark:bg-slate-800" />
                      ) : isVideo ? (
                        <div className="mb-1 flex h-20 w-full items-center justify-center rounded-md bg-slate-900/70 text-emerald-200">
                          <Video size={16} />
                        </div>
                      ) : (
                        <div className="mb-1 flex h-20 w-full items-center justify-center rounded-md bg-slate-100 text-emerald-700 dark:bg-slate-800 dark:text-emerald-200">
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
          className="absolute inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white/90 text-emerald-700 shadow-lg transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
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
              className={`mx-auto transition-all duration-200 ${focusVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"}`}
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "fit-content",
                maxWidth: "min(92vw, 1100px)",
                maxHeight: isDesktop ? "min(86vh, 820px)" : "calc(100vh - 1.5rem)",
              }}
            >
              {focusedMedia.type === "video" ? (
                <div
                  className="relative w-full"
                  onTouchStart={isMobileTouchDevice && !isDesktop ? handleFocusTouchStart : undefined}
                  onTouchEnd={isMobileTouchDevice && !isDesktop ? handleFocusTouchEnd : undefined}
                >
                  <video
                    ref={focusedVideoRef}
                    autoPlay
                    playsInline
                    src={focusedMedia.url}
                    onClick={toggleFocusedVideoPlay}
                    className="max-h-[72vh] w-full cursor-pointer rounded-2xl bg-black object-contain md:max-h-[78vh]"
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
                  <div className="mt-2 rounded-xl bg-black/70 p-2 text-white">
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

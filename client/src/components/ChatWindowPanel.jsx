import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
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
  replyTarget,
  onClearReply,
  onReplyToMessage,
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
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchDxRef = useRef(0);
  const touchDyRef = useRef(0);
  const trackingSwipeRef = useRef(false);
  const uploadMenuRef = useRef(null);
  const mediaInputRef = useRef(null);
  const documentInputRef = useRef(null);
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
  const uploadBusy = !fileUploadEnabled || fileUploadInProgress;
  const timelineBottomSpacerPx = 4;
  const replyOrUploadOffset =
    replyTarget || (pendingUploadFiles?.length ?? 0) > 0 ? 64 : 0;
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
    setLoadedMediaThumbs(new Set());
    setMediaAspectByKey({});
  }, [activeChatId]);

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
      onJumpToMessage={(messageId) => {
        const target = document.getElementById(`message-${messageId}`);
        if (target && typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        const bubble = target?.querySelector?.("[data-message-bubble]");
        if (bubble) {
          bubble.classList.remove("reply-flash");
          void bubble.offsetWidth;
          bubble.classList.add("reply-flash");
          window.setTimeout(() => {
            bubble.classList.remove("reply-flash");
          }, 700);
        }
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
          <div className="h-[72px] md:hidden" />
        </>
      ) : null}

      {insecureConnection && activeChatId ? (
        <div
          className="pointer-events-none absolute left-1/2 z-[1] -translate-x-1/2"
          style={{ top: "calc(env(safe-area-inset-top) + 122px)" }}
        >
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-semibold leading-none text-rose-700 dark:border-rose-500 dark:bg-rose-900 dark:text-rose-100">
            <AlertCircle className="h-[13px] w-[13px] shrink-0 -translate-y-[0.5px]" />
            <span className="leading-none">Connection is not secure</span>
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
            loadingMessages={loadingMessages || (!isConnected && messages.length === 0)}
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

      <MessageComposer
        activeChatId={activeChatId}
        isDesktop={isDesktop}
        handleSend={handleSend}
        onComposerResize={handleComposerResize}
        replyTarget={replyTarget}
        onClearReply={onClearReply}
        pendingUploadFiles={pendingUploadFiles}
        pendingUploadType={pendingUploadType}
        fileUploadEnabled={fileUploadEnabled}
        mediaInputRef={mediaInputRef}
        documentInputRef={documentInputRef}
        onClearPendingUploads={onClearPendingUploads}
        onRemovePendingUpload={onRemovePendingUpload}
        onUploadFilesSelected={onUploadFilesSelected}
        uploadError={uploadError}
        activeUploadProgress={activeUploadProgress}
        uploadBusy={uploadBusy}
        showUploadMenu={showUploadMenu}
        setShowUploadMenu={setShowUploadMenu}
        uploadMenuRef={uploadMenuRef}
        handleVideoThumbLoadedMetadata={handleVideoThumbLoadedMetadata}
      />

      {activeChatId && userScrolledUp ? (
        <button
          type="button"
          onClick={onJumpToLatest}
          className="absolute inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700 shadow-lg transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          style={{
            bottom: `max(80px + 0.05rem, calc(80px + env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px) + 0.05rem + ${replyOrUploadOffset}px))`,
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


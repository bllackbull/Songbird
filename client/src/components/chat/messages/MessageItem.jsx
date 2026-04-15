import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock12,
  ClockFading,
  Eye,
  File,
  Ghost,
  ImageIcon,
  Mic,
  Reply,
  Video,
} from "../../../icons/lucide.js";
import { hasPersian } from "../../../utils/fontUtils.js";
import { getAvatarStyle } from "../../../utils/avatarColor.js";
import { getAvatarInitials } from "../../../utils/avatarInitials.js";
import { MessageFiles } from "../media/MessageFiles.jsx";
import {
  renderMarkdownBlock,
  renderMarkdownInlinePlain,
} from "../../../utils/markdown.js";
import { resolveMention } from "../../../utils/mentions.js";

export const MessageItem = memo(function MessageItem({
  msg,
  isFirstInGroup,
  user,
  formatTime,
  unreadMarkerId,
  messageFilesProps,
  getMessageDayLabel,
  isDesktop,
  isMobileTouchDevice,
  isGroupChat = false,
  isChannelChat = false,
  chatName = "",
  chatColor = null,
  seenCount = null,
  onOpenSenderProfile,
  onOpenMention,
  mentionRefreshToken = 0,
  onReply,
  onJumpToMessage,
  canSwipeReply = true,
}) {
  const isOwn = !isChannelChat && msg.username === user.username;
  const isRead = Boolean(msg.read_at);
  const extractBodyText = (value) => {
    if (typeof value === "string") {
      return value === "[object Object]" ? "" : value;
    }
    if (value && typeof value === "object") {
      return String(value.text || value.body || "");
    }
    return String(value ?? "");
  };
  const messageFiles = Array.isArray(msg.files) ? msg.files : [];
  const hasFiles = messageFiles.length > 0;
  const getFileRenderType = messageFilesProps?.getFileRenderType;
  const hasMediaFiles = getFileRenderType
    ? messageFiles.some((file) => {
        const type = getFileRenderType(file);
        return type === "image" || type === "video";
      })
    : true;
  const hasUploadInProgress =
    Array.isArray(msg._files) &&
    msg._files.length > 0 &&
    Number(msg._uploadProgress ?? 100) < 100;
  const isSending =
    msg._delivery === "sending" ||
    hasUploadInProgress ||
    Boolean(msg._processingPending);
  const isFailed = msg._delivery === "failed";
  const bodyText = extractBodyText(msg?.body);
  const messageBodyRef = useRef(null);
  const mentionDebugEnabled =
    typeof window !== "undefined" &&
    window.localStorage?.getItem("sb-debug-mentions") === "1";
  const [mentionDebug, setMentionDebug] = useState(null);
  const onOpenMentionRef = useRef(onOpenMention);
  useEffect(() => {
    onOpenMentionRef.current = onOpenMention;
  }, [onOpenMention]);
  const markdownHtml = useMemo(() => {
    return renderMarkdownBlock(bodyText);
  }, [bodyText]);

  const wrapMentionsInContainer = (container) => {
    if (!container || typeof document === "undefined") return false;
    const showText =
      typeof NodeFilter !== "undefined" ? NodeFilter.SHOW_TEXT : 4;
    let walker = null;
    try {
      walker = document.createTreeWalker(container, showText, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter ? NodeFilter.FILTER_REJECT : 2;
          if (parent.closest("a, code, pre, .sb-mention")) {
            return NodeFilter ? NodeFilter.FILTER_REJECT : 2;
          }
          return NodeFilter ? NodeFilter.FILTER_ACCEPT : 1;
        },
      });
    } catch {
      return false;
    }
    let changed = false;
    const regex = /(^|[^a-z0-9._])@([a-z0-9._]{3,})/gi;
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    textNodes.forEach((node) => {
      const text = String(node.textContent || "");
      if (!regex.test(text)) return;
      regex.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      let match = null;
      while ((match = regex.exec(text))) {
        const prefix = match[1] || "";
        const username = match[2] || "";
        const start = match.index;
        const mentionStart = start + prefix.length;
        if (mentionStart > lastIndex) {
          frag.appendChild(
            document.createTextNode(text.slice(lastIndex, mentionStart)),
          );
        }
        const span = document.createElement("span");
        span.className = "sb-mention sb-mention-active";
        span.dataset.mention = String(username || "").toLowerCase();
        span.dir = "ltr";
        span.textContent = `@${username}`;
        frag.appendChild(span);
        lastIndex = mentionStart + username.length + 1;
      }
      if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      node.parentNode?.replaceChild(frag, node);
      changed = true;
    });
    return changed;
  };

  useEffect(() => {
    const container = messageBodyRef.current;
    if (!container) return;
    const mayContainMentionSyntax = /(^|[^a-z0-9._])@[a-z0-9._]{3,}/i.test(
      bodyText,
    );
    const mayContainCodeBlocks =
      typeof markdownHtml === "string" && markdownHtml.includes("sb-code-block");
    const markInvalid = (el) => {
      const now = Date.now();
      const lastValid = Number(el.dataset.sbMentionValidAt || 0);
      if (lastValid && now - lastValid < 30000) {
        el.dataset.sbMentionInvalidAt = String(now);
        return;
      }
      el.classList.remove("sb-mention-active");
      el.dataset.sbMentionInvalidAt = String(now);
    };
    const markValid = (el) => {
      el.classList.add("sb-mention-active");
      el.dataset.sbMentionValidAt = String(Date.now());
      if (el.dataset.sbMentionInvalidAt) {
        delete el.dataset.sbMentionInvalidAt;
      }
    };
    if (mayContainMentionSyntax) {
      wrapMentionsInContainer(container);
    }
    const handleMentionClick = (event) => {
      const target = event?.target;
      if (!target || typeof target.closest !== "function") return;
      const mentionEl = target.closest(".sb-mention");
      if (!mentionEl || !container.contains(mentionEl)) return;
      const rawMention =
        mentionEl.dataset.mention ||
        String(mentionEl.textContent || "")
          .trim()
          .replace(/^@/, "");
      const mention = String(rawMention || "").toLowerCase();
      if (!mention) return;
      resolveMention(mention, user.username, {
        fallbackToCacheOnError: true,
      }).then((result) => {
        if (!result || result.status !== "valid") {
          markInvalid(mentionEl);
          return;
        }
        markValid(mentionEl);
        if (typeof onOpenMentionRef.current === "function") {
          onOpenMentionRef.current(result.data);
        }
      });
    };
    if (mayContainMentionSyntax) {
      container.addEventListener("click", handleMentionClick);
    }
    if (mentionDebugEnabled) {
      const totalMentions = container.querySelectorAll(".sb-mention").length;
      const activeMentions =
        container.querySelectorAll(".sb-mention-active").length;
      setMentionDebug((prev) => {
        if (
          prev &&
          prev.total === totalMentions &&
          prev.active === activeMentions
        ) {
          return prev;
        }
        return {
          total: totalMentions,
          active: activeMentions,
        };
      });
    }
    if (mayContainCodeBlocks) {
      const enhanceCodeBlocks = () => {
        const blocks = container.querySelectorAll(".sb-code-block");
        blocks.forEach((block) => {
          if (block.dataset.sbEnhanced === "1") return;
          block.dataset.sbEnhanced = "1";
          const codeEl = block.querySelector("pre.sb-code > code");
          const button = block.querySelector(".sb-code-copy");
          if (!codeEl || !button) return;
          button.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(codeEl.textContent || "");
              button.dataset.state = "copied";
              button.setAttribute("aria-label", "Copied");
              window.setTimeout(() => {
                button.dataset.state = "idle";
                button.setAttribute("aria-label", "Copy code");
              }, 1200);
            } catch {
              button.dataset.state = "error";
              button.setAttribute("aria-label", "Copy failed");
              window.setTimeout(() => {
                button.dataset.state = "idle";
                button.setAttribute("aria-label", "Copy code");
              }, 1200);
            }
          });
        });
      };
      let idleId = null;
      let timerId = null;
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(enhanceCodeBlocks, { timeout: 600 });
      } else {
        timerId = window.setTimeout(enhanceCodeBlocks, 40);
      }
      return () => {
        if (mayContainMentionSyntax) {
          container.removeEventListener("click", handleMentionClick);
        }
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
      };
    }
    return () => {
      if (mayContainMentionSyntax) {
        container.removeEventListener("click", handleMentionClick);
      }
    };
  }, [
    markdownHtml,
    mentionRefreshToken,
    user.username,
    mentionDebugEnabled,
    bodyText,
  ]);

  const formatSeenCount = (value) => {
    const count = Math.max(1, Number(value || 0));
    if (!Number.isFinite(count)) return "1";
    if (count < 1000) return String(count);
    if (count < 1_000_000) {
      const next = (count / 1000).toFixed(1);
      return `${next.replace(/\.0$/, "")}K`;
    }
    if (count < 1_000_000_000) {
      const next = (count / 1_000_000).toFixed(1);
      return `${next.replace(/\.0$/, "")}M`;
    }
    const next = (count / 1_000_000_000).toFixed(1);
    return `${next.replace(/\.0$/, "")}B`;
  };
  const formatExpiryBadge = () => {
    const files = Array.isArray(msg?.files) ? msg.files : [];
    if (!files.length) return null;
    const expiryMs = files
      .map((file) => new Date(file?.expiresAt || "").getTime())
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b)[0];
    if (!expiryMs) return null;
    const diffMs = expiryMs - Date.now();
    if (diffMs <= 0) return null;
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;
    if (diffMs < hourMs) {
      const minutes = Math.max(1, Math.ceil(diffMs / minuteMs));
      return { label: `${minutes}m`, danger: true };
    }
    if (diffMs < dayMs) {
      const hours = Math.max(1, Math.ceil(diffMs / hourMs));
      return { label: `${hours}h`, danger: true };
    }
    const dayDisplayBiasMs = 55 * minuteMs;
    const days = Math.max(1, Math.floor((diffMs + dayDisplayBiasMs) / dayMs));
    return { label: `${days}d`, danger: days <= 1 };
  };
  const expiryBadge = formatExpiryBadge();
  const dayLabel = getMessageDayLabel
    ? getMessageDayLabel(msg)
    : msg?._dayLabel || msg?._dayKey || "";
  const replyTarget = msg.replyTo || null;
  const replyDisplayName =
    isChannelChat && replyTarget
      ? chatName || "Channel"
      : replyTarget?.displayName ||
        replyTarget?.nickname ||
        replyTarget?.username ||
        "Unknown";
  const replyColor =
    isChannelChat && replyTarget
      ? chatColor || "#10b981"
      : replyTarget?.color || "#10b981";
  const replyPreviewRaw =
    extractBodyText(replyTarget?.body).trim() || "Message";
  const truncateReplyPreview = (value, maxChars = 90) => {
    const text = String(value || "");
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars).trimEnd()}...`;
  };
  const replyPreview = truncateReplyPreview(replyPreviewRaw);
  const replyBodyText = extractBodyText(replyTarget?.body).trim();
  const isPluralMediaSummary =
    /^Sent \d+ (files|photos|videos|documents|media files)$/i.test(
      replyBodyText,
    );
  const isGenericReplyMediaText =
    /^Sent (a media file|a photo|a video|a document|\d+ (files|photos|videos|documents|media files))$/i.test(
      replyBodyText,
    );
  const normalizedReplyPreview =
    replyTarget?.icon === "voice"
      ? /^Sent (a voice message|\d+ voice messages)$/i.test(replyBodyText)
        ? "Sent a voice message"
        : replyPreview
      : replyTarget?.icon === "video"
        ? isGenericReplyMediaText && !isPluralMediaSummary
          ? "Sent a video"
          : replyPreview
        : replyTarget?.icon === "image"
          ? isGenericReplyMediaText && !isPluralMediaSummary
            ? "Sent a photo"
            : replyPreview
          : replyPreview;
  const replyPreviewHtml = useMemo(
    () => renderMarkdownInlinePlain(normalizedReplyPreview),
    [normalizedReplyPreview],
  );
  const derivedReplyIcon = (() => {
    if (!replyTarget) return null;
    if (replyTarget.icon) return replyTarget.icon;
    if (/^Sent \d+ media files/i.test(replyPreview)) return "image";
    if (/^Sent (a voice message|\d+ voice messages)/i.test(replyPreview))
      return "voice";
    if (/^Sent (a video|\d+ videos)/i.test(replyPreview)) return "video";
    if (/^Sent (a photo|\d+ photos)/i.test(replyPreview)) return "image";
    if (/^Sent a media file/i.test(replyPreview)) return "image";
    if (/^Sent (a document|\d+ documents|\d+ files)/i.test(replyPreview))
      return "document";
    return null;
  })();
  const isDeletedAuthor =
    String(msg.username || "").toLowerCase() === "deleted" ||
    String(msg.nickname || "").toLowerCase() === "deleted user";
  const senderName = isDeletedAuthor
    ? "Deleted account"
    : msg.nickname || msg.username || "Unknown";
  const senderInitials = getAvatarInitials(senderName);
  const senderColor = isDeletedAuthor ? "#94a3b8" : msg.color || "#10b981";
  const canOpenSenderProfile =
    !isDeletedAuthor && typeof onOpenSenderProfile === "function";

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchDxRef = useRef(0);
  const touchDyRef = useRef(0);
  const trackingSwipeRef = useRef(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeOffsetRef = useRef(0);
  const swipeRafRef = useRef(0);
  const swipeUserSelectRef = useRef(null);
  const swipeTouchCalloutRef = useRef(null);
  const swipeEndLockRef = useRef(false);
  const swipeProgress = Math.min(Math.abs(swipeOffset) / 70, 1);
  const showSwipeHint = !isDesktop && isMobileTouchDevice && canSwipeReply;

  const queueSwipeOffset = (value) => {
    swipeOffsetRef.current = value;
    if (swipeRafRef.current) return;
    swipeRafRef.current = window.requestAnimationFrame(() => {
      swipeRafRef.current = 0;
      setSwipeOffset(swipeOffsetRef.current);
    });
  };

  const resetSwipe = useCallback(() => {
    trackingSwipeRef.current = false;
    setIsSwiping(false);
    swipeOffsetRef.current = 0;
    if (swipeRafRef.current) {
      window.cancelAnimationFrame(swipeRafRef.current);
      swipeRafRef.current = 0;
    }
    if (swipeUserSelectRef.current !== null) {
      document.body.style.userSelect = swipeUserSelectRef.current;
      swipeUserSelectRef.current = null;
    }
    if (swipeTouchCalloutRef.current !== null) {
      document.body.style.webkitTouchCallout = swipeTouchCalloutRef.current;
      swipeTouchCalloutRef.current = null;
    }
    setSwipeOffset(0);
  }, []);

  const handleSwipeEnd = useCallback(() => {
    if (swipeEndLockRef.current) return;
    swipeEndLockRef.current = true;
    const dx = touchDxRef.current;
    const dy = Math.abs(touchDyRef.current);
    const swipeOffset = swipeOffsetRef.current;
    const shouldReply = (swipeOffset < -24 || dx < -24) && dy < 90;
    resetSwipe();
    if (shouldReply) {
      onReply?.(msg);
    }
    window.setTimeout(() => {
      swipeEndLockRef.current = false;
    }, 0);
  }, [msg, onReply, resetSwipe]);

  useEffect(() => {
    return () => {
      if (swipeRafRef.current) {
        window.cancelAnimationFrame(swipeRafRef.current);
        swipeRafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    const handleWindowTouchEnd = () => {
      if (trackingSwipeRef.current) {
        handleSwipeEnd();
        return;
      }
      if (swipeOffsetRef.current === 0) return;
      resetSwipe();
    };
    window.addEventListener("touchend", handleWindowTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleWindowTouchEnd, {
      passive: true,
    });
    window.addEventListener("pointerup", handleWindowTouchEnd, { passive: true });
    window.addEventListener("pointercancel", handleWindowTouchEnd, {
      passive: true,
    });
    return () => {
      window.removeEventListener("touchend", handleWindowTouchEnd);
      window.removeEventListener("touchcancel", handleWindowTouchEnd);
      window.removeEventListener("pointerup", handleWindowTouchEnd);
      window.removeEventListener("pointercancel", handleWindowTouchEnd);
    };
  }, [handleSwipeEnd, resetSwipe]);

  return (
    <div
      id={`message-${msg.id}`}
      data-msg-day={dayLabel}
      data-msg-day-key={msg?._dayKey || ""}
      style={{ scrollMarginTop: "96px" }}
      className={`w-full max-w-full overflow-x-hidden px-0 pb-3 md:px-3 ${
        isFirstInGroup ? "pt-2" : ""
      }`}
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
      {msg?._systemEvent ? (
        <div className="flex justify-center px-3 py-1 md:px-0">
          <span
            className="inline-flex max-w-full items-center justify-center rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-center text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
            style={{ lineHeight: 1.35 }}
          >
            <span className="min-w-0 truncate">
              <span
                className={`min-w-0 truncate ${
                  hasPersian(msg?._systemEvent?.name) ? "font-fa sb-fa-baseline-fix" : ""
                }`}
                dir="auto"
                style={{ unicodeBidi: "isolate" }}
              >
                {msg?._systemEvent?.name || "A member"}
              </span>{" "}
              <span
                dir="ltr"
                style={{ unicodeBidi: "isolate" }}
              >
                {msg?._systemEvent?.suffix || ""}
              </span>
            </span>
          </span>
        </div>
      ) : null}
      {!msg?._systemEvent ? (
        <div
          className={`relative flex w-full max-w-full px-3 md:px-0 ${
            isOwn ? "justify-end" : "justify-start"
          }`}
          style={{
            touchAction: "pan-y",
            userSelect: isSwiping ? "none" : "text",
          }}
          onTouchStart={(event) => {
            if (isDesktop || !isMobileTouchDevice || !onReply) return;
            if (!canSwipeReply) return;
            const target = event.target;
            if (
              target &&
              target.closest?.(
                "input, textarea, select, label, [contenteditable='true']",
              )
            ) {
              return;
            }
            const touch = event.touches?.[0];
            if (!touch) return;
            trackingSwipeRef.current = true;
            setIsSwiping(false);
            touchStartXRef.current = touch.clientX;
            touchStartYRef.current = touch.clientY;
            touchDxRef.current = 0;
            touchDyRef.current = 0;
            swipeOffsetRef.current = 0;
            if (swipeUserSelectRef.current === null && typeof document !== "undefined") {
              swipeUserSelectRef.current = document.body.style.userSelect || "";
              document.body.style.userSelect = "none";
            }
            if (swipeTouchCalloutRef.current === null && typeof document !== "undefined") {
              swipeTouchCalloutRef.current =
                document.body.style.webkitTouchCallout || "";
              document.body.style.webkitTouchCallout = "none";
            }
          }}
          onTouchMove={(event) => {
            if (!trackingSwipeRef.current || !canSwipeReply) return;
            const touch = event.touches?.[0];
            if (!touch) return;
            const dx = touch.clientX - touchStartXRef.current;
            const dy = touch.clientY - touchStartYRef.current;
            touchDxRef.current = dx;
            touchDyRef.current = dy;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (!isSwiping && absDy > absDx * 2.4 && absDy > 28) {
              resetSwipe();
              return;
            }
            if (!isSwiping) {
              if (absDx < 3 && absDy < 3) {
                return;
              }
              const horizontalIntent = absDx > 3 && absDx > absDy * 0.15;
              if (!horizontalIntent) {
                return;
              }
              setIsSwiping(true);
            }
            if (event.cancelable) {
              event.preventDefault();
            }
            if (dx < 0) {
              queueSwipeOffset(Math.max(dx, -90));
            } else {
              queueSwipeOffset(0);
            }
          }}
          onTouchEnd={() => {
            if (!trackingSwipeRef.current) return;
            handleSwipeEnd();
          }}
          onTouchCancel={handleSwipeEnd}
        >
          {showSwipeHint ? (
            <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                style={{
                  opacity: swipeProgress,
                  transform: `translateX(${52 - swipeProgress * 60}px) scale(${
                    0.5 + swipeProgress * 0.7
                  })`,
                }}
              >
                <Reply size={16} />
              </div>
            </div>
          ) : null}
          {!isOwn && isGroupChat && !isChannelChat ? (
            <div className="flex min-w-0 max-w-full items-end gap-2">
              <button
                type="button"
                onClick={
                  canOpenSenderProfile
                    ? () => onOpenSenderProfile?.(msg)
                    : undefined
                }
                className={canOpenSenderProfile ? "group" : ""}
                disabled={!canOpenSenderProfile}
              >
                {msg.avatar_url && !isDeletedAuthor ? (
                  <img
                    src={msg.avatar_url}
                    alt={senderName}
                    className={`h-7 w-7 shrink-0 rounded-full object-cover transition ${
                      canOpenSenderProfile
                        ? "group-hover:ring-2 group-hover:ring-emerald-300"
                        : ""
                    }`}
                  />
                ) : (
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] transition ${
                      canOpenSenderProfile
                        ? "group-hover:ring-2 group-hover:ring-emerald-300"
                        : ""
                    } ${hasPersian(senderInitials) ? "font-fa" : ""}`}
                    style={getAvatarStyle(senderColor)}
                  >
                    {isDeletedAuthor ? (
                      <Ghost size={12} className="text-slate-600" />
                    ) : (
                      senderInitials
                    )}
                  </div>
                )}
              </button>
              <div
                data-message-bubble
                className={`relative flex-none rounded-2xl px-4 py-3 text-sm shadow-sm overflow-visible min-w-0 max-w-[82%] sm:max-w-[86%] md:max-w-[min(84%,calc(100%-2rem))] ${
                  hasFiles
                    ? hasMediaFiles
                      ? "w-[min(52vw,18rem)] md:w-[min(44vw,22rem)] md:min-w-[12rem]"
                      : "w-fit max-w-full"
                    : "max-w-full"
                } bg-white/90 text-slate-800 rounded-bl-md dark:bg-slate-800/75 dark:text-slate-100`}
                onDoubleClick={() => {
                  if (!isDesktop || !onReply) return;
                  onReply(msg);
                }}
                style={{
                  transform: swipeOffset
                    ? `translateX(${swipeOffset}px)`
                    : undefined,
                  transition: isSwiping ? "none" : "transform 160ms ease",
                  willChange: isSwiping ? "transform" : "auto",
                }}
              >
                <button
                  type="button"
                  onClick={
                    canOpenSenderProfile
                      ? () => onOpenSenderProfile?.(msg)
                      : undefined
                  }
                  disabled={!canOpenSenderProfile}
                  className={`mb-1 block max-w-[60vw] truncate text-[11px] font-semibold transition ${
                    canOpenSenderProfile ? "hover:underline" : ""
                  } sm:max-w-[40vw] md:max-w-[28vw] ${hasPersian(senderName) ? "font-fa" : ""}`}
                  dir="auto"
                  style={{ color: String(senderColor), unicodeBidi: "isolate" }}
                  title={senderName}
                >
                  {senderName}
                </button>
                {replyTarget ? (
                  <button
                    type="button"
                    onClick={() => onJumpToMessage?.(replyTarget.id)}
                    className="group mb-2 inline-flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 text-left text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-white hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70 dark:hover:shadow-[0_0_16px_rgba(16,185,129,0.14)]"
                    aria-label={`Reply to ${replyDisplayName}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block max-w-full truncate whitespace-nowrap text-[10px] font-semibold ${
                          hasPersian(replyDisplayName) ? "font-fa" : ""
                        }`}
                        dir="auto"
                        style={{ color: String(replyColor), unicodeBidi: "isolate" }}
                        title={replyDisplayName}
                      >
                        {replyDisplayName}
                      </span>
                      <span
                        className={`flex max-w-full items-baseline gap-1 truncate whitespace-nowrap ${
                          hasPersian(normalizedReplyPreview) ? "font-fa" : ""
                        }`}
                        dir="ltr"
                        style={{ unicodeBidi: "isolate" }}
                      >
                        {derivedReplyIcon === "voice" ? (
                          <Mic
                            size={11}
                            className="shrink-0 text-slate-500 dark:text-slate-400"
                          />
                        ) : derivedReplyIcon === "video" ? (
                          <Video
                            size={11}
                            className="shrink-0 text-slate-500 dark:text-slate-400"
                          />
                        ) : derivedReplyIcon === "image" ? (
                          <ImageIcon
                            size={11}
                            className="shrink-0 text-slate-500 dark:text-slate-400"
                          />
                        ) : derivedReplyIcon === "document" ? (
                          <File
                            size={11}
                            className="shrink-0 text-slate-500 dark:text-slate-400"
                          />
                        ) : null}
                        <span
                          className="min-w-0 truncate"
                          dir="auto"
                          style={{ unicodeBidi: "isolate" }}
                          dangerouslySetInnerHTML={{
                            __html: String(replyPreviewHtml || ""),
                          }}
                        />
                      </span>
                    </span>
                  </button>
                ) : null}
                <MessageFiles
                  files={messageFiles}
                  docFullWidth={isGroupChat && !isOwn && !isDesktop}
                  {...messageFilesProps}
                />
                {!(
                  (msg.files || []).length &&
                  /^Sent (a media file|a photo|a video|a document|a voice message|\d+ (files|photos|videos|documents|media files|voice messages))$/i.test(
                    bodyText.trim(),
                  )
                ) ? (
                  <div
                    ref={messageBodyRef}
                    dir={hasPersian(bodyText) ? "rtl" : "ltr"}
                    className={`sb-markdown mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                      hasPersian(bodyText) ? "font-fa text-right" : "text-left"
                    }`}
                    style={{ unicodeBidi: "plaintext" }}
                    dangerouslySetInnerHTML={{
                      __html: String(markdownHtml || ""),
                    }}
                  />
                ) : null}
                {mentionDebugEnabled ? (
                  <div className="sb-mention-debug" aria-hidden="true">
                    @{mentionDebug?.active ?? 0}/{mentionDebug?.total ?? 0}
                  </div>
                ) : null}
                <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>{msg._timeLabel || formatTime(msg.created_at)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div
              data-message-bubble
              className={`relative rounded-2xl px-4 py-3 text-sm shadow-sm overflow-visible min-w-0 max-w-[78%] sm:max-w-[82%] md:max-w-[75%] ${
                hasFiles
                  ? hasMediaFiles
                    ? "w-[min(52vw,18rem)] max-w-[72%] md:w-[min(44vw,22rem)] md:max-w-[68%] md:min-w-[12rem]"
                    : "w-fit max-w-[82%] sm:max-w-[86%] md:max-w-[80%]"
                  : "max-w-[82%] sm:max-w-[86%] md:max-w-[80%]"
              } ${
                isOwn
                  ? "rounded-br-md bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-white"
                  : "bg-white/90 text-slate-800 rounded-bl-md dark:bg-slate-800/75 dark:text-slate-100"
              }`}
              onDoubleClick={() => {
                if (!isDesktop || !onReply) return;
                onReply(msg);
              }}
              style={{
                transform: swipeOffset
                  ? `translateX(${swipeOffset}px)`
                  : undefined,
                transition: isSwiping ? "none" : "transform 160ms ease",
                willChange: isSwiping ? "transform" : "auto",
              }}
            >
              {!isOwn && isGroupChat && !isChannelChat ? (
                <p
                  className={`mb-1 max-w-[60vw] truncate text-[11px] font-semibold sm:max-w-[40vw] md:max-w-[28vw] ${hasPersian(senderName) ? "font-fa" : ""}`}
                  dir="auto"
                  style={{ color: String(senderColor), unicodeBidi: "isolate" }}
                  title={senderName}
                >
                  {senderName}
                </p>
              ) : null}
              {replyTarget ? (
                <button
                  type="button"
                  onClick={() => onJumpToMessage?.(replyTarget.id)}
                  className="group mb-2 inline-flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-emerald-200/70 bg-white/70 px-3 py-2.5 text-left text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-white hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900/70 dark:hover:shadow-[0_0_16px_rgba(16,185,129,0.14)]"
                  aria-label={`Reply to ${replyDisplayName}`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block max-w-full truncate whitespace-nowrap text-[10px] font-semibold ${
                        hasPersian(replyDisplayName) ? "font-fa" : ""
                      }`}
                      dir="auto"
                      style={{ color: String(replyColor), unicodeBidi: "isolate" }}
                      title={replyDisplayName}
                    >
                      {replyDisplayName}
                    </span>
                    <span
                      className={`flex max-w-full items-baseline gap-1 truncate whitespace-nowrap ${
                        hasPersian(normalizedReplyPreview) ? "font-fa" : ""
                      }`}
                      dir="ltr"
                      style={{ unicodeBidi: "isolate" }}
                    >
                      {derivedReplyIcon === "voice" ? (
                        <Mic
                          size={11}
                          className="shrink-0 text-slate-500 dark:text-slate-400"
                        />
                      ) : derivedReplyIcon === "video" ? (
                        <Video
                          size={11}
                          className="shrink-0 text-slate-500 dark:text-slate-400"
                        />
                      ) : derivedReplyIcon === "image" ? (
                        <ImageIcon
                          size={11}
                          className="shrink-0 text-slate-500 dark:text-slate-400"
                        />
                      ) : derivedReplyIcon === "document" ? (
                        <File
                          size={11}
                          className="shrink-0 text-slate-500 dark:text-slate-400"
                        />
                      ) : null}
                      <span
                        className="min-w-0 truncate"
                        dir="auto"
                        style={{ unicodeBidi: "isolate" }}
                        dangerouslySetInnerHTML={{
                          __html: String(replyPreviewHtml || ""),
                        }}
                      />
                    </span>
                  </span>
                </button>
              ) : null}
              <MessageFiles
                files={messageFiles}
                docFullWidth={isGroupChat && !isOwn && !isDesktop}
                {...messageFilesProps}
              />
              {!(
                (msg.files || []).length &&
                /^Sent (a media file|a photo|a video|a document|a voice message|\d+ (files|photos|videos|documents|media files|voice messages))$/i.test(
                  bodyText.trim(),
                )
              ) ? (
                <div
                  ref={messageBodyRef}
                  dir={hasPersian(bodyText) ? "rtl" : "ltr"}
                  className={`sb-markdown mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                    hasPersian(bodyText) ? "font-fa text-right" : "text-left"
                  }`}
                  style={{ unicodeBidi: "plaintext" }}
                  dangerouslySetInnerHTML={{
                    __html: String(markdownHtml || ""),
                  }}
                />
              ) : null}
              {mentionDebugEnabled ? (
                <div className="sb-mention-debug" aria-hidden="true">
                  @{mentionDebug?.active ?? 0}/{mentionDebug?.total ?? 0}
                </div>
              ) : null}
              <div
                className={`mt-2 flex w-full items-center text-[10px] ${
                  isOwn
                    ? "text-emerald-900/80 dark:text-emerald-50/80"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  <span>{msg._timeLabel || formatTime(msg.created_at)}</span>
                  {isOwn || isChannelChat ? (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        isSending
                          ? "text-emerald-900/80 dark:text-emerald-50/80"
                          : isFailed
                            ? "text-rose-500"
                            : isChannelChat
                              ? "text-slate-500 dark:text-slate-400"
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
                        <AlertCircle
                          size={15}
                          strokeWidth={2.4}
                          aria-hidden="true"
                        />
                      ) : isChannelChat ? (
                        <>
                          <Eye
                            size={13}
                            strokeWidth={2.4}
                            aria-hidden="true"
                            className="-translate-y-px"
                          />
                          <span>{formatSeenCount(seenCount)}</span>
                        </>
                      ) : isRead ? (
                        <CheckCheck
                          size={15}
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      ) : (
                        <Check size={15} strokeWidth={2.5} aria-hidden="true" />
                      )}
                    </span>
                  ) : null}
                </span>
                {expiryBadge ? (
                  <span
                    className={`ms-auto inline-flex items-center gap-1 ${
                      expiryBadge.danger ? "text-rose-500" : "text-current"
                    }`}
                  >
                    <ClockFading size={12} className="-translate-y-px" />
                    <span>{expiryBadge.label}</span>
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}, (prev, next) => {
  if (prev.msg !== next.msg) return false;
  if (prev.unreadMarkerId !== next.unreadMarkerId) return false;
  if (prev.isDesktop !== next.isDesktop) return false;
  if (prev.isMobileTouchDevice !== next.isMobileTouchDevice) return false;
  if (prev.isGroupChat !== next.isGroupChat) return false;
  if (prev.isChannelChat !== next.isChannelChat) return false;
  if (prev.chatName !== next.chatName) return false;
  if (prev.chatColor !== next.chatColor) return false;
  if (prev.seenCount !== next.seenCount) return false;
  if (prev.mentionRefreshToken !== next.mentionRefreshToken) return false;
  if (prev.user?.username !== next.user?.username) return false;
  if (prev.messageFilesProps !== next.messageFilesProps) {
    const prevFiles = Array.isArray(prev.msg?.files) ? prev.msg.files : [];
    const nextFiles = Array.isArray(next.msg?.files) ? next.msg.files : [];
    if (prevFiles.length || nextFiles.length) return false;
  }
  return true;
});

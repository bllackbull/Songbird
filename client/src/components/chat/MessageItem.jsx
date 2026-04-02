import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, Clock12, ClockFading, Eye, File, Ghost, ImageIcon, Mic, Video } from "../../icons/lucide.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { getAvatarStyle } from "../../utils/avatarColor.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { MessageFiles } from "./MessageFiles.jsx";
import { renderMarkdownBlock, renderMarkdownInlinePlain } from "../../utils/markdown.js";
import { resolveMention } from "../../utils/mentions.js";

export function MessageItem({
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
  seenCount = null,
  onOpenSenderProfile,
  onOpenMention,
  mentionRefreshToken = 0,
  onReply,
  onJumpToMessage,
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
    msg._delivery === "sending" || hasUploadInProgress || Boolean(msg._processingPending);
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
    const showText = typeof NodeFilter !== "undefined" ? NodeFilter.SHOW_TEXT : 4;
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
          frag.appendChild(document.createTextNode(text.slice(lastIndex, mentionStart)));
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
    wrapMentionsInContainer(container);
    const handleMentionClick = (event) => {
      const target = event?.target;
      if (!target || typeof target.closest !== "function") return;
      const mentionEl = target.closest(".sb-mention");
      if (!mentionEl || !container.contains(mentionEl)) return;
      const rawMention =
        mentionEl.dataset.mention ||
        String(mentionEl.textContent || "").trim().replace(/^@/, "");
      const mention = String(rawMention || "").toLowerCase();
      if (!mention) return;
      resolveMention(mention, user.username, {
        force: true,
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
    container.addEventListener("click", handleMentionClick);
    const mentionVersion = String(mentionRefreshToken || 0);
    const mentionEls = container.querySelectorAll(".sb-mention");
    mentionEls.forEach((node) => {
      const el = node;
      if (el.dataset.sbMentionEnhanced === mentionVersion) return;
      const rawMention =
        el.dataset.mention ||
        String(el.textContent || "").trim().replace(/^@/, "");
      const mention = String(rawMention || "").toLowerCase();
      if (!mention) return;
      el.dataset.sbMentionEnhanced = mentionVersion;
      resolveMention(mention, user.username, {
        fallbackToCacheOnError: true,
      }).then((result) => {
        if (!result || result.status !== "valid") {
          markInvalid(el);
          return;
        }
        markValid(el);
      });
    });
    const refreshMentions = () => {
      const nodes = container.querySelectorAll(".sb-mention");
      nodes.forEach((node) => {
        const el = node;
        const rawMention =
          el.dataset.mention ||
          String(el.textContent || "").trim().replace(/^@/, "");
        const mention = String(rawMention || "").toLowerCase();
        if (!mention) return;
        resolveMention(mention, user.username, {
          force: true,
          fallbackToCacheOnError: true,
        }).then((result) => {
          if (!result || result.status !== "valid") {
            markInvalid(el);
            return;
          }
          markValid(el);
        });
      });
    };
    const refreshTimer = window.setInterval(refreshMentions, 15000);
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
    return () => {
      container.removeEventListener("click", handleMentionClick);
      window.clearInterval(refreshTimer);
    };
  }, [markdownHtml, mentionRefreshToken, user.username, mentionDebugEnabled]);

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
    const days = Math.max(1, Math.ceil(diffMs / dayMs));
    return { label: `${days}d`, danger: days <= 1 };
  };
  const expiryBadge = formatExpiryBadge();
  const dayLabel = getMessageDayLabel
    ? getMessageDayLabel(msg)
    : msg?._dayLabel || msg?._dayKey || "";
  const replyTarget = msg.replyTo || null;
  const replyDisplayName =
    replyTarget?.nickname || replyTarget?.username || "Unknown";
  const replyPreviewRaw = extractBodyText(replyTarget?.body).trim() || "Message";
  const truncateReplyPreview = (value, maxChars = 90) => {
    const text = String(value || "");
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars).trimEnd()}...`;
  };
  const replyPreview = truncateReplyPreview(replyPreviewRaw);
  const replyBodyText = extractBodyText(replyTarget?.body).trim();
  const isPluralMediaSummary =
    /^Sent \d+ (files|photos|videos|documents|media files)$/i.test(replyBodyText);
  const isGenericReplyMediaText =
    /^Sent (a media file|a photo|a video|a document|\d+ (files|photos|videos|documents|media files))$/i.test(
      replyBodyText,
    );
  const normalizedReplyPreview =
    replyTarget?.icon === "voice"
      ? (/^Sent (a voice message|\d+ voice messages)$/i.test(replyBodyText) ? "Sent a voice message" : replyPreview)
      : replyTarget?.icon === "video"
        ? (isGenericReplyMediaText && !isPluralMediaSummary ? "Sent a video" : replyPreview)
        : replyTarget?.icon === "image"
          ? (isGenericReplyMediaText && !isPluralMediaSummary ? "Sent a photo" : replyPreview)
          : replyPreview;
  const replyPreviewHtml = useMemo(
    () => renderMarkdownInlinePlain(normalizedReplyPreview),
    [normalizedReplyPreview],
  );
  const derivedReplyIcon = (() => {
    if (!replyTarget) return null;
    if (replyTarget.icon) return replyTarget.icon;
    if (/^Sent \d+ media files/i.test(replyPreview)) return "image";
    if (/^Sent (a voice message|\d+ voice messages)/i.test(replyPreview)) return "voice";
    if (/^Sent (a video|\d+ videos)/i.test(replyPreview)) return "video";
    if (/^Sent (a photo|\d+ photos)/i.test(replyPreview)) return "image";
    if (/^Sent a media file/i.test(replyPreview)) return "image";
    if (/^Sent (a document|\d+ documents|\d+ files)/i.test(replyPreview)) return "document";
    return null;
  })();
  const replyIsRtl = hasPersian(normalizedReplyPreview);
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
          <span className="rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
            {msg._systemEvent.text}
          </span>
        </div>
      ) : null}
      {!msg?._systemEvent ? (
      <div
        className={`flex w-full max-w-full px-3 md:px-0 ${
          isOwn ? "justify-end" : "justify-start"
        }`}
        style={{ touchAction: "pan-y" }}
        onTouchStart={(event) => {
          if (isDesktop || !isMobileTouchDevice || !onReply) return;
          const touch = event.touches?.[0];
          if (!touch) return;
          trackingSwipeRef.current = true;
          setIsSwiping(true);
          touchStartXRef.current = touch.clientX;
          touchStartYRef.current = touch.clientY;
          touchDxRef.current = 0;
          touchDyRef.current = 0;
        }}
        onTouchMove={(event) => {
          if (!trackingSwipeRef.current) return;
          const touch = event.touches?.[0];
          if (!touch) return;
          const dx = touch.clientX - touchStartXRef.current;
          const dy = touch.clientY - touchStartYRef.current;
          touchDxRef.current = dx;
          touchDyRef.current = dy;
          if (Math.abs(dx) < Math.abs(dy)) {
            return;
          }
          if (event.cancelable) {
            event.preventDefault();
          }
          if (dx < 0) {
            setSwipeOffset(Math.max(dx, -70));
          }
        }}
        onTouchEnd={() => {
          if (!trackingSwipeRef.current) return;
          trackingSwipeRef.current = false;
          setIsSwiping(false);
          const dx = touchDxRef.current;
          const dy = Math.abs(touchDyRef.current);
          setSwipeOffset(0);
            if (dx < -32 && dy < 50) {
              onReply?.(msg);
            }
          }}
      >
        {!isOwn && isGroupChat && !isChannelChat ? (
          <div className="flex min-w-0 max-w-full items-end gap-2">
            <button
              type="button"
              onClick={canOpenSenderProfile ? () => onOpenSenderProfile?.(msg) : undefined}
              className={canOpenSenderProfile ? "group" : ""}
              disabled={!canOpenSenderProfile}
            >
              {msg.avatar_url && !isDeletedAuthor ? (
                <img
                  src={msg.avatar_url}
                  alt={senderName}
                  className={`h-7 w-7 shrink-0 rounded-full object-cover transition ${
                    canOpenSenderProfile ? "group-hover:ring-2 group-hover:ring-emerald-300" : ""
                  }`}
                />
              ) : (
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] transition ${
                    canOpenSenderProfile ? "group-hover:ring-2 group-hover:ring-emerald-300" : ""
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
              className={`relative rounded-2xl px-4 py-3 text-sm shadow-sm overflow-visible min-w-0 max-w-[min(76%,calc(100%-2.25rem))] md:max-w-[min(80%,calc(100%-2.25rem))] ${
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
                transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
                transition: isSwiping ? "none" : "transform 160ms ease",
              }}
            >
              <button
                type="button"
                onClick={canOpenSenderProfile ? () => onOpenSenderProfile?.(msg) : undefined}
                disabled={!canOpenSenderProfile}
                className={`mb-1 block max-w-[60vw] truncate text-[11px] font-semibold transition ${
                  canOpenSenderProfile ? "hover:underline" : ""
                } sm:max-w-[40vw] md:max-w-[28vw] ${hasPersian(senderName) ? "font-fa text-right" : "text-left"}`}
                style={{ color: String(senderColor) }}
                dir="auto"
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
                      className="block max-w-full truncate whitespace-nowrap text-[10px] font-semibold"
                      style={{ color: String(replyTarget?.color || "#10b981") }}
                      dir="auto"
                      title={replyDisplayName}
                    >
                      {replyDisplayName}
                    </span>
                    <span
                      className={`flex max-w-full items-center gap-1 truncate whitespace-nowrap ${
                        replyIsRtl ? "font-fa text-right" : "text-left"
                      }`}
                      dir={replyIsRtl ? "rtl" : "ltr"}
                      style={{ unicodeBidi: "plaintext" }}
                    >
                      {derivedReplyIcon === "voice" ? (
                        <Mic size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                      ) : derivedReplyIcon === "video" ? (
                        <Video size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                      ) : derivedReplyIcon === "image" ? (
                        <ImageIcon size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                      ) : derivedReplyIcon === "document" ? (
                        <File size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                      ) : null}
                      <span
                        className="min-w-0 truncate"
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
            transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
            transition: isSwiping ? "none" : "transform 160ms ease",
          }}
          >
          {!isOwn && isGroupChat && !isChannelChat ? (
            <p
              className={`mb-1 max-w-[60vw] truncate text-[11px] font-semibold sm:max-w-[40vw] md:max-w-[28vw] ${hasPersian(senderName) ? "font-fa text-right" : "text-left"}`}
              style={{ color: String(senderColor) }}
              dir="auto"
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
                  className="block max-w-full truncate whitespace-nowrap text-[10px] font-semibold"
                  style={{ color: String(replyTarget?.color || "#10b981") }}
                  dir="auto"
                  title={replyDisplayName}
                >
                  {replyDisplayName}
                </span>
                <span
                  className={`flex max-w-full items-center gap-1 truncate whitespace-nowrap ${
                    replyIsRtl ? "font-fa text-right" : "text-left"
                  }`}
                  dir={replyIsRtl ? "rtl" : "ltr"}
                  style={{ unicodeBidi: "plaintext" }}
                >
                  {derivedReplyIcon === "voice" ? (
                    <Mic size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                  ) : derivedReplyIcon === "video" ? (
                    <Video size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                  ) : derivedReplyIcon === "image" ? (
                    <ImageIcon size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                  ) : derivedReplyIcon === "document" ? (
                    <File size={11} className="shrink-0 text-slate-500 dark:text-slate-400" />
                  ) : null}
                  <span
                  className="min-w-0 truncate"
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
                  {isChannelChat ? (
                    <>
                      <Eye
                        size={13}
                        strokeWidth={2.4}
                        aria-hidden="true"
                        className="-translate-y-px"
                      />
                      <span>{formatSeenCount(seenCount)}</span>
                    </>
                  ) : isSending ? (
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
}

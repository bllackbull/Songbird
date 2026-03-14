import { AlertCircle, Check, CheckCheck, Clock12 } from "../../icons/lucide.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { MessageFiles } from "./MessageFiles.jsx";

export function MessageItem({
  msg,
  isFirstInGroup,
  user,
  formatTime,
  unreadMarkerId,
  messageFilesProps,
  getMessageDayLabel,
}) {
  const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  const hasUrlPattern = /(?:https?:\/\/|www\.)[^\s<]+/i;
  const isUrlPattern = /^(?:https?:\/\/|www\.)[^\s<]+$/i;
  const isOwn = msg.username === user.username;
  const isRead = Boolean(msg.read_at);
  const messageFiles = Array.isArray(msg.files) ? msg.files : [];
  const hasFiles = messageFiles.length > 0;
  const getFileRenderType = messageFilesProps?.getFileRenderType;
  const hasMediaFiles = getFileRenderType
    ? messageFiles.some((file) => getFileRenderType(file) !== "document")
    : true;
  const hasUploadInProgress =
    Array.isArray(msg._files) &&
    msg._files.length > 0 &&
    Number(msg._uploadProgress ?? 100) < 100;
  const isSending =
    msg._delivery === "sending" || hasUploadInProgress || Boolean(msg._processingPending);
  const isFailed = msg._delivery === "failed";
  const dayLabel = getMessageDayLabel
    ? getMessageDayLabel(msg)
    : msg?._dayLabel || msg?._dayKey || "";

  const renderMessageBody = (body) => {
    const text = body || "";
    if (!hasUrlPattern.test(text)) {
      return text;
    }
    const parts = text.split(urlPattern);
    return parts.map((part, index) => {
      if (!part) return null;
      if (isUrlPattern.test(part)) {
        const href =
          part.startsWith("http://") || part.startsWith("https://") ? part : `https://${part}`;
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

  return (
    <div
      id={`message-${msg.id}`}
      data-msg-day={dayLabel}
      data-msg-day-key={msg?._dayKey || ""}
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
      <div
        className={`flex w-full max-w-full px-3 md:px-0 ${
          isOwn ? "justify-end" : "justify-start"
        }`}
      >
        <div
          className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
            hasFiles
              ? hasMediaFiles
                ? "w-[min(52vw,18rem)] max-w-[68%] md:w-[min(44vw,22rem)] md:max-w-[62%] md:min-w-[12rem]"
                : "w-fit max-w-[82%] md:max-w-[75%]"
              : "max-w-[82%] md:max-w-[75%]"
          } ${
            isOwn
              ? "rounded-br-md bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-white"
              : "bg-white/90 text-slate-800 rounded-bl-md dark:bg-slate-800/75 dark:text-slate-100"
          }`}
        >
          <MessageFiles files={messageFiles} {...messageFilesProps} />
          {!(
            (msg.files || []).length &&
            /^Sent (a media file|a document|\d+ files)$/i.test((msg.body || "").trim())
          ) ? (
            <p
              dir={hasPersian(msg.body) ? "rtl" : "ltr"}
              className={`mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                hasPersian(msg.body) ? "font-fa text-right" : "text-left"
              }`}
              style={{ unicodeBidi: "plaintext" }}
            >
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
                  <Clock12 size={15} strokeWidth={2.4} className="animate-spin" aria-hidden="true" />
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
}

import { ArrowDown, ArrowLeft, Check, CheckCheck, SendHorizonal as Send } from "lucide-react";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { hasPersian } from "../utils/fontUtils.js";

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
  isDark,
}) {
  const activePeerColor = activeHeaderPeer?.color || "#10b981";
  const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  const hasUrlPattern = /(?:https?:\/\/|www\.)[^\s<]+/i;
  const isUrlPattern = /^(?:https?:\/\/|www\.)[^\s<]+$/i;

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

  return (
    <section
      className={
        "fixed inset-0 top-0 z-20 md:relative md:inset-auto md:top-auto md:z-auto flex h-full flex-1 flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-xl shadow-emerald-500/10 dark:border-white/5 dark:bg-slate-900 md:border md:w-[65%] md:shadow-2xl md:shadow-emerald-500/15 transition-transform duration-300 ease-out will-change-transform " +
        (mobileTab === "chat"
          ? "translate-x-0"
          : "translate-x-full md:translate-x-0")
      }
      style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}
    >
      {activeChatId ? (
        <div className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 border-b border-slate-300/80 bg-white px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900">
          <button
            type="button"
            onClick={closeChat}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 md:hidden"
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
                  <span
                    className={`h-2 w-2 rounded-full ${
                      peerStatusLabel === "online" ? "bg-emerald-400" : "bg-slate-400"
                    }`}
                  />
                  {peerStatusLabel}
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
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${hasPersian((activeFallbackTitle || "S").slice(0, 1)) ? "font-fa" : ""}`}
                style={getAvatarStyle(activePeerColor)}
              >
                {(activeFallbackTitle || "S").slice(0, 1).toUpperCase()}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      <div
        ref={chatScrollRef}
        onScroll={onChatScroll}
        className="chat-scroll flex-1 space-y-3 overflow-y-auto px-6 py-6"
        style={{
          backgroundImage: isDark
            ? "radial-gradient(circle at top right, rgba(16,185,129,0.22), transparent 48%), radial-gradient(circle at bottom left, rgba(16,185,129,0.20), transparent 44%)"
            : "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 45%), radial-gradient(circle at bottom left, rgba(16,185,129,0.09), transparent 40%)",
          backgroundColor: isDark ? "#0b1320" : "#dcfce7",
          paddingBottom: activeChatId
            ? "max(7rem, calc(env(safe-area-inset-bottom) + var(--mobile-bottom-offset, 0px) + 7rem))"
            : undefined,
        }}
      >
        {!activeChatId ? (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
              Select a chat to start
            </div>
          </div>
        ) : loadingMessages ? (
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
            const currentDayKey = msg._dayKey || "";
            const prevDayKey = index > 0 ? messages[index - 1]?._dayKey || "" : "";
            const isNewDay = !prevDayKey || currentDayKey !== prevDayKey;
            const dayLabel = msg._dayLabel || "";
            return (
              <div key={msg.id} id={`message-${msg.id}`}>
                {isNewDay ? (
                  <div className="my-3 flex justify-center">
                    <div className="rounded-full border border-emerald-200/60 bg-white/80 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
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
                    <p className={`mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${hasPersian(msg.body) ? "font-fa" : ""}`}>
                      {renderMessageBody(msg.body)}
                    </p>
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
                            isRead
                              ? "text-sky-400"
                              : "text-emerald-900/80 dark:text-emerald-50/80"
                          }`}
                        >
                          {isRead ? (
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
          className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-3 border-t border-slate-300/80 bg-white px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-900 sm:px-6"
          style={{
            bottom: "var(--mobile-bottom-offset, 0px)",
            paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom) + 0.5rem))",
          }}
          onSubmit={handleSend}
        >
          <div className="flex flex-row gap-3">
            <input
              name="message"
              type="text"
              placeholder="Type a message"
              className="flex-1 rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-base text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/40"
            >
              <Send />
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
            <ArrowDown size={18} />
          </span>
          {unreadInChat > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white">
              {unreadInChat}
            </span>
          ) : null}
        </button>
      ) : null}

    </section>
  );
}

import { Check, Minus, Plus } from "lucide-react";

export default function ChatsListPanel({
  loadingChats,
  visibleChats,
  user,
  editMode,
  activeChatId,
  selectedChats,
  formatTime,
  requestDeleteChats,
  toggleSelectChat,
  setActiveChatId,
  setActivePeer,
  setMobileTab,
  setIsAtBottom,
  setUnreadInChat,
  lastMessageIdRef,
  isAtBottomRef,
  onOpenNewChat,
}) {
  return (
    <div className="mt-3 space-y-2">
      {loadingChats && !visibleChats.length ? (
        Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`chat-skeleton-${index}`}
            className="w-full animate-pulse rounded-2xl border border-emerald-100/70 bg-white/70 px-3 py-3 dark:border-emerald-500/20 dark:bg-slate-950/50"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 rounded bg-emerald-100 dark:bg-emerald-900/40" />
                <div className="h-2 w-3/4 rounded bg-emerald-100/80 dark:bg-emerald-900/30" />
              </div>
            </div>
          </div>
        ))
      ) : visibleChats.length ? (
        visibleChats.map((conv) => {
          const members = conv.members || [];
          const other =
            conv.type === "dm"
              ? members.find((member) => member.username !== user.username)
              : null;
          const name =
            conv.type === "dm"
              ? other?.nickname || other?.username || "Direct message"
              : conv.name || "Chat";
          const avatarColor = other?.color || "#10b981";
          const card = (
            <div
              className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${
                activeChatId === conv.id
                  ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-100"
                  : "border-emerald-100/70 bg-white/80 text-slate-700 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-sm dark:border-emerald-500/20 dark:bg-slate-950/60 dark:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-3">
                {other?.avatar_url ? (
                  <img
                    src={other.avatar_url}
                    alt={name}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: avatarColor }}
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold">{name}</p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                    {conv.last_message ? (
                      conv.last_sender_username === user.username ? (
                        <span>
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            You:
                          </span>{" "}
                          {conv.last_message}
                        </span>
                      ) : (
                        conv.last_message
                      )
                    ) : (
                      "No messages yet"
                    )}
                  </p>
                </div>
                {!editMode ? (
                  <div className="ml-auto flex flex-col items-end gap-1">
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {conv.last_time ? formatTime(conv.last_time) : ""}
                    </p>
                    {conv.unread_count > 0 ? (
                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white">
                        {conv.unread_count}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );

          return (
            <div key={conv.id} className="flex items-center gap-3">
              {editMode ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    requestDeleteChats([conv.id]);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                  aria-label="Remove chat"
                >
                  <Minus size={16} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (editMode) return;
                  setActiveChatId(Number(conv.id));
                  const nextOther =
                    conv.type === "dm"
                      ? conv.members?.find(
                          (member) => member.username !== user.username,
                        )
                      : null;
                  setActivePeer(nextOther || null);
                  setMobileTab("chat");
                  isAtBottomRef.current = true;
                  setIsAtBottom(true);
                  setUnreadInChat(0);
                  lastMessageIdRef.current = null;
                }}
                className={`flex-1 ${editMode ? "pointer-events-none" : ""}`}
              >
                {card}
              </button>
              {editMode ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSelectChat(conv.id);
                  }}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                    selectedChats.includes(conv.id)
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-emerald-200 text-emerald-600 dark:border-emerald-500/30 dark:text-emerald-200"
                  }`}
                  aria-label="Select chat"
                >
                  {selectedChats.includes(conv.id) ? <Check size={16} /> : null}
                </button>
              ) : null}
            </div>
          );
        })
      ) : (
        <div className="flex h-[40vh] items-center justify-center">
          <button
            type="button"
            onClick={onOpenNewChat}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-emerald-500/40"
          >
            <Plus size={18} />
            New chat
          </button>
        </div>
      )}
    </div>
  );
}

import { memo, useCallback, useState } from "react";
import { SmilePlus } from "../../../icons/lucide.js";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function groupReactions(reactions) {
  const map = new Map();
  for (const r of reactions) {
    if (!map.has(r.emoji)) {
      map.set(r.emoji, { emoji: r.emoji, users: [] });
    }
    map.get(r.emoji).users.push({ userId: r.userId, username: r.username });
  }
  return Array.from(map.values());
}

export const MessageReactions = memo(function MessageReactions({
  reactions = [],
  currentUsername,
  onToggleReaction,
  isOwn = false,
}) {
  const [showPicker, setShowPicker] = useState(false);
  const grouped = groupReactions(reactions);

  const handleEmojiClick = useCallback(
    (emoji) => {
      onToggleReaction?.(emoji);
      setShowPicker(false);
    },
    [onToggleReaction],
  );

  const hasReactions = grouped.length > 0;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${hasReactions ? "mt-1.5" : "mt-0.5"}`}>
      {grouped.map(({ emoji, users }) => {
        const currentUserReacted = users.some(
          (u) => u.username?.toLowerCase() === currentUsername?.toLowerCase(),
        );
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => handleEmojiClick(emoji)}
            title={users.map((u) => u.username).join(", ")}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-all ${
              currentUserReacted
                ? "border-emerald-400 bg-emerald-100/80 dark:border-emerald-500/50 dark:bg-emerald-900/40"
                : "border-slate-200 bg-slate-100/80 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700/50 dark:hover:border-slate-500"
            }`}
          >
            <span className="text-sm leading-none">{emoji}</span>
            {users.length > 1 ? (
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                {users.length}
              </span>
            ) : null}
          </button>
        );
      })}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowPicker((prev) => !prev)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-transparent text-slate-400 transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-600 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          aria-label="Add reaction"
        >
          <SmilePlus size={14} />
        </button>
        {showPicker ? (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowPicker(false)}
            />
            <div
              className={`absolute z-50 flex gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-800 ${
                isOwn ? "right-0" : "left-0"
              } bottom-full mb-1`}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
});

import { useEffect, useMemo, useState } from "react";
import { Close, SendHorizontal } from "../../icons/lucide.js";
import ForwardChatGridItem from "../forward/ForwardChatGridItem.jsx";
import {
  canForwardToChat,
  excludeForwardSourceChat,
  getForwardChatDisplay,
  sortForwardableChats,
} from "../forward/forwardChatUtils.js";

export default function ForwardMessageModal({
  open,
  chats,
  savedChat,
  currentUser,
  sourceChatId,
  onClose,
  onSubmit,
}) {
  const [selectedChatIds, setSelectedChatIds] = useState([]);

  useEffect(() => {
    if (!open) {
      setSelectedChatIds([]);
    }
  }, [open]);

  const availableChats = useMemo(() => {
    const baseChats = excludeForwardSourceChat(chats, sourceChatId);
    const withSaved =
      savedChat && Number(savedChat?.id || 0) !== Number(sourceChatId || 0)
        ? [savedChat, ...baseChats]
        : baseChats;
    const deduped = withSaved.filter(
      (chat, index, list) =>
        list.findIndex(
          (item) => Number(item?.id || 0) === Number(chat?.id || 0),
        ) === index,
    );
    const filtered = deduped.filter((chat) =>
      canForwardToChat(chat, currentUser?.id),
    );
    return sortForwardableChats(filtered, currentUser?.id);
  }, [chats, currentUser?.id, savedChat, sourceChatId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-emerald-100/70 bg-white px-6 py-5 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
            Send to...
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label="Close"
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
        </div>

        <div className="chat-scroll mt-4 grid max-h-[15rem] grid-cols-4 gap-1.5 overflow-y-auto">
          {availableChats.map((chat) => {
            const display = getForwardChatDisplay(chat, currentUser?.username);
            const selected = selectedChatIds.includes(Number(chat.id));
            return (
              <ForwardChatGridItem
                key={chat.id}
                title={display.title}
                avatarUrl={display.avatarUrl}
                color={display.color}
                kind={display.kind}
                initialsSource={display.initials}
                selected={selected}
                onClick={() => {
                  const chatId = Number(chat.id);
                  setSelectedChatIds((prev) =>
                    prev.includes(chatId)
                      ? prev.filter((id) => id !== chatId)
                      : [...prev, chatId],
                  );
                }}
              />
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button
            type="button"
            disabled={!selectedChatIds.length}
            onClick={() => onSubmit?.(selectedChatIds)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SendHorizontal size={16} className="icon-anim-slide" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

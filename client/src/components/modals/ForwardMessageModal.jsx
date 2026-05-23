import { useEffect, useMemo, useRef, useState } from "react";
import { Close, LoaderCircle, SendHorizontal } from "../../icons/lucide.js";
import ForwardChatGridItem from "../forward/ForwardChatGridItem.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";
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
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) {
      setSelectedChatIds([]);
      setSubmitting(false);
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

  const handleSubmit = async () => {
    if (!selectedChatIds.length || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit?.(selectedChatIds);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forward-modal-title"
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-emerald-100/70 bg-white px-6 py-5 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950"
      >
        <div className="flex items-center justify-between pb-1">
          <h3 id="forward-modal-title" className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
            Send to...
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
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
                  if (submitting) return;
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
            disabled={!selectedChatIds.length || submitting}
            onClick={handleSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <SendHorizontal size={16} className="icon-anim-slide" />
            )}
            {submitting ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

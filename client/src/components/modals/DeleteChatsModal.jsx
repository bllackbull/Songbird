import { createPortal } from "react-dom";

export default function DeleteChatsModal({
  open,
  pendingDeleteIds,
  selectedChats,
  setConfirmDeleteOpen,
  confirmDeleteChats,
}) {
  if (!open) return null;
  if (typeof document === "undefined") return null;
  const count = pendingDeleteIds.length
    ? pendingDeleteIds.length
    : selectedChats.length;

  return createPortal(
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">
          Delete chats
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {count === 1
            ? "Are you sure you want to delete this chat?"
            : `Are you sure you want to delete these ${count} chats?`}
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(false)}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDeleteChats}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

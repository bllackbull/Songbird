import { useState } from "react";
import { createPortal } from "react-dom";

export default function DeleteMessageScopeModal({
  open,
  onClose,
  onConfirm,
  allowDeleteForEveryone = true,
}) {
  const [deleteForEveryone, setDeleteForEveryone] = useState(false);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">
          Delete message
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {allowDeleteForEveryone
            ? "Delete this message now. You can also choose to remove it for everyone in this chat."
            : "Delete this message now. This action removes it from this chat view."}
        </p>
        {allowDeleteForEveryone ? (
          <button
            type="button"
            onClick={() => setDeleteForEveryone((prev) => !prev)}
            role="switch"
            aria-checked={deleteForEveryone}
            className="mt-4 flex w-full items-center justify-between rounded-2xl border border-emerald-200/70 bg-white/90 px-4 py-3 text-left text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_18px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
          >
            <span>Delete for everyone</span>
            <span
              className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                deleteForEveryone
                  ? "justify-end bg-emerald-500"
                  : "justify-start bg-slate-300 dark:bg-slate-700"
              }`}
            >
              <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition" />
            </span>
          </button>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDeleteForEveryone(false);
              onClose?.();
            }}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm?.(allowDeleteForEveryone ? deleteForEveryone : false);
              setDeleteForEveryone(false);
            }}
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

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRef } from "react";
import { LoaderCircle } from "../../icons/lucide.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

const DELETE_FOR_EVERYONE_PREFERENCE_KEY =
  "songbird-delete-message-for-everyone";

const readDeleteForEveryonePreference = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DELETE_FOR_EVERYONE_PREFERENCE_KEY) === "1";
};

export default function DeleteMessageScopeModal({
  open,
  onClose,
  onConfirm,
  allowDeleteForEveryone = true,
}) {
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);
  const [deleteForEveryone, setDeleteForEveryone] = useState(
    readDeleteForEveryonePreference,
  );
  const [submitting, setSubmitting] = useState(false);

  const handleDeleteForEveryoneChange = (nextValue) => {
    setDeleteForEveryone(nextValue);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      DELETE_FOR_EVERYONE_PREFERENCE_KEY,
      nextValue ? "1" : "0",
    );
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm?.(allowDeleteForEveryone ? deleteForEveryone : false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-320 flex items-center justify-center bg-black/40 px-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-message-modal-title"
        className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950"
      >
        <h3 id="delete-message-modal-title" className="text-lg font-semibold text-rose-600 dark:text-rose-300">
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
            onClick={() => handleDeleteForEveryoneChange(!deleteForEveryone)}
            role="switch"
            aria-checked={deleteForEveryone}
            disabled={submitting}
            className="mt-4 flex w-full items-center justify-between rounded-2xl border border-emerald-200/70 bg-white/90 px-4 py-3 text-left text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_18px_rgba(16,185,129,0.18)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
          >
            <span>Delete for everyone</span>
            <span
              className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                deleteForEveryone
                  ? "justify-end bg-emerald-500"
                  : "justify-start bg-slate-300 dark:bg-slate-700"
              }`}
            >
              <span className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" />
            </span>
          </button>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (submitting) return;
              onClose?.();
            }}
            disabled={submitting}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
          >
            {submitting ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : null}
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useState } from "react";
import { useRef } from "react";
import { Check, Copy, Users } from "../../icons/lucide.js";
import { copyTextToClipboard } from "../../utils/clipboard.js";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

export default function GroupInviteLinkModal({ open, inviteLink, onClose }) {
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  const handleCopyInviteLink = async () => {
    const value = String(inviteLink || "");
    if (!value) return;
    await copyTextToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-link-modal-title"
        className="w-full max-w-md rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950"
      >
        <h3 id="invite-link-modal-title" className="flex items-center gap-2 text-lg font-semibold text-emerald-700 dark:text-emerald-200">
          <Users size={18} />
          Group created
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Share this invite link so others can join your group.
        </p>
        <button
          type="button"
          onClick={handleCopyInviteLink}
          className="mt-3 flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-left text-xs text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
          aria-label="Copy invite link"
        >
          <span className="min-w-0 flex-1 break-all">{inviteLink}</span>
          <span className="ml-1 shrink-0 text-emerald-600 dark:text-emerald-400">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </span>
        </button>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

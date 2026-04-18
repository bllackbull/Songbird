import { useState } from "react";
import { Copy, Users } from "../../icons/lucide.js";
import { copyTextToClipboard } from "../../utils/clipboard.js";

export default function GroupInviteLinkModal({ open, inviteLink, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-md rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-emerald-700 dark:text-emerald-200">
          <Users size={18} />
          Group created
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Share this invite link so others can join your group.
        </p>
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <span className="break-all">{inviteLink}</span>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={async () => {
              const value = String(inviteLink || "");
              if (!value) return;
              try {
                await copyTextToClipboard(value);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              } catch {
                // ignore clipboard errors
              }
            }}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
          >
            <Copy size={12} className="icon-anim-pop" />
            {copied ? "Copied" : "Copy"}
          </button>
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

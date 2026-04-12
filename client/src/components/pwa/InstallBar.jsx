import { forwardRef } from "react";
import { Close, Download } from "../../icons/lucide.js";

const InstallBar = forwardRef(function InstallBar(
  { show, onDismiss, onInstall, iconSrc = "/icons/icon-192.png" },
  ref,
) {
  if (!show) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 top-0 border-b border-emerald-200 bg-white/95 shadow-sm shadow-emerald-500/10 backdrop-blur dark:border-emerald-500/30 dark:bg-slate-950/95"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        zIndex: "var(--install-bar-z, 40)",
        opacity: "var(--install-bar-opacity, 1)",
        pointerEvents: "var(--install-bar-pe, auto)",
        transform: "translateY(var(--install-bar-translate, 0%))",
        transition: "transform 220ms ease, opacity 220ms ease",
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label="Dismiss install prompt"
          >
            <Close size={16} className="icon-anim-pop" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm dark:border-emerald-500/30 dark:bg-slate-900">
            <img
              src={iconSrc}
              alt="Songbird"
              className="h-full w-full scale-110 object-cover"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              Songbird App
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onInstall}
          className="inline-flex h-8 items-center gap-2 rounded-full bg-emerald-500 px-4 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/40"
        >
          <Download size={14} className="icon-anim-drop" />
          Install
        </button>
      </div>
    </div>
  );
});

export default InstallBar;

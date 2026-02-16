import { Mail, MessageCircle as Chat, Settings } from "lucide-react";

export default function MobileTabMenu({
  hidden,
  mobileTab,
  mailUnreadCount = 0,
  onMail,
  onChats,
  onSettings,
}) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-10 px-4 sm:px-6 md:hidden ${
        hidden ? "hidden" : ""
      }`}
      style={{
        paddingBottom:
          "max(0.5rem, calc(env(safe-area-inset-bottom) + var(--vv-bottom-offset, 0px) + 0.5rem))",
      }}
    >
      <div className="mx-auto mb-2 flex max-w-sm items-center justify-between rounded-3xl border border-slate-300/90 bg-white/95 p-2 shadow-lg shadow-emerald-500/10 backdrop-blur-none dark:border-emerald-500/35 dark:bg-slate-900/95 md:backdrop-blur">
        <button
          type="button"
          onClick={onMail}
          className={`relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition ${
            mobileTab === "mail" || mobileTab === "mail-view"
              ? "text-white"
              : "text-emerald-700 dark:text-emerald-200"
          }`}
        >
          {mobileTab === "mail" || mobileTab === "mail-view" ? (
            <span className="absolute inset-0 rounded-2xl bg-emerald-500" />
          ) : null}
          <span className="relative z-10">
            <Mail className="icon-anim-peek" />
            {mailUnreadCount > 0 ? (
              <span
                className={`absolute -right-2 -top-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                  mobileTab === "mail" || mobileTab === "mail-view"
                    ? "bg-white text-emerald-600"
                    : "bg-emerald-500 text-white"
                }`}
              >
                {mailUnreadCount > 99 ? "99+" : mailUnreadCount}
              </span>
            ) : null}
          </span>
          <span className="relative z-10">Mail</span>
        </button>
        <button
          type="button"
          onClick={onChats}
          className={`relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition ${
            mobileTab === "chats"
              ? "text-white"
              : "text-emerald-700 dark:text-emerald-200"
          }`}
        >
          {mobileTab === "chats" ? (
            <span className="absolute inset-0 rounded-2xl bg-emerald-500" />
          ) : null}
          <span className="relative z-10">
            <Chat className="icon-anim-bob" />
          </span>
          <span className="relative z-10">Chats</span>
        </button>
        <button
          type="button"
          onClick={onSettings}
          className={`relative flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition ${
            mobileTab === "settings"
              ? "text-white"
              : "text-emerald-700 dark:text-emerald-200"
          }`}
        >
          {mobileTab === "settings" ? (
            <span className="absolute inset-0 rounded-2xl bg-emerald-500" />
          ) : null}
          <span className="relative z-10">
            <Settings className="icon-anim-spin-dir" />
          </span>
          <span className="relative z-10">Settings</span>
        </button>
      </div>
    </div>
  );
}

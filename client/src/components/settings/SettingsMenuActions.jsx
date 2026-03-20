import { Bell, BellOff, LogOut, ShieldCheck, User } from "../../icons/lucide.js";
import { ThemeButton } from "./ThemeButton.jsx";

export function SettingsMenuActions({
  variant = "popover",
  setSettingsPanel,
  isDark,
  toggleTheme,
  setIsDark,
  handleLogout,
  notificationsOn,
  notificationsDisabled,
  notificationStatusLabel,
  onToggleNotifications,
}) {
  const isMobile = variant === "mobile";
  const buttonBase = isMobile
    ? "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-base font-medium"
    : "flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-sm";
  const accentHover =
    "text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10";

  return (
    <>
      <button
        type="button"
        onClick={() => setSettingsPanel("profile")}
        className={`${buttonBase} ${accentHover}`}
      >
        <User size={18} className="icon-anim-sway" />
        Edit profile
      </button>
      <button
        type="button"
        onClick={() => setSettingsPanel("security")}
        className={`mt-1 ${buttonBase} ${accentHover}`}
      >
        <ShieldCheck size={18} className="icon-anim-sway" />
        Security
      </button>
      <button
        type="button"
        onClick={onToggleNotifications}
        disabled={notificationsDisabled}
        role="switch"
        aria-checked={notificationsOn}
        className={`mt-1 flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 ${
          isMobile ? "py-3 text-base font-medium" : "py-2 text-sm"
        } text-left text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 ${
          notificationsDisabled
            ? "cursor-not-allowed opacity-60 hover:bg-transparent hover:shadow-none"
            : ""
        }`}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-3">
            {notificationsOn ? (
              <Bell size={18} className="icon-anim-sway" />
            ) : (
              <BellOff size={18} className="icon-anim-sway" />
            )}
            Notifications
          </span>
          {notificationsDisabled ? (
            <span
              className={`mt-1 max-w-full truncate whitespace-nowrap ${
                isMobile ? "text-xs" : "text-[11px]"
              } font-medium text-slate-500 dark:text-slate-400`}
              title={notificationStatusLabel}
            >
              {notificationStatusLabel}
            </span>
          ) : null}
        </span>
        <span
          className={`relative inline-flex ${
            isMobile ? "h-6 w-11" : "h-5 w-9"
          } items-center rounded-full transition ${
            notificationsOn
              ? "bg-emerald-500"
              : "bg-slate-300 dark:bg-slate-700"
          }`}
        >
          <span
            className={`inline-block ${
              isMobile ? "h-5 w-5" : "h-4 w-4"
            } transform rounded-full bg-white shadow transition ${
              notificationsOn ? (isMobile ? "translate-x-5" : "translate-x-4") : "translate-x-1"
            }`}
          />
        </span>
      </button>
      <ThemeButton
        isDark={isDark}
        toggleTheme={toggleTheme}
        setIsDark={setIsDark}
        thick={isMobile}
      />
      <button
        type="button"
        onClick={handleLogout}
        className={`mt-2 ${buttonBase} text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-[0_0_18px_rgba(244,63,94,0.18)] dark:text-rose-300 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10`}
      >
        <LogOut size={18} className="icon-anim-slide" />
        Log out
      </button>
    </>
  );
}

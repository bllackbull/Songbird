import {
  Bell,
  Bookmark,
  Database,
  Info,
  LogOut,
  Rocket,
  ShieldCheck,
  User,
} from "../../../icons/lucide.js";
import { ThemeButton } from "../common/ThemeButton.jsx";

export function SettingsMenuActions({
  variant = "popover",
  setSettingsPanel,
  isDark,
  toggleTheme,
  setIsDark,
  handleLogout,
  _notificationsOn,
  _notificationsDisabled,
  _notificationStatusLabel,
  _onToggleNotifications,
  onOpenNotifications,
  onOpenSavedMessages,
  onOpenWhatsNew,
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
        onClick={() => setSettingsPanel("data")}
        className={`mt-1 ${buttonBase} ${accentHover}`}
      >
        <Database size={18} className="icon-anim-sway" />
        Data
      </button>
      <button
        type="button"
        onClick={() => onOpenSavedMessages?.()}
        className={`mt-1 ${buttonBase} ${accentHover}`}
      >
        <Bookmark size={18} className="icon-anim-sway" />
        Saved messages
      </button>
      <button
        type="button"
        onClick={onOpenNotifications}
        className={`mt-1 ${buttonBase} ${accentHover}`}
      >
        <Bell size={18} className="icon-anim-sway" />
        Notifications
      </button>
      <ThemeButton
        isDark={isDark}
        toggleTheme={toggleTheme}
        setIsDark={setIsDark}
        thick={isMobile}
      />
      <button
        type="button"
        onClick={() => onOpenWhatsNew?.()}
        className={`mt-1 ${buttonBase} ${accentHover}`}
      >
        <Rocket size={18} className="icon-anim-sway" />
        What's new
      </button>
      <button
        type="button"
        onClick={() => setSettingsPanel("about")}
        className={`mt-1 ${buttonBase} ${accentHover}`}
      >
        <Info size={18} className="icon-anim-sway" />
        About
      </button>
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

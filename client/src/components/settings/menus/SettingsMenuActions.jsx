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
import { LayoutDashboardIcon } from "../../../icons/AnimatedIcons.jsx";
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
  userRole,
  adminPanelEnabled = true,
}) {
  const isMobile = variant === "mobile";
  const buttonBase = isMobile
    ? "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base font-medium"
    : "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold";
  const accentHover =
    "text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200";
  const iconCls = "shrink-0 text-emerald-500";
  const isAdmin = userRole === "admin" || userRole === "owner";
  const showAdminPanel = isAdmin && adminPanelEnabled;
  const divider = <div className="my-1 h-px bg-slate-100 dark:bg-white/5" />;

  return (
    <>
      {/* Account */}
      <button
        type="button"
        onClick={() => setSettingsPanel("profile")}
        className={`${buttonBase} ${accentHover}`}
      >
        <User size={18} className={`${iconCls} icon-anim-sway`} />
        Edit profile
      </button>
      <button
        type="button"
        onClick={() => setSettingsPanel("security")}
        className={`${buttonBase} ${accentHover}`}
      >
        <ShieldCheck size={18} className={`${iconCls} icon-anim-beat`} />
        Security
      </button>
      <button
        type="button"
        onClick={() => setSettingsPanel("data")}
        className={`${buttonBase} ${accentHover}`}
      >
        <Database size={18} className={`${iconCls} icon-anim-bob`} />
        Data
      </button>
      <button
        type="button"
        onClick={() => onOpenSavedMessages?.()}
        className={`${buttonBase} ${accentHover}`}
      >
        <Bookmark size={18} className={`${iconCls} icon-anim-drop`} />
        Saved messages
      </button>

      {showAdminPanel ? (
        <>
          {divider}
          <button
            type="button"
            onClick={() => {
              window.history.pushState({}, "", "/admin");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            className={`${buttonBase} ${accentHover}`}
          >
            <LayoutDashboardIcon size={18} className={`${iconCls}`} />
            Admin Panel
          </button>
        </>
      ) : null}

      {divider}

      {/* App */}
      <button
        type="button"
        onClick={onOpenNotifications}
        className={`${buttonBase} ${accentHover}`}
      >
        <Bell size={18} className={`${iconCls} icon-anim-swing`} />
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
        className={`${buttonBase} ${accentHover}`}
      >
        <Rocket size={18} className={`${iconCls} icon-anim-lift`} />
        What's new
      </button>
      <button
        type="button"
        onClick={() => setSettingsPanel("about")}
        className={`${buttonBase} ${accentHover}`}
      >
        <Info size={18} className={`${iconCls} icon-anim-pop`} />
        About
      </button>

      {divider}

      <button
        type="button"
        onClick={handleLogout}
        className={`${buttonBase} text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10`}
      >
        <LogOut size={18} className="shrink-0 icon-anim-slide" />
        Log out
      </button>
    </>
  );
}

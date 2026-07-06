import { SettingsMenuActions } from "./SettingsMenuActions.jsx";

export function SettingsMenuPopover({
  showSettings,
  settingsMenuRef,
  setSettingsPanel,
  toggleTheme,
  setIsDark,
  isDark,
  handleLogout,
  notificationsSupported,
  notificationPermission,
  notificationsEnabled,
  notificationsDisabled,
  notificationStatusLabel,
  onToggleNotifications,
  onOpenNotifications,
  onOpenSavedMessages,
  onOpenWhatsNew,
  userRole,
  adminPanelEnabled = true,
}) {
  if (!showSettings) return null;
  const notificationsOn =
    notificationsSupported &&
    notificationPermission === "granted" &&
    notificationsEnabled;

  return (
    <div
      className="absolute bottom-20 right-4 z-10 w-64 max-w-[90vw] overflow-hidden rounded-2xl border border-emerald-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
      ref={settingsMenuRef}
    >
      <SettingsMenuActions
        variant="popover"
        setSettingsPanel={setSettingsPanel}
        isDark={isDark}
        toggleTheme={toggleTheme}
        setIsDark={setIsDark}
        handleLogout={handleLogout}
        notificationsOn={notificationsOn}
        notificationsDisabled={notificationsDisabled}
        notificationStatusLabel={notificationStatusLabel}
        onToggleNotifications={onToggleNotifications}
        onOpenNotifications={onOpenNotifications}
        onOpenSavedMessages={onOpenSavedMessages}
        onOpenWhatsNew={onOpenWhatsNew}
        userRole={userRole}
        adminPanelEnabled={adminPanelEnabled}
      />
    </div>
  );
}

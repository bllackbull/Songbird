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
}) {
  if (!showSettings) return null;
  const notificationsOn =
    notificationsSupported &&
    notificationPermission === "granted" &&
    notificationsEnabled;

  return (
    <div
      className="absolute bottom-20 right-4 z-10 w-64 max-w-[90vw] rounded-2xl border border-emerald-100/70 bg-white p-2 text-sm shadow-xl dark:border-emerald-500/30 dark:bg-slate-950"
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
      />
    </div>
  );
}

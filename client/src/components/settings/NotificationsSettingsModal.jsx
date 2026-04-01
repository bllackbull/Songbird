import { Close } from "../../icons/lucide.js";
import { NotificationsSettingsPanel } from "./NotificationsSettingsPanel.jsx";

export function NotificationsSettingsModal({
  open,
  onClose,
  notificationsActive,
  notificationsDisabled,
  notificationStatusLabel,
  onToggleNotifications,
  onTestPush,
  testNotificationSent,
  notificationsEnabled,
  debugLine = "",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-sm rounded-3xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
            Notifications
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label="Close"
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
        </div>

        <div className="mt-4">
          <NotificationsSettingsPanel
            notificationsActive={notificationsActive}
            notificationsDisabled={notificationsDisabled}
            notificationStatusLabel={notificationStatusLabel}
            onToggleNotifications={onToggleNotifications}
            onTestPush={onTestPush}
            testNotificationSent={testNotificationSent}
            notificationsEnabled={notificationsEnabled}
            debugLine={debugLine}
          />
        </div>

        <div className="mt-5 flex items-center justify-end">
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

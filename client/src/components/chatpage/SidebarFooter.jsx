import { Settings } from "../../icons/lucide.js";
import { getAvatarStyle } from "../../utils/avatarColor.js";
import { hasPersian } from "../../utils/fontUtils.js";

export default function SidebarFooter({
  user,
  displayName,
  displayInitials,
  statusDotClass,
  statusValue,
  userColor,
  onOpenSettings,
  settingsButtonRef,
}) {
  return (
    <div className="absolute bottom-0 left-0 right-0 hidden h-[88px] border-t border-slate-300/80 bg-white px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900 md:block">
      <div className="flex h-full items-center justify-between">
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={displayName}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                hasPersian(displayInitials) ? "font-fa" : ""
              }`}
              style={getAvatarStyle(userColor)}
            >
              {displayInitials}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              {displayName}
            </p>
            <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
              {statusValue}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          aria-label="Open settings"
          ref={settingsButtonRef}
        >
          <Settings size={18} className="icon-anim-spin-dir" />
        </button>
      </div>
    </div>
  );
}

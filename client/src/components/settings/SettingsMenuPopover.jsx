import { LogOut, ShieldCheck, User } from "../../icons/lucide.js";
import { ThemeButton } from "./ThemeButton.jsx";

export function SettingsMenuPopover({
  showSettings,
  settingsMenuRef,
  setSettingsPanel,
  toggleTheme,
  setIsDark,
  isDark,
  handleLogout,
}) {
  if (!showSettings) return null;

  return (
    <div
      className="absolute bottom-20 right-4 z-10 w-52 rounded-2xl border border-emerald-100/70 bg-white p-2 text-sm shadow-xl dark:border-emerald-500/30 dark:bg-slate-950"
      ref={settingsMenuRef}
    >
      <button
        type="button"
        onClick={() => setSettingsPanel("profile")}
        className="flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-sm text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
      >
        <User size={18} className="icon-anim-sway" />
        Edit profile
      </button>
      <button
        type="button"
        onClick={() => setSettingsPanel("security")}
        className="mt-1 flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-sm text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
      >
        <ShieldCheck size={18} className="icon-anim-sway" />
        Security
      </button>
      <ThemeButton
        isDark={isDark}
        toggleTheme={toggleTheme}
        setIsDark={setIsDark}
      />
      <button
        type="button"
        onClick={handleLogout}
        className="mt-2 flex w-full items-center gap-2 rounded-xl border border-transparent px-3 py-2 text-left text-sm text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-[0_0_18px_rgba(244,63,94,0.18)] dark:text-rose-300 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10"
      >
        <LogOut size={18} className="icon-anim-slide" />
        Log out
      </button>
    </div>
  );
}

import { Moon, Sun } from "../../icons/lucide.js";

export default function AuthHeader({
  isLogin,
  isDark,
  themeToggleAnimating,
  onToggleTheme,
}) {
  return (
    <div className="relative text-center">
      {/* Brand */}
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-300 sm:text-sm">
        Songbird
      </p>

      {/* Title */}
      <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">
        {isLogin ? "Welcome to Songbird" : "Join Songbird"}
      </h1>

      {/* Subtitle */}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
        {isLogin
          ? "Secure chat & file sharing platform"
          : "Create your account and start chatting"}
      </p>

      {/* Theme Toggle */}
      <button
        type="button"
        onClick={onToggleTheme}
        className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 sm:h-10 sm:w-10"
        aria-label="Toggle dark mode"
      >
        {isDark ? (
          <Sun
            key="theme-sun"
            size={18}
            className={`icon-anim-spin-dir ${
              themeToggleAnimating ? "icon-theme-enter-sun" : ""
            }`}
          />
        ) : (
          <Moon
            key="theme-moon"
            size={18}
            className={`icon-anim-spin-left ${
              themeToggleAnimating ? "icon-theme-enter-moon" : ""
            }`}
          />
        )}
      </button>
    </div>
  );
}
import { AlertCircle, LoaderCircle, Moon, Sun } from "lucide-react";

export default function AuthCard({
  mode,
  isDark,
  onToggleTheme,
  onSubmit,
  onSwitchMode,
  status,
  loading,
  showSigningOverlay = false,
}) {
  const isLogin = mode === "login";

  return (
    <section className="app-scroll relative my-auto w-full max-w-md max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-3xl border border-emerald-200/70 bg-white/80 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur dark:border-white/5 dark:bg-slate-900/80 sm:max-h-none sm:overflow-visible sm:p-8">
      <div className="relative text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-300 sm:text-sm">
          {isLogin ? "Sign in" : "Create account"}
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold sm:mt-3 sm:text-3xl">
          {isLogin ? "Welcome" : "Join the flock"}
        </h1>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 sm:mt-3 sm:text-sm">
          {isLogin
            ? "Use your unique username and password."
            : "Choose a unique username, nickname, and password."}
        </p>
        <button
          type="button"
          onClick={onToggleTheme}
          className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 sm:h-10 sm:w-10"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <form className="mt-4 space-y-3 sm:mt-6 sm:space-y-4" onSubmit={onSubmit}>
        {!isLogin ? (
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
              Nickname
            </span>
            <input
              name="nickname"
              type="text"
              required
              placeholder="Songbird Sage"
              className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100 sm:mt-2 sm:px-4 sm:py-3 sm:text-sm"
            />
          </label>
        ) : null}

        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
            Username
          </span>
          <input
            name="username"
            type="text"
            required
            pattern="[a-zA-Z0-9._-]+"
            title="Use english letters, numbers, dot (.), underscore (_), and dash (-)."
            autoCapitalize="none"
            placeholder="songbird.sage"
            className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100 sm:mt-2 sm:px-4 sm:py-3 sm:text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
            Password
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={isLogin ? undefined : 6}
            placeholder="********"
            className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100 sm:mt-2 sm:px-4 sm:py-3 sm:text-sm"
          />
        </label>

        {!isLogin ? (
          <label className="block">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
              Confirm password
            </span>
            <input
              name="confirmPassword"
              type="password"
              required
              minLength={6}
              placeholder="********"
              className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100 sm:mt-2 sm:px-4 sm:py-3 sm:text-sm"
            />
          </label>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:py-3 sm:text-sm"
        >
          {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {isLogin ? "Sign in" : "Create account"}
        </button>
      </form>

      {status ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200 sm:mt-4 sm:px-4 sm:py-3 sm:text-sm">
          <AlertCircle size={16} className="shrink-0 self-center" />
          <span>{status}</span>
        </p>
      ) : null}

      <div className="mt-4 space-y-2 rounded-2xl border border-emerald-100/70 bg-emerald-50/70 p-3 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/40 dark:text-emerald-200 sm:mt-6 sm:space-y-3 sm:p-4 sm:text-sm">
        <p className="font-semibold">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
        </p>
        <button
          type="button"
          onClick={onSwitchMode}
          className="mt-2 w-full rounded-2xl border border-emerald-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 hover:shadow-[0_0_18px_rgba(16,185,129,0.24)] dark:border-emerald-500/40 dark:bg-slate-900/60 dark:text-emerald-200 sm:px-4 sm:py-2 sm:text-sm"
        >
          {isLogin ? "Create new account" : "Back to sign in"}
        </button>
      </div>
      {showSigningOverlay && isLogin ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-white/85 backdrop-blur-sm dark:bg-slate-950/85">
          <LoaderCircle className="h-12 w-12 animate-spin text-emerald-500" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
            Signing in...
          </p>
        </div>
      ) : null}
    </section>
  );
}


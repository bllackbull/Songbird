import { Moon, Sun } from "lucide-react";

export default function LoginPage({ isDark, onToggleTheme, onLogin, onGoSignup, status }) {
  return (
    <section className="w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur dark:border-white/5 dark:bg-slate-900/80 sm:p-8">
      <div className="relative flex items-start justify-center gap-4 text-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-300 sm:text-sm">
            Sign in
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold sm:mt-3 sm:text-3xl">Welcome</h1>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 sm:mt-3 sm:text-sm">
            Use your unique username and password.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 sm:h-10 sm:w-10"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <form className="mt-4 space-y-3 sm:mt-6 sm:space-y-4" onSubmit={onLogin}>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">Username</span>
          <input
            name="username"
            type="text"
            required
            placeholder="songbird.sage"
            className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100 sm:mt-2 sm:px-4 sm:py-3 sm:text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">Password</span>
          <input
            name="password"
            type="password"
            required
            placeholder="********"
            className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100 sm:mt-2 sm:px-4 sm:py-3 sm:text-sm"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400 sm:px-4 sm:py-3 sm:text-sm"
        >
          Sign in
        </button>
      </form>

      {status ? (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200 sm:mt-4 sm:px-4 sm:py-3 sm:text-sm">
          {status}
        </p>
      ) : null}

      <div className="mt-4 space-y-2 rounded-2xl border border-emerald-100/70 bg-emerald-50/70 p-3 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/40 dark:text-emerald-200 sm:mt-6 sm:space-y-3 sm:p-4 sm:text-sm">
        <p className="font-semibold">Don't have an account?</p>
        <button
          type="button"
          onClick={onGoSignup}
          className="mt-2 w-full rounded-2xl border border-emerald-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md dark:border-emerald-500/40 dark:bg-slate-900/60 dark:text-emerald-200 sm:px-4 sm:py-2 sm:text-sm"
        >
          Create new account
        </button>
      </div>
    </section>
  )
}

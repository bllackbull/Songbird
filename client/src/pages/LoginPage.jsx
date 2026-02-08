import { MoonIcon, SunIcon } from '../components/Icons.jsx'

export default function LoginPage({ isDark, onToggleTheme, onLogin, onGoSignup, status }) {
  return (
    <section className="w-full max-w-md rounded-3xl border border-white/60 bg-white/80 p-8 shadow-2xl shadow-emerald-500/10 backdrop-blur dark:border-white/5 dark:bg-slate-900/80">
      <div className="relative flex items-start justify-center gap-4 text-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-300">
            Sign in
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold">Welcome</h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Use your unique username and password.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          aria-label="Toggle dark mode"
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <form className="mt-6 space-y-4" onSubmit={onLogin}>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Username</span>
          <input
            name="username"
            type="text"
            required
            placeholder="songbird.sage"
            className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Password</span>
          <input
            name="password"
            type="password"
            required
            placeholder="********"
            className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
        >
          Sign in
        </button>
      </form>

      {status ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
          {status}
        </p>
      ) : null}

      <div className="mt-6 space-y-3 rounded-2xl border border-emerald-100/70 bg-emerald-50/70 p-4 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-900/40 dark:text-emerald-200">
        <p className="font-semibold">Don't have an account?</p>
        <button
          type="button"
          onClick={onGoSignup}
          className="mt-2 w-full rounded-2xl border border-emerald-300 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md dark:border-emerald-500/40 dark:bg-slate-900/60 dark:text-emerald-200"
        >
          Create new account
        </button>
      </div>
    </section>
  )
}

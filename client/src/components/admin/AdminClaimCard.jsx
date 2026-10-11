import { useState } from "react";
import AuthPage from "../../pages/AuthPage.jsx";
import { Eye, EyeOff } from "../../icons/lucide.js";
import { claimAdminPrivileges } from "../../api/chatApi.js";

export default function AdminClaimCard({
  setUser,
  isDark,
  onToggleTheme,
  onBack,
}) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSecure =
    typeof window !== "undefined" &&
    (window.isSecureContext ||
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  if (!isSecure) {
    return (
      <AuthPage
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        title="Unauthorized"
        subtitle="Access Denied"
      >
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 sm:px-4 sm:py-3 sm:text-sm"
          >
            Back to Chat
          </button>
        </div>
      </AuthPage>
    );
  }

  const handleClaim = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await claimAdminPrivileges(token.trim());
      if (res.ok && res.role) {
        setUser?.((prev) => ({ ...prev, role: res.role }));
      } else {
        setError(res.error || "Failed to claim privileges.");
      }
    } catch (err) {
      setError(err.message || "Failed to claim privileges.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPage
      isDark={isDark}
      onToggleTheme={onToggleTheme}
      title="Emergency Claim"
      subtitle="Admin Panel Access"
      status={error}
      loading={loading}
    >
      <form onSubmit={handleClaim} className="mt-4 space-y-4 sm:mt-6">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
            Admin API Token
          </span>
          <div className="relative mt-1 sm:mt-2">
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter ADMIN_API_TOKEN"
              autoComplete="off"
              required
              className="w-full rounded-2xl border border-emerald-200 bg-white py-2 pl-3 pr-14 text-xs text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-100 sm:py-3 sm:pl-4 sm:pr-16 sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowToken((prev) => !prev)}
              className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/10 sm:h-9 sm:w-9"
              aria-label={showToken ? "Hide token" : "Show token"}
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <button
          type="submit"
          disabled={loading || !token.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:py-3 sm:text-sm"
        >
          <span>{loading ? "Verifying..." : "Claim Privileges"}</span>
        </button>
      </form>
    </AuthPage>
  );
}

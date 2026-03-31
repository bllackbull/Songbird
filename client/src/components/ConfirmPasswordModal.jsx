import { useEffect, useMemo, useState } from "react";
import { Close, Eye, EyeOff } from "../icons/lucide.js";

export default function ConfirmPasswordModal({
  open,
  title,
  description,
  confirmLabel = "Continue",
  deleteLabel = "Delete",
  onClose,
  onConfirm,
}) {
  const [step, setStep] = useState("confirm");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("confirm");
      setPassword("");
      setShowPassword(false);
      setError("");
      setLoading(false);
    }
  }, [open]);

  const canSubmit = useMemo(
    () => Boolean(password.trim()) && !loading,
    [password, loading],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">
            {title}
          </h3>
          <button
            type="button"
            onClick={() => {
              if (!loading) onClose?.();
            }}
            className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
        </div>

        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {description}
        </p>

        {step === "confirm" ? (
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setStep("password")}
              className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
            >
              {confirmLabel}
            </button>
          </div>
        ) : null}

        {step === "password" ? (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Password
              </span>
              <div className="relative mt-2">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={showPassword ? "12345678" : "********"}
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-20 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff size={16} className="icon-anim-peek" />
                  ) : (
                    <Eye size={16} className="icon-anim-peek" />
                  )}
                </button>
              </div>
            </label>

            {error ? (
              <p className="text-xs text-rose-600 dark:text-rose-200">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onClose?.()}
                className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!canSubmit) return;
                  setLoading(true);
                  setError("");
                  try {
                    await onConfirm?.(password);
                    setLoading(false);
                    onClose?.();
                  } catch (err) {
                    setError(String(err?.message || "Unable to delete."));
                    setLoading(false);
                    return;
                  }
                }}
                disabled={!canSubmit}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
              >
                {loading ? "Deleting..." : deleteLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

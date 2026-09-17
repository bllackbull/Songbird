import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/chatApi.js";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Unplug,
  Zap,
} from "../../icons/lucide.js";
import { btnDanger, btnPrimary, btnSecondary } from "./adminShared.js";
import { Field, Modal } from "./AdminCommon.jsx";

const BASE = "/api/admin/remote-channel";

// Inputs mirror AdminUserModal's password fields; buttons reuse the shared
// Settings-tab inline button styles, with a thickened modal primary.
const TEXT_INPUT =
  "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
const PW_INPUT =
  "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-12 text-sm text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
const EYE_BTN =
  "absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/10";
const BTN_PRIMARY =
  btnPrimary + " h-11 w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-50";
const BTN_INLINE = " w-44 justify-center";

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function PwToggle({ show, onToggle }) {
  return (
    <button type="button" onClick={onToggle} className={EYE_BTN} aria-label={show ? "Hide" : "Show"}>
      {show ? <EyeOff size={16} className="icon-anim-peek" /> : <Eye size={16} className="icon-anim-peek" />}
    </button>
  );
}

export default function RemoteChannelSetupModal({ open, onClose, onChanged }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("credentials"); // credentials | code | password | done | success
  const [apiId, setApiId] = useState("");
  const [showApiId, setShowApiId] = useState(false);
  const [apiHash, setApiHash] = useState("");
  const [showHash, setShowHash] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [codeViaApp, setCodeViaApp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testState, setTestState] = useState(null); // null | { ok: true, account } | { ok: false }

  const fetchStatus = useCallback(async () => {
    const res = await apiFetch(`${BASE}/status`);
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Failed to load status.");
    setStatus(data);
    return data;
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setTestState(null);
    setCode("");
    setPassword("");
    setLoading(true);
    fetchStatus()
      .then((data) => {
        if (data.hasSession) setStep("done");
        else setStep("credentials");
      })
      .catch((e) => setError(e.message || "Failed to load status."))
      .finally(() => setLoading(false));
  }, [open, fetchStatus]);

  const envLocked = Boolean(
    status?.managedByEnv?.apiId ||
      status?.managedByEnv?.apiHash ||
      status?.managedByEnv?.sessionString,
  );

  const sendCode = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`${BASE}/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId: Number(apiId), apiHash, phoneNumber: phone }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Failed to send code.");
      setCodeViaApp(Boolean(data.isCodeViaApp));
      setStep("code");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`${BASE}/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...(step === "password" ? { password } : {}) }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Sign-in failed.");
      if (data.needsPassword) {
        setStep("password");
        return;
      }
      // Refresh status silently (no step clobbering) then show the success page.
      fetchStatus().catch(() => {});
      setStep("success");
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    setError("");
    setTestState(null);
    try {
      const res = await apiFetch(`${BASE}/test`, { method: "POST" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Connection test failed.");
      setTestState({ ok: true, account: data.account || "Connected" });
    } catch (e) {
      setError(e.message);
      setTestState({ ok: false });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`${BASE}/session`, { method: "DELETE" });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Disconnect failed.");
      setStep("credentials");
      setApiHash("");
      onChanged?.();
      fetchStatus().catch(() => {});
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal title="Remote channel setup" onClose={onClose} wide>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <LoaderCircle size={16} className="animate-spin" /> Loading status…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {envLocked && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Telegram credentials are managed via environment variables. Clear them from
              `.env` to manage the session here.
            </p>
          )}
          {error && (
            <p className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle size={12} /> {error}
            </p>
          )}


          {step === "credentials" && (
            <>
              <Field label="Telegram API ID">
                <div className="relative">
                  <input
                    type={showApiId ? "text" : "password"}
                    value={apiId}
                    onChange={(e) => setApiId(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    inputMode="numeric"
                    className={PW_INPUT}
                    disabled={busy || envLocked}
                    autoComplete="off"
                  />
                  <PwToggle show={showApiId} onToggle={() => setShowApiId((p) => !p)} />
                </div>
              </Field>
              <Field label="Telegram API hash">
                <div className="relative">
                  <input
                    type={showHash ? "text" : "password"}
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    placeholder="••••••••"
                    className={PW_INPUT}
                    disabled={busy || envLocked}
                    autoComplete="off"
                  />
                  <PwToggle show={showHash} onToggle={() => setShowHash((p) => !p)} />
                </div>
              </Field>
              <Field label="Phone number">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+15551234567"
                  className={TEXT_INPUT}
                  disabled={busy || envLocked}
                  dir="ltr"
                />
              </Field>
              <button type="button" onClick={sendCode} disabled={busy || envLocked} className={BTN_PRIMARY}>
                {busy ? <LoaderCircle size={13} className="animate-spin" /> : null}
                Send login code
              </button>
            </>
          )}

          {step === "code" && (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Code sent{codeViaApp ? " via the Telegram app" : " via SMS"}.
                Enter it below.
              </p>
              <Field label="Login code">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="12345"
                  inputMode="numeric"
                  maxLength={8}
                  className={TEXT_INPUT}
                  disabled={busy}
                  dir="ltr"
                />
              </Field>
              <button type="button" onClick={signIn} disabled={busy || !code} className={BTN_PRIMARY}>
                {busy ? <LoaderCircle size={13} className="animate-spin" /> : null}
                Verify code
              </button>
            </>
          )}

          {step === "password" && (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This account has two-step verification. Enter the password.
              </p>
              <Field label="Two-step password">
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={PW_INPUT}
                    disabled={busy}
                    autoComplete="off"
                  />
                  <PwToggle show={showPassword} onToggle={() => setShowPassword((p) => !p)} />
                </div>
              </Field>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep("code")} disabled={busy} className={btnSecondary + " h-11 shrink-0 text-sm"}>
                  Back
                </button>
                <button type="button" onClick={signIn} disabled={busy || !password} className={BTN_PRIMARY + " flex-1"}>
                  {busy ? <LoaderCircle size={13} className="animate-spin" /> : null}
                  Sign in
                </button>
              </div>
            </>
          )}

          {step === "done" && status?.hasSession && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={testConnection}
                disabled={busy}
                title={testState?.ok ? testState.account : undefined}
                className={
                  testState?.ok
                    ? "inline-flex h-9 w-44 items-center justify-center gap-1.5 truncate rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-400"
                    : testState
                      ? "inline-flex h-9 w-44 items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3 text-xs font-semibold text-white transition hover:bg-rose-400"
                      : btnSecondary + BTN_INLINE
                }
              >
                {busy ? (
                  <LoaderCircle size={13} className="animate-spin" />
                ) : testState?.ok ? (
                  <Check size={14} className="icon-anim-pop" />
                ) : testState ? (
                  <AlertCircle size={14} className="icon-anim-pop" />
                ) : (
                  <Zap size={14} className="icon-anim-beat" />
                )}
                {busy ? "Testing…" : testState?.ok ? testState.account : testState ? "Failed" : "Test connection"}
              </button>
              <button type="button" onClick={disconnect} disabled={busy} className={btnDanger + BTN_INLINE}>
                <Unplug size={14} className="icon-anim-slide" />
                Disconnect
              </button>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                <Check size={26} />
              </span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Remote channel activated
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Telegram is linked. Mirroring starts on the next poll.
              </p>
              <button type="button" onClick={onClose} className={BTN_PRIMARY}>
                Done
              </button>
            </div>
          )}

          {(step === "credentials" || step === "code" || step === "password") && (
            <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
              For more information visit the{" "}
              <a
                href="https://docs.songbird.website/Remote-Channel-Setup"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                docs
              </a>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

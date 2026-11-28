import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/chatApi.js";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  LoaderCircle,
  Server,
  Unplug,
  Zap,
} from "../../icons/lucide.js";
import { CloudflareIcon } from "../../icons/BrandIcons.jsx";
import { btnDanger, btnPrimary, btnSecondary } from "./adminShared.js";
import { Field, Modal } from "./AdminCommon.jsx";
import { useOverlayBack } from "../../hooks/chat/useOverlayBack.js";

const BASE = "/api/admin/turn";

const TEXT_INPUT =
  "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
const PW_INPUT =
  "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-12 text-sm text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
const EYE_BTN =
  "absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/10";
const BTN_PRIMARY =
  btnPrimary +
  " h-11 w-full justify-center text-sm disabled:cursor-not-allowed disabled:opacity-50";
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
    <button
      type="button"
      onClick={onToggle}
      className={EYE_BTN}
      aria-label={show ? "Hide" : "Show"}
    >
      {show ? (
        <EyeOff size={16} className="icon-anim-peek" />
      ) : (
        <Eye size={16} className="icon-anim-peek" />
      )}
    </button>
  );
}

function EnvBadge({ locked }) {
  if (!locked) return null;
  return (
    <span
      className="ml-2 inline-flex cursor-help items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400"
      title="Managed via environment variables"
    >
      environment
    </span>
  );
}

export default function TurnSetupModal({ open, onClose, onChanged }) {
  // System back cancels the setup instead of exiting.
  useOverlayBack(Boolean(open), onClose, "sbTurnSetupModal");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testState, setTestState] = useState(null);
  const [mode, setMode] = useState("self-hosted");
  const [form, setForm] = useState({
    stunUrl: "",
    turnUrl: "",
    username: "",
    tokenId: "",
    credential: "",
    apiToken: "",
  });
  const [showCredential, setShowCredential] = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeButtonRef = useRef(null);
  const modeMenuRef = useRef(null);
  const ignoreModeButtonClickRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    const res = await apiFetch(`${BASE}/status`);
    const data = await readJson(res);
    if (!res.ok) throw new Error(data.error || "Failed to load status.");
    setStatus(data);
    setForm({
      stunUrl: data.stunUrl || "",
      turnUrl: data.turnUrl || "",
      username: data.username || "",
      tokenId: data.tokenId || "",
      credential: "",
      apiToken: "",
    });
    setMode(data.mode === "cloudflare" ? "cloudflare" : "self-hosted");
    return data;
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setTestState(null);
    setLoading(true);
    fetchStatus()
      .catch((e) => setError(e.message || "Failed to load status."))
      .finally(() => setLoading(false));
  }, [open, fetchStatus]);

  useEffect(() => {
    if (!open || !modeMenuOpen) return undefined;
    const ownerDocument = modeMenuRef.current?.ownerDocument || document;
    const handleOutsideInteraction = (event) => {
      const menu = modeMenuRef.current;
      const button = modeButtonRef.current;
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];
      if (menu && (menu.contains(event.target) || path.includes(menu))) return;
      if (button && (button.contains(event.target) || path.includes(button))) {
        ignoreModeButtonClickRef.current = true;
      }
      setModeMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setModeMenuOpen(false);
    };
    ownerDocument.addEventListener("pointerdown", handleOutsideInteraction, true);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handleOutsideInteraction, true);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, modeMenuOpen]);

  const locked = (field) => Boolean(status?.managedByEnv?.[field]);
  const configured =
    status?.mode === "self-hosted" || status?.mode === "cloudflare";

  const setField = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const clear = async () => {
    setBusy(true);
    setError("");
    setTestState(null);
    try {
      const res = await apiFetch(`${BASE}/config`, { method: "DELETE" });
      const data = await readJson(res);
      if (!res.ok)
        throw new Error(data.error || "Failed to clear TURN configuration.");
      await fetchStatus().catch(() => {});
      setForm((prev) => ({ ...prev, credential: "", apiToken: "" }));
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setTestState(null);
    try {
      const activeFields =
        mode === "cloudflare"
          ? ["stunUrl", "tokenId", "apiToken"]
          : ["stunUrl", "turnUrl", "username", "credential"];
      const patch = { mode };
      for (const field of activeFields) {
        if (locked(field) || form[field] === "") continue;
        patch[field] = form[field];
      }
      const res = await apiFetch(`${BASE}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await readJson(res);
      if (!res.ok)
        throw new Error(data.error || "Failed to save TURN configuration.");
      await fetchStatus().catch(() => {});
      setForm((prev) => ({ ...prev, credential: "", apiToken: "" }));
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
      setTestState(data);
    } catch (e) {
      setError(e.message);
      setTestState({ reachable: false });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal title="TURN server" onClose={onClose} wide>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <LoaderCircle size={16} className="animate-spin" /> Loading status…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && (
            <p className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle size={12} /> {error}
            </p>
          )}

          {configured ? (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                onClick={testConnection}
                disabled={busy}
                title={testState?.reachable ? `Latency ${testState.latencyMs}ms` : undefined}
                className={
                  testState?.reachable
                    ? "inline-flex h-9 w-44 items-center justify-center gap-1.5 truncate rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-400"
                    : testState
                      ? "inline-flex h-9 w-44 items-center justify-center gap-1.5 rounded-xl bg-rose-500 px-3 text-xs font-semibold text-white transition hover:bg-rose-400"
                      : btnSecondary + BTN_INLINE
                }
              >
                {busy ? (
                  <LoaderCircle size={13} className="animate-spin" />
                ) : testState?.reachable ? (
                  <Check size={14} className="icon-anim-pop" />
                ) : testState ? (
                  <AlertCircle size={14} className="icon-anim-pop" />
                ) : (
                  <Zap size={14} className="icon-anim-beat" />
                )}
                {busy
                  ? "Testing…"
                  : testState?.reachable
                    ? `Reachable · ${testState.latencyMs}ms`
                    : testState
                      ? "Failed"
                      : "Test connection"}
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={busy}
                className={btnDanger + BTN_INLINE}
              >
                <Unplug size={14} className="icon-anim-slide" />
                Disconnect
              </button>
            </div>
          ) : (
            <>
          <div className="relative">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Mode
            </label>
            <button
              ref={modeButtonRef}
              type="button"
              onClick={() => {
                if (ignoreModeButtonClickRef.current) {
                  ignoreModeButtonClickRef.current = false;
                  return;
                }
                setModeMenuOpen((current) => !current);
              }}
              disabled={busy}
              className="relative mt-2 flex w-full items-center rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-12 text-left text-sm font-semibold text-slate-700 outline-hidden transition hover:border-emerald-300 hover:bg-emerald-50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-emerald-500/10"
              aria-expanded={modeMenuOpen}
              aria-haspopup="listbox"
              aria-label={`TURN mode: ${mode === "cloudflare" ? "Cloudflare" : "Self-hosted"}`}
            >
              <span className="flex items-center gap-2">
                {mode === "cloudflare" ? (
                  <CloudflareIcon size={16} />
                ) : (
                  <Server size={16} />
                )}
                {mode === "cloudflare" ? "Cloudflare" : "Self-hosted"}
              </span>
              <ChevronDown
                size={16}
                className={`absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 transition-transform ${
                  modeMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {modeMenuOpen ? (
              <div
                ref={modeMenuRef}
                role="listbox"
                className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={mode === "self-hosted"}
                  onClick={() => {
                    setModeMenuOpen(false);
                    setMode("self-hosted");
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
                >
                  <span className="flex items-center gap-2">
                    <Server size={16} /> Self-hosted
                  </span>
                  {mode === "self-hosted" ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ) : null}
                </button>
                <button
                  type="button"
                  role="option"
                  aria-selected={mode === "cloudflare"}
                  onClick={() => {
                    setModeMenuOpen(false);
                    setMode("cloudflare");
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
                >
                  <span className="flex items-center gap-2">
                    <CloudflareIcon size={16} /> Cloudflare
                  </span>
                  {mode === "cloudflare" ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>

          <Field
            label={
              <span>
                STUN URL <EnvBadge locked={locked("stunUrl")} />
              </span>
            }
          >
            <input
              value={form.stunUrl}
              onChange={(e) => setField("stunUrl", e.target.value)}
              placeholder="stun:stun.l.google.com:19302"
              className={TEXT_INPUT}
              disabled={busy || locked("stunUrl")}
              dir="ltr"
            />
          </Field>

          {mode === "self-hosted" ? (
            <>
              <Field
                label={
                  <span>
                    TURN URL <EnvBadge locked={locked("turnUrl")} />
                  </span>
                }
              >
                <input
                  value={form.turnUrl}
                  onChange={(e) => setField("turnUrl", e.target.value)}
                  placeholder="turn:relay.example.com:3478"
                  className={TEXT_INPUT}
                  disabled={busy || locked("turnUrl")}
                  dir="ltr"
                />
              </Field>
              <Field
                label={
                  <span>
                    Username <EnvBadge locked={locked("username")} />
                  </span>
                }
              >
                <input
                  value={form.username}
                  onChange={(e) => setField("username", e.target.value)}
                  className={TEXT_INPUT}
                  disabled={busy || locked("username")}
                  autoComplete="off"
                />
              </Field>
              <Field
                label={
                  <span>
                    Credential <EnvBadge locked={locked("credential")} />
                  </span>
                }
              >
                <div className="relative">
                  <input
                    type={showCredential ? "text" : "password"}
                    value={form.credential}
                    onChange={(e) => setField("credential", e.target.value)}
                    placeholder={
                      status?.hasCredential ? "Saved — leave blank to keep" : ""
                    }
                    className={PW_INPUT}
                    disabled={busy || locked("credential")}
                    autoComplete="off"
                  />
                  <PwToggle
                    show={showCredential}
                    onToggle={() => setShowCredential((p) => !p)}
                  />
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field
                label={
                  <span>
                    Cloudflare key ID <EnvBadge locked={locked("tokenId")} />
                  </span>
                }
              >
                <input
                  value={form.tokenId}
                  onChange={(e) => setField("tokenId", e.target.value)}
                  className={TEXT_INPUT}
                  disabled={busy || locked("tokenId")}
                  autoComplete="off"
                />
              </Field>
              <Field
                label={
                  <span>
                    API token <EnvBadge locked={locked("apiToken")} />
                  </span>
                }
              >
                <div className="relative">
                  <input
                    type={showApiToken ? "text" : "password"}
                    value={form.apiToken}
                    onChange={(e) => setField("apiToken", e.target.value)}
                    placeholder={
                      status?.hasApiToken ? "Saved — leave blank to keep" : ""
                    }
                    className={PW_INPUT}
                    disabled={busy || locked("apiToken")}
                    autoComplete="off"
                  />
                  <PwToggle
                    show={showApiToken}
                    onToggle={() => setShowApiToken((p) => !p)}
                  />
                </div>
              </Field>
            </>
          )}

          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={BTN_PRIMARY}
          >
            {busy ? (
              <LoaderCircle size={13} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Save
          </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

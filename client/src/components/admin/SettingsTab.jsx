import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AtSign,
  Bell,
  Box,
  Boxes,
  Check,
  Clock12,
  ClockFading,
  Download,
  Files,
  ImageIcon,
  Info,
  Link,
  LoaderCircle,
  Lock,
  MessageCircleMore,
  Paperclip,
  Pencil,
  Refresh,
  Rotate,
  SatelliteDish,
  SquareStack,
  ToggleRight,
  UserPlus,
  Video,
} from "../../icons/lucide.js";
import { api, cardCls, btnPrimary, btnSecondary } from "./adminShared.js";
import ConfirmModal from "../modals/ConfirmModal.jsx";

// ─── Group metadata ───────────────────────────────────────────────────────────

const GROUP_META = {
  registration: { label: "Registration", order: 0 },
  uploads: { label: "File Uploads", order: 1 },
  retention: { label: "Message Retention", order: 2 },
  limits: { label: "Limits", order: 3 },
  push: { label: "Push Notifications", order: 4 },
  remote_channel: { label: "Remote Channel", order: 5 },
};

// Icon for each setting key
const SETTING_ICONS = {
  SIGN_UP: UserPlus,
  FILE_UPLOAD: Paperclip,
  FILE_UPLOAD_MAX_SIZE_MB: Box,
  FILE_UPLOAD_MAX_TOTAL_SIZE_MB: Boxes,
  FILE_UPLOAD_MAX_FILES: Files,
  FILE_UPLOAD_TRANSCODE_VIDEOS: Video,
  MESSAGE_FILE_RETENTION: ClockFading,
  MESSAGE_TEXT_RETENTION: ClockFading,
  MESSAGE_MAX_CHARS: MessageCircleMore,
  USERNAME_MAX_CHARS: AtSign,
  NICKNAME_MAX_CHARS: Pencil,
  REMOTE_CHANNEL: SatelliteDish,
  REMOTE_CHANNEL_UI: ToggleRight,
  REMOTE_CHANNEL_MEDIA_STREAM: ImageIcon,
  REMOTE_CHANNEL_POLL_INTERVAL_MS: Clock12,
  REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT: Download,
  REMOTE_CHANNEL_QUEUE_INTERVAL_MS: Clock12,
  REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS: Rotate,
  REMOTE_CHANNEL_QUEUE_BATCH_SIZE: Box,
  REMOTE_CHANNEL_QUEUE_CONCURRENCY: SquareStack,
  REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS: Lock,
  PUSH_PROXY_URL: Bell,
};

// ─── iOS-style toggle — same pattern as NewGroupModal ────────────────────────

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } ${
        checked
          ? "justify-end bg-emerald-500"
          : "justify-start bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition" />
    </button>
  );
}

// ─── Styled number stepper ────────────────────────────────────────────────────

function NumberInput({ value, onChange, min, max, disabled = false }) {
  const num = Number(value) || 0;

  const step = (delta) => {
    const next = Math.trunc(num + delta);
    const lo = min !== undefined ? Math.max(min, next) : next;
    const hi = max !== undefined ? Math.min(max, lo) : lo;
    onChange(String(hi));
  };

  return (
    <div
      className={`inline-flex w-36 items-center rounded-xl border transition ${
        disabled
          ? "border-slate-200 bg-slate-100 opacity-40 dark:border-slate-700 dark:bg-slate-900/40"
          : "border-emerald-200 bg-white dark:border-emerald-500/30 dark:bg-slate-900/50"
      }`}
    >
      <button
        type="button"
        disabled={disabled || (min !== undefined && num <= min)}
        onClick={() => step(-1)}
        className="flex h-8 w-7 shrink-0 items-center justify-center text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-500 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
        aria-label="Decrease"
      >
        <span className="select-none text-sm font-bold leading-none">−</span>
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 border-0 bg-transparent px-0 py-1.5 text-center text-xs font-semibold text-slate-700 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-slate-200"
      />
      <button
        type="button"
        disabled={disabled || (max !== undefined && num >= max)}
        onClick={() => step(1)}
        className="flex h-8 w-7 shrink-0 items-center justify-center text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-500 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
        aria-label="Increase"
      >
        <span className="select-none text-sm font-bold leading-none">+</span>
      </button>
    </div>
  );
}

// ─── Single setting row ───────────────────────────────────────────────────────

function SettingRow({ def, localVal, onChange }) {
  const Icon = SETTING_ICONS[def.key] ?? Info;
  const isNullable = Boolean(def.nullable);
  const isNullableString = isNullable && def.type === "string";
  const nullIntVal = "0";

  // For nullable strings, the "enabled" flag and the URL value are tracked
  // separately so that toggling off→on doesn't immediately re-disable the field.
  // The URL value lives in localVal (controlled by parent); we keep a local
  // enabled flag that drives what we show and what we commit upward.
  const [strEnabled, setStrEnabled] = useState(() =>
    isNullableString ? localVal !== "" : false,
  );
  // Keep strEnabled in sync if the parent resets localVal (e.g. after save/restore)
  const prevLocalVal = useRef(localVal);
  useEffect(() => {
    if (isNullableString && prevLocalVal.current !== localVal) {
      prevLocalVal.current = localVal;
      setStrEnabled(localVal !== "");
    }
  }, [isNullableString, localVal]);

  // For int nullable: enabled = value !== "0"
  const isIntEnabled =
    isNullable && def.type === "int" ? localVal !== nullIntVal : true;
  // Combined enabled flag
  const isEnabled = isNullableString ? strEnabled : isIntEnabled;

  const handleToggleEnable = (on) => {
    if (isNullableString) {
      setStrEnabled(on);
      if (!on) onChange(""); // write empty string = disabled
      // when turning on, keep whatever localVal already is (empty = user types)
    } else {
      // int nullable
      if (!on) {
        onChange(nullIntVal);
      } else {
        const fallback = String(
          def.defaultVal !== undefined && Number(def.defaultVal) > 0
            ? def.defaultVal
            : (def.min ?? 1),
        );
        onChange(fallback);
      }
    }
  };

  return (
    <div className={cardCls}>
      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Icon size={16} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {def.label}
          </p>
          {def.description && (
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {def.description}
            </p>
          )}
        </div>

        <div className="shrink-0">
          {def.type === "bool" ? (
            <Toggle
              checked={localVal === "true"}
              onChange={(on) => onChange(on ? "true" : "false")}
            />
          ) : isNullable ? (
            <Toggle checked={isEnabled} onChange={handleToggleEnable} />
          ) : def.type === "int" ? (
            <NumberInput
              value={localVal}
              onChange={onChange}
              min={def.min}
              max={def.max}
            />
          ) : null}
        </div>
      </div>

      {/* ── Sub-row for nullable int (retention period) ───────────────────── */}
      {isNullable && def.type === "int" && (
        <div
          className={`flex items-center gap-3 border-t px-4 py-3 ${
            isEnabled ? "" : "opacity-40"
          } border-emerald-100 dark:border-emerald-500/20`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
            <Clock12 size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Retention period
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              How many days to keep before auto-deletion.
            </p>
          </div>
          <div className="shrink-0">
            <NumberInput
              value={isEnabled ? localVal : String(def.min ?? 1)}
              onChange={onChange}
              min={def.min ?? 1}
              max={def.max}
              disabled={!isEnabled}
            />
          </div>
        </div>
      )}

      {/* ── Sub-row for nullable string (proxy URL) ───────────────────────── */}
      {isNullable && def.type === "string" && (
        <div
          className={`flex items-start gap-3 border-t px-4 py-3 ${
            isEnabled ? "" : "opacity-40"
          } border-emerald-100 dark:border-emerald-500/20`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
            <Link size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Proxy URL
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              HTTPS, SOCKS4, or SOCKS5 proxy address.
            </p>
            <input
              type="text"
              value={isEnabled ? localVal : ""}
              disabled={!isEnabled}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://proxy.example.com:8080"
              className="mt-2 w-full rounded-xl border border-emerald-200/70 bg-white/90 px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 hover:border-emerald-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/40 disabled:cursor-not-allowed dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder-slate-600"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function SettingGroup({ groupKey, defs, effectiveVals, onChange }) {
  const meta = GROUP_META[groupKey] ?? { label: groupKey };
  return (
    <div>
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {meta.label}
      </h2>
      <div className="space-y-2">
        {defs.map((def) => (
          <SettingRow
            key={def.key}
            def={def}
            localVal={effectiveVals[def.key]}
            onChange={(val) => onChange(def.key, val)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function SettingsTab() {
  const [settings, setSettings] = useState([]);
  const [localVals, setLocalVals] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ msg: "", type: "ok" });
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  // Restart confirmation — shown after saving if restart-required keys were touched
  const [restartOpen, setRestartOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const toastRef = useRef(null);

  const flash = (msg, type = "ok") => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ msg, type });
    toastRef.current = setTimeout(
      () => setToast({ msg: "", type: "ok" }),
      4000,
    );
  };

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.get("/api/admin/settings");
      setSettings(data.settings ?? []);
      setLocalVals({});
    } catch {
      setError("Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    return () => {
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  }, [fetchSettings]);

  // Build a lookup map from key → def for quick access
  const defsByKey = Object.fromEntries(settings.map((d) => [d.key, d]));

  // Keys that differ from their persisted server value
  const dirtyKeys = settings
    .filter((def) => {
      const local = localVals[def.key];
      if (local === undefined) return false;
      return local !== String(def.value ?? def.defaultVal ?? "");
    })
    .map((def) => def.key);

  const hasDirty = dirtyKeys.length > 0;

  const handleChange = (key, val) => {
    setLocalVals((prev) => ({ ...prev, [key]: val }));
  };

  const handleSaveAll = async () => {
    if (!hasDirty) return;
    setSaving(true);
    const updates = {};
    for (const key of dirtyKeys) updates[key] = localVals[key];
    try {
      const r = await api.put("/api/admin/settings", { settings: updates });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const firstError = d.errors ? Object.values(d.errors)[0] : d.error;
        flash(firstError || "Save failed.", "error");
        if (d.settings) {
          setSettings(d.settings);
          setLocalVals({});
        }
        return;
      }
      const d = await r.json();
      setSettings(d.settings ?? settings);

      // Check if any of the saved keys require a restart
      const needsRestart = dirtyKeys.some((key) => defsByKey[key]?.restart);
      setLocalVals({});

      if (needsRestart) {
        setRestartOpen(true);
      } else {
        flash("Settings saved.");
      }
    } catch {
      flash("Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await api.post("/api/admin/service/restart", {});
      flash("Restarting… the app will be briefly unavailable.");
    } catch {
      flash("Restart failed.", "error");
    } finally {
      setRestarting(false);
      setRestartOpen(false);
    }
  };

  const handleResetAll = async () => {
    setResetting(true);
    try {
      for (const def of settings) {
        await api.delete(`/api/admin/settings/${def.key}`);
      }
      const data = await api.get("/api/admin/settings");
      setSettings(data.settings ?? []);
      setLocalVals({});
      flash("All settings restored to defaults.");
    } catch {
      flash("Restore failed.", "error");
    } finally {
      setResetting(false);
      setResetOpen(false);
    }
  };

  // Group and sort
  const grouped = settings.reduce((acc, def) => {
    const g = def.group ?? "other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(def);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ao = GROUP_META[a]?.order ?? 99;
    const bo = GROUP_META[b]?.order ?? 99;
    return ao - bo;
  });

  // Effective display values: local edit → server value → default
  const effectiveVals = {};
  for (const def of settings) {
    effectiveVals[def.key] =
      localVals[def.key] !== undefined
        ? localVals[def.key]
        : String(def.value ?? def.defaultVal ?? "");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 dark:text-slate-500">
        <LoaderCircle size={20} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-slate-400 dark:text-slate-500">
        <AlertCircle size={20} className="text-rose-400" />
        <span className="text-sm">{error}</span>
        <button type="button" onClick={fetchSettings} className={btnSecondary}>
          <Refresh size={13} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Top bar: toast + action buttons on one line ───────────────────── */}
      <div className="flex min-h-[2.25rem] items-center gap-3">
        <div className="min-w-0 flex-1">
          {toast.msg && (
            <div
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium ${
                toast.type === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              }`}
            >
              {toast.type === "error" ? (
                <AlertCircle size={12} />
              ) : (
                <Check size={12} />
              )}
              {toast.msg}
            </div>
          )}
          {!toast.msg && hasDirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {dirtyKeys.length} unsaved change
              {dirtyKeys.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setResetOpen(true)}
          className={btnSecondary}
        >
          <Rotate size={13} />
          Restore defaults
        </button>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saving || !hasDirty}
          className={
            btnPrimary + " disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {saving ? (
            <LoaderCircle size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          Save
        </button>
      </div>

      {/* ── Setting groups ────────────────────────────────────────────────── */}
      {sortedGroups.map(([groupKey, defs]) => (
        <SettingGroup
          key={groupKey}
          groupKey={groupKey}
          defs={defs}
          effectiveVals={effectiveVals}
          onChange={handleChange}
        />
      ))}

      {/* ── Restore defaults modal ────────────────────────────────────────── */}
      <ConfirmModal
        open={resetOpen}
        title="Restore defaults"
        message="This will reset every setting back to its default value. Any customisations will be lost."
        confirmLabel={resetting ? "Restoring…" : "Restore defaults"}
        busy={resetting}
        onConfirm={handleResetAll}
        onClose={() => {
          if (!resetting) setResetOpen(false);
        }}
      />

      {/* ── Restart modal — shown after saving restart-required settings ───── */}
      <ConfirmModal
        open={restartOpen}
        title="Restart required"
        message="Settings saved. One or more changes require a service restart to take effect. Restart now?"
        confirmLabel={restarting ? "Restarting…" : "Restart now"}
        busy={restarting}
        onConfirm={handleRestart}
        onClose={() => {
          if (!restarting) {
            setRestartOpen(false);
            flash("Settings saved. Restart the service when ready.");
          }
        }}
      />
    </div>
  );
}

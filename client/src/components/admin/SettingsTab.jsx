import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  AlertCircle,
  AtSign,
  Bell,
  Box,
  Boxes,
  Bug,
  Check,
  Clock12,
  ClockFading,
  Database,
  Download,
  Files,
  ImageIcon,
  Info,
  KeyRound,
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
  diagnostics: { label: "Diagnostics", order: 0 },
  registration: { label: "Registration", order: 1 },
  uploads: { label: "File Uploads", order: 2 },
  retention: { label: "Message Retention", order: 3 },
  limits: { label: "Limits", order: 4 },
  client: { label: "Client Behavior", order: 5 },
  push: { label: "Push Notifications", order: 6 },
  remote_channel: { label: "Remote Channel", order: 7 },
};

// Icon for each setting key
const SETTING_ICONS = {
  APP_DEBUG: Bug,
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
  CHAT_MESSAGE_FETCH_LIMIT: Download,
  CHAT_MESSAGE_PAGE_SIZE: SquareStack,
  CHAT_CACHE_TTL: Database,
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
  REMOTE_CHANNEL_TELEGRAM_PROXY_URL: SatelliteDish,
  REMOTE_CHANNEL_SONGBIRD_PROXY_URL: SatelliteDish,
  PUSH_PROXY_URL: Bell,
};

// Per-icon hover animation
const SETTING_ICON_ANIM = {
  APP_DEBUG: "icon-anim-sway",
  SIGN_UP: "icon-anim-pop",
  FILE_UPLOAD: "icon-anim-sway",
  FILE_UPLOAD_MAX_SIZE_MB: "icon-anim-bob",
  FILE_UPLOAD_MAX_TOTAL_SIZE_MB: "icon-anim-bob",
  FILE_UPLOAD_MAX_FILES: "icon-anim-lift",
  FILE_UPLOAD_TRANSCODE_VIDEOS: "icon-anim-sway",
  MESSAGE_FILE_RETENTION: "icon-anim-swing",
  MESSAGE_TEXT_RETENTION: "icon-anim-swing",
  MESSAGE_MAX_CHARS: "icon-anim-sway",
  USERNAME_MAX_CHARS: "icon-anim-pop",
  NICKNAME_MAX_CHARS: "icon-anim-sway",
  CHAT_MESSAGE_FETCH_LIMIT: "icon-anim-drop",
  CHAT_MESSAGE_PAGE_SIZE: "icon-anim-lift",
  CHAT_CACHE_TTL: "icon-anim-lift",
  REMOTE_CHANNEL: "icon-anim-sway",
  REMOTE_CHANNEL_UI: "icon-anim-lift",
  REMOTE_CHANNEL_MEDIA_STREAM: "icon-anim-pop",
  REMOTE_CHANNEL_POLL_INTERVAL_MS: "icon-anim-swing",
  REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT: "icon-anim-drop",
  REMOTE_CHANNEL_QUEUE_INTERVAL_MS: "icon-anim-swing",
  REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS: "icon-anim-spin-full",
  REMOTE_CHANNEL_QUEUE_BATCH_SIZE: "icon-anim-bob",
  REMOTE_CHANNEL_QUEUE_CONCURRENCY: "icon-anim-lift",
  REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS: "icon-anim-bob",
  REMOTE_CHANNEL_TELEGRAM_PROXY_URL: "icon-anim-swing",
  REMOTE_CHANNEL_SONGBIRD_PROXY_URL: "icon-anim-swing",
  PUSH_PROXY_URL: "icon-anim-swing",
};

// Keys that act as the master enable/disable toggle for their whole group.
// When the master is false, all other rows in the group are disabled.
const GROUP_MASTER = {
  uploads:        "FILE_UPLOAD",
  remote_channel: "REMOTE_CHANNEL",
};

// Keys that should be rendered as sub-rows inside their master's card,
// rather than as standalone cards. Order matters — they appear in this order.
const GROUP_CHILDREN = {
  uploads: [
    "FILE_UPLOAD_MAX_SIZE_MB",
    "FILE_UPLOAD_MAX_TOTAL_SIZE_MB",
    "FILE_UPLOAD_MAX_FILES",
    "FILE_UPLOAD_TRANSCODE_VIDEOS",
  ],
  remote_channel: [
    "REMOTE_CHANNEL_UI",
    "REMOTE_CHANNEL_MEDIA_STREAM",
    "REMOTE_CHANNEL_POLL_INTERVAL_MS",
    "REMOTE_CHANNEL_TELEGRAM_POLL_LIMIT",
    "REMOTE_CHANNEL_QUEUE_INTERVAL_MS",
    "REMOTE_CHANNEL_QUEUE_MAX_ATTEMPTS",
    "REMOTE_CHANNEL_QUEUE_BATCH_SIZE",
    "REMOTE_CHANNEL_QUEUE_CONCURRENCY",
    "REMOTE_CHANNEL_QUEUE_STALE_LOCK_MS",
  ],
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

  // If the field is emptied and blurred, refill it with a sane minimum
  // instead of leaving it blank.
  const handleBlur = () => {
    if (String(value ?? "").trim() !== "") return;
    const fallback = min !== undefined ? min : 1;
    onChange(String(fallback));
  };

  return (
    <div
      className={`inline-flex shrink-0 items-center overflow-hidden rounded-xl border transition ${
        disabled
          ? "border-slate-200 bg-slate-100 opacity-40 dark:border-slate-700 dark:bg-slate-900/40"
          : "border-emerald-200 bg-white dark:border-emerald-500/30 dark:bg-slate-900/50"
      }`}
      style={{ width: "clamp(3.25rem, 20vw + 0.5rem, 9rem)" }}
    >
      <button
        type="button"
        disabled={disabled || (min !== undefined && num <= min)}
        onClick={() => step(-1)}
        className="flex h-8 w-4 shrink-0 items-center justify-center text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-500 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400 sm:w-7"
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
        onBlur={handleBlur}
        className="min-w-0 flex-1 border-0 bg-transparent px-0 py-1.5 text-center font-semibold text-slate-700 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-slate-200"
        style={{ fontSize: "clamp(0.625rem, 1.5vw + 0.2rem, 0.8125rem)" }}
      />
      <button
        type="button"
        disabled={disabled || (max !== undefined && num >= max)}
        onClick={() => step(1)}
        className="flex h-8 w-4 shrink-0 items-center justify-center text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-500 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400 sm:w-7"
        aria-label="Increase"
      >
        <span className="select-none text-sm font-bold leading-none">+</span>
      </button>
    </div>
  );
}

// ─── Sub-row inside a grouped card ───────────────────────────────────────────
// Used for child settings rendered inside the master's card.

function SubRow({ def, localVal, onChange, masterDisabled = false }) {
  const Icon = SETTING_ICONS[def.key] ?? Info;
  const iconAnim = SETTING_ICON_ANIM[def.key] ?? "icon-anim-sway";
  const envLocked = Boolean(def.envLocked);
  // Only disable controls for masterDisabled — envLocked dims the whole
  // sub-row via opacity already, so the control doesn't need a second layer.
  const isDisabled = masterDisabled;

  return (
    <div className={`settings-row flex items-center gap-3 border-t px-4 py-3 border-emerald-100 dark:border-emerald-500/20 transition-opacity ${
      masterDisabled ? "opacity-40" : ""
    }`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-400 dark:text-slate-500">
        <Icon size={20} className={iconAnim} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {def.label}
          </p>
          {envLocked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
              <KeyRound size={9} /> set in .env
            </span>
          )}
        </div>
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
            onChange={(on) => !isDisabled && onChange(on ? "true" : "false")}
            disabled={isDisabled}
          />
        ) : def.type === "int" ? (
          <NumberInput
            value={localVal}
            onChange={onChange}
            min={def.min}
            max={def.max}
            disabled={isDisabled}
          />
        ) : null}
      </div>
    </div>
  );
}

// ─── Single setting row ───────────────────────────────────────────────────────

function SettingRow({ def, localVal, onChange, groupDisabled = false, childDefs = [], childVals = {}, onChildChange, masterOff = false }) {
  const Icon = SETTING_ICONS[def.key] ?? Info;
  const iconAnim = SETTING_ICON_ANIM[def.key] ?? "icon-anim-sway";
  const isNullable = Boolean(def.nullable);
  const isNullableString = isNullable && def.type === "string";
  const nullIntVal = "0";
  const envLocked = Boolean(def.envLocked);
  // Only disable controls for group-master-off, not for envLocked —
  // the whole card is already pointer-events-none when envLocked.
  const controlDisabled = groupDisabled;

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
    <div className={`${cardCls} transition-opacity ${
      envLocked || groupDisabled ? "opacity-50 pointer-events-none" : ""
    }`}>
      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="settings-row flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Icon size={22} className={iconAnim} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {def.label}
            </p>
            {envLocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400">
                <KeyRound size={9} /> set in .env
              </span>
            )}
          </div>
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
              disabled={controlDisabled}
            />
          ) : isNullable ? (
            <Toggle checked={isEnabled} onChange={handleToggleEnable} disabled={controlDisabled} />
          ) : def.type === "int" ? (
            <NumberInput
              value={localVal}
              onChange={onChange}
              min={def.min}
              max={def.max}
              disabled={controlDisabled}
            />
          ) : null}
        </div>
      </div>

      {/* ── Sub-row for nullable int (retention period) ───────────────────── */}
      {isNullable && def.type === "int" && (
        <div
          className={`settings-row flex items-center gap-3 border-t px-4 py-3 ${
            isEnabled ? "" : "opacity-40"
          } border-emerald-100 dark:border-emerald-500/20`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-400 dark:text-slate-500">
            <Clock12 size={20} className="icon-anim-sway" />
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
              disabled={!isEnabled || controlDisabled}
            />
          </div>
        </div>
      )}

      {/* ── Sub-rows for nullable string (proxy URL) ──────────────────────── */}
      {isNullable && def.type === "string" && (
        <div
          className={`settings-row flex items-start gap-3 border-t px-4 py-3 ${
            isEnabled ? "" : "opacity-40"
          } border-emerald-100 dark:border-emerald-500/20`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-400 dark:text-slate-500">
            <Link size={20} className="icon-anim-swing" />
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
              disabled={!isEnabled || controlDisabled}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://proxy.example.com:8080"
              className="mt-2 w-full rounded-xl border border-emerald-200/70 bg-white/90 px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 hover:border-emerald-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/40 disabled:cursor-not-allowed dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder-slate-600"
            />
          </div>
        </div>
      )}

      {/* ── Grouped child settings ────────────────────────────────────────── */}
      {childDefs.map((child) => (
        <SubRow
          key={child.key}
          def={child}
          localVal={childVals[child.key] ?? String(child.value ?? child.defaultVal ?? "")}
          onChange={(val) => onChildChange?.(child.key, val)}
          masterDisabled={masterOff}
        />
      ))}
    </div>
  );
}

// ─── Group section ────────────────────────────────────────────────────────────

function SettingGroup({ groupKey, defs, effectiveVals, onChange }) {
  const meta       = GROUP_META[groupKey] ?? { label: groupKey };
  const masterKey  = GROUP_MASTER[groupKey];
  const childKeys  = new Set(GROUP_CHILDREN[groupKey] ?? []);
  const childOrder = GROUP_CHILDREN[groupKey] ?? [];

  // Master is off when its effective value is "false".
  // But if the master is env-locked, the whole card is already opacity-50 —
  // don't additionally dim the sub-rows (that would compound the opacity).
  const masterDef = masterKey ? defs.find((d) => d.key === masterKey) : null;
  const masterEnvLocked = Boolean(masterDef?.envLocked);
  const masterOff = masterKey && !masterEnvLocked
    ? effectiveVals[masterKey] === "false"
    : false;

  // Standalone rows = defs that are NOT child keys (includes the master itself)
  const standaloneDefs = defs.filter((d) => !childKeys.has(d.key));
  // Child defs in declared order
  const childDefs = childOrder
    .map((k) => defs.find((d) => d.key === k))
    .filter(Boolean);

  return (
    <div>
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {meta.label}
      </h2>
      <div className="space-y-2">
        {standaloneDefs.map((def) => {
          const isMaster = def.key === masterKey;
          return (
            <div key={def.key}>
              {/* Master card — may contain children as sub-rows */}
              <SettingRow
                def={def}
                localVal={effectiveVals[def.key]}
                onChange={(val) => onChange(def.key, val)}
                groupDisabled={false}
                // Pass children so the master card can render them inside itself
                childDefs={isMaster ? childDefs : []}
                childVals={isMaster ? effectiveVals : {}}
                onChildChange={isMaster ? onChange : undefined}
                masterOff={isMaster ? masterOff : false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

const SettingsTab = forwardRef(function SettingsTab(_props, ref) {
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

  useImperativeHandle(ref, () => ({ refresh: fetchSettings }), [fetchSettings]);

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
    // Never track changes for env-locked keys — they can't be saved
    if (defsByKey[key]?.envLocked) return;
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
      // Fire-and-forget nginx sync for keys that affect client_max_body_size.
      if (dirtyKeys.some((key) => defsByKey[key]?.nginxReload)) {
        api.post("/api/admin/nginx/reload", {})
          .then((r) => r.json().catch(() => ({})))
          .then((result) => {
            if (!result.ok && !result.dockerMode) {
              flash("Settings saved, but nginx config update failed — update client_max_body_size manually.", "error");
            }
          })
          .catch(() => {
            flash("Settings saved, but nginx config update failed — update client_max_body_size manually.", "error");
          });
      }
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
      // Only reset keys that are not env-locked — those can't be changed anyway
      for (const def of settings) {
        if (def.envLocked) continue;
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
          <Rotate size={13} className="icon-anim-spin-full" />
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
            <Check size={13} className="icon-anim-pop" />
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
        message="This will reset all customised settings back to their default values. Settings controlled by .env are not affected."
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
});

export default SettingsTab;

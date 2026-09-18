import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Clapper,
  KeyRound,
  LoaderCircle,
  PackageOpen,
} from "../../icons/lucide.js";
import { TelegramIcon } from "../../icons/BrandIcons.jsx";
import Tooltip from "../common/Tooltip.jsx";
import { api } from "./adminShared.js";
import { SectionHeading } from "./AdminCommon.jsx";
import RemoteChannelSetupModal from "./RemoteChannelSetupModal.jsx";

// ─── Status badge — mirrors ActionsTab ───────────────────────────────────────

function StatusBadge({ status }) {
  if (!status) return null;
  // "env" mirrors the Settings tab EnvLockBadge for env-managed values.
  if (status.type === "env") {
    return (
      <Tooltip label="Managed via environment variables">
        <span
          tabIndex={0}
          className="inline-flex cursor-help items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-400"
        >
          <KeyRound size={9} /> set in .env
        </span>
      </Tooltip>
    );
  }
  const { type, label } = status;
  const cls =
    type === "error"
      ? "text-rose-600 dark:text-rose-300"
      : "text-emerald-600 dark:text-emerald-300";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${cls}`}>
      {type === "busy" ? (
        <LoaderCircle size={13} className="animate-spin" />
      ) : type === "error" ? (
        <AlertCircle size={13} />
      ) : (
        <Check size={13} />
      )}
      {label}
    </span>
  );
}

// ─── Service row — mirrors ActionsTab ActionRow ──────────────────────────────

function ServiceRow({
  icon: Icon,
  iconAnim = "icon-anim-sway",
  label,
  description,
  onClick,
  disabled = false,
  status = null,
}) {
  const busy = status?.type === "busy";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="flex h-full w-full flex-col items-start gap-2 rounded-2xl border border-emerald-200/70 bg-white/90 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-slate-950/50 dark:hover:bg-emerald-500/5"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Icon size={22} className={iconAnim} />
        </div>
        {status && <div className="shrink-0 pt-1"><StatusBadge status={status} /></div>}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}

const ServicesTab = forwardRef(function ServicesTab(
  { data, onMutated },
  ref,
) {
  const [rowStatus, setRowStatus] = useState({});
  const [setupOpen, setSetupOpen] = useState(false);
  const statusTimers = useRef({});

  const flashStatus = (key, type, label, ms = 3000) => {
    if (statusTimers.current[key]) clearTimeout(statusTimers.current[key]);
    setRowStatus((prev) => ({ ...prev, [key]: { type, label } }));
    if (type !== "busy") {
      statusTimers.current[key] = setTimeout(() => {
        setRowStatus((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, ms);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: () => api.get("/api/admin/services").then(() => {}).catch(() => {}),
  }), []);

  const mediaWorker = data?.mediaWorker || null;
  const remoteChannel = data?.remoteChannel || null;
  const storage = data?.storage || null;

  const workerDescription = mediaWorker?.configured
    ? mediaWorker.reachable
      ? `Reachable${mediaWorker.latencyMs != null ? ` · ${mediaWorker.latencyMs}ms` : ""}`
      : "Configured but unreachable."
    : "Local fallback mode — no external worker configured.";

  const remoteFeatureOn = Boolean(remoteChannel?.enabled);
  const remoteLinked = Boolean(remoteChannel?.telegramConfigured);
  const remoteEnvManaged = Boolean(remoteChannel?.telegramManagedByEnv);
  const remoteDescription = !remoteFeatureOn
    ? "Remote channel is disabled"
    : remoteEnvManaged
      ? "Telegram credentials are set in .env"
      : remoteLinked
        ? `Telegram linked${remoteChannel.telegramConnected ? " · connected" : ""}`
        : "Not linked — set up to link Telegram.";

  const handleWorkerCheck = async () => {
    flashStatus("worker", "busy", "Checking…");
    try {
      const payload = await api.get("/api/admin/services");
      const reachable = payload?.mediaWorker?.reachable;
      const configured = payload?.mediaWorker?.configured;
      if (reachable || !configured) flashStatus("worker", "success", "Active");
      else flashStatus("worker", "error", "Inactive");
    } catch {
      flashStatus("worker", "error", "Check failed");
    }
  };

  const storageReachable = storage?.reachable;
  const storageDescription =
    `Driver: ${storage?.driver || "local"}` +
    (storageReachable && storage?.latencyMs != null ? ` · ${storage.latencyMs}ms` : "");
  const handleStorageCheck = async () => {
    flashStatus("storage", "busy", "Checking…");
    try {
      const payload = await api.get("/api/admin/services");
      if (payload?.storage?.reachable === false) {
        flashStatus("storage", "error", "Unreachable");
      } else {
        flashStatus("storage", "success", "Active");
      }
    } catch {
      flashStatus("storage", "error", "Check failed");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading>Services</SectionHeading>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ServiceRow
            icon={Clapper}
            iconAnim="icon-anim-beat"
            label="Media worker"
            description={workerDescription}
            onClick={handleWorkerCheck}
            status={
              rowStatus.worker ||
              (mediaWorker
                ? mediaWorker.reachable || !mediaWorker.configured
                  ? { type: "success", label: "Active" }
                  : { type: "error", label: "Inactive" }
                : null)
            }
          />
          <ServiceRow
            icon={TelegramIcon}
            iconAnim="icon-anim-sway"
            label="Telegram connection"
            description={remoteDescription}
            onClick={() => setSetupOpen(true)}
            disabled={!remoteFeatureOn || remoteEnvManaged}
            status={
              !remoteFeatureOn
                ? { type: "error", label: "Disabled" }
                : remoteEnvManaged
                  ? { type: "env" }
                  : rowStatus.remote ||
                    (remoteChannel
                      ? remoteLinked
                        ? { type: "success", label: "Connected" }
                        : { type: "error", label: "Not configured" }
                      : null)
            }
          />
          <ServiceRow
            icon={PackageOpen}
            iconAnim="icon-anim-drop"
            label="Storage"
            description={storageDescription}
            onClick={handleStorageCheck}
            status={
              rowStatus.storage ||
              (storage
                ? storageReachable === false
                  ? { type: "error", label: "Unreachable" }
                  : { type: "success", label: "Active" }
                : null)
            }
          />
        </div>
      </div>
      <RemoteChannelSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onChanged={() => onMutated?.()}
      />
    </div>
  );
});

export default ServicesTab;

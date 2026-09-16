import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Clapper,
  Database,
  LoaderCircle,
  SatelliteDish,
} from "../../icons/lucide.js";
import { api } from "./adminShared.js";
import { SectionHeading } from "./AdminCommon.jsx";

// ─── Status badge — mirrors ActionsTab ───────────────────────────────────────

function StatusBadge({ status }) {
  if (!status) return null;
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
  { data, onSetupRemoteChannel },
  ref,
) {
  const [rowStatus, setRowStatus] = useState({});
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

  const remoteDescription = remoteChannel?.enabled
    ? `Enabled${remoteChannel.telegramConfigured ? " · Telegram linked" : " · Songbird only"}`
    : "Disabled — set up to link Telegram.";

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
            icon={SatelliteDish}
            iconAnim="icon-anim-sway"
            label="Remote channel"
            description={remoteDescription}
            onClick={() => onSetupRemoteChannel?.()}
            status={
              rowStatus.remote ||
              (remoteChannel
                ? remoteChannel.enabled
                  ? { type: "success", label: "Active" }
                  : { type: "error", label: "Inactive" }
                : null)
            }
          />
          <ServiceRow
            icon={Database}
            iconAnim="icon-anim-drop"
            label="Storage"
            description={`Driver: ${storage?.driver || "local"}`}
            onClick={() => flashStatus("storage", "success", "Active")}
            status={rowStatus.storage || (storage ? { type: "success", label: "Active" } : null)}
          />
        </div>
      </div>
    </div>
  );
});

export default ServicesTab;

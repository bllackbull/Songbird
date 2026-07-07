import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { apiFetch } from "../../api/chatApi.js";
import { fetchAppInfo, checkAppVersion } from "../../api/appMetaApi.js";
import {
  AlertCircle,
  Brush,
  Check,
  HardDriveDownload,
  HardDriveUpload,
  LoaderCircle,
  MessageCircleX,
  Power,
  Refresh,
  Rotate,
  Trash,
} from "../../icons/lucide.js";
import { api } from "./adminShared.js";
import { TypedConfirmModal } from "./AdminCommon.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";

// ─── Status badge — shown on the right side of an action row ────────────────

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

// ─── Action row — the row itself is the button ────────────────────────────────

function ActionRow({
  icon: Icon,
  iconAnim = "icon-anim-sway",
  label,
  description,
  onClick,
  disabled = false,
  status = null,
  danger = false,
}) {
  const busy = status?.type === "busy";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex h-full w-full flex-col items-start gap-2 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        danger
          ? "border-rose-200/70 bg-rose-50/40 hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/4 dark:hover:bg-rose-500/10"
          : "border-emerald-200/70 bg-white/90 hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-slate-950/50 dark:hover:bg-emerald-500/5"
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center ${
            danger
              ? "text-rose-500 dark:text-rose-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <Icon size={22} className={iconAnim} />
        </div>
        {status && <div className="shrink-0 pt-1"><StatusBadge status={status} /></div>}
      </div>
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold ${
            danger
              ? "text-rose-700 dark:text-rose-300"
              : "text-slate-700 dark:text-slate-200"
          }`}
        >
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

// ─── Check for updates row — has its own dynamic status trailing badge ───────

function CheckUpdateRow({ appInfo }) {
  const [status, setStatus] = useState(null);
  const resetRef = useRef(null);
  const versionLabel = String(appInfo?.version || "Unknown").trim() || "Unknown";

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  const scheduleReset = () => {
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setStatus(null), 3500);
  };

  const check = async () => {
    if (resetRef.current) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
    setStatus({ type: "busy", label: "Checking…" });
    try {
      const payload = await checkAppVersion(appInfo);
      const s = payload?.status || "up-to-date";
      setStatus(
        s === "error"
          ? { type: "error", label: "Check failed" }
          : s === "update-available"
            ? { type: "success", label: "Update available" }
            : { type: "success", label: "Up to date" },
      );
    } catch {
      setStatus({ type: "error", label: "Check failed" });
    }
    scheduleReset();
  };

  return (
    <ActionRow
      icon={Refresh}
      iconAnim="icon-anim-spin-full"
      label="Check for updates"
      description={`Current version: ${versionLabel}`}
      onClick={check}
      status={status}
    />
  );
}

const ActionsTab = forwardRef(function ActionsTab(_props, ref) {
  const [appInfo, setAppInfo] = useState(null);
  const [rowStatus, setRowStatus] = useState({});
  const statusTimers = useRef({});

  const [pendingFile, setPendingFile] = useState(null);
  const [serviceAction, setServiceAction] = useState(null);
  const [danger, setDanger] = useState(null);
  const [vacuumConfirmOpen, setVacuumConfirmOpen] = useState(false);
  const fileRef = useRef(null);

  useEffect(
    () => () => {
      Object.values(statusTimers.current).forEach((t) => clearTimeout(t));
    },
    [],
  );

  // Set a transient status badge on a row. Non-"busy" statuses auto-clear.
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

  const loadAppInfo = useCallback(() => {
    fetchAppInfo()
      .then((r) => r.json())
      .then((d) => setAppInfo(d))
      .catch(() => {});
  }, []);

  useEffect(() => { loadAppInfo(); }, [loadAppInfo]);

  useImperativeHandle(ref, () => ({ refresh: loadAppInfo }), [loadAppInfo]);

  const confirmVacuum = async () => {
    flashStatus("vacuum", "busy", "Vacuuming…");
    try {
      const r = await api.post("/api/admin/maintenance/vacuum", {});
      flashStatus("vacuum", r.ok ? "success" : "error", r.ok ? "Vacuumed" : "Failed");
    } catch {
      flashStatus("vacuum", "error", "Failed");
    } finally {
      setVacuumConfirmOpen(false);
    }
  };

  const downloadDb = () => {
    flashStatus("backup", "busy", "Downloading…");
    window.location.href = "/api/admin/maintenance/download-db";
    // The browser handles the actual download; there's no completion event
    // to await, so flip to a success state shortly after triggering it.
    setTimeout(() => flashStatus("backup", "success", "Saved"), 900);
  };

  const onFilePicked = (e) => {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    if (f) setPendingFile(f);
  };

  const confirmRestore = async () => {
    if (!pendingFile) return;
    flashStatus("restore", "busy", "Restoring…");
    try {
      const form = new FormData();
      form.append("database", pendingFile);
      const r = await apiFetch("/api/admin/maintenance/restore", {
        method: "POST",
        body: form,
      });
      flashStatus("restore", r.ok ? "success" : "error", r.ok ? "Restored" : "Failed");
    } catch {
      flashStatus("restore", "error", "Failed");
    } finally {
      setPendingFile(null);
    }
  };

  const confirmServiceAction = async () => {
    const action = serviceAction;
    if (!action) return;
    const key = action === "restart" ? "restart" : "stop";
    flashStatus(key, "busy", action === "restart" ? "Restarting…" : "Stopping…");
    try {
      await api.post(`/api/admin/service/${action}`, {});
      flashStatus(
        key,
        "success",
        action === "restart" ? "Restarting" : "Stopped",
        6000,
      );
    } catch {
      flashStatus(key, "error", "Failed");
    } finally {
      setServiceAction(null);
    }
  };

  const confirmDanger = async () => {
    if (!danger) return;
    flashStatus(danger.key, "busy", danger.busyLabel);
    try {
      const r = await api.post(danger.endpoint, { confirm: danger.phrase });
      flashStatus(danger.key, r.ok ? "success" : "error", r.ok ? danger.doneLabel : "Failed");
    } catch {
      flashStatus(danger.key, "error", "Failed");
    } finally {
      setDanger(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* System */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          System
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <CheckUpdateRow appInfo={appInfo} />
          <ActionRow
            icon={Rotate}
            iconAnim="icon-anim-spin-full"
            label="Restart service"
            description="Briefly interrupts the app while the service restarts."
            onClick={() => setServiceAction("restart")}
            status={rowStatus.restart}
          />
          <ActionRow
            icon={Power}
            iconAnim="icon-anim-beat"
            label="Stop service"
            description="Takes the app offline until restarted from the server."
            onClick={() => setServiceAction("stop")}
            status={rowStatus.stop}
            danger
          />
        </div>
      </div>

      {/* Database */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Database Maintenance
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ActionRow
            icon={HardDriveDownload}
            iconAnim="icon-anim-drop"
            label="Backup database"
            description="Download the database file to your device."
            onClick={downloadDb}
            status={rowStatus.backup}
          />
          <ActionRow
            icon={HardDriveUpload}
            iconAnim="icon-anim-lift"
            label="Restore database"
            description="Replace the current database by uploading a backup file."
            onClick={() => fileRef.current?.click()}
            status={rowStatus.restore}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".db,application/x-sqlite3,application/vnd.sqlite3"
            onChange={onFilePicked}
            className="hidden"
          />
          <ActionRow
            icon={Brush}
            iconAnim="icon-anim-wiggle"
            label="Vacuum database"
            description="Reclaim unused space and defragment the DB file."
            onClick={() => setVacuumConfirmOpen(true)}
            status={rowStatus.vacuum}
          />
        </div>
      </div>

      {/* Danger zone */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-rose-400 dark:text-rose-400/80">
          Danger Zone
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <ActionRow
            icon={MessageCircleX}
            iconAnim="icon-anim-sway"
            label="Clear all messages"
            description="Permanently delete every message and uploaded file. Users and chats are kept."
            onClick={() =>
              setDanger({
                key: "clearMessages",
                title: "Clear all messages",
                message:
                  "This permanently deletes every message and uploaded file across all chats. Users and chats remain. This cannot be undone.",
                phrase: "clear messages",
                endpoint: "/api/admin/maintenance/clear-messages",
                busyLabel: "Clearing…",
                doneLabel: "Cleared",
              })
            }
            status={rowStatus.clearMessages}
            danger
          />
          <ActionRow
            icon={Trash}
            iconAnim="icon-anim-slide"
            label="Reset database"
            description="Wipe everything — all users, chats, messages, sessions, and files. The schema is kept."
            onClick={() =>
              setDanger({
                key: "resetDb",
                title: "Reset database",
                message:
                  "This permanently deletes ALL users, chats, messages, sessions, and files. The app will be empty afterwards. This cannot be undone.",
                phrase: "reset everything",
                endpoint: "/api/admin/maintenance/reset",
                busyLabel: "Resetting…",
                doneLabel: "Reset",
              })
            }
            status={rowStatus.resetDb}
            danger
          />
        </div>
      </div>

      <ConfirmModal
        open={vacuumConfirmOpen}
        title="Vacuum database"
        message="Run VACUUM now? This rewrites the database file to reclaim space."
        confirmLabel={rowStatus.vacuum?.type === "busy" ? "Vacuuming…" : "Vacuum"}
        busy={rowStatus.vacuum?.type === "busy"}
        onConfirm={confirmVacuum}
        onClose={() => {
          if (rowStatus.vacuum?.type !== "busy") setVacuumConfirmOpen(false);
        }}
      />

      <ConfirmModal
        open={Boolean(pendingFile)}
        title="Restore database"
        message={
          pendingFile
            ? `Replace the current database with "${pendingFile.name}"? This overwrites all existing data and cannot be undone.`
            : ""
        }
        confirmLabel={rowStatus.restore?.type === "busy" ? "Restoring…" : "Restore"}
        busy={rowStatus.restore?.type === "busy"}
        onConfirm={confirmRestore}
        onClose={() => {
          if (rowStatus.restore?.type !== "busy") setPendingFile(null);
        }}
      />

      <ConfirmModal
        open={Boolean(serviceAction)}
        title={serviceAction === "stop" ? "Stop service" : "Restart service"}
        message={
          serviceAction === "stop"
            ? "Stop the Songbird service? The app will go offline until it is started again from the server."
            : "Restart the Songbird service? The app will be briefly unavailable while it restarts."
        }
        confirmLabel={
          rowStatus[serviceAction]?.type === "busy"
            ? "Working…"
            : serviceAction === "stop"
              ? "Stop"
              : "Restart"
        }
        busy={rowStatus[serviceAction]?.type === "busy"}
        onConfirm={confirmServiceAction}
        onClose={() => {
          if (rowStatus[serviceAction]?.type !== "busy") setServiceAction(null);
        }}
      />

      <TypedConfirmModal
        open={Boolean(danger)}
        title={danger?.title || ""}
        message={danger?.message || ""}
        phrase={danger?.phrase || ""}
        busy={danger ? rowStatus[danger.key]?.type === "busy" : false}
        onConfirm={confirmDanger}
        onClose={() => {
          if (!danger || rowStatus[danger.key]?.type !== "busy") setDanger(null);
        }}
      />
    </div>
  );
});

export default ActionsTab;

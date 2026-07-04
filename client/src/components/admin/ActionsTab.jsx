import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/chatApi.js";
import { fetchAppInfo, checkAppVersion } from "../../api/appMetaApi.js";
import {
  AlertCircle,
  AppWindow,
  Brush,
  Check,
  Database,
  HardDriveDownload,
  HardDriveUpload,
  LoaderCircle,
  MessageCircleX,
  Power,
  Refresh,
  Rotate,
  Trash,
  Wrench,
} from "../../icons/lucide.js";
import {
  api,
  cardCls,
  btnPrimary,
  btnSecondary,
  btnDanger,
} from "./adminShared.js";
import { TypedConfirmModal } from "./AdminCommon.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";

// Combined system card — app version (with check-for-update) + service controls.
function SystemCard({ appInfo, onRestart, onStop }) {
  const [state, setState] = useState({ status: "", latestVersion: "" });
  const resetRef = useRef(null);
  const versionLabel =
    String(appInfo?.version || "Unknown").trim() || "Unknown";

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  const scheduleReset = () => {
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(
      () => setState({ status: "", latestVersion: "" }),
      3500,
    );
  };

  const check = async () => {
    if (resetRef.current) {
      clearTimeout(resetRef.current);
      resetRef.current = null;
    }
    setState({ status: "checking", latestVersion: "" });
    try {
      const payload = await checkAppVersion(appInfo);
      setState({
        status: payload?.status || "up-to-date",
        latestVersion: String(payload?.latestVersion || ""),
      });
    } catch {
      setState({ status: "error", latestVersion: "" });
    }
    scheduleReset();
  };

  const versionBtn = (() => {
    if (state.status === "checking")
      return {
        cls: "border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 cursor-wait",
        label: "Checking",
        icon: <LoaderCircle size={13} className="animate-spin" />,
      };
    if (state.status === "error")
      return {
        cls: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200",
        label: "Check failed",
        icon: <AlertCircle size={13} />,
      };
    if (state.status === "update-available")
      return {
        cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
        label: "Update available",
        icon: <AlertCircle size={13} />,
      };
    if (state.status === "up-to-date")
      return {
        cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
        label: "Up to date",
        icon: <Check size={13} />,
      };
    return {
      cls: "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-white/5",
      label: versionLabel,
      icon: <Refresh size={13} />,
    };
  })();

  return (
    <div className={cardCls + " settings-row flex items-start gap-3 p-4"}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
        <AppWindow size={22} className="icon-anim-sway" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Service
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          Check for updates, or restart and stop the Songbird service.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={check}
            disabled={state.status === "checking"}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${versionBtn.cls}`}
          >
            {versionBtn.icon} {versionBtn.label}
          </button>
          <button type="button" onClick={onRestart} className={btnPrimary}>
            <Refresh size={13} className="icon-anim-spin-full" /> Restart
          </button>
          <button type="button" onClick={onStop} className={btnDanger}>
            <Power size={13} className="icon-anim-beat" /> Stop
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActionsTab() {
  const [vacuumBusy, setVacuumBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [toast, setToast] = useState("");
  const [appInfo, setAppInfo] = useState(null);
  const [serviceAction, setServiceAction] = useState(null);
  const [servicePending, setServicePending] = useState(false);
  const [danger, setDanger] = useState(null);
  const [dangerBusy, setDangerBusy] = useState(false);
  const fileRef = useRef(null);

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  };

  useEffect(() => {
    let cancelled = false;
    fetchAppInfo()
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAppInfo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const runVacuum = async () => {
    if (
      !confirm(
        "Run VACUUM now? This rewrites the database file to reclaim space.",
      )
    )
      return;
    setVacuumBusy(true);
    try {
      const r = await api.post("/api/admin/maintenance/vacuum", {});
      flash(r.ok ? "Database vacuumed successfully." : "Vacuum failed.");
    } catch {
      flash("Vacuum failed.");
    } finally {
      setVacuumBusy(false);
    }
  };

  const downloadDb = () => {
    window.location.href = "/api/admin/maintenance/download-db";
  };

  const onFilePicked = (e) => {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    if (f) setPendingFile(f);
  };

  const confirmRestore = async () => {
    if (!pendingFile) return;
    setRestoring(true);
    try {
      const form = new FormData();
      form.append("database", pendingFile);
      const r = await apiFetch("/api/admin/maintenance/restore", {
        method: "POST",
        body: form,
      });
      const d = await r.json().catch(() => ({}));
      flash(
        r.ok ? "Database restored successfully." : d.error || "Restore failed.",
      );
    } catch {
      flash("Restore failed.");
    } finally {
      setRestoring(false);
      setPendingFile(null);
    }
  };

  const confirmServiceAction = async () => {
    const action = serviceAction;
    if (!action) return;
    setServicePending(true);
    try {
      await api.post(`/api/admin/service/${action}`, {});
      flash(
        action === "restart"
          ? "Restarting the service… the app may be briefly unavailable."
          : "Stopping the service… the app will become unavailable.",
      );
    } catch {
      flash(`Failed to ${action} the service.`);
    } finally {
      setServicePending(false);
      setServiceAction(null);
    }
  };

  const confirmDanger = async () => {
    if (!danger) return;
    setDangerBusy(true);
    try {
      const r = await api.post(danger.endpoint, { confirm: danger.phrase });
      const d = await r.json().catch(() => ({}));
      flash(r.ok ? danger.success : d.error || "Action failed.");
    } catch {
      flash("Action failed.");
    } finally {
      setDangerBusy(false);
      setDanger(null);
    }
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          {toast}
        </div>
      )}

      {/* System */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          System
        </h2>
        <SystemCard
          appInfo={appInfo}
          onRestart={() => setServiceAction("restart")}
          onStop={() => setServiceAction("stop")}
        />
      </div>

      {/* Database */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Database Maintenance
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className={cardCls + " settings-row flex items-start gap-3 p-4"}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Database size={22} className="icon-anim-bob" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Backup &amp; restore
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                Download the database to your device, or restore by uploading a
                backup file.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadDb}
                  className={btnPrimary}
                >
                  <HardDriveDownload size={13} className="icon-anim-drop" />{" "}
                  Backup
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={btnSecondary}
                >
                  <HardDriveUpload size={13} className="icon-anim-lift" />{" "}
                  Restore
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".db,application/x-sqlite3,application/vnd.sqlite3"
                  onChange={onFilePicked}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          <div className={cardCls + " settings-row flex items-start gap-3 p-4"}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Brush size={22} className="icon-anim-wiggle" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Vacuum database
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                Reclaim unused space and defragment the DB file.
              </p>
              <button
                type="button"
                onClick={runVacuum}
                disabled={vacuumBusy}
                className={btnPrimary + " mt-3"}
              >
                <Wrench size={13} className="icon-anim-wiggle" />{" "}
                {vacuumBusy ? "Running…" : "Run vacuum"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-rose-400 dark:text-rose-400/80">
          Danger Zone
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="settings-row flex items-start gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-500/30 dark:bg-rose-500/[0.04]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center text-rose-500 dark:text-rose-400">
              <MessageCircleX size={22} className="icon-anim-sway" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Clear all messages
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                Permanently delete every message and uploaded file. Users and
                chats are kept.
              </p>
              <button
                type="button"
                onClick={() =>
                  setDanger({
                    title: "Clear all messages",
                    message:
                      "This permanently deletes every message and uploaded file across all chats. Users and chats remain. This cannot be undone.",
                    phrase: "clear messages",
                    endpoint: "/api/admin/maintenance/clear-messages",
                    success: "All messages and files cleared.",
                  })
                }
                className={btnDanger + " mt-3"}
              >
                <Trash size={13} className="icon-anim-slide" /> Clear messages
              </button>
            </div>
          </div>

          <div className="settings-row flex items-start gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-500/30 dark:bg-rose-500/[0.04]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center text-rose-500 dark:text-rose-400">
              <Rotate size={22} className="icon-anim-wiggle" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Reset database
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                Wipe everything — all users, chats, messages, sessions, and
                files. The schema is kept.
              </p>
              <button
                type="button"
                onClick={() =>
                  setDanger({
                    title: "Reset database",
                    message:
                      "This permanently deletes ALL users, chats, messages, sessions, and files. The app will be empty afterwards. This cannot be undone.",
                    phrase: "reset everything",
                    endpoint: "/api/admin/maintenance/reset",
                    success: "Database reset. The app is now empty.",
                  })
                }
                className={btnDanger + " mt-3"}
              >
                <Trash size={13} className="icon-anim-slide" /> Reset database
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(pendingFile)}
        title="Restore database"
        message={
          pendingFile
            ? `Replace the current database with "${pendingFile.name}"? This overwrites all existing data and cannot be undone.`
            : ""
        }
        confirmLabel={restoring ? "Restoring…" : "Restore"}
        busy={restoring}
        onConfirm={confirmRestore}
        onClose={() => {
          if (!restoring) setPendingFile(null);
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
          servicePending
            ? "Working…"
            : serviceAction === "stop"
              ? "Stop"
              : "Restart"
        }
        busy={servicePending}
        onConfirm={confirmServiceAction}
        onClose={() => {
          if (!servicePending) setServiceAction(null);
        }}
      />

      <TypedConfirmModal
        open={Boolean(danger)}
        title={danger?.title || ""}
        message={danger?.message || ""}
        phrase={danger?.phrase || ""}
        busy={dangerBusy}
        onConfirm={confirmDanger}
        onClose={() => {
          if (!dangerBusy) setDanger(null);
        }}
      />
    </div>
  );
}

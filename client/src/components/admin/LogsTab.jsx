import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Ban,
  Brush,
  CirclePlus,
  HardDriveDownload,
  HardDriveUpload,
  History,
  KeyRound,
  MessageCircleX,
  Pencil,
  Plus,
  Power,
  Refresh,
  Rotate,
  Search,
  Settings,
  Tag,
  Trash,
  UserMinus,
  UserPlus,
} from "../../icons/lucide.js";
import { api, cardCls, inputSmCls, btnDanger, fmtDateTime, searchIconCls } from "./adminShared.js";
import { LoadingRows, EmptyState } from "./AdminCommon.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import { hasPersian } from "../../utils/fontUtils.js";

const LOG_ACTION_META = {
  "user.create":         { label: "User created",      color: "emerald", icon: UserPlus },
  "user.edit":           { label: "User edited",       color: "slate",   icon: Pencil },
  "user.delete":         { label: "User deleted",      color: "rose",    icon: Trash },
  "user.ban":            { label: "User banned",       color: "rose",    icon: Ban },
  "user.unban":          { label: "User unbanned",     color: "emerald", icon: CirclePlus },
  "user.role":           { label: "Role changed",      color: "emerald", icon: Tag },
  "user.reset_password": { label: "Password reset",    color: "slate",  icon: KeyRound },
  "chat.create":         { label: "Chat created",      color: "emerald", icon: Plus },
  "chat.edit":           { label: "Chat edited",       color: "slate",   icon: Pencil },
  "chat.delete":         { label: "Chat deleted",      color: "rose",    icon: Trash },
  "chat.member_add":     { label: "Member added",      color: "emerald", icon: UserPlus },
  "chat.member_remove":  { label: "Member removed",    color: "rose",  icon: UserMinus },
  "chat.member_role":    { label: "Member role",       color: "slate",   icon: Tag },
  "db.vacuum":           { label: "DB vacuumed",       color: "emerald", icon: Brush },
  "db.clear_messages":   { label: "Messages cleared",  color: "rose",    icon: MessageCircleX },
  "db.reset":            { label: "DB reset",          color: "rose",    icon: Rotate },
  "db.backup":           { label: "DB downloaded",     color: "emerald", icon: HardDriveDownload },
  "db.restore":          { label: "DB restored",       color: "slate",   icon: HardDriveUpload },
  "service.restart":     { label: "Service restarted", color: "emerald", icon: Refresh },
  "service.stop":        { label: "Service stopped",   color: "rose",    icon: Power },
  "logs.clear":          { label: "Logs cleared",      color: "rose",    icon: Trash },
  "settings.update":     { label: "Setting updated",   color: "emerald", icon: Settings },
  "settings.reset":      { label: "Setting reset",     color: "slate",   icon: Rotate },
};

const LOG_COLORS = {
  emerald: { icon: "text-emerald-600 dark:text-emerald-400" },
  rose:    { icon: "text-rose-500 dark:text-rose-400" },
  slate:   { icon: "text-slate-500 dark:text-slate-400" },
};

const LOG_SOURCES = [
  { id: "admin",     label: "Admin Panel" },
  { id: "installer", label: "Installer" },
  { id: "service",   label: "Service" },
  { id: "nginx",     label: "Nginx" },
];

const AdminLogView = forwardRef(function AdminLogView({ currentUser }, ref) {
  const [logs, setLogs]               = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [search, setSearch]           = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing]       = useState(false);
  const debounceRef = useRef(null);
  const searchRef = useRef(search);
  useEffect(() => { searchRef.current = search; });

  const isOwner = currentUser?.role === "owner";

  const load = useCallback(async () => {
    const q = new URLSearchParams({ limit: 300, search: searchRef.current });
    try { const d = await api.get(`/api/admin/logs?${q}`); setLogs(d.logs || []); } catch {}
    setInitialized(true);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search, load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  const clearLogs = async () => {
    setClearing(true);
    try { await api.delete("/api/admin/logs"); await load(); }
    finally { setClearing(false); setConfirmOpen(false); }
  };

  const searchHasPersian = hasPersian(search);

  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2 sm:flex-wrap">
        <label className="group relative block min-w-0 flex-1 sm:min-w-40">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Search size={16} className={searchIconCls} />
          </span>
          <input type="text" placeholder="Search logs…" value={search} onChange={(e) => setSearch(e.target.value)}
            lang={searchHasPersian ? "fa" : "en"} dir={searchHasPersian ? "rtl" : "ltr"}
            className={inputSmCls + " pl-8" + (searchHasPersian ? " font-fa text-right" : "")}
            style={{ unicodeBidi: "plaintext" }} />
        </label>
        {isOwner && (
          <button type="button" onClick={() => setConfirmOpen(true)} title="Clear"
            className={btnDanger + " w-9 shrink-0 justify-center px-0 sm:w-auto sm:justify-start sm:px-3"}>
            <Trash size={16} className="icon-anim-slide shrink-0" /> <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Clear admin logs"
        message="Clear all admin logs? This cannot be undone."
        confirmLabel="Clear"
        busy={clearing}
        onConfirm={clearLogs}
        onClose={() => setConfirmOpen(false)}
      />

      {!initialized ? <LoadingRows /> : logs.length === 0 ? <EmptyState message="No log entries." /> : (
        <div className={"overflow-hidden " + cardCls}>
          {logs.map((entry, i) => {
            const meta = LOG_ACTION_META[entry.action] || { label: entry.action, color: "slate", icon: History };
            const Icon = meta.icon || History;
            const colors = LOG_COLORS[meta.color] || LOG_COLORS.slate;
            const detailText = [entry.targetLabel, entry.details].filter(Boolean).join(" · ");
            const detailHasPersian = hasPersian(detailText);
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i < logs.length - 1 ? "border-b border-slate-100 dark:border-white/5" : ""}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center ${colors.icon}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{meta.label}</span>
                    {entry.status === "error" && <span className="text-[10px] font-semibold text-rose-500">failed</span>}
                  </div>
                  <p className={`mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500 ${detailHasPersian ? "font-fa" : ""}`} dir="auto">
                    {detailText}
                    {detailText ? " · " : ""}
                    {entry.actorUsername ? `@${entry.actorUsername}` : "system"} · {fmtDateTime(entry.ts)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

const SystemLogView = forwardRef(function SystemLogView({ source }, ref) {
  const [data, setData]               = useState(null);
  const [initialized, setInitialized] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.get(`/api/admin/logs/${source}`); setData(d); }
    catch { setData({ available: false, lines: [], reason: "Failed to load." }); }
    setInitialized(true);
  }, [source]);

  useEffect(() => { setInitialized(false); load(); }, [load]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  return (
    <div className="space-y-3">
      {!initialized ? <LoadingRows /> : !data?.available ? (
        <EmptyState message={data?.reason || "Logs not available."} />
      ) : data.lines.length === 0 ? (
        <EmptyState message="Log is empty." />
      ) : (
        <div className={"overflow-hidden " + cardCls}>
          <pre className="app-scroll max-h-[60vh] overflow-auto p-4 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
            {data.lines.join("\n")}
          </pre>
        </div>
      )}
      {data?.source && <p className="text-[11px] text-slate-400 dark:text-slate-500">Source: <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-white/10">{data.source}</code></p>}
    </div>
  );
});

const LogsTab = forwardRef(function LogsTab({ currentUser }, ref) {
  const [source, setSource] = useState("admin");
  const viewRef = useRef(null);

  useImperativeHandle(ref, () => ({ refresh: () => viewRef.current?.refresh() }), []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {LOG_SOURCES.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => setSource(id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              source === id
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
            }`}>
            {label}
          </button>
        ))}
      </div>
      {source === "admin" ? <AdminLogView ref={viewRef} currentUser={currentUser} /> : <SystemLogView ref={viewRef} source={source} key={source} />}
    </div>
  );
});

export default LogsTab;

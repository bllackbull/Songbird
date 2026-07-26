import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
  Settings,
  Tag,
  Trash,
  UserMinus,
  UserPlus,
} from "../../icons/lucide.js";
import { api, cardCls, btnDanger, fmtDateTime, DEFAULT_PAGE_SIZE } from "./adminShared.js";
import { LoadingRows, EmptyState, Pagination, TabToolbar, TabSearchInput } from "./AdminCommon.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import { hasPersian } from "../../utils/fontUtils.js";

const LOG_ACTION_META = {
  "user.create":         { label: "User created",      color: "emerald", icon: UserPlus },
  "user.edit":           { label: "User edited",       color: "slate",   icon: Pencil },
  "user.delete":         { label: "User deleted",      color: "rose",    icon: Trash },
  "user.ban":            { label: "User banned",       color: "rose",    icon: Ban },
  "user.unban":          { label: "User unbanned",     color: "emerald", icon: CirclePlus },
  "user.role":           { label: "Role changed",      color: "emerald", icon: Tag },
  "user.reset_password": { label: "Password reset",    color: "slate",   icon: KeyRound },
  "chat.create":         { label: "Chat created",      color: "emerald", icon: Plus },
  "chat.edit":           { label: "Chat edited",       color: "slate",   icon: Pencil },
  "chat.delete":         { label: "Chat deleted",      color: "rose",    icon: Trash },
  "chat.member_add":     { label: "Member added",      color: "emerald", icon: UserPlus },
  "chat.member_remove":  { label: "Member removed",    color: "rose",    icon: UserMinus },
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

// All possible log sources in display order.
const ALL_LOG_SOURCES = [
  { id: "admin",     label: "Admin Panel" },
  { id: "installer", label: "Installer" },
  { id: "service",   label: "Service" },
  { id: "nginx",     label: "Nginx" },
];

// ─── Admin audit log ──────────────────────────────────────────────────────────

// `cachedData`  — { logs, total } from the parent cache (may be null on first load)
// `onFetched`   — parent callback to store fresh data: (page, pageSize, search, data) => void
// `active`      — whether this tab is visible
const AdminLogView = forwardRef(function AdminLogView({ currentUser, active = true, cachedData, onFetched }, ref) {
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing]       = useState(false);
  const debounceRef  = useRef(null);
  const requestIdRef = useRef(0);

  const isOwner = currentUser?.role === "owner";

  // Derive display data from cache. While the first fetch is in-flight,
  // cachedData is null → show LoadingRows. After that, stale data stays
  // visible while a background refresh runs (loading=true but data shown).
  const logs      = cachedData?.logs  ?? null;
  const total     = cachedData?.total ?? 0;
  const initialized = logs !== null;

  const trimmedSearch = search.trim();
  const fetchPage = useCallback(async (targetPage) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const offset = (Math.max(1, targetPage) - 1) * pageSize;
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
    if (trimmedSearch) params.set("search", trimmedSearch);
    try {
      const data = await api.get(`/api/admin/logs?${params.toString()}`);
      if (requestId !== requestIdRef.current) return;
      onFetched?.({ logs: data.logs ?? [], total: Number(data.total || 0) });
    } catch {
      // Leave stale cache intact on error
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [trimmedSearch, pageSize, onFetched]);

  useEffect(() => {
    if (!active) return undefined;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPage(page), 250);
    return () => clearTimeout(debounceRef.current);
  }, [active, page, fetchPage]);

  const refresh = useCallback(() => fetchPage(page), [fetchPage, page]);
  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  const changeSearch   = (value) => { setSearch(value);   setPage(1); };
  const changePageSize = (value) => { setPageSize(value); setPage(1); };

  const clearLogs = async () => {
    setClearing(true);
    try { await api.delete("/api/admin/logs"); setPage(1); refresh(); }
    finally { setClearing(false); setConfirmOpen(false); }
  };

  return (
    <div className="space-y-3">
      <TabToolbar>
        <TabSearchInput value={search} onChange={changeSearch} placeholder="Search logs…" />
        {isOwner && (
          <button type="button" onClick={() => setConfirmOpen(true)} title="Clear"
            className={btnDanger + " w-9 shrink-0 justify-center px-0 sm:w-auto sm:justify-start sm:px-3"}>
            <Trash size={16} className="icon-anim-slide shrink-0" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
      </TabToolbar>

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
        <>
          <div className={"overflow-hidden " + cardCls}>
            {logs.map((entry, i) => {
              const meta   = LOG_ACTION_META[entry.action] || { label: entry.action, color: "slate", icon: History };
              const Icon   = meta.icon || History;
              const colors = LOG_COLORS[meta.color] || LOG_COLORS.slate;
              const detailText      = [entry.targetLabel, entry.details].filter(Boolean).join(" · ");
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
                    <p className={`mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500 ${detailHasPersian ? "font-fa" : ""}`} dir="ltr">
                      <bdi>{detailText}</bdi>
                      {detailText ? " · " : ""}
                      {entry.actorUsername ? `@${entry.actorUsername}` : "system"} · {fmtDateTime(entry.ts)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage}
            onPageSizeChange={changePageSize} busy={loading} />
        </>
      )}
    </div>
  );
});

// ─── System log viewer (installer / service / nginx) ─────────────────────────

// `cachedData`  — { available, lines, reason, source } from parent cache (null = not yet loaded)
// `onFetched`   — parent callback to store fresh data: (data) => void
const SystemLogView = forwardRef(function SystemLogView({ source, cachedData, onFetched }, ref) {
  const logContainerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/api/admin/logs/${source}`);
      onFetched?.(d);
    } catch {
      onFetched?.({ available: false, lines: [], reason: "Failed to load." });
    }
  }, [source, onFetched]);

  // Fetch on mount only if we have no cached data yet.
  useEffect(() => {
    if (!cachedData) load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Scroll to bottom whenever fresh lines arrive.
  useEffect(() => {
    if (cachedData?.lines?.length > 0 && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [cachedData]);

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  // Show LoadingRows only on the very first load (no cached data yet).
  const initialized = cachedData !== null;

  return (
    <div className="space-y-3">
      {!initialized ? <LoadingRows /> : !cachedData?.available ? (
        <EmptyState message={cachedData?.reason || "Logs not available."} />
      ) : cachedData.lines.length === 0 ? (
        <EmptyState message="Log is empty." />
      ) : (
        <div className={"overflow-hidden " + cardCls}>
          <pre ref={logContainerRef} className="app-scroll max-h-[40vh] overflow-auto p-3 text-[10px] leading-relaxed text-slate-600 sm:max-h-[60vh] sm:p-4 sm:text-[11px] dark:text-slate-300">
            {cachedData.lines.join("\n")}
          </pre>
        </div>
      )}
      {cachedData?.source && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Source: <code className="rounded-sm bg-slate-100 px-1 py-0.5 dark:bg-white/10">{cachedData.source}</code>
        </p>
      )}
    </div>
  );
});

// ─── Tab container ────────────────────────────────────────────────────────────

// Module-level store so cache survives tab navigation (same pattern as useAdminCache).
const _logCache = {};

const LogsTab = forwardRef(function LogsTab({ currentUser, active = true }, ref) {
  const [source, setSource]                 = useState("admin");
  const [availableSources, setAvailableSources] = useState(null); // null = probing

  // Per-source cache: { admin: { logs, total } | null, installer: {...} | null, ... }
  // null = not yet fetched; populated value = last-known data (shown instantly on revisit).
  const [sourceCache, setSourceCache] = useState(() => ({
    admin:     _logCache.admin     ?? null,
    installer: _logCache.installer ?? null,
    service:   _logCache.service   ?? null,
    nginx:     _logCache.nginx     ?? null,
    sources:   _logCache.sources   ?? null, // sources probe result
  }));

  // Keep module store in sync so data survives unmount/remount.
  const persistCache = useCallback((key, data) => {
    _logCache[key] = data;
    setSourceCache((prev) => ({ ...prev, [key]: data }));
  }, []);

  const viewRef = useRef(null);

  useImperativeHandle(ref, () => ({ refresh: () => viewRef.current?.refresh() }), []);

  // Probe which log sources exist. Uses cached result if available; otherwise
  // fetches once and caches permanently for the session.
  useEffect(() => {
    if (sourceCache.sources !== null) {
      // Restore from cache — re-apply availability and ensure source is valid.
      const available = sourceCache.sources;
      if (!available.has(source)) setSource("admin");
      return;
    }
    api.get("/api/admin/logs/sources")
      .then((data) => {
        const available = new Set(
          Object.entries(data.sources ?? {})
            .filter(([, v]) => v?.available)
            .map(([k]) => k),
        );
        available.add("admin"); // always present
        persistCache("sources", available);
        setAvailableSources(available);
        if (!available.has(source)) setSource("admin");
      })
      .catch(() => {
        const fallback = new Set(ALL_LOG_SOURCES.map((s) => s.id));
        persistCache("sources", fallback);
        setAvailableSources(fallback);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync availableSources state from cache on mount (when cache already populated).
  useEffect(() => {
    if (availableSources === null && sourceCache.sources !== null) {
      setAvailableSources(sourceCache.sources);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCache.sources]);

  // Stable callbacks per source so child components don't re-render on unrelated cache updates.
  const onAdminFetched   = useCallback((d) => persistCache("admin",     d), [persistCache]);
  const onInstallerFetched = useCallback((d) => persistCache("installer", d), [persistCache]);
  const onServiceFetched = useCallback((d) => persistCache("service",   d), [persistCache]);
  const onNginxFetched   = useCallback((d) => persistCache("nginx",     d), [persistCache]);

  const onFetchedBySource = useMemo(() => ({
    admin:     onAdminFetched,
    installer: onInstallerFetched,
    service:   onServiceFetched,
    nginx:     onNginxFetched,
  }), [onAdminFetched, onInstallerFetched, onServiceFetched, onNginxFetched]);

  // Show all tabs always; disable ones that aren't available in this deployment.
  const visibleSources = ALL_LOG_SOURCES.map((s) => ({
    ...s,
    disabled: availableSources !== null && !availableSources.has(s.id),
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {visibleSources.map(({ id, label, disabled }) => (
          <button key={id} type="button" onClick={() => !disabled && setSource(id)}
            disabled={disabled}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              source === id
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
            }`}>
            {label}
          </button>
        ))}
      </div>
      {source === "admin"
        ? <AdminLogView
            ref={viewRef}
            currentUser={currentUser}
            active={active && source === "admin"}
            cachedData={sourceCache.admin}
            onFetched={onAdminFetched}
          />
        : <SystemLogView
            ref={viewRef}
            source={source}
            key={source}
            cachedData={sourceCache[source] ?? null}
            onFetched={onFetchedBySource[source]}
          />
      }
    </div>
  );
});

export default LogsTab;

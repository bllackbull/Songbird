import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/chatApi.js";
import { fetchAppInfo, checkAppVersion } from "../api/appMetaApi.js";
import {
  Activity,
  AlertCircle,
  AppWindow,
  ArrowLeft,
  ArrowLeftFromLine,
  ArrowUpDown,
  ArrowRightFromLine,
  Ban,
  Check,
  ChevronDown,
  Database,
  Gauge,
  Globe,
  HardDriveDownload,
  HardDriveUpload,
  History,
  KeyRound,
  LoaderCircle,
  Lock,
  Megaphone,
  MemoryStick,
  MessageCircleMore,
  MessageCircleX,
  Moon,
  Pencil,
  Plus,
  Power,
  Refresh,
  Rotate,
  ScrollText,
  Search,
  ShieldCog,
  Sparkles,
  Sun,
  Trash,
  User,
  UserMinus,
  UserPlus,
  Users,
  Wrench,
  Close,
} from "../icons/lucide.js";

// ─── Access Guard ──────────────────────────────────────────────────────────────

export default function AdminPage({ user, onBack, isDark, toggleTheme }) {
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  if (!isAdmin) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900">
        <ShieldCog size={36} className="text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Access denied</p>
      </div>
    );
  }
  return <AdminPanelContent user={user} onBack={onBack} isDark={isDark} toggleTheme={toggleTheme} />;
}

// ─── Nav config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "users",     label: "Users",     icon: Users },
  { id: "chats",     label: "Chats",     icon: MessageCircleMore },
  { id: "actions",   label: "Actions",   icon: Wrench },
  { id: "logs",      label: "Logs",      icon: ScrollText },
];

// ─── Shared style constants ────────────────────────────────────────────────────

const cardCls    = "rounded-2xl border border-emerald-200/70 bg-white/90 dark:border-emerald-500/30 dark:bg-slate-900/50";
const inputCls   = "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
const inputSmCls = "w-full rounded-2xl border border-emerald-200/70 bg-white/90 py-2 px-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/40 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder-slate-500";
const labelCls   = "block text-xs font-semibold text-slate-600 dark:text-slate-300";
const btnPrimary = "inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 hover:shadow-[0_0_14px_rgba(16,185,129,0.3)]";
const btnSecondary = "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-white/5";
const btnDanger  = "inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400";
const iconBtn = (color = "slate") => {
  const map = {
    slate:   "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5",
    emerald: "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10",
    orange:  "border-orange-200 text-orange-500 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-400 dark:hover:bg-orange-500/10",
    rose:    "border-rose-200 text-rose-500 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10",
  };
  return `inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${map[color] || map.slate}`;
};

// ─── API helpers ───────────────────────────────────────────────────────────────

const api = {
  get:    (url)       => apiFetch(url).then(r => r.json()),
  post:   (url, body) => apiFetch(url, { method: "POST",   headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patch:  (url, body) => apiFetch(url, { method: "PATCH",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  delete: (url)       => apiFetch(url, { method: "DELETE" }),
};

// ─── Main shell ────────────────────────────────────────────────────────────────

function AdminPanelContent({ user, onBack, isDark, toggleTheme }) {
  const [tab,         setTab]         = useState("dashboard");
  const [stats,       setStats]       = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [themeAnim,   setThemeAnim]   = useState(false);
  const themeAnimRef = useRef(null);

  const refreshStats = useCallback(async () => {
    try { const d = await api.get("/api/admin/stats"); setStats(d); } catch {}
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  const handleToggleTheme = () => {
    setThemeAnim(true);
    clearTimeout(themeAnimRef.current);
    if (toggleTheme) toggleTheme();
    themeAnimRef.current = setTimeout(() => setThemeAnim(false), 520);
  };

  useEffect(() => () => clearTimeout(themeAnimRef.current), []);

  const activeTab  = TABS.find(t => t.id === tab);
  const ActiveIcon = activeTab?.icon ?? Gauge;

  // On mobile: toggle means show/hide. On desktop: toggle means expand/shrink.
  // The button lives in the sidebar header always.
  // When sidebar is expanded → show ArrowLeftFromLine (to collapse)
  // When sidebar is collapsed → the header slot still shows PanelLeftOpen so user can re-expand

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-900">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <nav className={`
        absolute inset-y-0 left-0 z-30 flex flex-col
        border-r border-slate-200/80 bg-white/95 backdrop-blur-sm
        transition-all duration-200
        dark:border-white/5 dark:bg-slate-900/95
        md:relative md:z-auto md:translate-x-0
        ${sidebarOpen ? "w-56 translate-x-0" : "w-0 -translate-x-full md:w-14 md:translate-x-0"}
      `}>

        {/* Sidebar header — always present, contains the toggle */}
        <div className={`flex h-12 shrink-0 items-center border-b border-slate-100 dark:border-white/5 ${sidebarOpen ? "justify-between px-3" : "justify-center"}`}>
          {sidebarOpen && (
            <div className="flex items-center gap-2 overflow-hidden">
              <ShieldCog size={14} className="shrink-0 text-emerald-500" />
              <span className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">Admin Panel</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Collapse" : "Expand"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-400 transition hover:border-emerald-200/60 hover:bg-emerald-50/50 hover:text-emerald-600 dark:text-slate-500 dark:hover:border-emerald-500/20 dark:hover:bg-emerald-500/5 dark:hover:text-emerald-400"
          >
            {sidebarOpen ? <ArrowLeftFromLine size={15} /> : <ArrowRightFromLine size={15} />}
          </button>
        </div>

        {/* Nav items */}
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden p-2">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setTab(id); if (window.innerWidth < 768) setSidebarOpen(false); }}
              title={!sidebarOpen ? label : undefined}
              className={`flex h-9 w-full items-center rounded-xl border transition
                ${sidebarOpen ? "gap-2.5 px-3 text-sm font-medium" : "justify-center"}
                ${tab === id
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_14px_rgba(16,185,129,0.12)] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-transparent text-slate-500 hover:border-emerald-200/60 hover:bg-emerald-50/50 hover:text-emerald-700 dark:text-slate-400 dark:hover:border-emerald-500/20 dark:hover:bg-emerald-500/5 dark:hover:text-emerald-300"
                }`}
            >
              <Icon size={15} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </button>
          ))}
        </div>

        {/* Exit button */}
        <div className="shrink-0 border-t border-slate-100 p-2 dark:border-white/5">
          <button
            type="button"
            onClick={onBack}
            title={!sidebarOpen ? "Exit" : undefined}
            className={`flex h-9 w-full items-center rounded-xl border border-transparent text-rose-500 transition
              hover:border-rose-200 hover:bg-rose-50 hover:shadow-[0_0_14px_rgba(244,63,94,0.12)]
              dark:text-rose-400 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10
              ${sidebarOpen ? "gap-2 px-3 text-sm font-medium" : "justify-center"}`}
          >
            <ArrowLeft size={15} className="shrink-0" />
            {sidebarOpen && <span className="truncate">Exit</span>}
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/80 px-3 backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/80">
          <ActiveIcon size={15} className="shrink-0 text-emerald-500" />
          <h1 className="flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
            {activeTab?.label}
          </h1>
          {/* Theme toggle — icon only */}
          <button
            type="button"
            onClick={handleToggleTheme}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700 dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
          >
            {isDark
              ? <Sun  size={15} className={`icon-anim-spin-dir  ${themeAnim ? "icon-theme-enter-sun"  : ""}`} />
              : <Moon size={15} className={`icon-anim-spin-left ${themeAnim ? "icon-theme-enter-moon" : ""}`} />
            }
          </button>
          {/* Manual refresh */}
          <button
            type="button"
            onClick={refreshStats}
            title="Refresh"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700 dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
          >
            <Refresh size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          {tab === "dashboard" && <DashboardTab stats={stats} onStatsChange={refreshStats} />}
          {tab === "users"     && <UsersTab currentUser={user} onStatsChange={refreshStats} />}
          {tab === "chats"     && <ChatsTab onStatsChange={refreshStats} />}
          {tab === "actions"   && <ActionsTab />}
          {tab === "logs"      && <LogsTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Semi-circle gauge ─────────────────────────────────────────────────────────
// Draws a half-circle arc that fills based on pct (0–100).

const GAUGE_COLORS = {
  emerald: { track: "#d1fae5", fill: "#10b981", text: "text-emerald-600 dark:text-emerald-400", dark_track: "#064e3b" },
  orange:  { track: "#fed7aa", fill: "#f97316", text: "text-orange-500", dark_track: "#431407" },
  rose:    { track: "#fecdd3", fill: "#f43f5e", text: "text-rose-500", dark_track: "#4c0519" },
};

function SemiCircleGauge({ pct, color = "emerald", label, sublabel, size = 120 }) {
  const safe    = Math.max(0, Math.min(100, pct || 0));
  const r       = 44;
  const cx      = 60;
  const cy      = 60;
  const circ    = Math.PI * r;          // half-circumference (semicircle)
  const offset  = circ - (safe / 100) * circ;
  const c       = GAUGE_COLORS[color] || GAUGE_COLORS.emerald;
  const isDark  = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const trackColor = isDark ? c.dark_track : c.track;

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg
        viewBox="0 0 120 68"
        width={size}
        height={size * 0.6}
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        {/* Track arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={trackColor}
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Fill arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={c.fill}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${offset}`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        {/* Center % text */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          fill={c.fill}
          fontFamily="inherit"
        >
          {safe.toFixed(0)}%
        </text>
      </svg>
      {label && <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300 text-center">{label}</p>}
      {sublabel && <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">{sublabel}</p>}
    </div>
  );
}

// ─── Utility formatters ────────────────────────────────────────────────────────

function fmtBytes(b) {
  if (b == null || b < 0) return "—";
  if (b < 1024)      return `${b} B`;
  if (b < 1024**2)   return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024**3)   return `${(b / 1024**2).toFixed(1)} MB`;
  return `${(b / 1024**3).toFixed(2)} GB`;
}

function fmtUptime(secs) {
  if (!secs) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return "—"; }
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

function DashboardTab({ stats, onStatsChange }) {
  const [sys, setSys] = useState(null);

  const loadSys = useCallback(async () => {
    try { const d = await api.get("/api/admin/system"); setSys(d); } catch {}
  }, []);

  // Auto-refresh everything every 10s
  useEffect(() => {
    loadSys();
    onStatsChange();
    const timer = setInterval(() => { loadSys(); onStatsChange(); }, 10000);
    return () => clearInterval(timer);
  }, [loadSys, onStatsChange]);

  // Gauge values
  const sysPct    = sys ? Math.round((sys.memory.systemUsed / sys.memory.systemTotal) * 100) : 0;
  const heapPct   = sys ? Math.round((sys.memory.heapUsed   / sys.memory.heapTotal)   * 100) : 0;
  const load1     = sys?.loadAvg?.[0] ?? null;
  const loadPct   = sys ? Math.round(Math.min(100, (load1 / (sys.cpuCount || 1)) * 100)) : 0;
  const diskTotal = sys?.storage?.diskTotalBytes ?? 0;
  const diskUsed  = sys?.storage?.diskUsedBytes ?? 0;
  const diskPct   = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;

  const uploadsSize  = sys?.storage?.uploadsSizeBytes ?? 0;

  const gaugeColor = (pct) => pct > 85 ? "rose" : pct > 65 ? "orange" : "emerald";

  const statCards = [
    { label: "Total Users",     value: stats?.totalUsers,    icon: Users,             accent: "emerald" },
    { label: "Show Online",     value: stats?.onlineUsers,   icon: User,              accent: "emerald",
      hint: "Users whose status preference is set to show online" },
    { label: "Banned",          value: stats?.bannedUsers,   icon: Ban,               accent: "rose" },
    { label: "Total Chats",     value: stats?.totalChats,    icon: MessageCircleMore, accent: "emerald" },
    { label: "Total Messages",  value: stats?.totalMessages, icon: Database,          accent: "emerald" },
    { label: "Active Sessions", value: stats?.totalSessions, icon: ShieldCog,         accent: "emerald" },
  ];

  // Info cards
  const infoCards = [
    { label: "Uploads",     value: sys ? fmtBytes(uploadsSize)   : "—", icon: Database,
      hint: "Total size of uploaded files on disk" },
    { label: "Process RSS", value: sys ? fmtBytes(sys.memory.rss) : "—", icon: MemoryStick,
      hint: "Total RAM used by the server process (Resident Set Size)" },
    { label: "Uptime",      value: sys ? fmtUptime(sys.uptime)    : "—", icon: Activity, accent: true },
  ];

  return (
    <div className="space-y-5">

      {/* ── Resource gauges ── */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Resources</h2>
        <div className={cardCls + " p-4"}>
          {!sys ? (
            <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">Loading…</p>
          ) : (
            <div className="flex flex-wrap items-start justify-around gap-2">
              <SemiCircleGauge
                pct={loadPct}
                color={gaugeColor(loadPct)}
                label="CPU Load"
                sublabel={`${load1?.toFixed(2)} avg · ${sys.cpuCount} core${sys.cpuCount !== 1 ? "s" : ""}`}
              />
              <SemiCircleGauge
                pct={heapPct}
                color={gaugeColor(heapPct)}
                label="App Memory"
                sublabel={`${fmtBytes(sys.memory.heapUsed)} / ${fmtBytes(sys.memory.heapTotal)}`}
              />
              <SemiCircleGauge
                pct={sysPct}
                color={gaugeColor(sysPct)}
                label="System Memory"
                sublabel={`${fmtBytes(sys.memory.systemUsed)} / ${fmtBytes(sys.memory.systemTotal)}`}
              />
              <SemiCircleGauge
                pct={diskPct}
                color={gaugeColor(diskPct)}
                label="Disk Storage"
                sublabel={diskTotal > 0 ? `${fmtBytes(diskUsed)} / ${fmtBytes(diskTotal)}` : "Unavailable"}
              />
            </div>
          )}
        </div>

        {/* Separate info cards */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {infoCards.map(({ label, value, icon: Icon, accent, hint }) => (
            <div key={label} className={cardCls + " px-4 py-3"} title={hint}>
              <div className="mb-1 flex items-center gap-1.5">
                <Icon size={11} className="shrink-0 text-emerald-500" />
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{label}</span>
              </div>
              <span className={`text-base font-bold ${accent ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-200"}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Overview stat cards ── */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {statCards.map(({ label, value, icon: Icon, accent, hint }) => (
            <div key={label} className={cardCls + " px-4 py-3"} title={hint}>
              <div className="flex items-center gap-1.5">
                <Icon size={12} className={accent === "rose" ? "text-rose-400" : "text-emerald-500"} />
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{label}</p>
              </div>
              <p className={`mt-1.5 text-2xl font-bold ${accent === "rose" ? "text-rose-500 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300"}`}>
                {value ?? "—"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Custom dropdown ───────────────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen]   = useState(false);
  const btnRef  = useRef(null);
  const menuRef = useRef(null);
  const ignoreRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) { ignoreRef.current = true; return; }
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const toggle = () => { if (ignoreRef.current) { ignoreRef.current = false; return; } setOpen(o => !o); };
  return { open, setOpen, toggle, btnRef, menuRef };
}

function CustomSelect({ value, onChange, options, placeholder = "Select…" }) {
  const { open, toggle, setOpen, btnRef, menuRef } = useDropdown();
  const selected = options.find(([v]) => v === value);
  const label    = selected?.[1] ?? placeholder;
  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={toggle} aria-expanded={open}
        className="relative flex w-full items-center rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-10 text-left text-sm font-semibold text-slate-700 outline-none transition hover:border-emerald-300 hover:bg-emerald-50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-emerald-500/10">
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown size={15} className={`absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={menuRef} className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100">
          {options.map(([v, l]) => (
            <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200 ${v === value ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
              <span className="truncate">{l}</span>
              {v === value && <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterDropdown({ value, onChange, options }) {
  const { open, toggle, setOpen, btnRef, menuRef } = useDropdown();
  const selected = options.find(([v]) => v === value);
  const label    = selected?.[1] ?? options[0]?.[1] ?? "Filter";
  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={toggle} aria-expanded={open}
        className="relative flex items-center gap-1.5 rounded-xl border border-emerald-200/70 bg-white/90 py-2 pl-3 pr-7 text-xs font-semibold text-slate-600 outline-none transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-emerald-500/5">
        <span className="max-w-24 truncate">{label}</span>
        <ChevronDown size={11} className={`absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={menuRef} className="absolute left-0 z-50 mt-1.5 min-w-max overflow-hidden rounded-2xl border border-emerald-200 bg-white p-1 text-xs font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100">
          {options.map(([v, l]) => (
            <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200 ${v === value ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
              <span>{l}</span>
              {v === value && <span className="ml-3 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sort TH ───────────────────────────────────────────────────────────────────

function SortTh({ field, sortBy, sortDir, onToggle, children }) {
  const active = sortBy === field;
  return (
    <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400" onClick={() => onToggle(field)}>
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown size={10} className={active ? "text-emerald-500" : "opacity-30"} />
        {active && <span className="text-[10px] text-emerald-500">{sortDir === "DESC" ? "↓" : "↑"}</span>}
      </span>
    </th>
  );
}

// ─── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ currentUser, onStatsChange }) {
  const [users,        setUsers]        = useState([]);
  const [initialized,  setInitialized]  = useState(false);
  const [search,       setSearch]       = useState("");
  const [roleFilter,   setRoleFilter]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy,       setSortBy]       = useState("id");
  const [sortDir,      setSortDir]      = useState("DESC");
  const [editUser,     setEditUser]     = useState(null);
  const [createOpen,   setCreateOpen]   = useState(false);
  const debounceRef = useRef(null);
  const paramsRef   = useRef({ search, roleFilter, statusFilter, sortBy, sortDir });
  useEffect(() => { paramsRef.current = { search, roleFilter, statusFilter, sortBy, sortDir }; });

  const load = useCallback(async () => {
    const { search: s, roleFilter: role, statusFilter: status, sortBy: sBy, sortDir: sDir } = paramsRef.current;
    const q = new URLSearchParams({ limit: 200, search: s, sortBy: sBy, sortDir: sDir });
    if (role)   q.set("role",   role);
    if (status) q.set("status", status);
    try {
      const d = await api.get(`/api/admin/users?${q}`);
      setUsers(d.users || []);
    } catch {}
    setInitialized(true);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search, roleFilter, statusFilter, sortBy, sortDir, load]);

  const toggleSort = (field) => {
    setSortBy(prev => {
      if (prev === field) { setSortDir(d => d === "DESC" ? "ASC" : "DESC"); return field; }
      setSortDir("DESC"); return field;
    });
  };

  const handleBan = async (u) => {
    await api.post(`/api/admin/users/${u.id}/ban`, { banned: !u.banned });
    load(); onStatsChange();
  };
  const handleDelete = async (u) => {
    if (!confirm(`Delete @${u.username}? This cannot be undone.`)) return;
    await api.delete(`/api/admin/users/${u.id}`);
    load(); onStatsChange();
  };
  const handleRoleToggle = async (u) => {
    await api.post(`/api/admin/users/${u.id}/role`, { role: u.role === "admin" ? "user" : "admin" });
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} className={inputSmCls + " pl-8"} />
        </div>
        <FilterDropdown value={roleFilter}   onChange={setRoleFilter}   options={[["","All roles"],["user","User"],["admin","Admin"],["owner","Owner"]]} />
        <FilterDropdown value={statusFilter} onChange={setStatusFilter} options={[["","All"],["online","Show Online"],["invisible","Invisible"],["banned","Banned"]]} />
        <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}><UserPlus size={13} /> New user</button>
      </div>

      {!initialized ? <LoadingRows /> : users.length === 0 ? <EmptyState message="No users found." /> : (
        <div className={"overflow-hidden " + cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 dark:border-white/5">
                <tr>
                  <SortTh field="username"   sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>User</SortTh>
                  <SortTh field="role"       sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Role</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Status pref.</th>
                  <SortTh field="created_at" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Joined</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: u.color || "#10b981" }}>
                          {(u.nickname || u.username || "?")[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{u.nickname || u.username}</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <RoleBadge role={u.role} />
                        {u.banned && <span className="rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">banned</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-medium ${u.banned ? "text-slate-300 line-through dark:text-slate-600" : u.status === "online" ? "text-emerald-500" : "text-slate-400 dark:text-slate-500"}`}>
                        {u.status === "online" ? "Show online" : "Invisible"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(u.created_at)}</td>
                    <td className="px-4 py-2.5">
                      {u.id !== currentUser.id ? (
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setEditUser(u)}        className={iconBtn("slate")}                              title="Edit"><Pencil size={13} /></button>
                          <button type="button" onClick={() => handleRoleToggle(u)}   className={iconBtn(u.role === "admin" ? "slate" : "emerald")} title={u.role === "admin" ? "Demote" : "Promote to admin"}><ShieldCog size={13} /></button>
                          <button type="button" onClick={() => handleBan(u)}          className={iconBtn(u.banned ? "emerald" : "orange")}      title={u.banned ? "Unban" : "Ban"}><Ban size={13} /></button>
                          <button type="button" onClick={() => handleDelete(u)}       className={iconBtn("rose")}                               title="Delete"><Trash size={13} /></button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">You</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={() => { load(); onStatsChange(); }} />}
      {editUser   && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
    </div>
  );
}

// ─── Chats tab ─────────────────────────────────────────────────────────────────

function ChatsTab({ onStatsChange }) {
  const [chats,       setChats]       = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState("");
  const [sortBy,      setSortBy]      = useState("id");
  const [sortDir,     setSortDir]     = useState("DESC");
  const [editChat,    setEditChat]    = useState(null);
  const [membersChat, setMembersChat] = useState(null);
  const [createOpen,  setCreateOpen]  = useState(false);
  const debounceRef = useRef(null);
  const paramsRef   = useRef({ search, typeFilter, sortBy, sortDir });
  useEffect(() => { paramsRef.current = { search, typeFilter, sortBy, sortDir }; });

  const load = useCallback(async () => {
    const { search: s, typeFilter: type, sortBy: sBy, sortDir: sDir } = paramsRef.current;
    const q = new URLSearchParams({ limit: 200, search: s, sortBy: sBy, sortDir: sDir });
    if (type) q.set("type", type);
    try { const d = await api.get(`/api/admin/chats?${q}`); setChats(d.chats || []); } catch {}
    setInitialized(true);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search, typeFilter, sortBy, sortDir, load]);

  const toggleSort = (field) => {
    setSortBy(prev => {
      if (prev === field) { setSortDir(d => d === "DESC" ? "ASC" : "DESC"); return field; }
      setSortDir("DESC"); return field;
    });
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete "${c.name || `Chat #${c.id}`}"? This cannot be undone.`)) return;
    await api.delete(`/api/admin/chats/${c.id}`);
    load(); onStatsChange();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search chats…" value={search} onChange={e => setSearch(e.target.value)} className={inputSmCls + " pl-8"} />
        </div>
        <FilterDropdown value={typeFilter} onChange={setTypeFilter} options={[["","All types"],["dm","DMs"],["group","Groups"],["channel","Channels"]]} />
        <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}><Plus size={13} /> New chat</button>
      </div>

      {!initialized ? <LoadingRows /> : chats.length === 0 ? <EmptyState message="No chats found." /> : (
        <div className={"overflow-hidden " + cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 dark:border-white/5">
                <tr>
                  <SortTh field="name"         sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Chat</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Type</th>
                  <SortTh field="member_count"  sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}><Users size={10} className="mr-0.5 inline opacity-60" />Members</SortTh>
                  <SortTh field="message_count" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}><MessageCircleMore size={10} className="mr-0.5 inline opacity-60" />Messages</SortTh>
                  <SortTh field="created_at"    sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Created</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                {chats.map(c => (
                  <tr key={c.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ChatTypeIcon type={c.type} size={14} />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{c.name || `Chat #${c.id}`}</p>
                          {c.group_username && <p className="text-[11px] text-slate-400">@{c.group_username}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5"><ChatTypeBadge type={c.type} visibility={c.group_visibility} /></td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1"><Users size={11} className="text-slate-400" />{c.member_count}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1"><MessageCircleMore size={11} className="text-slate-400" />{c.message_count}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(c.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {c.type !== "dm" && (
                          <>
                            <button type="button" onClick={() => setEditChat(c)}    className={iconBtn("slate")}   title="Edit"><Pencil size={13} /></button>
                            <button type="button" onClick={() => setMembersChat(c)} className={iconBtn("emerald")} title="Members"><Users size={13} /></button>
                          </>
                        )}
                        <button type="button" onClick={() => handleDelete(c)} className={iconBtn("rose")} title="Delete"><Trash size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen  && <CreateChatModal onClose={() => setCreateOpen(false)} onCreated={() => { load(); onStatsChange(); }} />}
      {editChat    && <EditChatModal   chat={editChat} onClose={() => setEditChat(null)} onSaved={load} />}
      {membersChat && <MembersModal    chat={membersChat} onClose={() => setMembersChat(null)} />}
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`app-scroll relative w-full ${wide ? "sm:max-w-lg" : "sm:max-w-sm"} max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-emerald-100/70 bg-white shadow-xl dark:border-emerald-500/30 dark:bg-slate-950`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">{title}</h3>
          <button type="button" onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10">
            <Close size={14} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </label>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ nickname: "", username: "", password: "", role: "user" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { const r = await api.post("/api/admin/users", form); if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; } onCreated(); onClose(); }
    catch { setError("Request failed."); } finally { setBusy(false); }
  };
  return (
    <Modal title="Create user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Display name"><input className={inputCls} value={form.nickname} onChange={e => set("nickname", e.target.value)} required /></Field>
        <Field label="Username"><input className={inputCls} value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} required /></Field>
        <Field label="Password"><input type="password" className={inputCls} value={form.password} onChange={e => set("password", e.target.value)} required /></Field>
        <Field label="Role"><CustomSelect value={form.role} onChange={v => set("role", v)} options={[["user","User"],["admin","Admin"]]} /></Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Creating…" : "Create user"}</button>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, onClose, onSaved }) {
  const [form,  setForm]  = useState({ nickname: user.nickname || "", username: user.username || "", status: user.status || "online", color: user.color || "" });
  const [pwForm,setPwForm]= useState({ password: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submitProfile = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { const r = await api.patch(`/api/admin/users/${user.id}`, form); if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; } onSaved(); onClose(); }
    catch { setError("Request failed."); } finally { setBusy(false); }
  };
  const submitPassword = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { const r = await api.post(`/api/admin/users/${user.id}/reset-password`, pwForm); if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; } onClose(); }
    catch { setError("Request failed."); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Edit @${user.username}`} onClose={onClose}>
      <div className="space-y-4">
        <form onSubmit={submitProfile} className="space-y-3">
          <Field label="Display name"><input className={inputCls} value={form.nickname} onChange={e => set("nickname", e.target.value)} /></Field>
          <Field label="Username"><input className={inputCls} value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} /></Field>
          <Field label="Status preference" hint="Whether the user appears online to others when they're active.">
            <CustomSelect value={form.status} onChange={v => set("status", v)} options={[["online","Show online"],["invisible","Invisible"]]} />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-2">
              <input type="color" value={form.color || "#10b981"} onChange={e => set("color", e.target.value)} className="h-12 w-14 cursor-pointer rounded-xl border border-emerald-200/70 p-1 dark:border-emerald-500/30" />
              <input className={inputCls + " flex-1"} value={form.color} onChange={e => set("color", e.target.value)} placeholder="#10b981" />
            </div>
          </Field>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Saving…" : "Save profile"}</button>
        </form>
        <div className="border-t border-slate-100 pt-4 dark:border-white/5">
          <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Reset password</p>
          <form onSubmit={submitPassword} className="space-y-3">
            <Field label="New password"><input type="password" className={inputCls} value={pwForm.password} onChange={e => setPwForm({ password: e.target.value })} placeholder="Min 6 characters" /></Field>
            <button type="submit" disabled={busy} className={btnDanger + " w-full justify-center"}>{busy ? "Updating…" : "Reset password & sign out"}</button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

function CreateChatModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", username: "", type: "group", visibility: "public", owner: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try { const r = await api.post("/api/admin/chats", form); if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; } onCreated(); onClose(); }
    catch { setError("Request failed."); } finally { setBusy(false); }
  };
  return (
    <Modal title="Create chat" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Type"><CustomSelect value={form.type} onChange={v => set("type", v)} options={[["group","Group"],["channel","Channel"]]} /></Field>
        <Field label="Name"><input className={inputCls} value={form.name} onChange={e => set("name", e.target.value)} required /></Field>
        <Field label="Username"><input className={inputCls} value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} required /></Field>
        <Field label="Owner (username or user ID)"><input className={inputCls} value={form.owner} onChange={e => set("owner", e.target.value)} required /></Field>
        <Field label="Visibility"><CustomSelect value={form.visibility} onChange={v => set("visibility", v)} options={[["public","Public"],["private","Private"]]} /></Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Creating…" : "Create"}</button>
      </form>
    </Modal>
  );
}

function EditChatModal({ chat, onClose, onSaved }) {
  const [form, setForm] = useState({ name: chat.name || "", username: chat.group_username || "", visibility: chat.group_visibility || "public", color: chat.group_color || "", owner: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    const payload = { ...form };
    if (!payload.owner.trim()) delete payload.owner;
    if (!payload.color.trim()) delete payload.color;
    try { const r = await api.patch(`/api/admin/chats/${chat.id}`, payload); if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; } onSaved(); onClose(); }
    catch { setError("Request failed."); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Edit ${chat.name || `Chat #${chat.id}`}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><input className={inputCls} value={form.name} onChange={e => set("name", e.target.value)} required /></Field>
        <Field label="Username"><input className={inputCls} value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} /></Field>
        <Field label="Visibility"><CustomSelect value={form.visibility} onChange={v => set("visibility", v)} options={[["public","Public"],["private","Private"]]} /></Field>
        <Field label="Color">
          <div className="flex items-center gap-2">
            <input type="color" value={form.color || "#10b981"} onChange={e => set("color", e.target.value)} className="h-12 w-14 cursor-pointer rounded-xl border border-emerald-200/70 p-1 dark:border-emerald-500/30" />
            <input className={inputCls + " flex-1"} value={form.color} onChange={e => set("color", e.target.value)} placeholder="#10b981" />
          </div>
        </Field>
        <Field label="Transfer ownership" hint="Leave empty to keep current owner.">
          <input className={inputCls} value={form.owner} onChange={e => set("owner", e.target.value)} placeholder="username or user ID" />
        </Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Saving…" : "Save changes"}</button>
      </form>
    </Modal>
  );
}

function MembersModal({ chat, onClose }) {
  const [members,   setMembers]   = useState([]);
  const [allUsers,  setAllUsers]  = useState([]);
  const [addUserId, setAddUserId] = useState("");
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [md, ud] = await Promise.all([api.get(`/api/admin/chats/${chat.id}/members`), api.get("/api/admin/users?limit=500")]);
      setMembers(md.members || []); setAllUsers(ud.users || []);
    } catch {} finally { setLoading(false); }
  }, [chat.id]);
  useEffect(() => { loadMembers(); }, [loadMembers]);
  const memberIds = new Set(members.map(m => String(m.id)));
  const available = allUsers.filter(u => !memberIds.has(String(u.id)));
  const addMember = async () => {
    if (!addUserId) return; setError("");
    const r = await api.post(`/api/admin/chats/${chat.id}/members`, { userId: Number(addUserId) });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; }
    setAddUserId(""); loadMembers();
  };
  return (
    <Modal title={`Members — ${chat.name || `Chat #${chat.id}`}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <CustomSelect value={addUserId} onChange={setAddUserId} placeholder="Add a member…"
              options={[["","Add a member…"], ...available.map(u => [String(u.id), `@${u.username}${u.nickname ? ` (${u.nickname})` : ""}`])]} />
          </div>
          <button type="button" onClick={addMember} disabled={!addUserId} className={btnPrimary}><UserPlus size={13} /></button>
        </div>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        {loading ? <LoadingRows /> : members.length === 0 ? <EmptyState message="No members." /> : (
          <div className={"overflow-hidden " + cardCls}>
            {members.map((m, i) => (
              <div key={m.id} className={`flex items-center gap-3 px-4 py-2.5 ${i < members.length - 1 ? "border-b border-slate-100 dark:border-white/5" : ""}`}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: m.color || "#10b981" }}>
                  {(m.nickname || m.username || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{m.nickname || m.username}</p>
                  <p className="text-[11px] text-slate-400">@{m.username}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <select value={m.role} onChange={e => api.patch(`/api/admin/chats/${chat.id}/members/${m.id}`, { role: e.target.value }).then(loadMembers)}
                    className="rounded-xl border border-emerald-200/70 bg-white/90 px-2 py-1 text-xs text-slate-700 outline-none dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200">
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                    <option value="owner">owner</option>
                  </select>
                  <button type="button" onClick={() => api.delete(`/api/admin/chats/${chat.id}/members/${m.id}`).then(loadMembers)} className={iconBtn("rose")} title="Remove"><Close size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Shared small components ───────────────────────────────────────────────────

function ChatTypeIcon({ type, size = 16 }) {
  if (type === "channel") return <Megaphone size={size} className="shrink-0 text-emerald-500" />;
  if (type === "group")   return <Users     size={size} className="shrink-0 text-emerald-500" />;
  return                         <User      size={size} className="shrink-0 text-slate-400" />;
}

function ChatTypeBadge({ type, visibility }) {
  const label = type === "dm" ? "DM" : type === "channel" ? "Channel" : "Group";
  const VisIcon = type !== "dm" ? (visibility === "private" ? <Lock size={9} /> : <Globe size={9} />) : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
      {VisIcon}{label}
    </span>
  );
}

function RoleBadge({ role }) {
  const r = (role === 0 || role === "0" || !role) ? "user" : String(role);
  if (r === "user") return <span className="text-[11px] text-slate-400 dark:text-slate-500">user</span>;
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">{r}</span>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(n => <div key={n} className="h-12 animate-pulse rounded-2xl border border-emerald-200/40 bg-white/60 dark:border-emerald-500/20 dark:bg-slate-900/40" />)}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
      <p className="text-sm text-slate-400 dark:text-slate-500">{message}</p>
    </div>
  );
}

// ─── Actions tab (DB maintenance) ──────────────────────────────────────────────

function ActionsTab() {
  const [vacuumBusy,   setVacuumBusy]   = useState(false);
  const [pendingFile,  setPendingFile]  = useState(null);  // file awaiting confirmation
  const [restoring,    setRestoring]    = useState(false);
  const [toast,        setToast]        = useState("");
  const [appInfo,      setAppInfo]      = useState(null);
  const [serviceAction, setServiceAction] = useState(null); // "restart" | "stop" awaiting confirm
  const [servicePending, setServicePending] = useState(false);
  const [danger,       setDanger]       = useState(null); // { kind, title, message, phrase, endpoint } awaiting confirm
  const [dangerBusy,   setDangerBusy]   = useState(false);
  const fileRef = useRef(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  useEffect(() => {
    let cancelled = false;
    fetchAppInfo().then(r => r.json()).then(d => { if (!cancelled) setAppInfo(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const runVacuum = async () => {
    if (!confirm("Run VACUUM now? This rewrites the database file to reclaim space.")) return;
    setVacuumBusy(true);
    try {
      const r = await api.post("/api/admin/maintenance/vacuum", {});
      flash(r.ok ? "Database vacuumed successfully." : "Vacuum failed.");
    } catch { flash("Vacuum failed."); } finally { setVacuumBusy(false); }
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
      const r = await apiFetch("/api/admin/maintenance/restore", { method: "POST", body: form });
      const d = await r.json().catch(() => ({}));
      flash(r.ok ? "Database restored successfully." : (d.error || "Restore failed."));
    } catch { flash("Restore failed."); }
    finally { setRestoring(false); setPendingFile(null); }
  };

  const confirmServiceAction = async () => {
    const action = serviceAction;
    if (!action) return;
    setServicePending(true);
    try {
      await api.post(`/api/admin/service/${action}`, {});
      flash(action === "restart"
        ? "Restarting the service… the app may be briefly unavailable."
        : "Stopping the service… the app will become unavailable.");
    } catch { flash(`Failed to ${action} the service.`); }
    finally { setServicePending(false); setServiceAction(null); }
  };

  const confirmDanger = async () => {
    if (!danger) return;
    setDangerBusy(true);
    try {
      const r = await api.post(danger.endpoint, { confirm: danger.phrase });
      const d = await r.json().catch(() => ({}));
      flash(r.ok ? danger.success : (d.error || "Action failed."));
    } catch { flash("Action failed."); }
    finally { setDangerBusy(false); setDanger(null); }
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          {toast}
        </div>
      )}

      {/* ── Database ── */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Database Maintenance</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

          {/* Backup & restore */}
          <div className={cardCls + " flex items-start gap-3 p-4"}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Database size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Backup &amp; restore</p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Download the database to your device, or restore by uploading a backup file.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={downloadDb} className={btnPrimary}>
                  <HardDriveDownload size={13} /> Backup
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className={btnSecondary}>
                  <HardDriveUpload size={13} /> Restore
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

          {/* Vacuum */}
          <div className={cardCls + " flex items-start gap-3 p-4"}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Vacuum database</p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Reclaim unused space and defragment the DB file.</p>
              <button type="button" onClick={runVacuum} disabled={vacuumBusy} className={btnPrimary + " mt-3"}>
                <Wrench size={13} /> {vacuumBusy ? "Running…" : "Run vacuum"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── System ── */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">System</h2>
        <SystemCard
          appInfo={appInfo}
          onRestart={() => setServiceAction("restart")}
          onStop={() => setServiceAction("stop")}
        />
      </div>

      {/* ── Danger zone ── */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-rose-400 dark:text-rose-400/80">Danger Zone</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Clear messages */}
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-500/30 dark:bg-rose-500/[0.04]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
              <MessageCircleX size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Clear all messages</p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Permanently delete every message and uploaded file. Users and chats are kept.</p>
              <button
                type="button"
                onClick={() => setDanger({
                  title: "Clear all messages",
                  message: "This permanently deletes every message and uploaded file across all chats. Users and chats remain. This cannot be undone.",
                  phrase: "clear messages",
                  endpoint: "/api/admin/maintenance/clear-messages",
                  success: "All messages and files cleared.",
                })}
                className={btnDanger + " mt-3"}
              >
                <Trash size={13} /> Clear messages
              </button>
            </div>
          </div>

          {/* Reset everything */}
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/40 p-4 dark:border-rose-500/30 dark:bg-rose-500/[0.04]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
              <Rotate size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Reset database</p>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Wipe everything — all users, chats, messages, sessions, and files. The schema is kept.</p>
              <button
                type="button"
                onClick={() => setDanger({
                  title: "Reset database",
                  message: "This permanently deletes ALL users, chats, messages, sessions, and files. The app will be empty afterwards. This cannot be undone.",
                  phrase: "reset everything",
                  endpoint: "/api/admin/maintenance/reset",
                  success: "Database reset. The app is now empty.",
                })}
                className={btnDanger + " mt-3"}
              >
                <Trash size={13} /> Reset database
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(pendingFile)}
        title="Restore database"
        message={pendingFile
          ? `Replace the current database with "${pendingFile.name}"? This overwrites all existing data and cannot be undone.`
          : ""}
        confirmLabel={restoring ? "Restoring…" : "Restore"}
        busy={restoring}
        onConfirm={confirmRestore}
        onClose={() => { if (!restoring) setPendingFile(null); }}
      />

      <ConfirmModal
        open={Boolean(serviceAction)}
        title={serviceAction === "stop" ? "Stop service" : "Restart service"}
        message={serviceAction === "stop"
          ? "Stop the Songbird service? The app will go offline until it is started again from the server."
          : "Restart the Songbird service? The app will be briefly unavailable while it restarts."}
        confirmLabel={servicePending ? "Working…" : (serviceAction === "stop" ? "Stop" : "Restart")}
        busy={servicePending}
        onConfirm={confirmServiceAction}
        onClose={() => { if (!servicePending) setServiceAction(null); }}
      />

      <TypedConfirmModal
        open={Boolean(danger)}
        title={danger?.title || ""}
        message={danger?.message || ""}
        phrase={danger?.phrase || ""}
        busy={dangerBusy}
        onConfirm={confirmDanger}
        onClose={() => { if (!dangerBusy) setDanger(null); }}
      />
    </div>
  );
}

// Combined system card — app version (with check-for-update) + service controls,
// styled like the Backup & restore card: one card, icon, title, buttons row.
function SystemCard({ appInfo, onRestart, onStop }) {
  const [state, setState] = useState({ status: "", latestVersion: "" });
  const resetRef = useRef(null);
  const versionLabel = String(appInfo?.version || "Unknown").trim() || "Unknown";

  useEffect(() => () => { if (resetRef.current) clearTimeout(resetRef.current); }, []);

  const scheduleReset = () => {
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => setState({ status: "", latestVersion: "" }), 3500);
  };

  const check = async () => {
    if (resetRef.current) { clearTimeout(resetRef.current); resetRef.current = null; }
    setState({ status: "checking", latestVersion: "" });
    try {
      const payload = await checkAppVersion(appInfo);
      setState({ status: payload?.status || "up-to-date", latestVersion: String(payload?.latestVersion || "") });
    } catch {
      setState({ status: "error", latestVersion: "" });
    }
    scheduleReset();
  };

  const versionBtn = (() => {
    if (state.status === "checking")         return { cls: "border-emerald-200 bg-white text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 cursor-wait", label: "Checking", icon: <LoaderCircle size={13} className="animate-spin" /> };
    if (state.status === "error")            return { cls: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200", label: "Check failed", icon: <AlertCircle size={13} /> };
    if (state.status === "update-available") return { cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200", label: "Update available", icon: <AlertCircle size={13} /> };
    if (state.status === "up-to-date")       return { cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200", label: "Up to date", icon: <Check size={13} /> };
    return { cls: "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-white/5", label: versionLabel, icon: <Refresh size={13} /> };
  })();

  return (
    <div className={cardCls + " flex items-start gap-3 p-4"}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
        <AppWindow size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Service</p>
        <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Check for updates, or restart and stop the Songbird service.</p>
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
            <Refresh size={13} /> Restart
          </button>
          <button type="button" onClick={onStop} className={btnDanger}>
            <Power size={13} /> Stop
          </button>
        </div>
      </div>
    </div>
  );
}

// App-style confirmation modal (matches LeaveGroup / DeleteMessage dialogs).
function ConfirmModal({ open, title, message, confirmLabel = "Confirm", busy = false, onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirmation modal that requires typing an exact phrase before enabling confirm.
function TypedConfirmModal({ open, title, message, phrase, busy = false, onConfirm, onClose }) {
  const [text, setText] = useState("");
  useEffect(() => { if (open) setText(""); }, [open]);
  if (!open) return null;
  const matched = text.trim() === phrase;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Type <span className="font-semibold text-rose-600 dark:text-rose-300">{phrase}</span> to confirm.
        </p>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={phrase}
          className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-300/40 dark:border-rose-500/30 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !matched}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] disabled:opacity-40 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
          >
            {busy ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Logs tab ──────────────────────────────────────────────────────────────────

const LOG_ACTION_META = {
  "user.create":         { label: "User created",   color: "emerald", icon: UserPlus },
  "user.edit":           { label: "User edited",    color: "slate",   icon: Pencil },
  "user.delete":         { label: "User deleted",   color: "rose",    icon: Trash },
  "user.ban":            { label: "User banned",    color: "orange",  icon: Ban },
  "user.unban":          { label: "User unbanned",  color: "emerald", icon: Ban },
  "user.role":           { label: "Role changed",   color: "emerald", icon: ShieldCog },
  "user.reset_password": { label: "Password reset", color: "orange",  icon: KeyRound },
  "chat.create":         { label: "Chat created",   color: "emerald", icon: Plus },
  "chat.edit":           { label: "Chat edited",    color: "slate",   icon: Pencil },
  "chat.delete":         { label: "Chat deleted",   color: "rose",    icon: Trash },
  "chat.member_add":     { label: "Member added",   color: "emerald", icon: UserPlus },
  "chat.member_remove":  { label: "Member removed", color: "orange",  icon: UserMinus },
  "chat.member_role":    { label: "Member role",    color: "slate",   icon: ShieldCog },
  "db.vacuum":           { label: "DB vacuumed",    color: "emerald", icon: Sparkles },
  "db.clear_messages":   { label: "Messages cleared", color: "rose",  icon: MessageCircleX },
  "db.reset":            { label: "DB reset",       color: "rose",    icon: Rotate },
  "db.backup":           { label: "DB downloaded",  color: "emerald", icon: HardDriveDownload },
  "db.restore":          { label: "DB restored",    color: "slate",   icon: HardDriveUpload },
  "service.restart":     { label: "Service restarted", color: "emerald", icon: Refresh },
  "service.stop":        { label: "Service stopped",   color: "rose",    icon: Power },
  "logs.clear":          { label: "Logs cleared",   color: "rose",    icon: Trash },
};

const LOG_COLORS = {
  emerald: { badge: "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400", icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  rose:    { badge: "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400",                 icon: "bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400" },
  orange:  { badge: "border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400",     icon: "bg-orange-50 text-orange-500 dark:bg-orange-500/10 dark:text-orange-400" },
  slate:   { badge: "border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",                    icon: "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400" },
};

const LOG_SOURCES = [
  { id: "admin",     label: "Admin Panel" },
  { id: "installer", label: "Installer" },
  { id: "service",   label: "Service" },
  { id: "nginx",     label: "Nginx" },
];

function LogsTab() {
  const [source, setSource] = useState("admin");
  return (
    <div className="space-y-3">
      {/* Source tabs */}
      <div className="flex flex-wrap gap-1.5">
        {LOG_SOURCES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSource(id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
              source === id
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "admin" ? <AdminLogView /> : <SystemLogView source={source} />}
    </div>
  );
}

function AdminLogView() {
  const [logs,        setLogs]        = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [search,      setSearch]      = useState("");
  const debounceRef = useRef(null);
  const searchRef   = useRef(search);
  useEffect(() => { searchRef.current = search; });

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

  const clearLogs = async () => {
    if (!confirm("Clear all admin logs? This cannot be undone.")) return;
    await api.delete("/api/admin/logs");
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search logs…" value={search} onChange={e => setSearch(e.target.value)} className={inputSmCls + " pl-8"} />
        </div>
        <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5" title="Refresh">
          <Refresh size={14} />
        </button>
        <button type="button" onClick={clearLogs} className={btnDanger}>
          <Trash size={13} /> Clear
        </button>
      </div>

      {!initialized ? <LoadingRows /> : logs.length === 0 ? <EmptyState message="No log entries." /> : (
        <div className={"overflow-hidden " + cardCls}>
          {logs.map((entry, i) => {
            const meta = LOG_ACTION_META[entry.action] || { label: entry.action, color: "slate", icon: History };
            const Icon = meta.icon || History;
            const colors = LOG_COLORS[meta.color] || LOG_COLORS.slate;
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i < logs.length - 1 ? "border-b border-slate-100 dark:border-white/5" : ""}`}>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
                  <Icon size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{meta.label}</span>
                    {entry.status === "error" && <span className="text-[10px] font-semibold text-rose-500">failed</span>}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
                    {[entry.targetLabel, entry.details].filter(Boolean).join(" · ")}
                    {(entry.targetLabel || entry.details) ? " · " : ""}
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
}

function SystemLogView({ source }) {
  const [data,        setData]        = useState(null);
  const [initialized, setInitialized] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.get(`/api/admin/logs/${source}`); setData(d); } catch { setData({ available: false, lines: [], reason: "Failed to load." }); }
    setInitialized(true);
  }, [source]);

  useEffect(() => { setInitialized(false); load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={load} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5" title="Refresh">
          <Refresh size={14} />
        </button>
      </div>
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
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = iso.includes("T") ? new Date(iso) : new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

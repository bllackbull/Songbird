import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Chat,
  Check,
  LoaderCircle,
  Moon,
  Refresh,
  ScrollText,
  Settings,
  Sun,
  Users,
  Wrench,
} from "../../icons/lucide.js";
import { api } from "./adminShared.js";
import { pingPresence } from "../../api/chatApi.js";
import { GaugeIcon, LayoutDashboardIcon } from "../../icons/AnimatedIcons.jsx";
import { CHAT_PAGE_CONFIG } from "../../settings/chatPageConfig.js";
import DashboardTab from "./DashboardTab.jsx";
import UsersTab from "./UsersTab.jsx";
import ChatsTab from "./ChatsTab.jsx";
import ActionsTab from "./ActionsTab.jsx";
import LogsTab from "./LogsTab.jsx";
import SettingsTab from "./SettingsTab.jsx";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: GaugeIcon,         anim: "" },
  { id: "users",     label: "Users",     icon: Users,             anim: "icon-anim-pop" },
  { id: "chats",     label: "Chats",     icon: Chat,              anim: "icon-anim-bob" },
  { id: "actions",   label: "Actions",   icon: Wrench,            anim: "icon-anim-wiggle" },
  { id: "settings",  label: "Settings",  icon: Settings,          anim: "icon-anim-spin-dir" },
  { id: "logs",      label: "Logs",      icon: ScrollText,        anim: "icon-anim-sway" },
];

// Keep the admin's presence fresh while they're active in the panel.
const PRESENCE_PING_INTERVAL_MS = CHAT_PAGE_CONFIG.presencePingIntervalMs;
// Auto-exit the panel after this much inactivity (no mouse/keyboard/touch).
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export default function AdminPanel({ user, onBack, isDark, toggleTheme }) {
  const [tab, setTab]                 = useState("dashboard");
  const [stats, setStats]             = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [themeAnim, setThemeAnim]     = useState(false);
  const themeAnimRef = useRef(null);
  const [refreshState, setRefreshState] = useState(""); // "" | "loading" | "done"
  const refreshResetRef = useRef(null);
  const tabRefs = useRef({});

  const refreshStats = useCallback(async () => {
    try { const d = await api.get("/api/admin/stats"); setStats(d); } catch {}
  }, []);

  // The top bar refresh button refreshes the shared stats plus whatever data
  // the currently active tab is showing, so tabs don't need their own
  // separate refresh controls.
  const handleManualRefresh = useCallback(async () => {
    if (refreshResetRef.current) { clearTimeout(refreshResetRef.current); refreshResetRef.current = null; }
    setRefreshState("loading");
    await Promise.all([refreshStats(), tabRefs.current[tab]?.refresh?.()]);
    setRefreshState("done");
    refreshResetRef.current = setTimeout(() => setRefreshState(""), 1500);
  }, [refreshStats, tab]);

  useEffect(() => { refreshStats(); }, [refreshStats]);
  useEffect(() => () => { if (refreshResetRef.current) clearTimeout(refreshResetRef.current); }, []);

  // Keep the admin marked online while they're in the panel: ping presence on
  // mount, on a fixed interval, and whenever the tab regains focus.
  useEffect(() => {
    const username = user?.username;
    if (!username) return undefined;
    const ping = () => { pingPresence(username).catch(() => {}); };
    ping();
    const interval = setInterval(ping, PRESENCE_PING_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [user?.username]);

  // Auto-exit the panel after a period of inactivity. Any user interaction
  // resets the countdown; when it elapses we leave the panel via onBack.
  const onBackRef = useRef(onBack);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);
  useEffect(() => {
    let timer = null;
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { onBackRef.current?.(); }, IDLE_TIMEOUT_MS);
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  const handleToggleTheme = () => {
    setThemeAnim(true);
    clearTimeout(themeAnimRef.current);
    if (toggleTheme) toggleTheme();
    themeAnimRef.current = setTimeout(() => setThemeAnim(false), 520);
  };
  useEffect(() => () => clearTimeout(themeAnimRef.current), []);

  const activeTab = TABS.find((t) => t.id === tab);
  const ActiveIcon = activeTab?.icon ?? GaugeIcon;

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <nav className={`
        absolute inset-y-0 left-0 z-30 flex flex-col
        border-r border-slate-200/80 bg-white/95 backdrop-blur-sm
        transition-all duration-200
        dark:border-white/5 dark:bg-slate-900/95
        md:relative md:z-auto md:translate-x-0
        ${sidebarOpen ? "w-56 translate-x-0" : "w-0 -translate-x-full md:w-14 md:translate-x-0"}
      `}>
        <div className={`flex h-12 shrink-0 items-center border-b border-slate-100 dark:border-white/5 ${sidebarOpen ? "justify-between px-3" : "justify-center"}`}>
          {sidebarOpen && (
            <label className="flex cursor-default items-center gap-2 overflow-hidden">
              <LayoutDashboardIcon size={14} className="shrink-0 text-emerald-500" />
              <span className="truncate text-sm font-bold text-slate-700 dark:text-slate-200">Admin Panel</span>
            </label>
          )}
          <button type="button" onClick={() => setSidebarOpen((o) => !o)} title={sidebarOpen ? "Collapse" : "Expand"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-400 transition hover:border-emerald-200/60 hover:bg-emerald-50/50 hover:text-emerald-600 dark:text-slate-500 dark:hover:border-emerald-500/20 dark:hover:bg-emerald-500/5 dark:hover:text-emerald-400">
            {sidebarOpen ? <ArrowLeftFromLine size={15} className="icon-anim-nudge" /> : <ArrowRightFromLine size={15} className="icon-anim-nudge" />}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden p-2">
          {TABS.map(({ id, label, icon: Icon, anim }) => (
            <button key={id} type="button"
              onClick={() => { setTab(id); if (window.innerWidth < 768) setSidebarOpen(false); }}
              title={!sidebarOpen ? label : undefined}
              className={`flex h-9 w-full items-center rounded-xl transition
                ${sidebarOpen ? "gap-2.5 px-3 text-sm font-semibold" : "justify-center"}
                ${tab === id
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
                }`}>
              <Icon size={15} className={`shrink-0 text-emerald-500 ${anim}`} />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </button>
          ))}
        </div>

        <div className="shrink-0 border-t border-slate-100 p-2 dark:border-white/5">
          <button type="button" onClick={onBack} title={!sidebarOpen ? "Exit" : undefined}
            className={`flex h-9 w-full items-center rounded-xl text-rose-600 transition
              hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10
              ${sidebarOpen ? "gap-2.5 px-3 text-sm font-semibold" : "justify-center"}`}>
            <ArrowLeft size={15} className="shrink-0 icon-anim-slide" />
            {sidebarOpen && <span className="truncate">Exit</span>}
          </button>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200/80 bg-white/80 px-3 backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/80">
          <ActiveIcon size={15} className="shrink-0 text-emerald-500" />
          <h1 className="flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{activeTab?.label}</h1>
          <button type="button" onClick={handleToggleTheme} title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700 dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300">
            {isDark
              ? <Sun size={15} className={`icon-anim-spin-dir ${themeAnim ? "icon-theme-enter-sun" : ""}`} />
              : <Moon size={15} className={`icon-anim-spin-left ${themeAnim ? "icon-theme-enter-moon" : ""}`} />}
          </button>
          <button type="button" onClick={handleManualRefresh} disabled={refreshState === "loading"} title="Refresh"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700 disabled:cursor-wait dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300">
            {refreshState === "loading"
              ? <LoaderCircle size={14} className="animate-spin text-emerald-600 dark:text-emerald-400" />
              : refreshState === "done"
                ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                : <Refresh size={14} className="icon-anim-spin-full" />}
          </button>
        </div>

        <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          {tab === "dashboard" && <DashboardTab ref={(r) => { tabRefs.current.dashboard = r; }} stats={stats} onStatsChange={refreshStats} />}
          {tab === "users"     && <UsersTab ref={(r) => { tabRefs.current.users = r; }} currentUser={user} onStatsChange={refreshStats} />}
          {tab === "chats"     && <ChatsTab ref={(r) => { tabRefs.current.chats = r; }} onStatsChange={refreshStats} />}
          {tab === "settings"  && <SettingsTab ref={(r) => { tabRefs.current.settings = r; }} />}
          {tab === "actions"   && <ActionsTab ref={(r) => { tabRefs.current.actions = r; }} />}
          {tab === "logs"      && <LogsTab ref={(r) => { tabRefs.current.logs = r; }} />}
        </div>
      </div>
    </div>
  );
}

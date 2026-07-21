import { useCallback, useEffect, useRef, useState, Activity } from "react";
import {
  ArrowLeft,
  ArrowLeftFromLine,
  ArrowRight,
  ArrowRightFromLine,
  Chat,
  Check,
  LoaderCircle,
  Refresh,
  ScrollText,
  Settings,
  Users,
  Wrench,
} from "../../icons/lucide.js";
import { api } from "./adminShared.js";
import { pingPresence } from "../../api/chatApi.js";
import { GaugeIcon, LayoutDashboardIcon } from "../../icons/AnimatedIcons.jsx";
import { CHAT_PAGE_CONFIG } from "../../settings/chatPageConfig.js";
import { useAdminCache } from "../../hooks/useAdminCache.js";
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

// Auto-refresh interval for shared admin cache (stats / active tab).
// DashboardTab polls /api/admin/system on its own matching cadence.
const AUTO_REFRESH_MS = 10_000;

export default function AdminPanel({ user, onBack }) {
  const [tab, setTab]                 = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [refreshState, setRefreshState] = useState(""); // "" | "loading" | "done"
  const refreshResetRef = useRef(null);
  const tabRefs = useRef({});

  // ── Centralised cache ────────────────────────────────────────────────────
  // Each fetcher returns raw data that gets stored in the cache and passed
  // down to the corresponding tab as a prop.  Tabs no longer fetch on mount.
  // Users, chats, and logs are paginated server-side and own their own data
  // fetching (see the individual tabs), so they are intentionally NOT in this
  // shared cache. Only the small, single-shot payloads live here.
  const { cache, ensureFresh, invalidate, refresh: refreshKey, refreshAll } = useAdminCache({
    stats:    () => api.get("/api/admin/stats"),
    settings: () => api.get("/api/admin/settings"),
  }, { ttlMs: AUTO_REFRESH_MS });

  // Tabs that manage their own paginated data and expose a `refresh()` via ref.
  const SELF_PAGINATED_TABS = ["users", "chats", "logs"];

  // Convenience aliases so downstream JSX stays readable.
  const stats = cache.stats?.data ?? null;

  // On phone-sized screens the sidebar becomes a full-page menu.
  const [isDesktopView, setIsDesktopView] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );
  const [mobileView, setMobileView] = useState("menu"); // "menu" | "detail"
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchDxRef = useRef(0);
  const touchDyRef = useRef(0);
  const trackingSwipeRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktopView(media.matches);
    update();
    if (media.addEventListener) media.addEventListener("change", update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", update);
      else media.removeListener(update);
    };
  }, []);

  const selectTab = useCallback((id) => {
    setTab(id);
    setMobileView("detail");
  }, []);

  const handleTouchStart = (event) => {
    if (isDesktopView || mobileView !== "detail") return;
    const touch = event.touches?.[0];
    if (!touch) return;
    // Start near left edge to avoid interfering with content scroll/swipes.
    trackingSwipeRef.current = touch.clientX <= 40;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchDxRef.current = 0;
    touchDyRef.current = 0;
  };

  const handleTouchMove = (event) => {
    if (!trackingSwipeRef.current) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    touchDxRef.current = touch.clientX - touchStartXRef.current;
    touchDyRef.current = touch.clientY - touchStartYRef.current;
  };

  const handleTouchEnd = () => {
    if (!trackingSwipeRef.current) return;
    const dx = touchDxRef.current;
    const dy = Math.abs(touchDyRef.current);
    trackingSwipeRef.current = false;
    if (dx > 80 && dy < 70) {
      setMobileView("menu");
    }
  };

  // ── Ensure data is fresh when a tab becomes active ──────────────────────
  // On mount and on tab switch, fetch any stale/missing cache entries.
  // The dashboard also needs `stats`, so always keep that fresh.
  useEffect(() => {
    ensureFresh("stats");
    // Only shared-cache tabs (e.g. settings) refetch here; self-paginated tabs
    // load their own data on mount/param change.
    if (tab !== "dashboard" && cache[tab] !== undefined) ensureFresh(tab);
  }, [tab, ensureFresh, cache]);

  // ── Background auto-refresh (10 s) ───────────────────────────────────────
  // Refresh stats always; also refresh the current tab's data if it has a
  // dedicated cache entry so the active view stays live. Skip while the
  // document is hidden to avoid burning the shared API rate limit.
  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      refreshKey("stats");
      if (cache[tab] !== undefined) refreshKey(tab);
      // Self-paginated tabs refresh their current page via their own ref.
      else if (SELF_PAGINATED_TABS.includes(tab)) tabRefs.current[tab]?.refresh?.();
    };
    const timer = setInterval(tick, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, refreshKey]);

  // The top bar refresh button: flush stats + active tab immediately.
  const handleManualRefresh = useCallback(async () => {
    if (refreshResetRef.current) { clearTimeout(refreshResetRef.current); refreshResetRef.current = null; }
    setRefreshState("loading");
    const keys = ["stats"];
    if (cache[tab] !== undefined) keys.push(tab);
    await refreshAll(...keys);
    // Self-paginated tabs aren't in the shared cache; refresh via their ref
    // below (handled by the tabRefs.current[tab]?.refresh?.() call).
    // Also give the active tab ref a chance to refresh its own local state
    // (e.g. DashboardTab's system metrics which aren't in the shared cache).
    tabRefs.current[tab]?.refresh?.();
    setRefreshState("done");
    refreshResetRef.current = setTimeout(() => setRefreshState(""), 1500);
  }, [tab, cache, refreshAll]);

  useEffect(() => () => { if (refreshResetRef.current) clearTimeout(refreshResetRef.current); }, []);

  // Called by tabs after a mutation so sibling caches stay in sync.
  const invalidateStats = useCallback(() => invalidate("stats"), [invalidate]);
  // Stable callback for DashboardTab manual refresh (via tabRefs); auto-poll
  // of stats stays in this panel so DashboardTab does not re-trigger it.
  const refreshStats = useCallback(() => refreshKey("stats"), [refreshKey]);

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

  const activeTab = TABS.find((t) => t.id === tab);
  // The collapse/expand toggle only applies to the desktop sidebar.
  const showLabels = sidebarOpen;

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Desktop sidebar */}
      <nav className={`
        relative z-auto hidden shrink-0 flex-col
        border-r border-slate-200/80 bg-white/95 backdrop-blur-xs
        transition-all duration-200
        dark:border-white/5 dark:bg-slate-900/95
        md:flex
        ${sidebarOpen ? "w-56" : "w-14"}
      `}>
        <div className={`flex h-12 shrink-0 items-center border-b border-slate-100 dark:border-white/5 ${showLabels ? "justify-between px-3" : "justify-center"}`}>
          {showLabels && (
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

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {TABS.map(({ id, label, icon: Icon, anim }) => (
            <button key={id} type="button"
              onClick={() => selectTab(id)}
              title={!showLabels ? label : undefined}
              className={`flex h-9 w-full items-center rounded-xl border transition
                ${showLabels ? "gap-2.5 px-3 text-sm font-semibold" : "justify-center"}
                ${tab === id
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-400/60 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-transparent text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
                }`}>
              <Icon size={15} className={`shrink-0 text-emerald-500 ${anim}`} />
              {showLabels && <span className="truncate">{label}</span>}
            </button>
          ))}
        </div>

        <div className="shrink-0 border-t border-slate-100 p-2 dark:border-white/5">
          <button type="button" onClick={onBack} title={!showLabels ? "Exit" : undefined}
            className={`flex h-9 w-full items-center rounded-xl text-rose-600 transition
              hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10
              ${showLabels ? "gap-2.5 px-3 text-sm font-semibold" : "justify-center"}`}>
            <ArrowLeft size={15} className="shrink-0 icon-anim-slide" />
            {showLabels && <span className="truncate">Exit</span>}
          </button>
        </div>
      </nav>

      {/* Mobile full-page menu */}
      <nav className={`
        absolute inset-y-0 left-0 z-30 flex w-full flex-col
        bg-slate-50 transition-transform duration-300 ease-out will-change-transform
        dark:bg-slate-900
        md:hidden
        ${mobileView === "menu" ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-slate-300/80 bg-white px-4 py-4 dark:border-emerald-500/20 dark:bg-slate-900">
          <button type="button" onClick={onBack} aria-label="Exit admin panel"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-white/80 text-rose-600 transition hover:border-rose-300 hover:shadow-md dark:border-rose-500/30 dark:bg-slate-950 dark:text-rose-200">
            <ArrowLeft size={18} />
          </button>
          <span className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <span className="truncate text-base font-semibold text-slate-700 dark:text-slate-200">Admin Panel</span>
          </span>
          <span className="h-9 w-9 shrink-0" aria-hidden="true" />
        </div>

        <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-white/5 dark:bg-slate-950/60">
            {TABS.map(({ id, label, icon: Icon, anim }, index) => (
              <button key={id} type="button"
                onClick={() => selectTab(id)}
                className={`flex h-14 w-full items-center gap-3 px-4 text-left transition active:bg-emerald-50 dark:active:bg-emerald-500/10
                  ${index > 0 ? "border-t border-slate-100 dark:border-white/5" : ""}`}>
                <Icon size={22} className={`shrink-0 text-emerald-500 ${anim}`} />
                <span className="flex-1 truncate text-base font-semibold text-slate-700 dark:text-slate-100">{label}</span>
                <ArrowRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600" />
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content / mobile detail page */}
      <div
        className={`
          absolute inset-y-0 left-0 z-20 flex w-full min-w-0 flex-1 flex-col overflow-hidden
          bg-slate-50 transition-transform duration-300 ease-out will-change-transform
          dark:bg-slate-900
          md:relative md:z-auto md:w-auto md:translate-x-0
          ${mobileView === "detail" ? "translate-x-0" : "translate-x-full"}
        `}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative flex h-[72px] shrink-0 items-center gap-3 border-b border-slate-300/80 bg-white px-4 py-4 dark:border-emerald-500/20 dark:bg-slate-900 md:h-12 md:gap-2 md:border-slate-200/80 md:bg-white/80 md:px-3 md:py-0 md:backdrop-blur-xs md:dark:border-white/5 md:dark:bg-slate-900/80">
          <button type="button" onClick={() => setMobileView("menu")} aria-label="Back to menu"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 md:hidden">
            <ArrowLeft size={18} />
          </button>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 px-16 md:px-14">
            <h1 className="truncate text-base font-semibold text-slate-700 dark:text-slate-200 md:text-sm">{activeTab?.label}</h1>
          </span>
          <button type="button" onClick={handleManualRefresh} disabled={refreshState === "loading"} title="Refresh"
            className={`ml-auto inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700 disabled:cursor-wait dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300 ${isDesktopView ? "h-8 w-8" : "h-10 w-10"}`}>
            {refreshState === "loading"
              ? <LoaderCircle size={isDesktopView ? 14 : 16} className="animate-spin text-emerald-600 dark:text-emerald-400" />
              : refreshState === "done"
                ? <Check size={isDesktopView ? 14 : 16} className="text-emerald-600 dark:text-emerald-400" />
                : <Refresh size={isDesktopView ? 14 : 16} className="icon-anim-spin-full" />}
          </button>
        </div>

        <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
            <Activity mode={tab === "dashboard" ? "visible" : "hidden"}>
              <DashboardTab ref={(r) => { tabRefs.current.dashboard = r; }} stats={stats} onStatsChange={refreshStats} />
            </Activity>
            <Activity mode={tab === "users" ? "visible" : "hidden"}>
              <UsersTab
                ref={(r) => { tabRefs.current.users = r; }}
                currentUser={user}
                active={tab === "users"}
                onMutated={invalidateStats}
                onStatsChange={invalidateStats}
              />
            </Activity>
            <Activity mode={tab === "chats" ? "visible" : "hidden"}>
              <ChatsTab
                ref={(r) => { tabRefs.current.chats = r; }}
                active={tab === "chats"}
                onMutated={invalidateStats}
                onStatsChange={invalidateStats}
              />
            </Activity>
            <Activity mode={tab === "settings" ? "visible" : "hidden"}>
              <SettingsTab
                ref={(r) => { tabRefs.current.settings = r; }}
                cachedData={cache.settings?.data ?? null}
                isLoading={cache.settings?.loading ?? false}
                hasData={Boolean(cache.settings?.data)}
                onMutated={() => invalidate("settings")}
              />
            </Activity>
            <Activity mode={tab === "actions" ? "visible" : "hidden"}>
              <ActionsTab ref={(r) => { tabRefs.current.actions = r; }} />
            </Activity>
            <Activity mode={tab === "logs" ? "visible" : "hidden"}>
              <LogsTab
                ref={(r) => { tabRefs.current.logs = r; }}
                currentUser={user}
                active={tab === "logs"}
              />
            </Activity>
        </div>
      </div>
    </div>
  );
}

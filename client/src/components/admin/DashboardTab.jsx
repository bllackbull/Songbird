import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Activity,
  Ban,
  Bell,
  Chat,
  Database,
  Files,
  Megaphone,
  MemoryStick,
  MessageCircleMore,
  MonitorDot,
  User,
  Users,
  UserPlus,
  Wifi,
} from "../../icons/lucide.js";
import { api, cardCls, fmtBytes, fmtUptime } from "./adminShared.js";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Eases a value toward `target`, starting from 0 on first mount and smoothly
// tweening from the last shown value on subsequent updates (e.g. auto-refresh).
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (typeof target !== "number" || !Number.isFinite(target))
      return undefined;
    if (prefersReducedMotion()) {
      fromRef.current = target;
      setVal(target);
      return undefined;
    }
    const from = fromRef.current;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const cur = from + (target - from) * ease(p);
      fromRef.current = cur;
      setVal(cur);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return val;
}

function CountUp({ value }) {
  const numeric = typeof value === "number" && Number.isFinite(value);
  const animated = useCountUp(numeric ? value : NaN);
  if (!numeric) return value ?? "—";
  return Math.round(animated).toLocaleString();
}

const GAUGE_COLORS = {
  emerald: { track: "#d1fae5", fill: "#10b981", dark_track: "#064e3b" },
  orange: { track: "#fed7aa", fill: "#f97316", dark_track: "#431407" },
  rose: { track: "#fecdd3", fill: "#f43f5e", dark_track: "#4c0519" },
};

function SemiCircleGauge({
  pct,
  color = "emerald",
  label,
  sublabel,
  size = 120,
}) {
  const target = Math.max(0, Math.min(100, pct || 0));
  const safe = useCountUp(target);
  const r = 44,
    cx = 60,
    cy = 60;
  const circ = Math.PI * r;
  const offset = circ - (safe / 100) * circ;
  const c = GAUGE_COLORS[color] || GAUGE_COLORS.emerald;
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
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
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={trackColor}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={c.fill}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={`${offset}`}
        />
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
      {label && (
        <p className="mt-1 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
          {label}
        </p>
      )}
      {sublabel && (
        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
          {sublabel}
        </p>
      )}
    </div>
  );
}

const DashboardTab = forwardRef(function DashboardTab({ stats, onStatsChange }, ref) {
  const [sys, setSys] = useState(null);

  const loadSys = useCallback(async () => {
    try {
      const d = await api.get("/api/admin/system");
      setSys(d);
    } catch {}
  }, []);

  useEffect(() => {
    loadSys();
    onStatsChange();
    const timer = setInterval(() => {
      loadSys();
      onStatsChange();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadSys, onStatsChange]);

  useImperativeHandle(ref, () => ({
    refresh: () => { loadSys(); onStatsChange(); },
  }), [loadSys, onStatsChange]);

  const sysPct = sys
    ? Math.round((sys.memory.systemUsed / sys.memory.systemTotal) * 100)
    : 0;
  const heapPct = sys
    ? Math.round((sys.memory.heapUsed / sys.memory.heapTotal) * 100)
    : 0;
  const load1 = sys?.loadAvg?.[0] ?? null;
  const loadPct = sys
    ? Math.round(Math.min(100, (load1 / (sys.cpuCount || 1)) * 100))
    : 0;
  const diskTotal = sys?.storage?.diskTotalBytes ?? 0;
  const diskUsed = sys?.storage?.diskUsedBytes ?? 0;
  const diskPct = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;
  const uploadsSize = sys?.storage?.uploadsSizeBytes ?? 0;

  const gaugeColor = (pct) =>
    pct > 85 ? "rose" : pct > 65 ? "orange" : "emerald";

  const chatBreakdown = stats
    ? `${stats.groupChats ?? 0} groups · ${stats.channelChats ?? 0} channels`
    : undefined;

  const statCards = [
    {
      label: "Total Users",
      value: stats?.totalUsers,
      icon: User,
      accent: "emerald",
    },
    {
      label: "Online Users",
      value: stats?.onlineUsers,
      icon: Wifi,
      accent: "emerald",
      hint: "Users currently active (seen in the last 30 seconds)",
    },
    {
      label: "New Users (7d)",
      value: stats?.newUsers7d,
      icon: UserPlus,
      accent: "emerald",
      hint: "Users registered in the last 7 days",
    },
    { label: "Banned", value: stats?.bannedUsers, icon: Ban, accent: "rose" },
    {
      label: "Total Chats",
      value: stats?.totalChats,
      icon: Chat,
      accent: "emerald",
      hint: chatBreakdown,
    },
    {
      label: "Total Groups",
      value: stats?.groupChats,
      icon: Users,
      accent: "emerald",
      hint: "Group chats",
    },
    {
      label: "Total Channels",
      value: stats?.channelChats,
      icon: Megaphone,
      accent: "emerald",
      hint: "Channels",
    },
    {
      label: "Total Messages",
      value: stats?.totalMessages,
      icon: MessageCircleMore,
      accent: "emerald",
    },
    {
      label: "Messages (24h)",
      value: stats?.messagesLast24h,
      icon: MessageCircleMore,
      accent: "emerald",
      hint: "Messages sent in the last 24 hours",
    },
    {
      label: "Uploaded Files",
      value: stats?.totalFiles,
      icon: Files,
      accent: "emerald",
      hint: "Total media/files attached to messages",
    },
    {
      label: "Push Devices",
      value: stats?.pushSubscriptions,
      icon: Bell,
      accent: "emerald",
      hint: "Registered web-push notification subscriptions",
    },
    {
      label: "Active Sessions",
      value: stats?.totalSessions,
      icon: MonitorDot,
      accent: "emerald",
    },
  ];

  const infoCards = [
    {
      label: "Database Size",
      value: sys ? fmtBytes(uploadsSize) : "—",
      icon: Database,
      hint: "Total size of uploaded files on disk",
    },
    {
      label: "Process RSS",
      value: sys ? fmtBytes(sys.memory.rss) : "—",
      icon: MemoryStick,
      hint: "Total RAM used by the server process (Resident Set Size)",
    },
    {
      label: "Uptime",
      value: sys ? fmtUptime(sys.uptime) : "—",
      icon: Activity,
      accent: true,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Resource gauges */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Resources
        </h2>
        <div className={cardCls + " p-4"}>
          {!sys ? (
            <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
              Loading…
            </p>
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
                sublabel={
                  diskTotal > 0
                    ? `${fmtBytes(diskUsed)} / ${fmtBytes(diskTotal)}`
                    : "Unavailable"
                }
              />
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {infoCards.map(({ label, value, icon: Icon, accent, hint }) => (
            <div key={label} className={cardCls + " px-4 py-3"} title={hint}>
              <div className="mb-1 flex items-center gap-1.5">
                <Icon size={11} className="shrink-0 text-emerald-500" />
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                  {label}
                </span>
              </div>
              <span
                className={`text-base font-bold ${accent ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-200"}`}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Overview stat cards */}
      <div>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {statCards.map(({ label, value, icon: Icon, accent, hint }) => (
            <div key={label} className={cardCls + " px-4 py-3"} title={hint}>
              <div className="flex items-center gap-1.5">
                <Icon
                  size={12}
                  className={
                    accent === "rose" ? "text-rose-400" : "text-emerald-500"
                  }
                />
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                  {label}
                </p>
              </div>
              <p
                className={`mt-1.5 text-2xl font-bold ${accent === "rose" ? "text-rose-500 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300"}`}
              >
                <CountUp value={value} />
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default DashboardTab;

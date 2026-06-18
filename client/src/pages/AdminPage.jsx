import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/chatApi.js";
import {
  ArrowLeft,
  Ban,
  MessageCircleMore,
  Search,
  ShieldCog,
  Trash,
  Users,
} from "../icons/lucide.js";

// ─── Access Guard ──────────────────────────────────────────────────────────────

export default function AdminPage({ user, onBack }) {
  const isAdmin = user?.role === "admin" || user?.role === "owner";

  if (!isAdmin) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900">
        <ShieldCog size={36} className="text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-400 dark:text-slate-500">
          Access denied
        </p>
      </div>
    );
  }

  return <AdminPanelContent user={user} onBack={onBack} />;
}

// ─── Nav tabs config ───────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: ShieldCog },
  { id: "users",     label: "Users",     icon: Users },
  { id: "chats",     label: "Chats",     icon: MessageCircleMore },
];

// ─── Main content ──────────────────────────────────────────────────────────────

function AdminPanelContent({ user, onBack }) {
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const searchDebounceRef = useRef(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  const fetchUsers = useCallback(async (search = "") => {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await apiFetch(`/api/admin/users${q}`);
      if (res.ok) setUsers((await res.json()).users || []);
    } catch {}
    setLoading(false);
  }, []);

  const fetchChats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/chats");
      if (res.ok) setChats((await res.json()).chats || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (tab === "users") {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => fetchUsers(userSearch), 300);
      return () => clearTimeout(searchDebounceRef.current);
    }
    if (tab === "chats") fetchChats();
  }, [tab, fetchUsers, fetchChats, userSearch]);

  const handleBanToggle = async (userId, currentBanned) => {
    await apiFetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banned: !currentBanned }),
    });
    fetchUsers(userSearch);
    fetchStats();
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    fetchUsers(userSearch);
    fetchStats();
  };

  const handleDeleteChat = async (chatId) => {
    if (!confirm("Delete this chat? This cannot be undone.")) return;
    await apiFetch(`/api/admin/chats/${chatId}`, { method: "DELETE" });
    fetchChats();
    fetchStats();
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 dark:bg-slate-900">

      {/* ── Header ── */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/80">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700 hover:shadow-[0_0_14px_rgba(16,185,129,0.18)] dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
        >
          <ArrowLeft size={17} />
        </button>
        <ShieldCog size={17} className="text-emerald-500" />
        <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Admin Panel
        </h1>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* ── Left nav ── */}
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-slate-200/80 bg-white/60 p-2 backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/60">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                tab === id
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_14px_rgba(16,185,129,0.12)] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-transparent text-slate-500 hover:border-emerald-200/60 hover:bg-emerald-50/50 hover:text-emerald-700 dark:text-slate-400 dark:hover:border-emerald-500/20 dark:hover:bg-emerald-500/5 dark:hover:text-emerald-300"
              }`}
            >
              <Icon size={15} className="shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* ── Content ── */}
        <div className="app-scroll flex-1 overflow-y-auto p-5">
          {tab === "dashboard" && <DashboardTab stats={stats} />}
          {tab === "users"     && (
            <UsersTab
              user={user}
              users={users}
              loading={loading}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              onBanToggle={handleBanToggle}
              onDelete={handleDeleteUser}
            />
          )}
          {tab === "chats" && (
            <ChatsTab
              chats={chats}
              loading={loading}
              onDelete={handleDeleteChat}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

function DashboardTab({ stats }) {
  if (!stats) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
      </div>
    );
  }

  const cards = [
    { label: "Total Users",     value: stats.totalUsers,    accent: "emerald" },
    { label: "Online Now",      value: stats.onlineUsers,   accent: "emerald" },
    { label: "Banned Users",    value: stats.bannedUsers,   accent: "rose"    },
    { label: "Total Chats",     value: stats.totalChats,    accent: "emerald" },
    { label: "Total Messages",  value: stats.totalMessages, accent: "emerald" },
    { label: "Active Sessions", value: stats.totalSessions, accent: "emerald" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {cards.map(({ label, value, accent }) => (
        <div
          key={label}
          className="rounded-2xl border border-emerald-200/70 bg-white/90 px-5 py-4 dark:border-emerald-500/30 dark:bg-slate-900/50"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
            {label}
          </p>
          <p className={`mt-2 text-3xl font-bold ${
            accent === "rose"
              ? "text-rose-500 dark:text-rose-400"
              : "text-emerald-700 dark:text-emerald-300"
          }`}>
            {value ?? "—"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Users ─────────────────────────────────────────────────────────────────────

function UsersTab({ user, users, loading, userSearch, setUserSearch, onBanToggle, onDelete }) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by username or name…"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="w-full rounded-xl border border-emerald-200/70 bg-white/90 py-2 pl-8 pr-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/40 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-emerald-500"
        />
      </div>

      {loading ? (
        <LoadingRows />
      ) : users.length === 0 ? (
        <EmptyState message="No users found." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-emerald-200/70 bg-white/90 dark:border-emerald-500/30 dark:bg-slate-900/50">
          {users.map((u, i) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 px-4 py-3 ${
                i < users.length - 1
                  ? "border-b border-slate-100 dark:border-white/5"
                  : ""
              }`}
            >
              {/* Avatar placeholder */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: u.color || "#10b981" }}
              >
                {(u.nickname || u.username || "?")[0].toUpperCase()}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {u.nickname || u.username}
                  <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                    @{u.username}
                  </span>
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <RoleBadge role={u.role} />
                  <StatusBadge status={u.status} banned={u.banned} />
                </div>
              </div>

              {/* Actions */}
              {u.id !== user.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onBanToggle(u.id, u.banned)}
                    title={u.banned ? "Unban" : "Ban"}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition ${
                      u.banned
                        ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                        : "border-orange-200 text-orange-500 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-400 dark:hover:bg-orange-500/10"
                    }`}
                  >
                    <Ban size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(u.id)}
                    title="Delete user"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    <Trash size={13} />
                  </button>
                </div>
              ) : (
                <span className="shrink-0 rounded-full border border-emerald-200/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:border-emerald-500/30 dark:text-emerald-400">
                  You
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Chats ─────────────────────────────────────────────────────────────────────

function ChatsTab({ chats, loading, onDelete }) {
  if (loading) return <LoadingRows />;
  if (chats.length === 0) return <EmptyState message="No chats found." />;

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200/70 bg-white/90 dark:border-emerald-500/30 dark:bg-slate-900/50">
      {chats.map((c, i) => (
        <div
          key={c.id}
          className={`flex items-center gap-3 px-4 py-3 ${
            i < chats.length - 1
              ? "border-b border-slate-100 dark:border-white/5"
              : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
              {c.name || `Chat #${c.id}`}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
              <ChatTypeBadge type={c.type} />
              <span>{c.member_count} member{c.member_count !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>{c.message_count} msg{c.message_count !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDelete(c.id)}
            title="Delete chat"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200 text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <Trash size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Shared small components ───────────────────────────────────────────────────

function RoleBadge({ role }) {
  if (!role || role === "user") return null;
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
      {role}
    </span>
  );
}

function StatusBadge({ status, banned }) {
  if (banned) {
    return (
      <span className="text-[11px] font-medium text-rose-500 dark:text-rose-400">
        Banned
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-1 text-[11px] ${status === "online" ? "text-emerald-500" : "text-slate-400 dark:text-slate-500"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "online" ? "bg-emerald-400" : "bg-slate-300 dark:bg-slate-600"}`} />
      {status || "offline"}
    </span>
  );
}

function ChatTypeBadge({ type }) {
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
      {type}
    </span>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="h-14 animate-pulse rounded-2xl border border-emerald-200/40 bg-white/60 dark:border-emerald-500/20 dark:bg-slate-900/40"
        />
      ))}
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

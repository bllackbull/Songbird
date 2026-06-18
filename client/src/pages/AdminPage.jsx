import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../api/chatApi.js";
import {
  ArrowLeft,
  ArrowUpDown,
  Ban,
  ChevronDown,
  Globe,
  Lock,
  Megaphone,
  MessageCircleMore,
  Pencil,
  Plus,
  Refresh,
  Search,
  ShieldCog,
  Trash,
  User,
  UserPlus,
  Users,
  Close,
} from "../icons/lucide.js";

// ─── Access Guard ──────────────────────────────────────────────────────────────

export default function AdminPage({ user, onBack }) {
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  if (!isAdmin) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900">
        <ShieldCog size={36} className="text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-400 dark:text-slate-500">Access denied</p>
      </div>
    );
  }
  return <AdminPanelContent user={user} onBack={onBack} />;
}

// ─── Nav config ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: ShieldCog },
  { id: "users",     label: "Users",     icon: Users },
  { id: "chats",     label: "Chats",     icon: MessageCircleMore },
];

// ─── Shared style helpers ──────────────────────────────────────────────────────

const cardCls  = "rounded-2xl border border-emerald-200/70 bg-white/90 dark:border-emerald-500/30 dark:bg-slate-900/50";
const inputCls = "w-full rounded-xl border border-emerald-200/70 bg-white/90 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/40 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-emerald-500";
const labelCls = "block text-xs font-semibold text-slate-600 dark:text-slate-300";
const btnPrimary = "inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 hover:shadow-[0_0_14px_rgba(16,185,129,0.3)]";
const btnDanger  = "inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400";
const iconBtn    = (color = "slate") => {
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
  get:    (url)         => apiFetch(url).then(r => r.json()),
  post:   (url, body)   => apiFetch(url, { method: "POST",   headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patch:  (url, body)   => apiFetch(url, { method: "PATCH",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  delete: (url)         => apiFetch(url, { method: "DELETE" }),
};

// ─── Main shell ────────────────────────────────────────────────────────────────

function AdminPanelContent({ user, onBack }) {
  const [tab, setTab] = useState("dashboard");
  const [stats, setStats] = useState(null);

  const refreshStats = useCallback(async () => {
    try { const d = await api.get("/api/admin/stats"); setStats(d); } catch {}
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/80">
        <button type="button" onClick={onBack} aria-label="Back"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700 hover:shadow-[0_0_14px_rgba(16,185,129,0.18)] dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300">
          <ArrowLeft size={17} />
        </button>
        <ShieldCog size={17} className="text-emerald-500" />
        <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Admin Panel</h1>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left nav */}
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-slate-200/80 bg-white/60 p-2 backdrop-blur-sm dark:border-white/5 dark:bg-slate-900/60">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                tab === id
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_14px_rgba(16,185,129,0.12)] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "border-transparent text-slate-500 hover:border-emerald-200/60 hover:bg-emerald-50/50 hover:text-emerald-700 dark:text-slate-400 dark:hover:border-emerald-500/20 dark:hover:bg-emerald-500/5 dark:hover:text-emerald-300"
              }`}>
              <Icon size={15} className="shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "dashboard" && <DashboardTab stats={stats} onRefresh={refreshStats} />}
          {tab === "users"     && <UsersTab     currentUser={user} onStatsChange={refreshStats} />}
          {tab === "chats"     && <ChatsTab     onStatsChange={refreshStats} />}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

function DashboardTab({ stats, onRefresh }) {
  const cards = [
    { label: "Total Users",     value: stats?.totalUsers,    accent: "emerald" },
    { label: "Online Now",      value: stats?.onlineUsers,   accent: "emerald" },
    { label: "Banned Users",    value: stats?.bannedUsers,   accent: "rose"    },
    { label: "Total Chats",     value: stats?.totalChats,    accent: "emerald" },
    { label: "Total Messages",  value: stats?.totalMessages, accent: "emerald" },
    { label: "Active Sessions", value: stats?.totalSessions, accent: "emerald" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">Overview</h2>
        <button type="button" onClick={onRefresh} className={iconBtn("slate")} title="Refresh">
          <Refresh size={13} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(({ label, value, accent }) => (
          <div key={label} className={cardCls + " px-5 py-4"}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${accent === "rose" ? "text-rose-500 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-300"}`}>
              {value ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sorting hook ──────────────────────────────────────────────────────────────

function useSortState(defaultField) {
  const [sortBy,  setSortBy]  = useState(defaultField);
  const [sortDir, setSortDir] = useState("DESC");
  const toggle = (field) => {
    if (sortBy === field) setSortDir(d => d === "DESC" ? "ASC" : "DESC");
    else { setSortBy(field); setSortDir("DESC"); }
  };
  const indicator = (field) => sortBy === field ? (sortDir === "DESC" ? " ↓" : " ↑") : "";
  return { sortBy, sortDir, toggle, indicator };
}

// ─── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab({ currentUser, onStatsChange }) {
  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("");
  const [statusFilter,setStatusFilter]= useState("");
  const [editUser,    setEditUser]    = useState(null);  // user being edited
  const [createOpen,  setCreateOpen]  = useState(false);
  const debounceRef   = useRef(null);
  const { sortBy, sortDir, toggle, indicator } = useSortState("id");

  const load = useCallback(async (s = search, role = roleFilter, status = statusFilter, sBy = sortBy, sDir = sortDir) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: 200, search: s, sortBy: sBy, sortDir: sDir });
      if (role)   q.set("role",   role);
      if (status) q.set("status", status);
      const d = await api.get(`/api/admin/users?${q}`);
      setUsers(d.users || []);
    } catch {} finally { setLoading(false); }
  }, [search, roleFilter, statusFilter, sortBy, sortDir]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(search, roleFilter, statusFilter, sortBy, sortDir), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, roleFilter, statusFilter, sortBy, sortDir, load]);

  const handleBan = async (u) => {
    await api.post(`/api/admin/users/${u.id}/ban`, { banned: !u.banned });
    load(); onStatsChange();
  };
  const handleDelete = async (u) => {
    if (!confirm(`Delete user @${u.username}? This cannot be undone.`)) return;
    await api.delete(`/api/admin/users/${u.id}`);
    load(); onStatsChange();
  };
  const handleRoleToggle = async (u) => {
    const next = u.role === "admin" ? "user" : "admin";
    await api.post(`/api/admin/users/${u.id}/role`, { role: next });
    load();
  };

  const SortTh = ({ field, children }) => (
    <th className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
        onClick={() => toggle(field)}>
      <span className="flex items-center gap-1">{children}<ArrowUpDown size={11} className="opacity-40" />{indicator(field)}</span>
    </th>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search users…" value={search}
            onChange={e => setSearch(e.target.value)}
            className={inputCls + " pl-8"} />
        </div>
        <FilterSelect value={roleFilter}   onChange={setRoleFilter}   options={[["","All roles"],["user","User"],["admin","Admin"],["owner","Owner"]]} />
        <FilterSelect value={statusFilter} onChange={setStatusFilter} options={[["","All status"],["online","Online"],["invisible","Invisible"],["banned","Banned"]]} />
        <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}>
          <UserPlus size={13} /> New user
        </button>
      </div>

      {loading ? <LoadingRows /> : users.length === 0 ? <EmptyState message="No users found." /> : (
        <div className={"overflow-hidden " + cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 dark:border-white/5">
                <tr>
                  <SortTh field="username">User</SortTh>
                  <SortTh field="role">Role</SortTh>
                  <SortTh field="created_at">Joined</SortTh>
                  <SortTh field="last_seen">Last seen</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: u.color || "#10b981" }}>
                          {(u.nickname || u.username || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {u.nickname || u.username}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <RoleBadge role={u.role} />
                      {u.banned && <span className="ml-1.5 text-[10px] font-semibold text-rose-500">banned</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(u.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`flex items-center gap-1 text-[11px] ${u.banned ? "text-rose-400" : u.status === "online" ? "text-emerald-500" : "text-slate-400 dark:text-slate-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.banned ? "bg-rose-400" : u.status === "online" ? "bg-emerald-400" : "bg-slate-300 dark:bg-slate-600"}`} />
                        {u.banned ? "banned" : (u.status || "—")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {u.id !== currentUser.id ? (
                          <>
                            <button type="button" onClick={() => setEditUser(u)} className={iconBtn("slate")} title="Edit"><Pencil size={13} /></button>
                            <button type="button" onClick={() => handleRoleToggle(u)} className={iconBtn(u.role === "admin" ? "slate" : "emerald")} title={u.role === "admin" ? "Demote to user" : "Promote to admin"}><ShieldCog size={13} /></button>
                            <button type="button" onClick={() => handleBan(u)} className={iconBtn(u.banned ? "emerald" : "orange")} title={u.banned ? "Unban" : "Ban"}><Ban size={13} /></button>
                            <button type="button" onClick={() => handleDelete(u)} className={iconBtn("rose")} title="Delete user"><Trash size={13} /></button>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400">You</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={() => { load(); onStatsChange(); }} />}
      {editUser   && <EditUserModal   user={editUser} onClose={() => setEditUser(null)} onSaved={() => load()} />}
    </div>
  );
}

// ─── Chats tab ─────────────────────────────────────────────────────────────────

function ChatsTab({ onStatsChange }) {
  const [chats,      setChats]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [editChat,   setEditChat]   = useState(null);
  const [membersChat,setMembersChat]= useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const debounceRef  = useRef(null);
  const { sortBy, sortDir, toggle, indicator } = useSortState("id");

  const load = useCallback(async (s = search, type = typeFilter, sBy = sortBy, sDir = sortDir) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ limit: 200, search: s, sortBy: sBy, sortDir: sDir });
      if (type) q.set("type", type);
      const d = await api.get(`/api/admin/chats?${q}`);
      setChats(d.chats || []);
    } catch {} finally { setLoading(false); }
  }, [search, typeFilter, sortBy, sortDir]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(search, typeFilter, sortBy, sortDir), 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, typeFilter, sortBy, sortDir, load]);

  const handleDelete = async (c) => {
    if (!confirm(`Delete "${c.name || `Chat #${c.id}`}"? This cannot be undone.`)) return;
    await api.delete(`/api/admin/chats/${c.id}`);
    load(); onStatsChange();
  };

  const SortTh = ({ field, children }) => (
    <th className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400"
        onClick={() => toggle(field)}>
      <span className="flex items-center gap-1">{children}<ArrowUpDown size={11} className="opacity-40" />{indicator(field)}</span>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search chats…" value={search}
            onChange={e => setSearch(e.target.value)}
            className={inputCls + " pl-8"} />
        </div>
        <FilterSelect value={typeFilter} onChange={setTypeFilter}
          options={[["","All types"],["dm","DMs"],["group","Groups"],["channel","Channels"]]} />
        <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}>
          <Plus size={13} /> New chat
        </button>
      </div>

      {loading ? <LoadingRows /> : chats.length === 0 ? <EmptyState message="No chats found." /> : (
        <div className={"overflow-hidden " + cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 dark:border-white/5">
                <tr>
                  <SortTh field="name">Chat</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Type</th>
                  <SortTh field="member_count"><Users size={11} className="inline mr-1 opacity-60" />Members</SortTh>
                  <SortTh field="message_count"><MessageCircleMore size={11} className="inline mr-1 opacity-60" />Messages</SortTh>
                  <SortTh field="created_at">Created</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                {chats.map(c => (
                  <tr key={c.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <ChatTypeIcon type={c.type} size={14} />
                        <div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{c.name || `Chat #${c.id}`}</p>
                          {c.group_username && <p className="text-[11px] text-slate-400 dark:text-slate-500">@{c.group_username}</p>}
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
                            <button type="button" onClick={() => setEditChat(c)} className={iconBtn("slate")} title="Edit"><Pencil size={13} /></button>
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

      {createOpen   && <CreateChatModal onClose={() => setCreateOpen(false)} onCreated={() => { load(); onStatsChange(); }} />}
      {editChat     && <EditChatModal   chat={editChat} onClose={() => setEditChat(null)} onSaved={() => load()} />}
      {membersChat  && <MembersModal    chat={membersChat} onClose={() => setMembersChat(null)} />}
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`relative w-full ${wide ? "max-w-lg" : "max-w-sm"} rounded-2xl border border-emerald-100/70 bg-white shadow-xl dark:border-emerald-500/30 dark:bg-slate-950`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
          <button type="button" onClick={onClose} className={iconBtn("slate")}><Close size={14} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1.5">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

// — Create User —

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm]   = useState({ nickname: "", username: "", password: "", role: "user" });
  const [error, setError] = useState("");
  const [busy,  setBusy]  = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const r = await api.post("/api/admin/users", form);
      if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; }
      onCreated(); onClose();
    } catch { setError("Request failed."); } finally { setBusy(false); }
  };

  return (
    <Modal title="Create user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Display name"><input className={inputCls} value={form.nickname} onChange={e => set("nickname", e.target.value)} required /></Field>
        <Field label="Username"><input className={inputCls} value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} required /></Field>
        <Field label="Password"><input type="password" className={inputCls} value={form.password} onChange={e => set("password", e.target.value)} required /></Field>
        <Field label="Role">
          <select className={inputCls} value={form.role} onChange={e => set("role", e.target.value)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>
          {busy ? "Creating…" : "Create user"}
        </button>
      </form>
    </Modal>
  );
}

// — Edit User —

function EditUserModal({ user, onClose, onSaved }) {
  const [form,  setForm]  = useState({ nickname: user.nickname || "", username: user.username || "", status: user.status || "online", color: user.color || "" });
  const [pwForm,setPwForm]= useState({ password: "" });
  const [error, setError] = useState("");
  const [busy,  setBusy]  = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submitProfile = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const r = await api.patch(`/api/admin/users/${user.id}`, form);
      if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; }
      onSaved(); onClose();
    } catch { setError("Request failed."); } finally { setBusy(false); }
  };

  const submitPassword = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const r = await api.post(`/api/admin/users/${user.id}/reset-password`, pwForm);
      if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; }
      onClose();
    } catch { setError("Request failed."); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Edit @${user.username}`} onClose={onClose}>
      <div className="space-y-4">
        <form onSubmit={submitProfile} className="space-y-3">
          <Field label="Display name"><input className={inputCls} value={form.nickname} onChange={e => set("nickname", e.target.value)} /></Field>
          <Field label="Username"><input className={inputCls} value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} /></Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={e => set("status", e.target.value)}>
              <option value="online">Online</option>
              <option value="invisible">Invisible</option>
            </select>
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => set("color", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-lg border border-emerald-200/70 bg-white/90 p-1 dark:border-emerald-500/30 dark:bg-slate-900/50" />
              <input className={inputCls} value={form.color} onChange={e => set("color", e.target.value)} placeholder="#10b981" />
            </div>
          </Field>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Saving…" : "Save profile"}</button>
        </form>
        <div className="border-t border-slate-100 pt-4 dark:border-white/5">
          <form onSubmit={submitPassword} className="space-y-3">
            <Field label="New password">
              <input type="password" className={inputCls} value={pwForm.password}
                onChange={e => setPwForm({ password: e.target.value })} placeholder="Min 6 characters" />
            </Field>
            <button type="submit" disabled={busy} className={btnDanger + " w-full justify-center"}>{busy ? "Updating…" : "Reset password"}</button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

// — Create Chat —

function CreateChatModal({ onClose, onCreated }) {
  const [form, setForm]   = useState({ name: "", username: "", type: "group", visibility: "public", owner: "" });
  const [error, setError] = useState("");
  const [busy,  setBusy]  = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const r = await api.post("/api/admin/chats", form);
      if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; }
      onCreated(); onClose();
    } catch { setError("Request failed."); } finally { setBusy(false); }
  };

  return (
    <Modal title="Create chat" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Type">
          <select className={inputCls} value={form.type} onChange={e => set("type", e.target.value)}>
            <option value="group">Group</option>
            <option value="channel">Channel</option>
          </select>
        </Field>
        <Field label="Name"><input className={inputCls} value={form.name} onChange={e => set("name", e.target.value)} required /></Field>
        <Field label="Username / handle"><input className={inputCls} value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} required /></Field>
        <Field label="Owner (username or ID)"><input className={inputCls} value={form.owner} onChange={e => set("owner", e.target.value)} required /></Field>
        <Field label="Visibility">
          <select className={inputCls} value={form.visibility} onChange={e => set("visibility", e.target.value)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Creating…" : "Create chat"}</button>
      </form>
    </Modal>
  );
}

// — Edit Chat —

function EditChatModal({ chat, onClose, onSaved }) {
  const [form, setForm]   = useState({ name: chat.name || "", username: chat.group_username || "", visibility: chat.group_visibility || "public", color: chat.group_color || "", owner: "" });
  const [error, setError] = useState("");
  const [busy,  setBusy]  = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault(); setError(""); setBusy(true);
    const payload = { ...form };
    if (!payload.owner.trim()) delete payload.owner;
    if (!payload.color.trim()) delete payload.color;
    try {
      const r = await api.patch(`/api/admin/chats/${chat.id}`, payload);
      if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; }
      onSaved(); onClose();
    } catch { setError("Request failed."); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Edit ${chat.name || `Chat #${chat.id}`}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><input className={inputCls} value={form.name} onChange={e => set("name", e.target.value)} required /></Field>
        <Field label="Username"><input className={inputCls} value={form.username} onChange={e => set("username", e.target.value.toLowerCase())} /></Field>
        <Field label="Visibility">
          <select className={inputCls} value={form.visibility} onChange={e => set("visibility", e.target.value)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </Field>
        <Field label="Color">
          <div className="flex items-center gap-2">
            <input type="color" value={form.color || "#10b981"} onChange={e => set("color", e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-emerald-200/70 bg-white/90 p-1 dark:border-emerald-500/30 dark:bg-slate-900/50" />
            <input className={inputCls} value={form.color} onChange={e => set("color", e.target.value)} placeholder="#10b981" />
          </div>
        </Field>
        <Field label="Transfer ownership (username or ID — leave empty to keep)">
          <input className={inputCls} value={form.owner} onChange={e => set("owner", e.target.value)} placeholder="username or ID" />
        </Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Saving…" : "Save changes"}</button>
      </form>
    </Modal>
  );
}

// — Members modal —

function MembersModal({ chat, onClose }) {
  const [members,   setMembers]   = useState([]);
  const [allUsers,  setAllUsers]  = useState([]);
  const [addUserId, setAddUserId] = useState("");
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [md, ud] = await Promise.all([
        api.get(`/api/admin/chats/${chat.id}/members`),
        api.get("/api/admin/users?limit=500"),
      ]);
      setMembers(md.members || []);
      setAllUsers(ud.users || []);
    } catch {} finally { setLoading(false); }
  }, [chat.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const memberIds = new Set(members.map(m => String(m.id)));
  const available = allUsers.filter(u => !memberIds.has(String(u.id)));

  const addMember = async () => {
    if (!addUserId) return;
    setError("");
    const r = await api.post(`/api/admin/chats/${chat.id}/members`, { userId: Number(addUserId) });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Failed"); return; }
    setAddUserId(""); loadMembers();
  };

  const removeMember = async (userId) => {
    await api.delete(`/api/admin/chats/${chat.id}/members/${userId}`);
    loadMembers();
  };

  const setRole = async (userId, role) => {
    await api.patch(`/api/admin/chats/${chat.id}/members/${userId}`, { role });
    loadMembers();
  };

  return (
    <Modal title={`Members — ${chat.name || `Chat #${chat.id}`}`} onClose={onClose} wide>
      <div className="space-y-4">
        {/* Add member */}
        <div className="flex gap-2">
          <select className={inputCls + " flex-1"} value={addUserId} onChange={e => setAddUserId(e.target.value)}>
            <option value="">Add a member…</option>
            {available.map(u => <option key={u.id} value={u.id}>@{u.username}{u.nickname ? ` (${u.nickname})` : ""}</option>)}
          </select>
          <button type="button" onClick={addMember} disabled={!addUserId} className={btnPrimary}>
            <UserPlus size={13} />
          </button>
        </div>
        {error && <p className="text-xs text-rose-500">{error}</p>}

        {/* Member list */}
        {loading ? <LoadingRows /> : members.length === 0 ? <EmptyState message="No members." /> : (
          <div className={"overflow-hidden " + cardCls}>
            {members.map((m, i) => (
              <div key={m.id} className={`flex items-center gap-3 px-4 py-2.5 ${i < members.length - 1 ? "border-b border-slate-100 dark:border-white/5" : ""}`}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: m.color || "#10b981" }}>
                  {(m.nickname || m.username || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{m.nickname || m.username}</p>
                  <p className="text-[11px] text-slate-400">@{m.username}</p>
                </div>
                <select value={m.role} onChange={e => setRole(m.id, e.target.value)}
                  className="rounded-lg border border-emerald-200/70 bg-white/90 px-2 py-1 text-xs dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200">
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                  <option value="owner">owner</option>
                </select>
                <button type="button" onClick={() => removeMember(m.id)} className={iconBtn("rose")} title="Remove">
                  <Close size={12} />
                </button>
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
  const vis   = type !== "dm" ? (visibility === "private" ? <Lock size={10} className="shrink-0" /> : <Globe size={10} className="shrink-0" />) : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
      {vis}{label}
    </span>
  );
}

function RoleBadge({ role }) {
  if (!role || role === "user") return <span className="text-[11px] text-slate-400 dark:text-slate-500">user</span>;
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
      {role}
    </span>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-emerald-200/70 bg-white/90 py-2 pl-3 pr-7 text-xs font-medium text-slate-600 outline-none transition focus:border-emerald-400 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-300">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(n => (
        <div key={n} className="h-12 animate-pulse rounded-2xl border border-emerald-200/40 bg-white/60 dark:border-emerald-500/20 dark:bg-slate-900/40" />
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

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return "—"; }
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Pencil, Search, ShieldCog, Trash, UserPlus } from "../../icons/lucide.js";
import { api, cardCls, inputSmCls, btnPrimary, iconBtn, fmtDate } from "./adminShared.js";
import { LoadingRows, EmptyState, FilterDropdown, SortTh, RoleBadge } from "./AdminCommon.jsx";
import { CreateUserModal, EditUserModal } from "./UserModals.jsx";

export default function UsersTab({ currentUser, onStatsChange }) {
  const [users, setUsers]             = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [search, setSearch]           = useState("");
  const [roleFilter, setRoleFilter]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy]           = useState("id");
  const [sortDir, setSortDir]         = useState("DESC");
  const [editUser, setEditUser]       = useState(null);
  const [createOpen, setCreateOpen]   = useState(false);
  const debounceRef = useRef(null);
  const paramsRef = useRef({ search, roleFilter, statusFilter, sortBy, sortDir });
  useEffect(() => { paramsRef.current = { search, roleFilter, statusFilter, sortBy, sortDir }; });

  const load = useCallback(async () => {
    const { search: s, roleFilter: role, statusFilter: status, sortBy: sBy, sortDir: sDir } = paramsRef.current;
    const q = new URLSearchParams({ limit: 200, search: s, sortBy: sBy, sortDir: sDir });
    if (role) q.set("role", role);
    if (status) q.set("status", status);
    try { const d = await api.get(`/api/admin/users?${q}`); setUsers(d.users || []); } catch {}
    setInitialized(true);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 250);
    return () => clearTimeout(debounceRef.current);
  }, [search, roleFilter, statusFilter, sortBy, sortDir, load]);

  const toggleSort = (field) => {
    setSortBy((prev) => {
      if (prev === field) { setSortDir((d) => (d === "DESC" ? "ASC" : "DESC")); return field; }
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
          <input type="text" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className={inputSmCls + " pl-8"} />
        </div>
        <FilterDropdown value={roleFilter} onChange={setRoleFilter} options={[["", "All roles"], ["user", "User"], ["admin", "Admin"], ["owner", "Owner"]]} />
        <FilterDropdown value={statusFilter} onChange={setStatusFilter} options={[["", "All"], ["online", "Show Online"], ["invisible", "Invisible"], ["banned", "Banned"]]} />
        <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}><UserPlus size={13} /> New user</button>
      </div>

      {!initialized ? <LoadingRows /> : users.length === 0 ? <EmptyState message="No users found." /> : (
        <div className={"overflow-hidden " + cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 dark:border-white/5">
                <tr>
                  <SortTh field="username" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>User</SortTh>
                  <SortTh field="role" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Role</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Status pref.</th>
                  <SortTh field="created_at" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Joined</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                {users.map((u) => (
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
                          <button type="button" onClick={() => setEditUser(u)} className={iconBtn("slate")} title="Edit"><Pencil size={13} /></button>
                          <button type="button" onClick={() => handleRoleToggle(u)} className={iconBtn(u.role === "admin" ? "slate" : "emerald")} title={u.role === "admin" ? "Demote" : "Promote to admin"}><ShieldCog size={13} /></button>
                          <button type="button" onClick={() => handleBan(u)} className={iconBtn(u.banned ? "emerald" : "orange")} title={u.banned ? "Unban" : "Ban"}><Ban size={13} /></button>
                          <button type="button" onClick={() => handleDelete(u)} className={iconBtn("rose")} title="Delete"><Trash size={13} /></button>
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
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
    </div>
  );
}

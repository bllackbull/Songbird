import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Ban, CirclePlus, Pencil, Search, ShieldCheck, ShieldOff, Trash, UserPlus } from "../../icons/lucide.js";
import { api, cardCls, inputSmCls, btnPrimary, iconBtn, fmtDate, searchIconCls } from "./adminShared.js";
import { LoadingRows, EmptyState, FilterDropdown, SortTh, RoleBadge } from "./AdminCommon.jsx";
import AdminUserModal from "./AdminUserModal.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import Avatar from "../common/Avatar.jsx";

const UsersTab = forwardRef(function UsersTab({ currentUser, onStatsChange }, ref) {
  const [users, setUsers]             = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [search, setSearch]           = useState("");
  const [roleFilter, setRoleFilter]   = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy]           = useState("id");
  const [sortDir, setSortDir]         = useState("ASC");
  const [editUser, setEditUser]       = useState(null);
  const [createOpen, setCreateOpen]   = useState(false);
  // Pending action for confirmation modals. Shape: { type, user } or null.
  const [pending, setPending]         = useState(null);
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

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

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
    await api.delete(`/api/admin/users/${u.id}`);
    load(); onStatsChange();
  };
  const handleRoleToggle = async (u) => {
    await api.post(`/api/admin/users/${u.id}/role`, { role: u.role === "admin" ? "user" : "admin" });
    load();
  };

  // Whether the currently logged-in admin is themselves the server owner.
  const iAmOwner = currentUser?.role === "owner";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="group relative block min-w-40 flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Search size={13} className={searchIconCls} />
          </span>
          <input type="text" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className={inputSmCls + " pl-8"} />
        </label>
        <FilterDropdown value={roleFilter} onChange={setRoleFilter} options={[["", "All roles"], ["user", "User"], ["admin", "Admin"], ["owner", "Owner"], ["banned", "Banned"]]} />
        <FilterDropdown value={statusFilter} onChange={setStatusFilter} options={[["", "All"], ["online", "Online"], ["offline", "Offline"]]} />
        <button type="button" onClick={() => setCreateOpen(true)} className={btnPrimary}><UserPlus size={13} className="icon-anim-pop" /> New user</button>
      </div>

      {!initialized ? <LoadingRows /> : users.length === 0 ? <EmptyState message="No users found." /> : (
        <div className={"overflow-hidden " + cardCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 dark:border-white/5">
                <tr>
                  <SortTh field="nickname" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>User</SortTh>
                  <SortTh field="role" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Role</SortTh>
                  <SortTh field="last_seen" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Last seen</SortTh>
                  <SortTh field="created_at" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Joined</SortTh>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/[0.04]">
                {users.map((u) => {
                  const isSelf    = u.id === currentUser.id;
                  const isOwnerRow  = u.role === "owner";
                  const isAdminRow  = u.role === "admin";
                  // An admin cannot act on the owner or on other admins.
                  // The owner can act on everyone (except themselves for ban/delete).
                  const actionsBlocked = !isSelf && !iAmOwner && (isOwnerRow || isAdminRow);

                  return (
                    <tr key={u.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="relative shrink-0">
                            <Avatar
                              src={u.avatar_url}
                              name={u.nickname || u.username}
                              color={u.color || "#10b981"}
                              className="h-7 w-7 text-xs font-bold text-white"
                            />
                            {u.online ? <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" title="Online" /> : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{u.nickname || u.username}</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {u.banned
                            ? <span className="rounded-full bg-rose-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">banned</span>
                            : <RoleBadge role={u.role} />}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[11px]">
                        {u.online
                          ? <span className="font-semibold text-emerald-500">Online</span>
                          : <span className="text-slate-400 dark:text-slate-500">{u.last_seen ? fmtDate(u.last_seen) : "—"}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-2.5">
                        {isSelf ? (
                          /* Self — show edit + role (functional), ban + delete disabled */
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setEditUser(u)} className={iconBtn("slate")} title="Edit"><Pencil size={13} className="icon-anim-sway" /></button>
                            <button type="button" disabled className={iconBtn(u.role === "admin" ? "rose" : "emerald")} title="Cannot change your own role">
                              {u.role === "admin" ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                            </button>
                            <button type="button" disabled className={iconBtn("rose")} title="Cannot ban yourself"><Ban size={13} /></button>
                            <button type="button" disabled className={iconBtn("rose")} title="Cannot delete yourself"><Trash size={13} /></button>
                          </div>
                        ) : actionsBlocked ? (
                          /* Owner row (for non-owners) or admin row (for non-owners) — all buttons disabled */
                          <div className="flex items-center gap-1">
                            <button type="button" disabled className={iconBtn("slate")} title={isOwnerRow ? "Cannot edit the owner" : "Cannot edit other admins"}><Pencil size={13} /></button>
                            <button type="button" disabled className={iconBtn(isOwnerRow ? "emerald" : "slate")} title={isOwnerRow ? "Cannot change the owner's role" : "Cannot change another admin's role"}>
                              <ShieldOff size={13} />
                            </button>
                            <button type="button" disabled className={iconBtn("rose")} title={isOwnerRow ? "Cannot ban the owner" : "Cannot ban other admins"}><Ban size={13} /></button>
                            <button type="button" disabled className={iconBtn("rose")} title={isOwnerRow ? "Cannot delete the owner" : "Cannot delete other admins"}><Trash size={13} /></button>
                          </div>
                        ) : (
                          /* Normal row — full controls */
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setEditUser(u)} disabled={!!u.banned} className={iconBtn("slate")} title={u.banned ? "Cannot edit a banned user" : "Edit"}><Pencil size={13} className="icon-anim-sway" /></button>
                            <button type="button" onClick={() => setPending({ type: "role", user: u })} disabled={!!u.banned || isOwnerRow}
                              className={iconBtn(u.role === "admin" ? "rose" : "emerald")}
                              title={u.banned ? "Cannot change role of a banned user" : isOwnerRow ? "Cannot demote the owner" : u.role === "admin" ? "Demote from admin" : "Promote to admin"}>
                              {u.role === "admin"
                                ? <ShieldOff size={13} className="icon-anim-beat" />
                                : <ShieldCheck size={13} className="icon-anim-beat" />}
                            </button>
                            <button type="button" onClick={() => setPending({ type: "ban", user: u })} className={iconBtn(u.banned ? "emerald" : "rose")} title={u.banned ? "Unban" : "Ban"}>
                              {u.banned ? <CirclePlus size={13} className="icon-anim-pop" /> : <Ban size={13} className="icon-anim-wiggle" />}
                            </button>
                            <button type="button" onClick={() => setPending({ type: "delete", user: u })} className={iconBtn("rose")} title="Delete"><Trash size={13} className="icon-anim-slide" /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen && <AdminUserModal mode="create" onClose={() => setCreateOpen(false)} onSaved={() => { load(); onStatsChange(); }} />}
      {editUser && <AdminUserModal mode="edit" user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}

      {/* Role toggle confirm */}
      <ConfirmModal
        open={pending?.type === "role"}
        title={pending?.user?.role === "admin" ? "Demote from admin" : "Promote to admin"}
        message={pending?.user?.role === "admin"
          ? `Remove admin role from @${pending?.user?.username}? They will become a regular user.`
          : `Grant admin access to @${pending?.user?.username}? They will be able to access the admin panel.`}
        confirmLabel={pending?.user?.role === "admin" ? "Demote" : "Promote"}
        onConfirm={async () => { await handleRoleToggle(pending.user); setPending(null); }}
        onClose={() => setPending(null)}
      />
      {/* Ban/unban confirm */}
      <ConfirmModal
        open={pending?.type === "ban"}
        title={pending?.user?.banned ? "Unban user" : "Ban user"}
        message={pending?.user?.banned
          ? `Unban @${pending?.user?.username}? They will regain access to the app.`
          : `Ban @${pending?.user?.username}? They will be signed out and unable to log in.`}
        confirmLabel={pending?.user?.banned ? "Unban" : "Ban"}
        onConfirm={async () => { await handleBan(pending.user); setPending(null); }}
        onClose={() => setPending(null)}
      />
      {/* Delete confirm */}
      <ConfirmModal
        open={pending?.type === "delete"}
        title="Delete user"
        message={`Permanently delete @${pending?.user?.username}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => { await handleDelete(pending.user); setPending(null); }}
        onClose={() => setPending(null)}
      />
    </div>
  );
});

export default UsersTab;

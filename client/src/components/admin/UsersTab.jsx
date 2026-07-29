import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Ban, CirclePlus, Filter, Pencil, ShieldCheck, ShieldOff, Tag, Trash, UserPlus } from "../../icons/lucide.js";
import { api, cardCls, btnPrimary, iconBtn, fmtDate, DEFAULT_PAGE_SIZE } from "./adminShared.js";
import { LoadingRows, EmptyState, FilterDropdown, SortTh, RoleBadge, Pagination, TabToolbar, TabSearchInput } from "./AdminCommon.jsx";
import AdminUserModal from "./AdminUserModal.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import Avatar from "../common/Avatar.jsx";
import UserRoleBadge from "../common/UserRoleBadge.jsx";
import VerifiedBadge from "../common/VerifiedBadge.jsx";
import Tooltip from "../common/Tooltip.jsx";
import { hasPersian } from "../../utils/fontUtils.js";

const UsersTab = forwardRef(function UsersTab({ currentUser, active = true, onMutated, onStatsChange }, ref) {
  const [users, setUsers]             = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(DEFAULT_PAGE_SIZE);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading]         = useState(false);
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
  // Guards against out-of-order responses clobbering newer results.
  const requestIdRef = useRef(0);

  // Fetch one page from the server. Sorting/filtering/search are applied
  // server-side across the entire users table, so the returned page reflects
  // the whole dataset — not just locally held rows. `total` drives the
  // pagination footer.
  const trimmedSearch = search.trim();
  const fetchPage = useCallback(async (targetPage) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const offset = (Math.max(1, targetPage) - 1) * pageSize;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
      sortBy,
      sortDir,
    });
    if (trimmedSearch) params.set("search", trimmedSearch);
    if (roleFilter) params.set("role", roleFilter);
    if (statusFilter) params.set("status", statusFilter);
    try {
      const data = await api.get(`/api/admin/users?${params.toString()}`);
      if (requestId !== requestIdRef.current) return;
      setUsers(data.users ?? []);
      setTotal(Number(data.total || 0));
      setInitialized(true);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setInitialized(true);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [trimmedSearch, roleFilter, statusFilter, sortBy, sortDir, pageSize]);

  // Refetch (debounced) whenever the query or page changes while the tab is visible.
  useEffect(() => {
    if (!active) return undefined;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPage(page), 250);
    return () => clearTimeout(debounceRef.current);
  }, [active, page, fetchPage]);

  const refresh = useCallback(() => fetchPage(page), [fetchPage, page]);
  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  // Changing the query resets to page 1. This lives in the handlers (not an
  // effect) so re-revealing the tab via <Activity> — which re-runs effects but
  // keeps state — never resets the page the admin was already on.
  const changeSearch = (value) => { setSearch(value); setPage(1); };
  const changeRoleFilter = (value) => { setRoleFilter(value); setPage(1); };
  const changeStatusFilter = (value) => { setStatusFilter(value); setPage(1); };
  const changePageSize = (value) => { setPageSize(value); setPage(1); };
  const toggleSort = (field) => {
    setPage(1);
    setSortBy((prev) => {
      if (prev === field) { setSortDir((d) => (d === "DESC" ? "ASC" : "DESC")); return field; }
      setSortDir("DESC"); return field;
    });
  };

  const handleBan = async (u) => {
    await api.post(`/api/admin/users/${u.id}/ban`, { banned: !u.banned });
    refresh(); onMutated(); onStatsChange();
  };
  const handleDelete = async (u) => {
    await api.delete(`/api/admin/users/${u.id}`);
    refresh(); onMutated(); onStatsChange();
  };
  const handleRoleToggle = async (u) => {
    await api.post(`/api/admin/users/${u.id}/role`, { role: u.role === "admin" ? "user" : "admin" });
    refresh(); onMutated();
  };

  // Whether the currently logged-in admin is themselves the server owner.
  const iAmOwner = currentUser?.role === "owner";

  return (
    <div className="space-y-3">
      <TabToolbar>
        <TabSearchInput value={search} onChange={changeSearch} placeholder="Search users…" />
        <FilterDropdown value={roleFilter} onChange={changeRoleFilter} icon={Tag} options={[["", "All roles"], ["user", "User"], ["admin", "Admin"], ["owner", "Owner"], ["banned", "Banned"]]} />
        <FilterDropdown value={statusFilter} onChange={changeStatusFilter} icon={Filter} options={[["", "All"], ["online", "online"], ["offline", "offline"]]} />
        <button type="button" onClick={() => setCreateOpen(true)} title="New user"
          className={btnPrimary + " w-9 shrink-0 justify-center px-0 sm:w-auto sm:justify-start sm:px-3"}>
          <UserPlus size={16} className="icon-anim-pop shrink-0" /> <span className="hidden sm:inline">New user</span>
        </button>
      </TabToolbar>

      {!initialized ? <LoadingRows /> : users.length === 0 ? <EmptyState message="No users found." /> : (
        <>
          {/* Mobile card list */}
          <div className="space-y-2 sm:hidden">
            {users.map((u) => {
              const isSelf    = u.id === currentUser.id;
              const isOwnerRow  = u.role === "owner";
              const isAdminRow  = u.role === "admin";
              const actionsBlocked = !isSelf && !iAmOwner && (isOwnerRow || isAdminRow);
              const displayName = u.nickname || u.username;
              const nameHasPersian = hasPersian(displayName);

              return (
                <div key={u.id} className={"p-3 " + cardCls}>
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <Avatar
                        src={u.avatar_url}
                        name={u.nickname || u.username}
                        color={u.color || "#10b981"}
                        className="h-10 w-10 text-sm font-bold text-white"
                      />
                      {u.online ? (
                        <Tooltip label="online" className="absolute -bottom-0.5 -right-0.5">
                          <span className="h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                        </Tooltip>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="flex items-center gap-0.5 truncate text-sm font-semibold text-slate-700 dark:text-slate-200" dir="ltr">
                              <span className={`truncate ${nameHasPersian ? "font-fa" : ""}`} dir="auto">{displayName}</span>
                              {Boolean(u.verified) && <VerifiedBadge size={14} />}
                              <UserRoleBadge role={u.role} size={14} />
                            </p>
                            {(u.banned || u.role === "admin" || u.role === "owner") && <RoleBadge role={u.role} banned={u.banned} />}
                          </div>
                          <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">@{u.username}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {isSelf ? (
                            <>
                              <Tooltip label="Edit"><button type="button" onClick={() => setEditUser(u)} className={iconBtn("slate")}><Pencil size={16} /></button></Tooltip>
                              <Tooltip label="Cannot change your own role">
                                <button type="button" disabled className={iconBtn(u.role === "admin" ? "rose" : "emerald")}>
                                  {u.role === "admin" ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                                </button>
                              </Tooltip>
                              <Tooltip label="Cannot ban yourself"><button type="button" disabled className={iconBtn("rose")}><Ban size={16} /></button></Tooltip>
                              <Tooltip label="Cannot delete yourself"><button type="button" disabled className={iconBtn("rose")}><Trash size={16} /></button></Tooltip>
                            </>
                          ) : actionsBlocked ? (
                            <>
                              <Tooltip label={isOwnerRow ? "Cannot edit the owner" : "Cannot edit other admins"}><button type="button" disabled className={iconBtn("slate")}><Pencil size={16} /></button></Tooltip>
                              <Tooltip label={isOwnerRow ? "Cannot change the owner's role" : "Cannot change another admin's role"}>
                                <button type="button" disabled className={iconBtn(isOwnerRow ? "rose" : "slate")}>
                                  <ShieldOff size={16} />
                                </button>
                              </Tooltip>
                              <Tooltip label={isOwnerRow ? "Cannot ban the owner" : "Cannot ban other admins"}><button type="button" disabled className={iconBtn("rose")}><Ban size={16} /></button></Tooltip>
                              <Tooltip label={isOwnerRow ? "Cannot delete the owner" : "Cannot delete other admins"}><button type="button" disabled className={iconBtn("rose")}><Trash size={16} /></button></Tooltip>
                            </>
                          ) : (
                            <>
                              <Tooltip label={u.banned ? "Cannot edit a banned user" : "Edit"}><button type="button" onClick={() => setEditUser(u)} disabled={!!u.banned} className={iconBtn("slate")}><Pencil size={16} /></button></Tooltip>
                              <Tooltip label={u.banned ? "Cannot change role of a banned user" : isOwnerRow ? "Cannot demote the owner" : u.role === "admin" ? "Demote from admin" : "Promote to admin"}>
                                <button type="button" onClick={() => setPending({ type: "role", user: u })} disabled={!!u.banned || isOwnerRow}
                                  className={iconBtn(u.role === "admin" ? "rose" : "emerald")}>
                                  {u.role === "admin" ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                                </button>
                              </Tooltip>
                              <Tooltip label={u.banned ? "Unban" : "Ban"}>
                                <button type="button" onClick={() => setPending({ type: "ban", user: u })} className={iconBtn(u.banned ? "emerald" : "rose")}>
                                  {u.banned ? <CirclePlus size={16} /> : <Ban size={16} />}
                                </button>
                              </Tooltip>
                              <Tooltip label="Delete"><button type="button" onClick={() => setPending({ type: "delete", user: u })} className={iconBtn("rose")}><Trash size={16} /></button></Tooltip>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        {u.online
                          ? <span className="font-semibold text-emerald-500">online</span>
                          : <span className="text-slate-400 dark:text-slate-500">Last seen {u.last_seen ? fmtDate(u.last_seen) : "—"}</span>}
                        <span className="text-slate-400 dark:text-slate-500">Joined {fmtDate(u.created_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className={"hidden overflow-hidden sm:block " + cardCls}>
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
                <tbody className="divide-y divide-slate-50 dark:divide-white/4">
                  {users.map((u) => {
                    const isSelf    = u.id === currentUser.id;
                    const isOwnerRow  = u.role === "owner";
                    const isAdminRow  = u.role === "admin";
                    // An admin cannot act on the owner or on other admins.
                    // The owner can act on everyone (except themselves for ban/delete).
                    const actionsBlocked = !isSelf && !iAmOwner && (isOwnerRow || isAdminRow);
                    const displayName = u.nickname || u.username;
                    const nameHasPersian = hasPersian(displayName);

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
                              {u.online ? (
                                <Tooltip label="online" className="absolute -bottom-0.5 -right-0.5">
                                  <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                                </Tooltip>
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <p className="flex items-center gap-0.5 truncate text-xs font-semibold text-slate-700 dark:text-slate-200" dir="ltr">
                                <span className={`truncate ${nameHasPersian ? "font-fa" : ""}`} dir="auto">{displayName}</span>
                                {Boolean(u.verified) && <VerifiedBadge size={14} />}
                                <UserRoleBadge role={u.role} size={14} />
                              </p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <RoleBadge role={u.role} banned={u.banned} />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[11px]">
                          {u.online
                            ? <span className="font-semibold text-emerald-500">online</span>
                            : <span className="text-slate-400 dark:text-slate-500">{u.last_seen ? fmtDate(u.last_seen) : "—"}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(u.created_at)}</td>
                        <td className="px-4 py-2.5">
                          {isSelf ? (
                            /* Self — show edit + role (functional), ban + delete disabled */
                            <div className="flex items-center gap-1">
                              <Tooltip label="Edit"><button type="button" onClick={() => setEditUser(u)} className={iconBtn("slate")}><Pencil size={16} className="icon-anim-sway" /></button></Tooltip>
                              <Tooltip label="Cannot change your own role">
                                <button type="button" disabled className={iconBtn(u.role === "admin" ? "rose" : "emerald")}>
                                  {u.role === "admin" ? <ShieldOff size={16} /> : <ShieldCheck size={16} />}
                                </button>
                              </Tooltip>
                              <Tooltip label="Cannot ban yourself"><button type="button" disabled className={iconBtn("rose")}><Ban size={16} /></button></Tooltip>
                              <Tooltip label="Cannot delete yourself"><button type="button" disabled className={iconBtn("rose")}><Trash size={16} /></button></Tooltip>
                            </div>
                          ) : actionsBlocked ? (
                            /* Owner row (for non-owners) or admin row (for non-owners) — all buttons disabled */
                            <div className="flex items-center gap-1">
                              <Tooltip label={isOwnerRow ? "Cannot edit the owner" : "Cannot edit other admins"}><button type="button" disabled className={iconBtn("slate")}><Pencil size={16} /></button></Tooltip>
                              <Tooltip label={isOwnerRow ? "Cannot change the owner's role" : "Cannot change another admin's role"}>
                                <button type="button" disabled className={iconBtn(isOwnerRow ? "rose" : "slate")}>
                                  <ShieldOff size={16} />
                                </button>
                              </Tooltip>
                              <Tooltip label={isOwnerRow ? "Cannot ban the owner" : "Cannot ban other admins"}><button type="button" disabled className={iconBtn("rose")}><Ban size={16} /></button></Tooltip>
                              <Tooltip label={isOwnerRow ? "Cannot delete the owner" : "Cannot delete other admins"}><button type="button" disabled className={iconBtn("rose")}><Trash size={16} /></button></Tooltip>
                            </div>
                          ) : (
                            /* Normal row — full controls */
                            <div className="flex items-center gap-1">
                              <Tooltip label={u.banned ? "Cannot edit a banned user" : "Edit"}><button type="button" onClick={() => setEditUser(u)} disabled={!!u.banned} className={iconBtn("slate")}><Pencil size={16} className="icon-anim-sway" /></button></Tooltip>
                              <Tooltip label={u.banned ? "Cannot change role of a banned user" : isOwnerRow ? "Cannot demote the owner" : u.role === "admin" ? "Demote from admin" : "Promote to admin"}>
                                <button type="button" onClick={() => setPending({ type: "role", user: u })} disabled={!!u.banned || isOwnerRow}
                                  className={iconBtn(u.role === "admin" ? "rose" : "emerald")}>
                                  {u.role === "admin"
                                    ? <ShieldOff size={16} className="icon-anim-beat" />
                                    : <ShieldCheck size={16} className="icon-anim-beat" />}
                                </button>
                              </Tooltip>
                              <Tooltip label={u.banned ? "Unban" : "Ban"}>
                                <button type="button" onClick={() => setPending({ type: "ban", user: u })} className={iconBtn(u.banned ? "emerald" : "rose")}>
                                  {u.banned ? <CirclePlus size={16} className="icon-anim-pop" /> : <Ban size={16} className="icon-anim-wiggle" />}
                                </button>
                              </Tooltip>
                              <Tooltip label="Delete"><button type="button" onClick={() => setPending({ type: "delete", user: u })} className={iconBtn("rose")}><Trash size={16} className="icon-anim-slide" /></button></Tooltip>
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

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage}
            onPageSizeChange={changePageSize} busy={loading} />
        </>
      )}

      {createOpen && <AdminUserModal mode="create" onClose={() => setCreateOpen(false)} onSaved={() => { refresh(); onMutated(); onStatsChange(); }} />}
      {editUser && <AdminUserModal mode="edit" user={editUser} onClose={() => setEditUser(null)} onSaved={() => { refresh(); onMutated(); }} />}

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

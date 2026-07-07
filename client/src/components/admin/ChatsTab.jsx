import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronDown, Globe, Lock, Megaphone, MessageCircleMore, Pencil, Plus, Search, Trash, Users } from "../../icons/lucide.js";
import { api, cardCls, inputSmCls, btnPrimary, iconBtn, fmtDate, searchIconCls } from "./adminShared.js";
import { LoadingRows, EmptyState, FilterDropdown, SortTh } from "./AdminCommon.jsx";
import AdminGroupModal from "./AdminGroupModal.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import Avatar from "../common/Avatar.jsx";
import { hasPersian } from "../../utils/fontUtils.js";

const ChatsTab = forwardRef(function ChatsTab({ onStatsChange }, ref) {
  const [chats, setChats]             = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("");
  const [sortBy, setSortBy]           = useState("id");
  const [sortDir, setSortDir]         = useState("ASC");
  const [editChat, setEditChat]       = useState(null);
  const [createType, setCreateType]   = useState(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const createMenuRef = useRef(null);
  const debounceRef = useRef(null);
  const paramsRef = useRef({ search, typeFilter, sortBy, sortDir });
  useEffect(() => { paramsRef.current = { search, typeFilter, sortBy, sortDir }; });

  useEffect(() => {
    if (!createMenuOpen) return undefined;
    const close = (e) => { if (!createMenuRef.current?.contains(e.target)) setCreateMenuOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setCreateMenuOpen(false); };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", onKey); };
  }, [createMenuOpen]);

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

  useImperativeHandle(ref, () => ({ refresh: load }), [load]);

  const toggleSort = (field) => {
    setSortBy((prev) => {
      if (prev === field) { setSortDir((d) => (d === "DESC" ? "ASC" : "DESC")); return field; }
      setSortDir("DESC"); return field;
    });
  };

  const handleDelete = async (c) => {
    await api.delete(`/api/admin/chats/${c.id}`);
    load(); onStatsChange();
  };

  const searchHasPersian = hasPersian(search);

  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2 sm:flex-wrap">
        <label className="group relative block min-w-0 flex-1 sm:min-w-40">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <Search size={16} className={searchIconCls} />
          </span>
          <input type="text" placeholder="Search chats…" value={search} onChange={(e) => setSearch(e.target.value)}
            lang={searchHasPersian ? "fa" : "en"} dir={searchHasPersian ? "rtl" : "ltr"}
            className={inputSmCls + " pl-8" + (searchHasPersian ? " font-fa text-right" : "")}
            style={{ unicodeBidi: "plaintext" }} />
        </label>
        <FilterDropdown value={typeFilter} onChange={setTypeFilter} options={[["", "All types"], ["group", "Groups"], ["channel", "Channels"]]} />
        <div ref={createMenuRef} className="relative shrink-0">
          <button type="button" onClick={() => setCreateMenuOpen((o) => !o)} aria-expanded={createMenuOpen} title="New chat"
            className={btnPrimary + " w-9 shrink-0 justify-center px-0 sm:w-auto sm:justify-start sm:px-3"}>
            <Plus size={16} className="icon-anim-pop shrink-0" /> <span className="hidden sm:inline">New chat</span>
            <ChevronDown size={12} className={`hidden transition-transform sm:inline-flex ${createMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {createMenuOpen ? (
            <div className="absolute right-0 z-50 mt-1.5 w-44 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100">
              <button type="button" onClick={() => { setCreateMenuOpen(false); setCreateType("group"); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200">
                <Users size={15} className="text-emerald-500 icon-anim-sway" /> New group
              </button>
              <button type="button" onClick={() => { setCreateMenuOpen(false); setCreateType("channel"); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200">
                <Megaphone size={15} className="text-emerald-500 icon-anim-swing" /> New channel
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {!initialized ? <LoadingRows /> : chats.length === 0 ? <EmptyState message="No chats found." /> : (
        <>
          {/* Mobile card list */}
          <div className="space-y-2 sm:hidden">
            {chats.map((c) => {
              const chatName = c.name || `Chat #${c.id}`;
              const nameHasPersian = hasPersian(chatName);
              return (
              <div key={c.id} className={"p-3 " + cardCls}>
                <div className="flex items-start gap-3">
                  <Avatar
                    src={c.group_avatar_url}
                    name={c.name || "Chat"}
                    color={c.group_color || "#10b981"}
                    className="h-10 w-10 shrink-0 text-sm font-bold text-white"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold text-slate-700 dark:text-slate-200 ${nameHasPersian ? "font-fa" : ""}`} dir="auto">{chatName}</p>
                        {c.group_username && <p className="truncate text-[11px] text-slate-400">@{c.group_username}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setEditChat(c)} className={iconBtn("slate")} title="Edit"><Pencil size={16} /></button>
                        <button type="button" onClick={() => setPendingDelete(c)} className={iconBtn("rose")} title="Delete"><Trash size={16} /></button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1 capitalize">
                        {c.type === "channel" ? <Megaphone size={12} className="text-emerald-500" /> : <Users size={12} className="text-emerald-500" />}
                        {c.type}
                      </span>
                      <span className="flex items-center gap-1 capitalize">
                        {(c.group_visibility || "public") === "private" ? <Lock size={12} className="text-emerald-500" /> : <Globe size={12} className="text-emerald-500" />}
                        {c.group_visibility || "public"}
                      </span>
                      <span className="flex items-center gap-1"><Users size={11} className="text-slate-400" />{c.member_count}</span>
                      <span className="flex items-center gap-1"><MessageCircleMore size={11} className="text-slate-400" />{c.message_count}</span>
                      <span className="text-slate-400 dark:text-slate-500">{fmtDate(c.created_at)}</span>
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
                    <SortTh field="name" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Chat</SortTh>
                    <SortTh field="type" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Type</SortTh>
                    <SortTh field="group_visibility" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Privacy</SortTh>
                    <SortTh field="member_count" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Members</SortTh>
                    <SortTh field="message_count" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Messages</SortTh>
                    <SortTh field="created_at" sortBy={sortBy} sortDir={sortDir} onToggle={toggleSort}>Created</SortTh>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/4">
                  {chats.map((c) => {
                    const chatName = c.name || `Chat #${c.id}`;
                    const nameHasPersian = hasPersian(chatName);
                    return (
                    <tr key={c.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            src={c.group_avatar_url}
                            name={c.name || "Chat"}
                            color={c.group_color || "#10b981"}
                            className="h-7 w-7 shrink-0 text-xs font-bold text-white"
                          />
                          <div className="min-w-0">
                            <p className={`truncate text-xs font-semibold text-slate-700 dark:text-slate-200 ${nameHasPersian ? "font-fa" : ""}`} dir="auto">{chatName}</p>
                            {c.group_username && <p className="text-[11px] text-slate-400">@{c.group_username}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs capitalize text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1.5">
                          {c.type === "channel" ? <Megaphone size={13} className="text-emerald-500" /> : <Users size={13} className="text-emerald-500" />}
                          {c.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs capitalize text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1.5">
                          {(c.group_visibility || "public") === "private" ? <Lock size={13} className="text-emerald-500" /> : <Globe size={13} className="text-emerald-500" />}
                          {c.group_visibility || "public"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1"><Users size={11} className="text-slate-400" />{c.member_count}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1"><MessageCircleMore size={11} className="text-slate-400" />{c.message_count}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-400 dark:text-slate-500">{fmtDate(c.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setEditChat(c)} className={iconBtn("slate")} title="Edit"><Pencil size={16} className="icon-anim-sway" /></button>
                          <button type="button" onClick={() => setPendingDelete(c)} className={iconBtn("rose")} title="Delete"><Trash size={16} className="icon-anim-slide" /></button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {createType && <AdminGroupModal mode="create" initialType={createType} onClose={() => setCreateType(null)} onSaved={() => { load(); onStatsChange(); }} />}
      {editChat && <AdminGroupModal mode="edit" chat={editChat} onClose={() => setEditChat(null)} onSaved={load} />}
      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete chat"
        message={`Permanently delete "${pendingDelete?.name || `Chat #${pendingDelete?.id}`}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => { await handleDelete(pendingDelete); setPendingDelete(null); }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
});

export default ChatsTab;

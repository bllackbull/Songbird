import { useCallback, useEffect, useState } from "react";
import { UserPlus, Close } from "../../icons/lucide.js";
import { api, cardCls, btnPrimary, iconBtn } from "./adminShared.js";
import { Modal, CompactSelect, LoadingRows, EmptyState } from "./AdminCommon.jsx";
import Avatar from "../common/Avatar.jsx";

export function MembersModal({ chat, onClose }) {
  const [members, setMembers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [addUserId, setAddUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const [md, ud] = await Promise.all([api.get(`/api/admin/chats/${chat.id}/members`), api.get("/api/admin/users?limit=500")]);
      setMembers(md.members || []); setAllUsers(ud.users || []);
    } catch {} finally { setLoading(false); }
  }, [chat.id]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const memberIds = new Set(members.map((m) => String(m.id)));
  const available = allUsers.filter((u) => !memberIds.has(String(u.id)));

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
              options={[["", "Add a member…"], ...available.map((u) => [String(u.id), `@${u.username}${u.nickname ? ` (${u.nickname})` : ""}`])]} />
          </div>
          <button type="button" onClick={addMember} disabled={!addUserId} className={btnPrimary}><UserPlus size={13} /></button>
        </div>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        {loading ? <LoadingRows /> : members.length === 0 ? <EmptyState message="No members." /> : (
          <div className={"overflow-hidden " + cardCls}>
            {members.map((m, i) => (
              <div key={m.id} className={`flex items-center gap-3 px-4 py-2.5 ${i < members.length - 1 ? "border-b border-slate-100 dark:border-white/5" : ""}`}>
                <Avatar
                  src={m.avatar_url}
                  name={m.nickname || m.username}
                  color={m.color || "#10b981"}
                  className="h-7 w-7 shrink-0 text-xs font-bold text-white"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{m.nickname || m.username}</p>
                  <p className="text-[11px] text-slate-400">@{m.username}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="w-28">
                    <CompactSelect value={m.role} onChange={(v) => api.patch(`/api/admin/chats/${chat.id}/members/${m.id}`, { role: v }).then(loadMembers)}
                      options={[["member", "Member"], ["admin", "Admin"], ["owner", "Owner"]]} />
                  </div>
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

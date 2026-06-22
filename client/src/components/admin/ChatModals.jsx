import { useCallback, useEffect, useState } from "react";
import { UserPlus, Close } from "../../icons/lucide.js";
import { api, inputCls, cardCls, btnPrimary, iconBtn } from "./adminShared.js";
import { Modal, Field, CustomSelect, LoadingRows, EmptyState } from "./AdminCommon.jsx";

export function CreateChatModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", username: "", type: "group", visibility: "public", owner: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
        <Field label="Type"><CustomSelect value={form.type} onChange={(v) => set("type", v)} options={[["group", "Group"], ["channel", "Channel"]]} /></Field>
        <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required /></Field>
        <Field label="Username"><input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} required /></Field>
        <Field label="Owner (username or user ID)"><input className={inputCls} value={form.owner} onChange={(e) => set("owner", e.target.value)} required /></Field>
        <Field label="Visibility"><CustomSelect value={form.visibility} onChange={(v) => set("visibility", v)} options={[["public", "Public"], ["private", "Private"]]} /></Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Creating…" : "Create"}</button>
      </form>
    </Modal>
  );
}

export function EditChatModal({ chat, onClose, onSaved }) {
  const [form, setForm] = useState({ name: chat.name || "", username: chat.group_username || "", visibility: chat.group_visibility || "public", color: chat.group_color || "", owner: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
        <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required /></Field>
        <Field label="Username"><input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} /></Field>
        <Field label="Visibility"><CustomSelect value={form.visibility} onChange={(v) => set("visibility", v)} options={[["public", "Public"], ["private", "Private"]]} /></Field>
        <Field label="Color">
          <div className="flex items-center gap-2">
            <input type="color" value={form.color || "#10b981"} onChange={(e) => set("color", e.target.value)} className="h-12 w-14 cursor-pointer rounded-xl border border-emerald-200/70 p-1 dark:border-emerald-500/30" />
            <input className={inputCls + " flex-1"} value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="#10b981" />
          </div>
        </Field>
        <Field label="Transfer ownership" hint="Leave empty to keep current owner.">
          <input className={inputCls} value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="username or user ID" />
        </Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Saving…" : "Save changes"}</button>
      </form>
    </Modal>
  );
}

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
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: m.color || "#10b981" }}>
                  {(m.nickname || m.username || "?")[0].toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{m.nickname || m.username}</p>
                  <p className="text-[11px] text-slate-400">@{m.username}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <select value={m.role} onChange={(e) => api.patch(`/api/admin/chats/${chat.id}/members/${m.id}`, { role: e.target.value }).then(loadMembers)}
                    className="rounded-xl border border-emerald-200/70 bg-white/90 px-2 py-1 text-xs text-slate-700 outline-none dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200">
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                    <option value="owner">owner</option>
                  </select>
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

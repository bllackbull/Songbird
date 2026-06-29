import { useState } from "react";
import { api, inputCls, btnPrimary } from "./adminShared.js";
import { Modal, Field, CustomSelect } from "./AdminCommon.jsx";

export function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ nickname: "", username: "", password: "", role: "user" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
        <Field label="Display name"><input className={inputCls} value={form.nickname} onChange={(e) => set("nickname", e.target.value)} required /></Field>
        <Field label="Username"><input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} required /></Field>
        <Field label="Password"><input type="password" className={inputCls} value={form.password} onChange={(e) => set("password", e.target.value)} required /></Field>
        <Field label="Role"><CustomSelect value={form.role} onChange={(v) => set("role", v)} options={[["user", "User"], ["admin", "Admin"]]} /></Field>
        {error && <p className="text-xs text-rose-500">{error}</p>}
        <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Creating…" : "Create user"}</button>
      </form>
    </Modal>
  );
}

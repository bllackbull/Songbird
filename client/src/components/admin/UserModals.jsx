import { useState } from "react";
import { api, inputCls, btnPrimary, btnDanger } from "./adminShared.js";
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

export function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ nickname: user.nickname || "", username: user.username || "", status: user.status || "online", color: user.color || "" });
  const [pwForm, setPwForm] = useState({ password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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
          <Field label="Display name"><input className={inputCls} value={form.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label="Username"><input className={inputCls} value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} /></Field>
          <Field label="Status preference" hint="Whether the user appears online to others when they're active.">
            <CustomSelect value={form.status} onChange={(v) => set("status", v)} options={[["online", "Show online"], ["invisible", "Invisible"]]} />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-2">
              <input type="color" value={form.color || "#10b981"} onChange={(e) => set("color", e.target.value)} className="h-12 w-14 cursor-pointer rounded-xl border border-emerald-200/70 p-1 dark:border-emerald-500/30" />
              <input className={inputCls + " flex-1"} value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="#10b981" />
            </div>
          </Field>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button type="submit" disabled={busy} className={btnPrimary + " w-full justify-center"}>{busy ? "Saving…" : "Save profile"}</button>
        </form>
        <div className="border-t border-slate-100 pt-4 dark:border-white/5">
          <p className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Reset password</p>
          <form onSubmit={submitPassword} className="space-y-3">
            <Field label="New password"><input type="password" className={inputCls} value={pwForm.password} onChange={(e) => setPwForm({ password: e.target.value })} placeholder="Min 6 characters" /></Field>
            <button type="submit" disabled={busy} className={btnDanger + " w-full justify-center"}>{busy ? "Updating…" : "Reset password & sign out"}</button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

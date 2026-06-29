import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Close, Eye, EyeOff, Pencil, Trash } from "../../icons/lucide.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { NICKNAME_MAX, USERNAME_MAX, USERNAME_INPUT_PATTERN } from "../../utils/nameLimits.js";
import { apiFetch } from "../../api/chatApi.js";
import { CHAT_PAGE_CONFIG } from "../../settings/chatPageConfig.js";
import { api, inputCls } from "./adminShared.js";
import Avatar from "../common/Avatar.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";

// ─── Avatar upload helpers ────────────────────────────────────────────────────

async function uploadUserAvatar(userId, file) {
  const fd = new FormData();
  fd.append("avatar", file);
  await apiFetch(`/api/admin/users/${userId}/avatar`, { method: "POST", body: fd });
}

async function deleteUserAvatar(userId) {
  await apiFetch(`/api/admin/users/${userId}/avatar`, { method: "DELETE" });
}

// ─── Shared input style (mirrors DesktopSettingsModal inputs) ─────────────────

const INPUT = "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-16 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
const EYE_BTN = "absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/10";

// ─── Admin Edit User Modal ────────────────────────────────────────────────────

export default function AdminUserModal({ user, onClose, onSaved }) {
  const fileUploadEnabled = CHAT_PAGE_CONFIG.fileUploadEnabled;

  // Profile form
  const [nick, setNick]             = useState(user.nickname || "");
  const [uname, setUname]           = useState(user.username || "");
  const [color, setColor]           = useState(user.color || "#10b981");
  const [profileErr, setProfileErr] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  // Password reset
  const [newPw, setNewPw]           = useState("");
  const [showNewPw, setShowNewPw]   = useState(false);
  const [pwConfirmOpen, setPwConfirmOpen] = useState(false);
  const [pwErr, setPwErr]           = useState("");
  const [pwBusy, setPwBusy]         = useState(false);

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState(user.avatar_url || "");
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const objectUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPendingAvatarFile(file);
    setAvatarRemoved(false);
    setAvatarPreview(url);
  };

  const handleAvatarRemove = () => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    setPendingAvatarFile(null);
    setAvatarRemoved(true);
    setAvatarPreview("");
  };

  // Submit profile + avatar
  const handleProfileSave = async (e) => {
    e.preventDefault();
    setProfileErr(""); setProfileBusy(true);
    try {
      const r = await api.patch(`/api/admin/users/${user.id}`, {
        nickname: nick,
        username: uname.toLowerCase(),
        color,
      });
      if (!r.ok) { const d = await r.json(); setProfileErr(d.error || "Failed"); return; }
      if (fileUploadEnabled) {
        if (pendingAvatarFile) await uploadUserAvatar(user.id, pendingAvatarFile);
        else if (avatarRemoved) await deleteUserAvatar(user.id);
      }
      onSaved(); onClose();
    } catch { setProfileErr("Request failed."); } finally { setProfileBusy(false); }
  };

  // Execute confirmed password reset
  const doPasswordReset = async () => {
    setPwErr(""); setPwBusy(true);
    try {
      const r = await api.post(`/api/admin/users/${user.id}/reset-password`, { password: newPw });
      if (!r.ok) { const d = await r.json(); setPwErr(d.error || "Failed"); return; }
      setNewPw(""); setPwConfirmOpen(false);
    } catch { setPwErr("Request failed."); } finally { setPwBusy(false); }
  };

  const nickHasPersian  = hasPersian(nick);
  const unameHasPersian = hasPersian(uname);
  const profileIdentity = nick || uname || "?";

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-6">
        <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-emerald-100/70 bg-white shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-emerald-100/70 px-6 py-5 dark:border-emerald-500/20">
            <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-200">
              Edit @{user.username}
            </h3>
            <button type="button" onClick={onClose}
              className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10">
              <Close size={18} className="icon-anim-pop" />
            </button>
          </div>

          {/* Scrollable body */}
          <form className="app-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6" onSubmit={handleProfileSave}>

            {/* Avatar */}
            <div className="py-2">
              <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-200">Profile photo</p>
              <div className="mt-3 flex justify-center">
                <div className="relative">
                  <button type="button"
                    onClick={() => { if (fileUploadEnabled) fileInputRef.current?.click(); }}
                    disabled={!fileUploadEnabled}
                    className={`group relative h-14 w-14 overflow-hidden rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-emerald-300/70 ${fileUploadEnabled ? "cursor-pointer border-emerald-200 hover:border-emerald-300 hover:shadow-lg dark:border-emerald-500/30 dark:hover:border-emerald-400/60" : "cursor-not-allowed border-slate-300 opacity-70 dark:border-slate-700"}`}
                    aria-label="Change profile photo">
                    <Avatar src={avatarPreview} name={profileIdentity} color={color || "#10b981"}
                      initials={getAvatarInitials(profileIdentity)} className="h-full w-full text-lg font-bold" />
                    {fileUploadEnabled ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100">
                        <Pencil size={18} className="icon-anim-pop" />
                      </span>
                    ) : null}
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="sr-only" disabled={!fileUploadEnabled} />
                  {avatarPreview ? (
                    <button type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAvatarRemove(); }}
                      className="absolute -right-2 -top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 shadow-md transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-900 dark:text-rose-200 dark:hover:bg-rose-800"
                      aria-label="Remove photo">
                      <Trash size={12} className="icon-anim-sway" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Nickname */}
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nickname</span>
              <div className="relative mt-2">
                <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={NICKNAME_MAX}
                  lang={nickHasPersian ? "fa" : "en"} dir={nickHasPersian ? "rtl" : "ltr"}
                  className={`${INPUT} ${nickHasPersian ? "font-fa text-right" : "text-left"}`}
                  style={{ unicodeBidi: "plaintext" }} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-500">{nick.length}/{NICKNAME_MAX}</span>
              </div>
            </label>

            {/* Username */}
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Username</span>
              <div className="relative mt-2">
                <input value={uname} onChange={(e) => setUname(e.target.value.toLowerCase())} maxLength={USERNAME_MAX}
                  pattern={USERNAME_INPUT_PATTERN} autoCapitalize="none"
                  lang={unameHasPersian ? "fa" : "en"} dir={unameHasPersian ? "rtl" : "ltr"}
                  className={`${INPUT} ${unameHasPersian ? "font-fa text-right" : "text-left"}`}
                  style={{ unicodeBidi: "plaintext" }} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-500">{uname.length}/{USERNAME_MAX}</span>
              </div>
            </label>

            {/* Color — in its own section card */}
            <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Color</p>
              <div className="mt-2 flex items-center gap-2">
                <input className={inputCls + " flex-1"} value={color} onChange={(e) => setColor(e.target.value)} placeholder="#10b981" />
                <input type="color" value={color || "#10b981"} onChange={(e) => setColor(e.target.value)}
                  className="color-swatch h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-emerald-200/70 dark:border-emerald-500/30" />
              </div>
            </div>

            {/* Profile error */}
            {profileErr && <p className="text-xs text-rose-500">{profileErr}</p>}

            {/* Reset password — sits before the save button */}
            <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Reset password</p>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Set a new password for this user. They will be signed out of all sessions.
              </p>
              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <input type={showNewPw ? "text" : "password"} value={newPw}
                    onChange={(e) => setNewPw(e.target.value)} placeholder="Min 6 characters"
                    className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-12 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100" />
                  <button type="button" onClick={() => setShowNewPw((p) => !p)} className={EYE_BTN}>
                    {showNewPw ? <EyeOff size={16} className="icon-anim-peek" /> : <Eye size={16} className="icon-anim-peek" />}
                  </button>
                </div>
                <button type="button" disabled={!newPw || pwBusy}
                  onClick={() => {
                    if (!newPw) return;
                    if (newPw.length < 6) { setPwErr("Password must be at least 6 characters."); return; }
                    setPwErr(""); setPwConfirmOpen(true);
                  }}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20">
                  Reset
                </button>
              </div>
              {pwErr && <p className="mt-2 text-xs text-rose-500">{pwErr}</p>}
            </div>

            {/* Save */}
            <button type="submit" disabled={profileBusy}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:opacity-70">
              {profileBusy ? "Saving…" : "Save profile"}
            </button>

          </form>
        </div>
      </div>

      <ConfirmModal
        open={pwConfirmOpen}
        title="Reset password"
        message={`Reset the password for @${user.username}? They will be signed out of all sessions.`}
        confirmLabel={pwBusy ? "Resetting…" : "Reset"}
        busy={pwBusy}
        onConfirm={doPasswordReset}
        onClose={() => setPwConfirmOpen(false)}
      />
    </>,
    document.body,
  );
}

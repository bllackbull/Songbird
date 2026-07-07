import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Close, Eye, EyeOff, Pencil, Trash } from "../../icons/lucide.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { USERNAME_INPUT_PATTERN, useNameLimits } from "../../utils/nameLimits.js";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const INPUT    = "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-16 text-sm text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
const PW_INPUT = "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-12 text-sm text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
const EYE_BTN  = "absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-200 dark:hover:bg-emerald-500/10";

// ─── Password visibility toggle ───────────────────────────────────────────────

function PwToggle({ show, onToggle }) {
  return (
    <button type="button" onClick={onToggle} className={EYE_BTN}>
      {show ? <EyeOff size={16} className="icon-anim-peek" /> : <Eye size={16} className="icon-anim-peek" />}
    </button>
  );
}

// ─── Admin User Modal (create + edit) ────────────────────────────────────────

export default function AdminUserModal({ mode = "edit", user = null, onClose, onSaved }) {
  const { nicknameMax: NICKNAME_MAX, usernameMax: USERNAME_MAX } = useNameLimits();
  const creating = mode === "create";
  const fileUploadEnabled = CHAT_PAGE_CONFIG.fileUploadEnabled;

  // Profile fields
  const [nick, setNick]             = useState(user?.nickname || "");
  const [uname, setUname]           = useState(user?.username || "");
  const [color, setColor]           = useState(user?.color || "#10b981");
  const [profileErr, setProfileErr] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);

  // Password fields — used for creation (required) and reset (optional)
  const [pw, setPw]                 = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwConfirmOpen, setPwConfirmOpen] = useState(false);
  const [pwErr, setPwErr]           = useState("");
  const [pwBusy, setPwBusy]         = useState(false);

  // Avatar — shown in both modes; in create mode the file is held and uploaded after the user is created
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || "");
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const objectUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPendingAvatarFile(file); setAvatarRemoved(false); setAvatarPreview(url);
  };
  const handleAvatarRemove = () => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; }
    setPendingAvatarFile(null); setAvatarRemoved(true); setAvatarPreview("");
  };

  // Validate password fields (shared by create-submit and reset-click)
  const validatePassword = (password, repeat) => {
    if (!password) return "Password is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (repeat !== undefined && password !== repeat) return "Passwords do not match.";
    return null;
  };

  // ─── Create submit ────────────────────────────────────────────────────────

  const handleCreate = async (e) => {
    e.preventDefault();
    const pwError = validatePassword(pw, confirmPw);
    if (pwError) { setPwErr(pwError); return; }
    setProfileErr(""); setPwErr(""); setProfileBusy(true);
    try {
      const r = await api.post("/api/admin/users", {
        nickname: nick,
        username: uname.toLowerCase(),
        password: pw,
        color,
        role: "user",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setProfileErr(data.error || "Failed"); return; }
      if (fileUploadEnabled && pendingAvatarFile && data?.user?.id) {
        await uploadUserAvatar(data.user.id, pendingAvatarFile);
      }
      onSaved(); onClose();
    } catch { setProfileErr("Request failed."); } finally { setProfileBusy(false); }
  };

  // ─── Edit submit ──────────────────────────────────────────────────────────

  const handleEditSave = async (e) => {
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

  // ─── Password reset (edit mode only) ─────────────────────────────────────

  const handleResetClick = () => {
    const pwError = validatePassword(pw);
    if (pwError) { setPwErr(pwError); return; }
    setPwErr(""); setPwConfirmOpen(true);
  };

  const doPasswordReset = async () => {
    setPwErr(""); setPwBusy(true);
    try {
      const r = await api.post(`/api/admin/users/${user.id}/reset-password`, { password: pw });
      if (!r.ok) { const d = await r.json(); setPwErr(d.error || "Failed"); return; }
      setPw(""); setConfirmPw(""); setPwConfirmOpen(false);
    } catch { setPwErr("Request failed."); } finally { setPwBusy(false); }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const nickHasPersian  = hasPersian(nick);
  const unameHasPersian = hasPersian(uname);
  const profileIdentity = nick || uname || "U";

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-140 flex items-center justify-center bg-black/40 px-6">
        <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-emerald-100/70 bg-white shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">

          {/* Header */}
          <div className="flex items-center justify-between border-b border-emerald-100/70 px-6 py-5 dark:border-emerald-500/20">
            <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-200">
              {creating ? "New user" : `Edit @${user.username}`}
            </h3>
            <button type="button" onClick={onClose}
              className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10">
              <Close size={18} className="icon-anim-pop" />
            </button>
          </div>

          {/* Scrollable body */}
          <form
            className="app-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-6"
            onSubmit={creating ? handleCreate : handleEditSave}
          >

            {/* Avatar */}
            <div className="py-2">
              <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-200">Profile photo</p>
                <div className="mt-3 flex justify-center">
                  <div className="relative">
                    <button type="button"
                      onClick={() => { if (fileUploadEnabled) fileInputRef.current?.click(); }}
                      disabled={!fileUploadEnabled}
                      className={`group relative h-14 w-14 overflow-hidden rounded-full border-2 transition focus:outline-hidden focus:ring-2 focus:ring-emerald-300/70 ${fileUploadEnabled ? "cursor-pointer border-emerald-200 hover:border-emerald-300 hover:shadow-lg dark:border-emerald-500/30 dark:hover:border-emerald-400/60" : "cursor-not-allowed border-slate-300 opacity-70 dark:border-slate-700"}`}
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

            {/* Color */}
            <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Color</p>
              <div className="mt-2 flex items-center gap-2">
                <input className={inputCls + " flex-1"} value={color} onChange={(e) => setColor(e.target.value)} placeholder="#10b981" />
                <input type="color" value={color || "#10b981"} onChange={(e) => setColor(e.target.value)}
                  className="color-swatch h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-emerald-200/70 dark:border-emerald-500/30" />
              </div>
            </div>

            {/* Password section — "Set password" for create, "Reset password" for edit */}
            <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {creating ? "Password" : "Reset password"}
              </p>
              {!creating ? (
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  Set a new password for this user. They will be signed out of all sessions.
                </p>
              ) : null}
              <div className={`mt-3 ${creating ? "space-y-3" : "flex gap-2"}`}>
                {/* Password input */}
                <div className="relative flex-1">
                  <input type={showPw ? "text" : "password"} value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder={creating ? "Min 6 characters" : "New password"}
                    className={PW_INPUT} />
                  <PwToggle show={showPw} onToggle={() => setShowPw((p) => !p)} />
                </div>
                {/* Repeat password (create only) */}
                {creating ? (
                  <div className="relative">
                    <input type={showConfirmPw ? "text" : "password"} value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      placeholder="Repeat password"
                      className={PW_INPUT} />
                    <PwToggle show={showConfirmPw} onToggle={() => setShowConfirmPw((p) => !p)} />
                  </div>
                ) : (
                  /* Reset button (edit only) */
                  <button type="button" disabled={!pw || pwBusy} onClick={handleResetClick}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20">
                    Reset
                  </button>
                )}
              </div>
              {pwErr && <p className="mt-2 text-xs text-rose-500">{pwErr}</p>}
            </div>

            {/* Profile error */}
            {profileErr && <p className="text-xs text-rose-500">{profileErr}</p>}

            {/* Submit */}
            <button type="submit" disabled={profileBusy}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:opacity-70">
              {profileBusy ? (creating ? "Creating…" : "Saving…") : (creating ? "Create user" : "Save profile")}
            </button>

          </form>
        </div>
      </div>

      {/* Reset password confirm (edit only) */}
      {!creating ? (
        <ConfirmModal
          open={pwConfirmOpen}
          title="Reset password"
          message={`Reset the password for @${user.username}? They will be signed out of all sessions.`}
          confirmLabel={pwBusy ? "Resetting…" : "Reset"}
          busy={pwBusy}
          onConfirm={doPasswordReset}
          onClose={() => setPwConfirmOpen(false)}
        />
      ) : null}
    </>,
    document.body,
  );
}

import { useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Trash,
  Upload,
} from "../../icons/lucide.js";
import { getAvatarStyle } from "../../utils/avatarColor.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { InlineError } from "./InlineError.jsx";
import { SettingsMenuActions } from "./SettingsMenuActions.jsx";

export function MobileSettingsPanel({
  settingsPanel,
  user,
  displayName,
  statusDotClass,
  statusValue,
  setSettingsPanel,
  toggleTheme,
  setIsDark,
  isDark,
  handleLogout,
  handleProfileSave,
  avatarPreview,
  profileForm,
  handleAvatarChange,
  handleAvatarRemove,
  setProfileForm,
  statusSelection,
  setStatusSelection,
  handlePasswordSave,
  passwordForm,
  setPasswordForm,
  userColor,
  profileError,
  passwordError,
  fileUploadEnabled,
  notificationsSupported,
  notificationPermission,
  notificationsEnabled,
  notificationStatusLabel,
  onToggleNotifications,
}) {
  const resolvedUserColor = userColor || "#10b981";
  const displayInitials = getAvatarInitials(displayName);
  const profileIdentity = profileForm.nickname || profileForm.username || "S";
  const profileInitials = getAvatarInitials(profileIdentity);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const notificationsOn =
    notificationsSupported &&
    notificationPermission === "granted" &&
    notificationsEnabled;
  const notificationsDisabled = Boolean(notificationStatusLabel);
  return (
    <>
      {!settingsPanel ? (
        <div className="space-y-4 md:hidden">
          <div className="rounded-2xl border border-slate-300/80 bg-white/90 p-4 text-slate-700 dark:border-emerald-500/20 dark:bg-slate-950/60 dark:text-slate-200">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${hasPersian(displayInitials) ? "font-fa" : ""}`}
                  style={getAvatarStyle(resolvedUserColor)}
                >
                  {displayInitials}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                  {displayName}
                </p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                  {statusValue}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-300/80 bg-white/90 p-2 text-sm shadow-sm dark:border-emerald-500/20 dark:bg-slate-950/60">
            <SettingsMenuActions
              variant="mobile"
              setSettingsPanel={setSettingsPanel}
              isDark={isDark}
              toggleTheme={toggleTheme}
              setIsDark={setIsDark}
              handleLogout={handleLogout}
              notificationsOn={notificationsOn}
              notificationsDisabled={notificationsDisabled}
              notificationStatusLabel={notificationStatusLabel}
              onToggleNotifications={onToggleNotifications}
            />
          </div>
        </div>
      ) : null}

      {settingsPanel === "profile" ? (
        <div className="md:hidden">
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-100/70 bg-white/80 p-4 dark:border-emerald-500/30 dark:bg-slate-950/60">
            <button
              type="button"
              onClick={() => setSettingsPanel(null)}
              className="inline-flex items-center justify-center rounded-full border border-emerald-200 p-2 text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              Edit profile
            </h4>
          </div>
          <form className="space-y-4" onSubmit={handleProfileSave}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Profile photo
              </span>
              <div className="mt-3 flex items-center gap-3">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={profileForm.nickname || profileForm.username}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${hasPersian(profileInitials) ? "font-fa" : ""}`}
                    style={getAvatarStyle(resolvedUserColor)}
                  >
                    {profileInitials}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="profilePhotoInput2"
                    className={`inline-flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      fileUploadEnabled
                        ? "cursor-pointer border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:shadow-md dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                        : "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                    }`}
                  >
                    <Upload size={18} className="icon-anim-lift" />
                    <span>Upload Photo</span>
                  </label>
                  <input
                    id="profilePhotoInput2"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="sr-only"
                    disabled={!fileUploadEnabled}
                  />
                  {avatarPreview ? (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleAvatarRemove();
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-md dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-800/50"
                      aria-label="Remove photo"
                    >
                      <Trash size={18} className="icon-anim-sway" />
                    </button>
                  ) : null}
                </div>
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Nickname
              </span>
              <input
                value={profileForm.nickname}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    nickname: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Username
              </span>
              <input
                value={profileForm.username}
                onChange={(event) =>
                  setProfileForm((prev) => ({
                    ...prev,
                    username: event.target.value,
                  }))
                }
                pattern="[a-zA-Z0-9._-]+"
                title="Use english letters, numbers, dot (.), underscore (_), and dash (-)."
                autoCapitalize="none"
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Status
              </p>
              <div className="mt-2 flex flex-row gap-2">
                {["online", "invisible"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusSelection(value)}
                    className={`flex items-center gap-1 rounded-xl border border-2 px-2 py-1 text-xs font-medium transition duration-200 ${
                      statusSelection === value
                        ? "border-emerald-500 bg-emerald-100/50 text-emerald-700 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-200"
                        : "border-emerald-100/70 bg-white/80 text-slate-700 hover:bg-emerald-50/30 dark:border-emerald-500/30 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:bg-slate-900/50"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${value === "online" ? "bg-emerald-400" : "bg-slate-400"}`}
                    />
                    <span>
                      {value.charAt(0).toUpperCase() + value.slice(1)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
            >
              Save profile
            </button>
            <InlineError message={profileError} />
          </form>
        </div>
      ) : null}

      {settingsPanel === "security" ? (
        <div className="md:hidden">
          <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-100/70 bg-white/80 p-4 dark:border-emerald-500/30 dark:bg-slate-950/60">
            <button
              type="button"
              onClick={() => setSettingsPanel(null)}
              className="inline-flex items-center justify-center rounded-full border border-emerald-200 p-2 text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              Security
            </h4>
          </div>
          <form className="space-y-4" onSubmit={handlePasswordSave}>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Current password
              </span>
              <div className="relative mt-2">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      currentPassword: event.target.value,
                    }))
                  }
                  placeholder={showCurrentPassword ? "12345678" : "********"}
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 pr-16 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  aria-label={
                    showCurrentPassword
                      ? "Hide current password"
                      : "Show current password"
                  }
                >
                  {showCurrentPassword ? (
                    <EyeOff size={16} className="icon-anim-peek" />
                  ) : (
                    <Eye size={16} className="icon-anim-peek" />
                  )}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                New password
              </span>
              <div className="relative mt-2">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      newPassword: event.target.value,
                    }))
                  }
                  placeholder={showNewPassword ? "12345678" : "********"}
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 pr-16 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  aria-label={
                    showNewPassword ? "Hide new password" : "Show new password"
                  }
                >
                  {showNewPassword ? (
                    <EyeOff size={16} className="icon-anim-peek" />
                  ) : (
                    <Eye size={16} className="icon-anim-peek" />
                  )}
                </button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Confirm new password
              </span>
              <div className="relative mt-2">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((prev) => ({
                      ...prev,
                      confirmPassword: event.target.value,
                    }))
                  }
                  placeholder={showConfirmPassword ? "12345678" : "********"}
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 pr-16 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                  aria-label={
                    showConfirmPassword
                      ? "Hide confirm password"
                      : "Show confirm password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff size={16} className="icon-anim-peek" />
                  ) : (
                    <Eye size={16} className="icon-anim-peek" />
                  )}
                </button>
              </div>
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
            >
              Update password
            </button>
            <InlineError message={passwordError} />
          </form>
        </div>
      ) : null}
    </>
  );
}

import { ArrowLeft, X as Close, LogOut, Moon, ShieldCheck, Sun, Trash, Upload, User } from "lucide-react";

function ThemeButton({ isDark, toggleTheme, setIsDark }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (toggleTheme) {
          toggleTheme();
        } else {
          setIsDark((prev) => !prev);
        }
      }}
      className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}

export function SettingsMenuPopover({
  showSettings,
  settingsMenuRef,
  setSettingsPanel,
  toggleTheme,
  setIsDark,
  isDark,
  handleLogout,
}) {
  if (!showSettings) return null;

  return (
    <div
      className="absolute bottom-20 right-4 z-10 w-52 rounded-2xl border border-emerald-100/70 bg-white p-2 text-sm shadow-xl dark:border-emerald-500/30 dark:bg-slate-950"
      ref={settingsMenuRef}
    >
      <button
        type="button"
        onClick={() => setSettingsPanel("profile")}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
      >
        <User size={18} />
        Edit profile
      </button>
      <button
        type="button"
        onClick={() => setSettingsPanel("security")}
        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
      >
        <ShieldCheck size={18} />
        Security
      </button>
      <ThemeButton isDark={isDark} toggleTheme={toggleTheme} setIsDark={setIsDark} />
      <button
        type="button"
        onClick={handleLogout}
        className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
      >
        <LogOut size={18} />
        Log out
      </button>
    </div>
  );
}

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
  setAvatarPreview,
  setProfileForm,
  statusSelection,
  setStatusSelection,
  handlePasswordSave,
  passwordForm,
  setPasswordForm,
  userColor,
}) {
  const resolvedUserColor = userColor || "#10b981";
  return (
    <>
      {!settingsPanel ? (
        <div className="space-y-4 md:hidden">
          <div className="rounded-2xl border border-emerald-100/70 bg-white/80 p-4 text-slate-700 dark:border-emerald-500/30 dark:bg-slate-950/60 dark:text-slate-200">
            <div className="flex items-center gap-3">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={displayName} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: resolvedUserColor }}
                >
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">{displayName}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${statusDotClass}`} />
                  {statusValue}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-100/70 bg-white/80 p-2 text-sm shadow-sm dark:border-emerald-500/30 dark:bg-slate-950/60">
            <button
              type="button"
              onClick={() => setSettingsPanel("profile")}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <User size={18} />
              Edit profile
            </button>
            <button
              type="button"
              onClick={() => setSettingsPanel("security")}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <ShieldCheck size={18} />
              Security
            </button>
            <ThemeButton isDark={isDark} toggleTheme={toggleTheme} setIsDark={setIsDark} />
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              <LogOut size={18} />
              Log out
            </button>
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
            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">Edit profile</h4>
          </div>
          <form className="space-y-4" onSubmit={handleProfileSave}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Profile photo</span>
              <div className="mt-3 flex items-center gap-3">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={profileForm.nickname || profileForm.username}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: resolvedUserColor }}
                  >
                    {(profileForm.nickname || profileForm.username || "S").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="profilePhotoInput2"
                    className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-md dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                  >
                    <Upload size={18} />
                    <span className="hidden sm:inline">Upload</span>
                  </label>
                  <input id="profilePhotoInput2" type="file" accept="image/*" onChange={handleAvatarChange} className="sr-only" />
                  {avatarPreview ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarPreview("");
                        setProfileForm((prev) => ({ ...prev, avatarUrl: "" }));
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-md dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-800/50"
                      aria-label="Remove photo"
                    >
                      <Trash size={18} />
                    </button>
                  ) : null}
                </div>
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Nickname</span>
              <input
                value={profileForm.nickname}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, nickname: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Username</span>
              <input
                value={profileForm.username}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Status</p>
              <div className="mt-2 flex flex-row gap-2">
                {["online", "invisible"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusSelection(value)}
                    className={`flex items-center gap-1 rounded-xl border border-2 px-2 py-1 text-xs font-medium transition duration-200 ${
                      statusSelection === value
                        ? "border-emerald-500 bg-emerald-100/50 text-emerald-700 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-200"
                        : "border-emerald-100/70 bg-white/80 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-emerald-500/30 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:bg-slate-900/50"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${value === "online" ? "bg-emerald-400" : "bg-slate-400"}`} />
                    <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
            >
              Save profile
            </button>
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
            <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">Security</h4>
          </div>
          <form className="space-y-4" onSubmit={handlePasswordSave}>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Current password</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">New password</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Confirm new password</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
            >
              Update password
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function DesktopSettingsModal({
  settingsPanel,
  setSettingsPanel,
  handleProfileSave,
  avatarPreview,
  profileForm,
  handleAvatarChange,
  setAvatarPreview,
  setProfileForm,
  statusSelection,
  setStatusSelection,
  handlePasswordSave,
  passwordForm,
  setPasswordForm,
  userColor,
}) {
  if (!settingsPanel) return null;
  const resolvedUserColor = userColor || "#10b981";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-md rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-200">
            {settingsPanel === "profile" ? "Edit profile" : "Security"}
          </h3>
          <button
            type="button"
            onClick={() => setSettingsPanel(null)}
            className="flex items-center justify-center rounded-full border border-emerald-200 p-2 text-emerald-700 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
          >
            <Close size={18} />
          </button>
        </div>

        {settingsPanel === "profile" ? (
          <form className="mt-4 space-y-4" onSubmit={handleProfileSave}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Profile photo</span>
              <div className="mt-3 flex items-center gap-4">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt={profileForm.nickname || profileForm.username}
                    className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: resolvedUserColor }}
                  >
                    {(profileForm.nickname || profileForm.username || "S").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center">
                  <label
                    htmlFor="profilePhotoInput"
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:shadow-md dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20 dark:hover:shadow-md"
                  >
                    <Upload size={18} />
                    <span>Upload Photo</span>
                  </label>
                  <input id="profilePhotoInput" type="file" accept="image/*" onChange={handleAvatarChange} className="sr-only" />
                  {avatarPreview ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarPreview("");
                        setProfileForm((prev) => ({ ...prev, avatarUrl: "" }));
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-md dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-800/50"
                      aria-label="Remove photo"
                    >
                      <Trash size={18} />
                    </button>
                  ) : null}
                </div>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Nickname</span>
              <input
                value={profileForm.nickname}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, nickname: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Username</span>
              <input
                value={profileForm.username}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Status</p>
              <div className="mt-2 flex flex-row gap-2">
                {["online", "invisible"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusSelection(value)}
                    className={`flex items-center gap-2 rounded-2xl border border-2 px-3 py-2 text-xs font-medium transition duration-200 ${
                      statusSelection === value
                        ? "border-emerald-500 bg-emerald-100/50 text-emerald-700 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-200"
                        : "border-emerald-100/70 bg-white/80 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-emerald-500/30 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:bg-slate-900/50"
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full transition duration-200 ${value === "online" ? "bg-emerald-400" : "bg-slate-400"}`} />
                    <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
            >
              Save profile
            </button>
          </form>
        ) : null}

        {settingsPanel === "security" ? (
          <form className="mt-4 space-y-4" onSubmit={handlePasswordSave}>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Current password</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">New password</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Confirm new password</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
            >
              Update password
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

import { useCallback, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Bookmark,
  Database,
  Eye,
  EyeOff,
  Info,
  LogOut,
  Moon,
  Pencil,
  Rocket,
  ShieldCheck,
  Sun,
  Trash,
  User,
} from "../../../icons/lucide.js";
import { LayoutDashboardIcon } from "../../../icons/AnimatedIcons.jsx";
import { hasPersian } from "../../../utils/fontUtils.js";
import { getAvatarInitials } from "../../../utils/avatarInitials.js";
import { USERNAME_INPUT_PATTERN, useNameLimits } from "../../../utils/nameLimits.js";
import { InlineError } from "../common/InlineError.jsx";
import { AboutSettingsPanel } from "./AboutSettingsPanel.jsx";
import { DataSettingsPanel } from "./DataSettingsPanel.jsx";
import { NotificationsSettingsPanel } from "./NotificationsSettingsPanel.jsx";
import ConfirmPasswordModal from "../../modals/ConfirmPasswordModal.jsx";
import Avatar from "../../common/Avatar.jsx";

const DETAIL_TITLES = {
  profile: "Edit profile",
  security: "Security",
  data: "Data",
  notifications: "Notifications",
  about: "About",
};

function MobileMenuRow({
  label,
  icon,
  onClick,
  danger = false,
  showArrow = true,
  trailing = null,
  role,
  ariaChecked,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role={role}
      aria-checked={ariaChecked}
      className={`flex min-h-14 w-full items-center gap-3 px-4 text-left transition active:bg-emerald-50 dark:active:bg-emerald-500/10 ${
        danger
          ? "text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
          : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
      }`}
    >
      <span
        className={`inline-flex shrink-0 ${
          danger ? "text-rose-500 dark:text-rose-300" : "text-emerald-500"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-base font-semibold">
        {label}
      </span>
      {trailing}
      {showArrow ? (
        <ArrowRight
          size={16}
          className="shrink-0 text-slate-300 dark:text-slate-600"
        />
      ) : null}
    </button>
  );
}

function MobileMenuCard({ children, className = "" }) {
  return (
    <div
      className={`divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:divide-white/5 dark:border-white/5 dark:bg-slate-950/60 ${className}`}
    >
      {children}
    </div>
  );
}

export function MobileSettingsPanel({
  settingsPanel,
  user,
  displayName,
  statusTextClass,
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
  notificationsDisabled: notificationsDisabledProp = false,
  notificationStatusLabel,
  onToggleNotifications,
  messagePreviewEnabled,
  onToggleMessagePreview,
  notificationsDebugLine,
  onClearCache,
  dataCacheStats,
  onOpenOwnProfile,
  onOpenSavedMessages,
  onDeleteAccount,
  appInfo,
  appInfoLoading,
  appInfoError,
  onOpenWhatsNew,
  adminPanelEnabled = true,
}) {
  const { nicknameMax: NICKNAME_MAX, usernameMax: USERNAME_MAX } = useNameLimits();
  const handleClosePanel = useCallback(
    () => setSettingsPanel(null),
    [setSettingsPanel],
  );
  const resolvedUserColor = userColor || "#10b981";
  const displayInitials = getAvatarInitials(displayName);
  const profileIdentity = profileForm.nickname || profileForm.username || "S";
  const profileInitials = getAvatarInitials(profileIdentity);
  const nicknameHasPersian = hasPersian(profileForm.nickname || "");
  const usernameHasPersian = hasPersian(profileForm.username || "");
  const nicknameLength = String(profileForm.nickname || "").length;
  const usernameLength = String(profileForm.username || "").length;
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const profilePhotoInputRef = useRef(null);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchDxRef = useRef(0);
  const touchDyRef = useRef(0);
  const trackingSwipeRef = useRef(false);

  const notificationsOn =
    notificationsSupported &&
    notificationPermission === "granted" &&
    notificationsEnabled;
  const notificationsDisabled =
    Boolean(notificationsDisabledProp) || Boolean(notificationStatusLabel);
  const isAdmin = user?.role === "admin" || user?.role === "owner";
  const showAdminPanel = isAdmin && adminPanelEnabled;
  const detailTitle = DETAIL_TITLES[settingsPanel] || "Settings";

  const goBackToMenu = useCallback(() => {
    setSettingsPanel(null);
  }, [setSettingsPanel]);

  const openNotificationsPanel = useCallback(
    () => setSettingsPanel("notifications"),
    [setSettingsPanel],
  );

  const openAdminPanel = useCallback(() => {
    window.history.pushState({}, "", "/admin");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const toggleThemeRow = useCallback(() => {
    if (toggleTheme) {
      toggleTheme();
    } else {
      setIsDark((prev) => !prev);
    }
  }, [setIsDark, toggleTheme]);

  const handleDetailTouchStart = (event) => {
    if (!settingsPanel) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    trackingSwipeRef.current = touch.clientX <= 40;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchDxRef.current = 0;
    touchDyRef.current = 0;
  };

  const handleDetailTouchMove = (event) => {
    if (!trackingSwipeRef.current) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    touchDxRef.current = touch.clientX - touchStartXRef.current;
    touchDyRef.current = touch.clientY - touchStartYRef.current;
  };

  const handleDetailTouchEnd = () => {
    if (!trackingSwipeRef.current) return;
    const dx = touchDxRef.current;
    const dy = Math.abs(touchDyRef.current);
    trackingSwipeRef.current = false;
    if (dx > 80 && dy < 70) {
      goBackToMenu();
    }
  };

  const renderProfilePanel = () => (
    <form className="space-y-4" onSubmit={handleProfileSave}>
      <div className="py-2">
        <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
          Profile photo
        </p>
        <div className="mt-3 flex justify-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (!fileUploadEnabled) return;
                profilePhotoInputRef.current?.click();
              }}
              disabled={!fileUploadEnabled}
              className={`group relative h-12 w-12 overflow-hidden rounded-full border-2 transition focus:outline-hidden focus:ring-2 focus:ring-emerald-300/70 ${
                fileUploadEnabled
                  ? "cursor-pointer border-emerald-200 hover:border-emerald-300 hover:shadow-lg dark:border-emerald-500/30 dark:hover:border-emerald-400/60"
                  : "cursor-not-allowed border-slate-300 opacity-70 dark:border-slate-700"
              }`}
              aria-label="Change profile photo"
            >
              <Avatar
                src={avatarPreview}
                alt={profileForm.nickname || profileForm.username}
                name={profileIdentity}
                color={resolvedUserColor}
                initials={profileInitials}
                className="h-full w-full text-base font-bold"
              />
              {fileUploadEnabled ? (
                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Pencil size={16} className="icon-anim-pop" />
                </span>
              ) : null}
            </button>
            <input
              ref={profilePhotoInputRef}
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
                className="absolute -right-2 -top-2 z-10 inline-flex h-6 min-h-6 w-6 min-w-6 flex-none items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-0 text-rose-600 shadow-md transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-lg dark:border-rose-500/30 dark:bg-rose-900 dark:text-rose-200 dark:hover:bg-rose-800"
                aria-label="Remove photo"
              >
                <Trash size={12} className="icon-anim-sway" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          Nickname
        </span>
        <div className="relative mt-2">
          <input
            value={profileForm.nickname}
            onChange={(event) =>
              setProfileForm((prev) => ({
                ...prev,
                nickname: event.target.value,
              }))
            }
            maxLength={NICKNAME_MAX}
            lang={nicknameHasPersian ? "fa" : "en"}
            dir={nicknameHasPersian ? "rtl" : "ltr"}
            className={`w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 pr-14 text-xs text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
              nicknameHasPersian ? "font-fa text-right" : "text-left"
            }`}
            style={{ unicodeBidi: "plaintext" }}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-slate-500">
            {nicknameLength}/{NICKNAME_MAX}
          </span>
        </div>
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          Username
        </span>
        <div className="relative mt-2">
          <input
            value={profileForm.username}
            onChange={(event) =>
              setProfileForm((prev) => ({
                ...prev,
                username: event.target.value,
              }))
            }
            maxLength={USERNAME_MAX}
            pattern={USERNAME_INPUT_PATTERN}
            title="Use english letters, numbers, dot (.), and underscore (_)."
            autoCapitalize="none"
            lang={usernameHasPersian ? "fa" : "en"}
            dir={usernameHasPersian ? "rtl" : "ltr"}
            className={`w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 pr-14 text-xs text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
              usernameHasPersian ? "font-fa text-right" : "text-left"
            }`}
            style={{ unicodeBidi: "plaintext" }}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 dark:text-slate-500">
            {usernameLength}/{USERNAME_MAX}
          </span>
        </div>
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
              className={`flex items-center gap-1 rounded-xl border-2 px-2 py-1 text-xs font-medium transition duration-200 ${
                statusSelection === value
                  ? "border-emerald-500 bg-emerald-100/50 text-emerald-700 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-200"
                  : "border-emerald-100/70 bg-white/80 text-slate-700 hover:bg-emerald-50/30 dark:border-emerald-500/30 dark:bg-slate-950/50 dark:text-slate-100 dark:hover:bg-slate-900/50"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  value === "online" ? "bg-emerald-400" : "bg-slate-400"
                }`}
              />
              <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Invisible makes you appear offline to others.
        </p>
      </div>
      {onDeleteAccount ? (
        <button
          type="button"
          onClick={() => setDeleteModalOpen(true)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200/80 bg-rose-50/70 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50"
        >
          <Trash size={14} className="icon-anim-sway" />
          Delete account
        </button>
      ) : null}
      <button
        type="submit"
        className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]"
      >
        Save profile
      </button>
      <InlineError message={profileError} />
    </form>
  );

  const renderSecurityPanel = () => (
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
            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 pr-16 text-xs text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => setShowCurrentPassword((prev) => !prev)}
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            aria-label={
              showCurrentPassword ? "Hide current password" : "Show current password"
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
            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 pr-16 text-xs text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => setShowNewPassword((prev) => !prev)}
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            aria-label={showNewPassword ? "Hide new password" : "Show new password"}
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
            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 pr-16 text-xs text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-emerald-700 transition hover:bg-emerald-100 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            aria-label={
              showConfirmPassword ? "Hide confirm password" : "Show confirm password"
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
  );

  const renderDetailPanel = () => {
    if (settingsPanel === "profile") return renderProfilePanel();
    if (settingsPanel === "security") return renderSecurityPanel();
    if (settingsPanel === "data") {
      return (
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <DataSettingsPanel
            dataCacheStats={dataCacheStats}
            onClearCache={onClearCache}
            onClose={handleClosePanel}
            user={user}
            variant="mobile"
          />
        </div>
      );
    }
    if (settingsPanel === "notifications") {
      return (
        <>
          <NotificationsSettingsPanel
            notificationsActive={notificationsOn}
            notificationsDisabled={notificationsDisabled}
            notificationStatusLabel={notificationStatusLabel}
            onToggleNotifications={onToggleNotifications}
            messagePreviewEnabled={messagePreviewEnabled}
            onToggleMessagePreview={onToggleMessagePreview}
            debugLine={notificationsDebugLine}
          />
          <div className="mt-5 flex items-center justify-end">
            <button
              type="button"
              onClick={handleClosePanel}
              className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400"
            >
              Done
            </button>
          </div>
        </>
      );
    }
    if (settingsPanel === "about") {
      return (
        <AboutSettingsPanel
          appInfo={appInfo}
          appInfoLoading={appInfoLoading}
          appInfoError={appInfoError}
          onDone={handleClosePanel}
          variant="mobile"
        />
      );
    }
    return null;
  };

  return (
    <>
      <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-slate-50 dark:bg-slate-900 md:hidden">
        <section
          className={`absolute inset-0 z-10 flex w-full flex-col bg-slate-50 transition-transform duration-300 ease-out will-change-transform dark:bg-slate-900 ${
            settingsPanel ? "-translate-x-full" : "translate-x-0"
          }`}
        >
          <div className="flex h-[72px] shrink-0 items-center justify-center border-b border-slate-300/80 bg-white px-4 py-4 dark:border-emerald-500/20 dark:bg-slate-900">
            <span className="truncate text-base font-semibold text-slate-700 dark:text-slate-200">
              Settings
            </span>
          </div>

          <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(104px+env(safe-area-inset-bottom))]">
            <div className="space-y-3">
              <MobileMenuCard>
                <div className="flex items-center gap-3 px-4 py-4">
                  <button
                    type="button"
                    onClick={onOpenOwnProfile}
                    className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Avatar
                      src={user.avatarUrl}
                      alt={displayName}
                      name={displayName}
                      color={resolvedUserColor}
                      initials={displayInitials}
                      className="h-10 w-10 transition group-hover:ring-2 group-hover:ring-emerald-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-semibold text-emerald-700 dark:text-emerald-200 ${
                          hasPersian(displayName) ? "font-fa" : ""
                        }`}
                        dir="auto"
                        style={{ unicodeBidi: "plaintext" }}
                        title={displayName}
                      >
                        {displayName}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className={statusTextClass}>{statusValue}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    aria-label="Log out"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-md dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
                  >
                    <LogOut size={16} className="icon-anim-slide" />
                  </button>
                </div>
              </MobileMenuCard>

              <MobileMenuCard>
                <MobileMenuRow
                  label="Edit profile"
                  icon={<User size={22} className="icon-anim-sway" />}
                  onClick={() => setSettingsPanel("profile")}
                />
                <MobileMenuRow
                  label="Saved messages"
                  icon={<Bookmark size={22} className="icon-anim-drop" />}
                  onClick={() => onOpenSavedMessages?.()}
                  showArrow={false}
                />
              </MobileMenuCard>

              {showAdminPanel ? (
                <MobileMenuCard>
                  <MobileMenuRow
                    label="Admin Panel"
                    icon={<LayoutDashboardIcon size={22} />}
                    onClick={openAdminPanel}
                    showArrow={false}
                  />
                </MobileMenuCard>
              ) : null}

              <MobileMenuCard>
                <MobileMenuRow
                  label="Security"
                  icon={<ShieldCheck size={22} className="icon-anim-beat" />}
                  onClick={() => setSettingsPanel("security")}
                />
                <MobileMenuRow
                  label="Data"
                  icon={<Database size={22} className="icon-anim-bob" />}
                  onClick={() => setSettingsPanel("data")}
                />
                <MobileMenuRow
                  label="Notifications"
                  icon={<Bell size={22} className="icon-anim-swing" />}
                  onClick={openNotificationsPanel}
                />
                <MobileMenuRow
                  label={isDark ? "Light mode" : "Dark mode"}
                  icon={
                    isDark ? (
                      <Sun size={22} className="icon-anim-spin-dir" />
                    ) : (
                      <Moon size={22} className="icon-anim-spin-left" />
                    )
                  }
                  onClick={toggleThemeRow}
                  showArrow={false}
                  role="switch"
                  ariaChecked={isDark}
                />
              </MobileMenuCard>

              <MobileMenuCard>
                <MobileMenuRow
                  label="What's new"
                  icon={<Rocket size={22} className="icon-anim-lift" />}
                  onClick={() => onOpenWhatsNew?.()}
                  showArrow={false}
                />
                <MobileMenuRow
                  label="About"
                  icon={<Info size={22} className="icon-anim-pop" />}
                  onClick={() => setSettingsPanel("about")}
                />
              </MobileMenuCard>

              <MobileMenuCard>
                <MobileMenuRow
                  label="Log out"
                  icon={<LogOut size={22} className="icon-anim-slide" />}
                  onClick={handleLogout}
                  danger
                  showArrow={false}
                />
              </MobileMenuCard>
            </div>
          </div>
        </section>

        <section
          className={`absolute inset-0 z-20 flex w-full flex-col bg-slate-50 transition-transform duration-300 ease-out will-change-transform dark:bg-slate-900 ${
            settingsPanel ? "translate-x-0" : "translate-x-full"
          }`}
          onTouchStart={handleDetailTouchStart}
          onTouchMove={handleDetailTouchMove}
          onTouchEnd={handleDetailTouchEnd}
        >
          <div className="relative flex h-[72px] shrink-0 items-center gap-3 border-b border-slate-300/80 bg-white px-4 py-4 dark:border-emerald-500/20 dark:bg-slate-900">
            <button
              type="button"
              onClick={goBackToMenu}
              aria-label="Back to settings"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
            >
              <ArrowLeft size={18} />
            </button>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-16">
              <h4 className="truncate text-base font-semibold text-slate-700 dark:text-slate-200">
                {detailTitle}
              </h4>
            </span>
            <span className="ml-auto h-9 w-9 shrink-0" aria-hidden="true" />
          </div>

          <div className="app-scroll min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(104px+env(safe-area-inset-bottom))]">
            {renderDetailPanel()}
          </div>
        </section>
      </div>

      <ConfirmPasswordModal
        open={deleteModalOpen}
        title="Delete account"
        description="This permanently deletes your account, removes your messages, and transfers or deletes any groups/channels you own."
        confirmLabel="Continue"
        deleteLabel="Delete"
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={async (password) => {
          await onDeleteAccount?.(password);
        }}
      />
    </>
  );
}

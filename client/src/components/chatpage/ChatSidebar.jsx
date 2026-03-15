import ChatsListPanel from "../ChatsListPanel.jsx";
import { MobileSettingsPanel, SettingsMenuPopover } from "../settings/index.js";
import SidebarFooter from "./SidebarFooter.jsx";
import SidebarHeader from "./SidebarHeader.jsx";

export default function ChatSidebar({
  mobileTab,
  isConnected,
  editMode,
  visibleChats,
  selectedChats,
  loadingChats,
  activeChatId,
  user,
  formatTime,
  requestDeleteChats,
  toggleSelectChat,
  setActiveChatId,
  setActivePeer,
  setMobileTab,
  setIsAtBottom,
  setUnreadInChat,
  lastMessageIdRef,
  isAtBottomRef,
  onOpenNewChat,
  showSettings,
  settingsMenuRef,
  setSettingsPanel,
  toggleTheme,
  setIsDark,
  isDark,
  handleLogout,
  settingsPanel,
  displayName,
  statusDotClass,
  statusValue,
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
  notificationsDisabled,
  notificationStatusLabel,
  onToggleNotifications,
  onExitEdit,
  onEnterEdit,
  onDeleteChats,
  onOpenSettings,
  settingsButtonRef,
  displayInitials,
}) {
  return (
    <aside
      className={
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-lg shadow-emerald-500/10 dark:border-white/5 dark:bg-slate-900 md:border md:w-[35%] md:shadow-xl md:shadow-emerald-500/15 " +
        (mobileTab === "chat" ? "hidden md:block" : "block")
      }
    >
      <SidebarHeader
        mobileTab={mobileTab}
        editMode={editMode}
        isConnected={isConnected}
        hasChats={Boolean(visibleChats.length)}
        selectedChatsCount={selectedChats.length}
        onExitEdit={onExitEdit}
        onEnterEdit={onEnterEdit}
        onDeleteChats={onDeleteChats}
        onNewChat={onOpenNewChat}
      />

      <SettingsMenuPopover
        showSettings={showSettings}
        settingsMenuRef={settingsMenuRef}
        setSettingsPanel={setSettingsPanel}
        toggleTheme={toggleTheme}
        setIsDark={setIsDark}
        isDark={isDark}
        handleLogout={handleLogout}
        notificationsSupported={notificationsSupported}
        notificationPermission={notificationPermission}
        notificationsEnabled={notificationsEnabled}
        notificationsDisabled={notificationsDisabled}
        notificationStatusLabel={notificationStatusLabel}
        onToggleNotifications={onToggleNotifications}
      />

      <div
        className="min-h-0 flex-1 overflow-hidden py-4"
        style={{ overscrollBehavior: "contain" }}
      >
        {mobileTab === "settings" ? (
          <div className="app-scroll h-full overflow-y-auto overflow-x-hidden px-6 pb-[104px] md:h-[calc(100%-88px)] md:pb-4">
            <MobileSettingsPanel
              settingsPanel={settingsPanel}
              user={user}
              displayName={displayName}
              statusDotClass={statusDotClass}
              statusValue={statusValue}
              setSettingsPanel={setSettingsPanel}
              toggleTheme={toggleTheme}
              setIsDark={setIsDark}
              isDark={isDark}
              handleLogout={handleLogout}
              handleProfileSave={handleProfileSave}
              avatarPreview={avatarPreview}
              profileForm={profileForm}
              handleAvatarChange={handleAvatarChange}
              handleAvatarRemove={handleAvatarRemove}
              setProfileForm={setProfileForm}
              statusSelection={statusSelection}
              setStatusSelection={setStatusSelection}
              handlePasswordSave={handlePasswordSave}
              passwordForm={passwordForm}
              setPasswordForm={setPasswordForm}
              userColor={userColor}
              profileError={profileError}
              passwordError={passwordError}
              fileUploadEnabled={fileUploadEnabled}
              notificationsSupported={notificationsSupported}
              notificationPermission={notificationPermission}
              notificationsEnabled={notificationsEnabled}
              notificationsDisabled={notificationsDisabled}
              notificationStatusLabel={notificationStatusLabel}
              onToggleNotifications={onToggleNotifications}
            />
          </div>
        ) : null}

        <div className={mobileTab === "settings" ? "hidden min-h-0 h-full" : "block min-h-0 h-full"}>
          <div className="app-scroll h-full overflow-y-auto overflow-x-hidden px-6 pb-[104px] md:h-[calc(100%-88px)] md:pb-4">
            <ChatsListPanel
              loadingChats={loadingChats}
              visibleChats={visibleChats}
              user={user}
              editMode={editMode}
              activeChatId={activeChatId}
              selectedChats={selectedChats}
              formatTime={formatTime}
              requestDeleteChats={requestDeleteChats}
              toggleSelectChat={toggleSelectChat}
              setActiveChatId={setActiveChatId}
              setActivePeer={setActivePeer}
              setMobileTab={setMobileTab}
              setIsAtBottom={setIsAtBottom}
              setUnreadInChat={setUnreadInChat}
              lastMessageIdRef={lastMessageIdRef}
              isAtBottomRef={isAtBottomRef}
              onOpenNewChat={onOpenNewChat}
            />
          </div>
        </div>
      </div>

      <SidebarFooter
        user={user}
        displayName={displayName}
        displayInitials={displayInitials}
        statusDotClass={statusDotClass}
        statusValue={statusValue}
        userColor={userColor}
        onOpenSettings={onOpenSettings}
        settingsButtonRef={settingsButtonRef}
      />
    </aside>
  );
}

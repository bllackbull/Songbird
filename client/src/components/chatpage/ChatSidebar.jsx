import { useLayoutEffect, useRef, useState } from "react";
import ChatsListPanel from "../ChatsListPanel.jsx";
import { MobileSettingsPanel, SettingsMenuPopover } from "../settings/index.js";
import SidebarFooter from "./SidebarFooter.jsx";
import SidebarHeader from "./SidebarHeader.jsx";

export default function ChatSidebar({
  mobileTab,
  isConnected,
  isUpdating,
  scrollEpoch = 0,
  editMode,
  visibleChats,
  selectedChats,
  loadingChats,
  activeChatId,
  user,
  formatChatTimestamp,
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
  onOpenNewGroup,
  onOpenNewChannel,
  chatsSearchQuery,
  onChatsSearchChange,
  onChatsSearchFocus,
  onChatsSearchBlur,
  chatsSearchFocused,
  onCloseSearch,
  discoverLoading,
  discoverUsers,
  discoverGroups,
  discoverChannels,
  discoverSaved,
  isSavedChatActive,
  onOpenDiscoveredUser,
  onOpenDiscoveredGroup,
  onOpenSavedMessages,
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
  onOpenNotifications,
  onTestPush,
  testNotificationSent,
  notificationsDebugLine,
  onClearCache,
  onDeleteAccount,
  onExitEdit,
  onEnterEdit,
  onDeleteChats,
  onOpenSettings,
  onOpenOwnProfile,
  settingsButtonRef,
  displayInitials,
}) {
  const chatsScrollRef = useRef(null);
  const chatsContentRef = useRef(null);
  const [isChatsScrollable, setIsChatsScrollable] = useState(false);

  useLayoutEffect(() => {
    const scroller = chatsScrollRef.current;
    const content = chatsContentRef.current;
    if (!scroller) return undefined;
    const updateScrollable = () => {
      const next = scroller.scrollHeight - scroller.clientHeight > 4;
      setIsChatsScrollable((prev) => (prev === next ? prev : next));
    };

    updateScrollable();
    const raf1 = requestAnimationFrame(() => {
      updateScrollable();
      requestAnimationFrame(updateScrollable);
    });

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateScrollable);
      resizeObserver.observe(scroller);
      if (content) {
        resizeObserver.observe(content);
      }
    }

    let mutationObserver = null;
    if (typeof MutationObserver !== "undefined" && content) {
      mutationObserver = new MutationObserver(updateScrollable);
      mutationObserver.observe(content, {
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener("resize", updateScrollable);
    return () => {
      cancelAnimationFrame(raf1);
      window.removeEventListener("resize", updateScrollable);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
    };
  }, [visibleChats.length, chatsSearchQuery, chatsSearchFocused, scrollEpoch]);

  const handleChatsScroll = () => {
    const node = chatsScrollRef.current;
    if (!node) return;
    setIsChatsScrollable(node.scrollHeight - node.clientHeight > 4);
  };

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
        isUpdating={isUpdating}
        hasChats={Boolean(visibleChats.length)}
        selectedChatsCount={selectedChats.length}
        onExitEdit={onExitEdit}
        onEnterEdit={onEnterEdit}
        onDeleteChats={onDeleteChats}
        onNewChat={onOpenNewChat}
        onNewGroup={onOpenNewGroup}
        onNewChannel={onOpenNewChannel}
        chatsSearchQuery={chatsSearchQuery}
        chatsSearchFocused={chatsSearchFocused}
        onChatsSearchChange={onChatsSearchChange}
        onChatsSearchFocus={onChatsSearchFocus}
        onChatsSearchBlur={onChatsSearchBlur}
        onCloseSearch={onCloseSearch}
        chatsScrollable={isChatsScrollable}
        onScrollToTop={() => {
          chatsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }}
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
        onOpenNotifications={onOpenNotifications}
        onOpenSavedMessages={onOpenSavedMessages}
      />

      <div
        className="min-h-0 flex-1 overflow-hidden py-4"
        style={{ overscrollBehavior: "contain" }}
      >
        {mobileTab === "settings" ? (
          <div
            key={`settings-scroll-${scrollEpoch}`}
            className="app-scroll flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden px-6 pb-[104px]"
            style={{
              overscrollBehaviorY: "contain",
              overflowAnchor: "none",
              WebkitOverflowScrolling: "touch",
              scrollbarGutter: "stable both-edges",
            }}
          >
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
              onOpenNotifications={onOpenNotifications}
              onTestPush={onTestPush}
              testNotificationSent={testNotificationSent}
              notificationsDebugLine={notificationsDebugLine}
              onClearCache={onClearCache}
              onOpenOwnProfile={onOpenOwnProfile}
              onOpenSavedMessages={onOpenSavedMessages}
              onDeleteAccount={onDeleteAccount}
            />
          </div>
        ) : null}

        <div className={mobileTab === "settings" ? "hidden min-h-0 h-full" : "flex min-h-0 h-full flex-col"}>
          <div
            key={`chats-scroll-${scrollEpoch}`}
            ref={chatsScrollRef}
            className="app-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pb-[104px]"
            style={{
              overscrollBehaviorY: "contain",
              overflowAnchor: "none",
              WebkitOverflowScrolling: "touch",
              scrollbarGutter: "stable both-edges",
            }}
            onScroll={handleChatsScroll}
          >
            <div ref={chatsContentRef} className="min-h-0">
              <ChatsListPanel
                loadingChats={loadingChats}
                visibleChats={visibleChats}
                user={user}
                editMode={editMode}
                activeChatId={activeChatId}
                selectedChats={selectedChats}
                formatChatTimestamp={formatChatTimestamp}
                requestDeleteChats={requestDeleteChats}
                toggleSelectChat={toggleSelectChat}
                setActiveChatId={setActiveChatId}
                setActivePeer={setActivePeer}
                setMobileTab={setMobileTab}
                setIsAtBottom={setIsAtBottom}
                setUnreadInChat={setUnreadInChat}
                lastMessageIdRef={lastMessageIdRef}
                isAtBottomRef={isAtBottomRef}
                chatsSearchQuery={chatsSearchQuery}
                chatsSearchFocused={chatsSearchFocused}
        discoverLoading={discoverLoading}
        discoverUsers={discoverUsers}
        discoverGroups={discoverGroups}
        discoverChannels={discoverChannels}
        discoverSaved={discoverSaved}
        isSavedChatActive={isSavedChatActive}
        onOpenDiscoveredUser={onOpenDiscoveredUser}
        onOpenDiscoveredGroup={onOpenDiscoveredGroup}
        onOpenSavedMessages={onOpenSavedMessages}
      />
            </div>
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
        onOpenOwnProfile={onOpenOwnProfile}
        settingsButtonRef={settingsButtonRef}
      />
    </aside>
  );
}

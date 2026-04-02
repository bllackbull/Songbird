import {
  Check,
  CheckCheck,
  Clock12,
  File,
  Ghost,
  ImageIcon,
  Mic,
  Minus,
  Bookmark,
  Megaphone,
  Users,
  Video,
} from "../icons/lucide.js";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { hasPersian } from "../utils/fontUtils.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import { renderMarkdownInlinePlain } from "../utils/markdown.js";

export default function ChatsListPanel({
  loadingChats,
  visibleChats,
  user,
  editMode,
  activeChatId,
  selectedChats,
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
  chatsSearchQuery,
  chatsSearchFocused,
  discoverLoading,
  discoverUsers,
  discoverGroups,
  discoverChannels,
  discoverSaved,
  isSavedChatActive,
  onOpenDiscoveredUser,
  onOpenDiscoveredGroup,
  onOpenSavedMessages,
}) {
  const wiggleDurations = [640, 700, 760, 820, 880, 940];
  const wiggleDelays = [-80, -170, -260, -120, -220, -320];
  const isEmptyState = !loadingChats && !visibleChats.length;
  const fallbackUploadTextPattern =
    /^Sent (a media file|a document|a voice message|\d+ files|\d+ media files|\d+ voice messages)$/i;
  const normalizePreviewText = (value) => {
    if (typeof value === "string") {
      return value === "[object Object]" ? "" : value;
    }
    if (value && typeof value === "object") {
      const text = value.text ?? value.body;
      return typeof text === "string" ? text : "";
    }
    if (value === null || value === undefined) return "";
    const str = String(value);
    return str === "[object Object]" ? "" : str;
  };
  const formatLastMessagePreview = (conv) => {
    const files = Array.isArray(conv.last_message_files)
      ? conv.last_message_files
      : [];
    const body = normalizePreviewText(conv.last_message).trim();
    if (!files.length) {
      return {
        icon: null,
        text: body,
      };
    }

    const videoCount = files.filter((file) =>
      String(file.mimeType || "")
        .toLowerCase()
        .startsWith("video/"),
    ).length;
    const imageCount = files.filter((file) =>
      String(file.mimeType || "")
        .toLowerCase()
        .startsWith("image/"),
    ).length;
    const audioCount = files.filter((file) =>
      String(file.mimeType || "")
        .toLowerCase()
        .startsWith("audio/"),
    ).length;
    const docCount = Math.max(0, files.length - videoCount - imageCount - audioCount);

    const isMixedMedia = imageCount > 0 && videoCount > 0 && docCount === 0;
    const hasVoiceOnly = audioCount > 0 && videoCount === 0 && imageCount === 0 && docCount === 0;
    const isFileOnlyBody = !body || fallbackUploadTextPattern.test(body);
    if (!isFileOnlyBody) {
      const icon =
        hasVoiceOnly
          ? "voice"
          : isMixedMedia
          ? "image"
          : videoCount > 0
            ? "video"
            : imageCount > 0
              ? "image"
              : "document";
      return { icon, text: body };
    }

    if (files.length === 1) {
      if (videoCount === 1) return { icon: "video", text: "Sent a video" };
      if (imageCount === 1) return { icon: "image", text: "Sent a photo" };
      if (audioCount === 1) return { icon: "voice", text: "Sent a voice message" };
      return { icon: "document", text: "Sent a document" };
    }

    if (audioCount > 0 && videoCount === 0 && imageCount === 0 && docCount === 0) {
      return {
        icon: "voice",
        text: `Sent ${audioCount} voice message${audioCount > 1 ? "s" : ""}`,
      };
    }
    if (videoCount > 0 && imageCount === 0 && docCount === 0) {
      return {
        icon: "video",
        text: `Sent ${videoCount} video${videoCount > 1 ? "s" : ""}`,
      };
    }
    if (imageCount > 0 && videoCount === 0 && docCount === 0) {
      return {
        icon: "image",
        text: `Sent ${imageCount} photo${imageCount > 1 ? "s" : ""}`,
      };
    }
    if (docCount > 0 && imageCount === 0 && videoCount === 0) {
      return {
        icon: "document",
        text: `Sent ${docCount} document${docCount > 1 ? "s" : ""}`,
      };
    }
    if (isMixedMedia) {
      return {
        icon: "image",
        text: `Sent ${files.length} media files`,
      };
    }
    return { icon: "document", text: `Sent ${files.length} files` };
  };

  const hasDiscoverQuery = Boolean(String(chatsSearchQuery || "").trim());
  const showSearchMode = Boolean(chatsSearchFocused);
  const showSearchEmptyState = showSearchMode && !discoverLoading && !hasDiscoverQuery;
  const hasDiscoverResults =
    (Array.isArray(discoverUsers) && discoverUsers.length > 0) ||
    (Array.isArray(discoverGroups) && discoverGroups.length > 0) ||
    (Array.isArray(discoverChannels) && discoverChannels.length > 0) ||
    Boolean(discoverSaved);
  const resolveDmChatId = (username) => {
    const target = String(username || "").toLowerCase();
    if (!target) return null;
    const dmChat = (visibleChats || []).find((chat) => {
      if (chat?.type !== "dm") return false;
      return (chat.members || []).some(
        (member) => String(member?.username || "").toLowerCase() === target,
      );
    });
    return dmChat?.id ?? null;
  };

  return (
    <div className={showSearchMode || isEmptyState ? "min-h-full" : "mt-3 space-y-2"}>
      {showSearchMode ? (
        <div className={showSearchEmptyState ? "flex min-h-full items-center justify-center py-8" : "mb-3 space-y-3"}>
          {discoverLoading ? (
            <p className="px-1 py-1 text-xs text-slate-500 dark:text-slate-400">Searching...</p>
          ) : null}
          {showSearchEmptyState ? (
            <div className="text-center text-sm text-slate-500 dark:text-slate-400">
              <p>Type to search users, groups, and channels.</p>
            </div>
          ) : null}
          {!showSearchEmptyState && Array.isArray(discoverUsers) && discoverUsers.length > 0 ? (
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                Users
              </p>
              {discoverUsers.map((member) => {
                const label = member.nickname || member.username;
                const initials = getAvatarInitials(label);
                const dmChatId = resolveDmChatId(member.username);
                const isActive = dmChatId && Number(activeChatId) === Number(dmChatId);
                return (
                  <button
                    key={`discover-user-${member.id}-${member.username}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onOpenDiscoveredUser?.(member)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      isActive
                        ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-100"
                        : "border-slate-300/80 bg-white/90 text-slate-700 hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.18)] focus-visible:border-emerald-300 focus-visible:shadow-[0_0_20px_rgba(16,185,129,0.18)] focus-visible:outline-none dark:border-emerald-500/20 dark:bg-slate-950/60 dark:text-slate-200"
                    }`}
                  >
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={label}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs ${hasPersian(initials) ? "font-fa" : ""}`}
                        style={getAvatarStyle(member.color || "#10b981")}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm font-semibold ${hasPersian(label) ? "font-fa" : ""}`}
                        dir="auto"
                        title={label}
                      >
                        {label}
                      </p>
                      <p
                        className="truncate text-xs text-slate-500 dark:text-slate-400"
                        dir="auto"
                        title={member.username}
                      >
                        @{member.username}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          {!showSearchEmptyState && Array.isArray(discoverGroups) && discoverGroups.length > 0 ? (
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                Groups
              </p>
              {discoverGroups.map((group) => {
                const label = group.name || "Group";
                const initials = getAvatarInitials(label);
                const isActive = Number(activeChatId) === Number(group.id);
                return (
                  <button
                    key={`discover-group-${group.id}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onOpenDiscoveredGroup?.(group)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      isActive
                        ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-100"
                        : "border-slate-300/80 bg-white/90 text-slate-700 hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.18)] focus-visible:border-emerald-300 focus-visible:shadow-[0_0_20px_rgba(16,185,129,0.18)] focus-visible:outline-none dark:border-emerald-500/20 dark:bg-slate-950/60 dark:text-slate-200"
                    }`}
                  >
                    {group.avatarUrl ? (
                      <img
                        src={group.avatarUrl}
                        alt={label}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs ${hasPersian(initials) ? "font-fa" : ""}`}
                        style={getAvatarStyle(group.color || "#10b981")}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-semibold ${hasPersian(label) ? "font-fa" : ""}`}
                        dir="auto"
                        title={label}
                      >
                        {label}
                      </p>
                      <p
                        className="truncate text-xs text-slate-500 dark:text-slate-400"
                        dir="auto"
                        title={group.username}
                      >
                        @{group.username} • {Number(group.membersCount || 0).toLocaleString("en-US")} members
                      </p>
                    </div>
                    {group.isMember ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                        Joined
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!showSearchEmptyState && Array.isArray(discoverChannels) && discoverChannels.length > 0 ? (
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                Channels
              </p>
              {discoverChannels.map((channel) => {
                const label = channel.name || "Channel";
                const initials = getAvatarInitials(label);
                const isActive = Number(activeChatId) === Number(channel.id);
                return (
                  <button
                    key={`discover-channel-${channel.id}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onOpenDiscoveredGroup?.(channel)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                      isActive
                        ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-100"
                        : "border-slate-300/80 bg-white/90 text-slate-700 hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.18)] focus-visible:border-emerald-300 focus-visible:shadow-[0_0_20px_rgba(16,185,129,0.18)] focus-visible:outline-none dark:border-emerald-500/20 dark:bg-slate-950/60 dark:text-slate-200"
                    }`}
                  >
                    {channel.avatarUrl ? (
                      <img
                        src={channel.avatarUrl}
                        alt={label}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs ${hasPersian(initials) ? "font-fa" : ""}`}
                        style={getAvatarStyle(channel.color || "#10b981")}
                      >
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-semibold ${hasPersian(label) ? "font-fa" : ""}`}
                        dir="auto"
                        title={label}
                      >
                        {label}
                      </p>
                      <p
                        className="truncate text-xs text-slate-500 dark:text-slate-400"
                        dir="auto"
                        title={channel.username}
                      >
                        @{channel.username} • {Number(channel.membersCount || 0).toLocaleString("en-US")} members
                      </p>
                    </div>
                    {channel.isMember ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                        Joined
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!showSearchEmptyState && discoverSaved ? (
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
                Saved Messages
              </p>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onOpenSavedMessages?.()}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                  isSavedChatActive
                    ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-100"
                    : "border-slate-300/80 bg-white/90 text-slate-700 hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.18)] focus-visible:border-emerald-300 focus-visible:shadow-[0_0_20px_rgba(16,185,129,0.18)] focus-visible:outline-none dark:border-emerald-500/20 dark:bg-slate-950/60 dark:text-slate-200"
                }`}
              >
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={getAvatarStyle("#10b981")}
                >
                  <Bookmark size={16} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">Saved messages</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    Personal notes
                  </p>
                </div>
              </button>
            </div>
          ) : null}
          {!showSearchEmptyState && hasDiscoverQuery && !discoverLoading && !hasDiscoverResults ? (
            <p className="px-1 py-1 text-xs text-slate-500 dark:text-slate-400">No results.</p>
          ) : null}
        </div>
      ) : null}
      {!showSearchMode && loadingChats && !visibleChats.length ? (
        Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`chat-skeleton-${index}`}
            className="w-full animate-pulse rounded-2xl border border-slate-300/80 bg-white/70 px-3 py-3 dark:border-emerald-500/20 dark:bg-slate-950/50"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/2 rounded bg-emerald-100 dark:bg-emerald-900/40" />
                <div className="h-2 w-3/4 rounded bg-emerald-100/80 dark:bg-emerald-900/30" />
              </div>
            </div>
          </div>
        ))
      ) : !showSearchMode && visibleChats.length ? (
        visibleChats.map((conv, index) => {
          const members = conv.members || [];
          const other =
            conv.type === "dm"
              ? members.find((member) => member.username !== user.username)
              : null;
          const isDeletedDm = conv.type === "dm" && !other;
          const isChannel = conv.type === "channel";
          const isGroup = conv.type === "group";
          const isSaved = conv.type === "saved";
          const isChannelOwner =
            isChannel &&
            members.some(
              (member) =>
                Number(member?.id || 0) === Number(user?.id || 0) &&
                String(member?.role || "").toLowerCase() === "owner",
            );
          const name =
            conv.type === "dm"
              ? other?.nickname ||
                other?.username ||
                (isDeletedDm ? "Deleted account" : "Direct message")
              : isSaved
                ? conv.name || "Saved messages"
                : conv.name || "Chat";
          const avatarColor =
            isGroup || isChannel
              ? conv.group_color || "#10b981"
              : isSaved
                ? "#10b981"
                : isDeletedDm
                  ? "#94a3b8"
                  : other?.color || "#10b981";
          const avatarInitials = getAvatarInitials(name);
          const wiggleStyle = editMode
            ? {
                animationDuration: `${wiggleDurations[index % 6]}ms`,
                animationDelay: `${wiggleDelays[index % 6]}ms`,
              }
            : undefined;
          const isOwnLastMessage =
            Boolean(conv.last_message) &&
            conv.last_sender_username === user.username;
          const isOwnLastMessagePending =
            Boolean(conv._lastMessagePending) && isOwnLastMessage;
          const isOwnLastMessageSeen = Boolean(conv.last_message_read_at);
          const lastPreview = formatLastMessagePreview(conv);
          const lastPreviewHtml = renderMarkdownInlinePlain(
            isOwnLastMessagePending ? "Processing..." : lastPreview.text,
          );

          let unreadCount = conv.unread_count;
          if (unreadCount > 999) unreadCount = "+999";

          const card = (
            <div
              className={`w-full min-h-[72px] rounded-2xl border px-3 py-3 text-left text-sm transition ${
                activeChatId === conv.id
                  ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-400/60 dark:bg-emerald-500/20 dark:text-emerald-100"
                  : "border-slate-300/80 bg-white/90 text-slate-700 hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.18)] dark:border-emerald-500/20 dark:bg-slate-950/60 dark:text-slate-200"
              } ${editMode ? "animate-chat-wiggle-ios shadow-[0_0_0_1px_rgba(16,185,129,0.35),0_0_16px_rgba(16,185,129,0.22)]" : ""}`}
              style={wiggleStyle}
            >
              <div className="flex items-start gap-3">
                {(isGroup || isChannel ? conv.group_avatar_url : other?.avatar_url) ? (
                  <img
                    src={isGroup || isChannel ? conv.group_avatar_url : other.avatar_url}
                    alt={name}
                    className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${hasPersian(avatarInitials) ? "font-fa" : ""}`}
                    style={getAvatarStyle(avatarColor)}
                  >
                    {isSaved ? (
                      <Bookmark size={16} className="text-white" />
                    ) : isDeletedDm ? (
                      <Ghost size={16} className="text-slate-600" />
                    ) : (
                      avatarInitials
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5 font-semibold">
                    {isChannel ? (
                      <Megaphone size={14} className="shrink-0 text-emerald-500" />
                    ) : isGroup ? (
                      <Users size={14} className="shrink-0 text-emerald-500" />
                    ) : null}
                      <span
                        className={`min-w-0 max-w-full truncate ${hasPersian(name) ? "font-fa" : ""} ${isDeletedDm ? "text-slate-500" : ""}`}
                        dir="auto"
                        title={name}
                      >
                        {name}
                      </span>
                  </p>
                  <p
                    className="mt-1 w-full min-w-0 overflow-hidden text-xs leading-[1.35] text-slate-500 dark:text-slate-400"
                    style={{ unicodeBidi: "plaintext" }}
                  >
                    {conv.last_message ||
                    (conv.last_message_files || []).length ? (
                      conv.last_sender_username === user.username && !isChannelOwner ? (
                        <span className="flex w-full min-w-0 items-center gap-1 align-middle leading-[1.35]">
                          <span className="shrink-0 font-bold text-slate-500 dark:text-slate-400">
                            You:
                          </span>
                          <span className="flex min-w-0 flex-1 items-center gap-1">
                            {lastPreview.icon === "voice" ? (
                              <Mic
                                size={12}
                                className="shrink-0 text-slate-500 dark:text-slate-400"
                              />
                            ) : lastPreview.icon === "video" ? (
                              <Video
                                size={12}
                                className="shrink-0 text-slate-500 dark:text-slate-400"
                              />
                            ) : lastPreview.icon === "image" ? (
                              <ImageIcon
                                size={12}
                                className="shrink-0 text-slate-500 dark:text-slate-400"
                              />
                            ) : lastPreview.icon === "document" ? (
                              <File
                                size={12}
                                className="shrink-0 text-slate-500 dark:text-slate-400"
                              />
                            ) : null}
                            <span
                              dir="auto"
                              className={`block min-w-0 max-w-full flex-1 truncate leading-[1.35] ${hasPersian(lastPreview.text) ? "font-fa" : ""}`}
                              style={{ unicodeBidi: "plaintext" }}
                              dangerouslySetInnerHTML={{
                                __html: String(lastPreviewHtml || ""),
                              }}
                            />
                          </span>
                        </span>
                      ) : (
                        <span className="flex w-full min-w-0 items-center gap-1 align-middle leading-[1.35]">
                          {isGroup &&
                          (conv.last_sender_nickname || conv.last_sender_username) ? (
                            <span
                              className="shrink-0 max-w-[40%] truncate font-bold text-slate-500 dark:text-slate-400"
                              dir="auto"
                              title={conv.last_sender_nickname || conv.last_sender_username}
                            >
                              {conv.last_sender_nickname || conv.last_sender_username}:
                            </span>
                          ) : null}
                          {lastPreview.icon === "voice" ? (
                            <Mic
                              size={12}
                              className="shrink-0 text-slate-500 dark:text-slate-400"
                            />
                          ) : lastPreview.icon === "video" ? (
                            <Video
                              size={12}
                              className="shrink-0 text-slate-500 dark:text-slate-400"
                            />
                          ) : lastPreview.icon === "image" ? (
                            <ImageIcon
                              size={12}
                              className="shrink-0 text-slate-500 dark:text-slate-400"
                            />
                          ) : lastPreview.icon === "document" ? (
                            <File
                              size={12}
                              className="shrink-0 text-slate-500 dark:text-slate-400"
                            />
                          ) : null}
                          <span
                            dir="auto"
                            className={`block min-w-0 max-w-full flex-1 truncate leading-[1.35] ${hasPersian(lastPreview.text) ? "font-fa" : ""}`}
                            style={{ unicodeBidi: "plaintext" }}
                            dangerouslySetInnerHTML={{
                              __html: String(lastPreviewHtml || ""),
                            }}
                          />
                        </span>
                      )
                    ) : null}
                  </p>
                </div>
                <div className="ml-auto flex min-w-[68px] flex-shrink-0 flex-col items-end gap-1 self-start">
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                    {isOwnLastMessage && !isChannelOwner ? (
                      <span
                        className={`inline-flex items-center ${
                          isOwnLastMessagePending
                            ? "text-emerald-900/80 dark:text-emerald-50/80"
                            : isOwnLastMessageSeen
                              ? "text-sky-400"
                              : "text-slate-500 dark:text-slate-400"
                        } -translate-y-[1px]`}
                      >
                        {isOwnLastMessagePending ? (
                          <Clock12
                            size={13}
                            strokeWidth={2.4}
                            aria-hidden="true"
                            className="animate-spin"
                          />
                        ) : isOwnLastMessageSeen ? (
                          <CheckCheck
                            size={13}
                            strokeWidth={2.4}
                            aria-hidden="true"
                          />
                        ) : (
                          <Check
                            size={13}
                            strokeWidth={2.4}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    ) : null}
                    <p>{conv.last_time ? formatChatTimestamp(conv.last_time) : ""}</p>
                  </div>
                  {conv.unread_count > 0 ? (
                    <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-2 text-[10px] font-bold text-white ${
                      conv._muted ? "bg-slate-400 dark:bg-slate-500" : "bg-emerald-500"
                    }`}>
                      {unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );

          return (
            <div key={conv.id} className="flex items-center gap-3">
              {editMode ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    requestDeleteChats([conv.id]);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                  aria-label="Remove chat"
                >
                  <Minus size={16} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (editMode) return;
                  setActiveChatId(Number(conv.id));
                  const nextOther =
                    conv.type === "dm"
                      ? conv.members?.find(
                          (member) => member.username !== user.username,
                        )
                      : null;
                  setActivePeer(nextOther || null);
                  if (window.matchMedia("(max-width: 767px)").matches) {
                    setMobileTab("chat");
                  }
                  isAtBottomRef.current = true;
                  setIsAtBottom(true);
                  setUnreadInChat(0);
                  lastMessageIdRef.current = null;
                }}
                className={`min-w-0 flex-1 ${editMode ? "pointer-events-none" : ""}`}
              >
                {card}
              </button>
              {editMode ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSelectChat(conv.id);
                  }}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${
                    selectedChats.includes(conv.id)
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-emerald-200 text-emerald-600 dark:border-emerald-500/30 dark:text-emerald-200"
                  }`}
                  aria-label="Select chat"
                >
                  {selectedChats.includes(conv.id) ? <Check size={16} /> : null}
                </button>
              ) : null}
            </div>
          );
        })
      ) : !showSearchMode ? (
        <div className="flex min-h-full items-center justify-center py-8">
          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            <p>Your chat list is empty.</p>
            <p className="mt-1">Search or use + button to start chatting.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

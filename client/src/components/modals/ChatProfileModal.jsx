import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import ContextMenuSurface from "../context-menu/ContextMenuSurface.jsx";
import {
  Bookmark,
  Chat,
  Check,
  Close,
  Copy,
  LoaderCircle,
  LogIn,
  LogOut,
  Pencil,
  SatelliteDish,
  Volume2,
  VolumeX,
} from "../../icons/lucide.js";
import { FaTelegram } from "react-icons/fa6";
import { copyTextToClipboard } from "../../utils/clipboard.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { hasPersian } from "../../utils/fontUtils.js";
import {
  getRemoteChannelSettings,
  pauseRemoteChannel,
  resumeRemoteChannel,
  skipRemoteChannelQueueItem,
  skipAllRemoteChannelQueueItems,
  testRemoteChannelConnection,
} from "../../api/chatApi.js";
import Avatar from "../common/Avatar.jsx";
import RemoteChannelQueueStatus from "./RemoteChannelQueueStatus.jsx";
import { useFocusTrap } from "../../hooks/useFocusTrap.js";

function SongbirdIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ overflow: "visible", flexShrink: 0 }}
    >
      <path d="M256 0C397.385 0 512 114.615 512 256C512 397.385 397.385 512 256 512C114.615 512 0 397.385 0 256C0 114.615 114.615 0 256 0ZM200.384 360.058C200.384 382.004 240.211 399.795 289.339 399.795C289.341 399.795 289.344 399.795 289.346 399.795V360.056H200.384V360.058ZM289.337 112.001C240.211 112.004 200.388 148.663 200.388 193.884C200.388 194.939 200.409 195.99 200.452 197.036L125.91 169.619C115.331 165.728 103.116 170.956 98.627 181.296C94.1384 191.636 99.0768 203.173 109.656 207.064L154.029 223.385C144.513 221.87 134.616 227.007 130.675 236.086C126.187 246.426 131.124 257.962 141.703 261.854L201.931 284.006C192.779 283.064 183.514 288.147 179.732 296.858C175.244 307.198 180.182 318.735 190.761 322.626L292.287 359.969C291.316 360.026 290.336 360.058 289.35 360.059V399.795C338.475 399.792 378.297 363.133 378.298 317.912C378.298 286.404 358.965 259.052 330.622 245.36C329.479 244.648 328.239 244.038 326.91 243.549L324.101 242.515C322.94 242.061 321.766 241.629 320.58 241.22L249.843 215.202C245.85 208.948 243.558 201.663 243.558 193.884C243.558 172.753 260.451 155.255 282.483 152.208C292.724 161.311 309.043 161.212 319.15 151.908L319.152 151.906L318.969 151.737H332.508V151.736H345.585V151.735C345.585 139.865 336.254 130.001 323.976 128.017C316.106 118.296 303.521 112 289.339 112H289.337V112.001Z" />
    </svg>
  );
}

const MEMBERS_BATCH_SIZE = 10;

export default function ChatProfileModal({
  open,
  chat,
  targetUser,
  currentUser,
  muted,
  inviteLink,
  inviteLinkLoading = false,
  canViewInvite,
  onClose,
  onOpenChat,
  onToggleMute,
  onLeaveGroup,
  onOpenMember,
  onRemoveMember,
  onOpenUserContextMenu,
  onEditGroup,
  onEditSelfProfile,
  showJoinAction = false,
  onJoinChat,
  showMembers = true,
  readOnly = false,
  membersBatchSize = MEMBERS_BATCH_SIZE,
  remoteChannelAvailable = false,
  initialRemoteChannelStatus = null,
  onRemoteChannelStatusChange,
}) {
  const [memberQuery, setMemberQuery] = useState("");
  const [memberLimit, setMemberLimit] = useState(membersBatchSize);
  const [remoteChannelStatus, setRemoteChannelStatus] = useState(initialRemoteChannelStatus);
  const [remoteActionLoading, setRemoteActionLoading] = useState(false);
  const [testConnectionLoading, setTestConnectionLoading] = useState(false);
  const [testConnectionResult, setTestConnectionResult] = useState(null); // 'success', 'error', or null
  const [inviteCopied, setInviteCopied] = useState(false);
  const membersListRef = useRef(null);
  const membersSentinelRef = useRef(null);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);
  
  // Infinite scroll: load more members when sentinel comes into view
  useEffect(() => {
    const sentinel = membersSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMemberLimit((prev) => prev + membersBatchSize);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  // Sync initial status when the chat changes (e.g. opening modal for a different channel)
  useEffect(() => {
    setRemoteChannelStatus(initialRemoteChannelStatus ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat?.id]);

  // Fetch remote channel status for channels
  useEffect(() => {
    if (!open || chat?.type !== "channel" || !remoteChannelAvailable || !currentUser?.username) {
      return undefined;
    }

    const fetchRemoteStatus = async () => {
      try {
        const res = await getRemoteChannelSettings({
          chatId: chat.id,
          username: currentUser.username,
        });
        const data = await res.json();
        if (res.ok) {
          setRemoteChannelStatus(data);
          onRemoteChannelStatusChange?.(data);
        }
      } catch (error) {
        console.error("Failed to fetch remote channel status:", error);
      }
    };

    fetchRemoteStatus();
    const intervalId = setInterval(fetchRemoteStatus, 10000);

    return () => clearInterval(intervalId);
  }, [open, chat?.id, chat?.type, currentUser?.username, remoteChannelAvailable, onRemoteChannelStatusChange]);

  // (Connection test is triggered manually by clicking the Queue Status box)

  // Remote channel action handlers (owner only)
  const handlePauseRemoteChannel = async () => {
    if (!chat?.id || remoteActionLoading) return;
    setRemoteActionLoading(true);
    try {
      const res = await pauseRemoteChannel(chat.id);
      if (res.ok) {
        // Optimistically reflect the paused state; polling will sync the rest.
        setRemoteChannelStatus((prev) => {
          const next = prev?.source ? { ...prev, source: { ...prev.source, paused: true } } : prev;
          onRemoteChannelStatusChange?.(next);
          return next;
        });
      }
    } catch (error) {
      console.error("Failed to pause remote channel:", error);
    } finally {
      setRemoteActionLoading(false);
    }
  };

  const handleResumeRemoteChannel = async () => {
    if (!chat?.id || remoteActionLoading) return;
    setRemoteActionLoading(true);
    try {
      const res = await resumeRemoteChannel(chat.id);
      if (res.ok) {
        // Optimistically reflect the resumed state; polling will sync the rest.
        setRemoteChannelStatus((prev) => {
          const next = prev?.source ? { ...prev, source: { ...prev.source, paused: false } } : prev;
          onRemoteChannelStatusChange?.(next);
          return next;
        });
      }
    } catch (error) {
      console.error("Failed to resume remote channel:", error);
    } finally {
      setRemoteActionLoading(false);
    }
  };

  const handleSkipQueueItem = async () => {
    if (!chat?.id || remoteActionLoading) return;
    setRemoteActionLoading(true);
    try {
      await skipRemoteChannelQueueItem(chat.id);
      // Optimistically clear active queue counts; polling will refresh real counts.
      setRemoteChannelStatus((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          source: prev.source
            ? { ...prev.source, queue: { ...(prev.source.queue || {}), pending: 0, processing: 0, retry: 0 } }
            : prev.source,
        };
        onRemoteChannelStatusChange?.(next);
        return next;
      });
    } catch (error) {
      console.error("Failed to skip queue item:", error);
    } finally {
      setRemoteActionLoading(false);
    }
  };

  const handleSkipAllQueueItems = async () => {
    if (!chat?.id || remoteActionLoading) return;
    setRemoteActionLoading(true);
    try {
      await skipAllRemoteChannelQueueItems(chat.id);
      // Optimistically clear active queue counts; polling will refresh real counts.
      setRemoteChannelStatus((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          source: prev.source
            ? { ...prev.source, queue: { ...(prev.source.queue || {}), pending: 0, processing: 0, retry: 0 } }
            : prev.source,
        };
        onRemoteChannelStatusChange?.(next);
        return next;
      });
    } catch (error) {
      console.error("Failed to skip all queue items:", error);
    } finally {
      setRemoteActionLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!chat?.id || remoteActionLoading || testConnectionLoading) return;
    setTestConnectionLoading(true);
    setTestConnectionResult(null);
    try {
      const res = await testRemoteChannelConnection(chat.id);
      if (res.ok) {
        setTestConnectionResult("success");
      } else {
        setTestConnectionResult("error");
      }
    } catch (error) {
      console.error("Failed to test connection:", error);
      setTestConnectionResult("error");
    } finally {
      setTestConnectionLoading(false);
    }
  };
  
  const handleClose = () => {
    setMemberQuery("");
    setMemberLimit(membersBatchSize);
    setRemoteActionLoading(false);
    setTestConnectionLoading(false);
    setTestConnectionResult(null);
    setInviteCopied(false);
    onClose?.();
  };
  const handleCopyInviteLink = async () => {
    const value = String(inviteLink || "");
    if (!value) return;
    await copyTextToClipboard(value);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1500);
  };

  const isGroup = chat?.type === "group";
  const isChannel = chat?.type === "channel";
  const isSaved = chat?.type === "saved";
  const isSelfProfile =
    !isGroup &&
    !isChannel &&
    !isSaved &&
    String(targetUser?.username || "").toLowerCase() ===
      String(currentUser?.username || "").toLowerCase();
  const profileName =
    isGroup || isChannel
      ? chat?.name || (isChannel ? "Channel" : "Group")
      : isSaved
        ? "Saved messages"
        : targetUser?.nickname || targetUser?.username || "User";
  const profileUsername =
    isGroup || isChannel
      ? chat?.group_username || ""
      : isSaved
        ? ""
        : targetUser?.username || "";
  const profileAvatarUrl =
    isGroup || isChannel
      ? chat?.group_avatar_url || null
      : isSaved
        ? null
        : targetUser?.avatar_url || null;
  const profileColor =
    isGroup || isChannel
      ? chat?.group_color || "#10b981"
      : isSaved
        ? "#10b981"
        : targetUser?.color || "#10b981";
  const initials = getAvatarInitials(profileName);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const members = Array.isArray(chat?.members) ? chat.members : [];
  const membersCountRaw = Number(chat?.membersCount);
  const membersCount = Number.isFinite(membersCountRaw)
    ? membersCountRaw
    : members.length;
  const ownerId = Number(
    members.find(
      (member) => String(member.role || "").toLowerCase() === "owner",
    )?.id || 0,
  );
  const isOwner = Number(currentUser?.id || 0) === ownerId;
  const isReadOnly = Boolean(readOnly);
  const canSeeMembers =
    showMembers && !isReadOnly && (isGroup || (isChannel && isOwner));
  const memberQueryHasPersian = hasPersian(memberQuery || "");

  const sortedMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    const normalized = members.filter((member) => {
      if (!query) return true;
      const nickname = String(member?.nickname || "").toLowerCase();
      const username = String(member?.username || "").toLowerCase();
      return nickname.includes(query) || username.includes(query);
    });
    const sortKey = (m) =>
      String(m?.nickname || m?.username || "").toLowerCase();
    const sortFn = (a, b) =>
      sortKey(a).localeCompare(sortKey(b), undefined, { numeric: true, sensitivity: "base" });
    const owners = normalized
      .filter((member) => String(member.role || "").toLowerCase() === "owner")
      .sort(sortFn);
    const online = normalized
      .filter(
        (member) =>
          String(member.role || "").toLowerCase() !== "owner" &&
          String(member.status || "").toLowerCase() === "online",
      )
      .sort(sortFn);
    const offline = normalized
      .filter(
        (member) =>
          String(member.role || "").toLowerCase() !== "owner" &&
          String(member.status || "").toLowerCase() !== "online",
      )
      .sort(sortFn);
    return [...owners, ...online, ...offline];
  }, [memberQuery, members]);

  const visibleMembers = sortedMembers.slice(0, memberLimit);
  const hasMoreMembers = sortedMembers.length > memberLimit;
  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-140 flex items-center justify-center bg-black/45 px-5">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={profileName}
        className="app-scroll max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-emerald-100/70 bg-white p-5 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950"
      >        <div className="mb-3 flex items-center justify-between">
          {!isReadOnly && (isGroup || isChannel) && isOwner && onEditGroup ? (
            <button
              type="button"
              onClick={onEditGroup}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
              aria-label={isChannel ? "Edit channel" : "Edit group"}
            >
              <Pencil size={16} className="icon-anim-sway" />
            </button>
          ) : !isReadOnly && isSelfProfile ? (
            <button
              type="button"
              onClick={onEditSelfProfile}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
              aria-label="Edit profile"
            >
              <Pencil size={16} className="icon-anim-sway" />
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-rose-500/10"
            aria-label="Close profile"
          >
            <Close size={16} className="icon-anim-pop" />
          </button>
        </div>

        <div className="text-center">
          <Avatar
            src={profileAvatarUrl}
            alt={profileName}
            name={profileName}
            color={profileColor}
            initials={initials}
            placeholderContent={
              isSaved ? <Bookmark size={24} className="text-white" /> : initials
            }
            className="mx-auto h-20 w-20 text-2xl font-bold"
          />
          <p
            className={`mt-3 text-lg font-semibold ${hasPersian(profileName) ? "font-fa" : ""}`}
            dir="auto"
            style={{ unicodeBidi: "plaintext" }}
          >
            {profileName}
          </p>
          {profileUsername ? (
            <p
              className="max-w-full truncate text-sm text-slate-500 dark:text-slate-400"
              dir="auto"
              title={profileUsername}
            >
              @{profileUsername}
            </p>
          ) : null}
          {isGroup || isChannel ? (
            <p
              className={`mt-1 whitespace-nowrap text-slate-500 dark:text-slate-400 ${
                membersCount >= 1_000_000 ? "text-[10px] sm:text-xs" : "text-xs"
              }`}
            >
              {membersCount.toLocaleString("en-US")} members
            </p>
          ) : null}
        </div>

        {showJoinAction ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onJoinChat}
              className="group col-start-2 rounded-2xl border border-emerald-200 bg-white px-2 py-3 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full">
                <LogIn size={24} className="icon-anim-bob" />
              </div>
              <p className="mt-1 text-xs font-semibold">Join</p>
            </button>
          </div>
        ) : !isReadOnly && !isSelfProfile && !isSaved ? (
          <div
            className={`mt-4 ${
              isGroup || isChannel
                ? "grid grid-cols-3 gap-2"
                : "mx-auto grid w-full max-w-[18rem] grid-cols-2 gap-2"
            }`}
          >
            <button
              type="button"
              onClick={onOpenChat}
              className="group rounded-2xl border border-emerald-200 bg-white px-2 py-3 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full">
                <Chat size={24} className="icon-anim-bob" />
              </div>
              <p className="mt-1 text-xs font-semibold">Chat</p>
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="group rounded-2xl border border-emerald-200 bg-white px-2 py-3 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full">
                {muted ? (
                  <Volume2 size={24} className="icon-anim-sway" />
                ) : (
                  <VolumeX size={24} className="icon-anim-sway" />
                )}
              </div>
              <p className="mt-1 text-xs font-semibold">
                {muted ? "Unmute" : "Mute"}
              </p>
            </button>
            {isGroup || isChannel ? (
              <button
                type="button"
                onClick={onLeaveGroup}
                className="group rounded-2xl border border-rose-200 bg-rose-50 px-2 py-3 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/45"
              >
                <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full">
                  <LogOut size={24} className="icon-anim-slide" />
                </div>
                <p className="mt-1 text-xs font-semibold">Leave</p>
              </button>
            ) : null}
          </div>
        ) : null}

        {!isReadOnly && (isGroup || isChannel) && canViewInvite ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Invite link
            </p>
            <button
              type="button"
              onClick={handleCopyInviteLink}
              disabled={!inviteLink || inviteLinkLoading}
              className="mt-2 flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-left text-xs text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-hidden focus:ring-2 focus:ring-emerald-300/60 disabled:cursor-default disabled:opacity-70 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
              aria-label="Copy invite link"
            >
              <span className="min-w-0 flex-1 break-all">
                {inviteLinkLoading ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <LoaderCircle size={13} className="animate-spin text-emerald-500" />
                    Loading...
                  </span>
                ) : (
                  inviteLink || "No invite link available."
                )}
              </span>
              {inviteLink && !inviteLinkLoading ? (
                <span className="ml-1 shrink-0 text-emerald-600 dark:text-emerald-400">
                  {inviteCopied ? <Check size={14} /> : <Copy size={14} />}
                </span>
              ) : null}
            </button>
          </div>
        ) : null}

        {isChannel && remoteChannelAvailable && Boolean(Number(chat?.remote_channel_enabled || 0)) ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Connection
              </p>
              {remoteChannelStatus === null ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <LoaderCircle size={14} className="animate-spin text-emerald-500" />
                  Loading...
                </span>
              ) : null}
            </div>
            {remoteChannelStatus !== null && remoteChannelStatus?.source?.enabled ? (
              <>
                <div className="mt-3">
                  <div className="flex w-full items-center justify-between rounded-2xl border border-emerald-200/70 bg-white/90 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-emerald-200">
                    <span className="flex items-center gap-3">
                      <SatelliteDish size={18} />
                      Remote Channel
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                      {remoteChannelStatus.source.provider === "telegram" ? (
                        <FaTelegram size={18} className="shrink-0" />
                      ) : remoteChannelStatus.source.provider === "songbird" ? (
                        <SongbirdIcon size={18} />
                      ) : (
                        <span>{remoteChannelStatus.source.provider}:</span>
                      )}
                      <span className="truncate">
                        {remoteChannelStatus.source.sourceUsername || remoteChannelStatus.source.sourceChatId || remoteChannelStatus.source.sourceUrl}
                      </span>
                    </span>
                  </div>
                </div>
                {isOwner ? (
                  <div className="mt-3">
                    <RemoteChannelQueueStatus 
                      queue={remoteChannelStatus.source?.queue || {}} 
                      sourceEnabled={Boolean(remoteChannelStatus.source?.enabled)}
                      readOnly={false}
                      onPause={remoteChannelStatus.source?.paused ? null : (remoteActionLoading ? null : handlePauseRemoteChannel)}
                      onResume={remoteChannelStatus.source?.paused ? (remoteActionLoading ? null : handleResumeRemoteChannel) : null}
                      onSkip={remoteActionLoading ? null : handleSkipQueueItem}
                      onSkipAll={remoteActionLoading ? null : handleSkipAllQueueItems}
                      onTestConnection={remoteActionLoading || testConnectionLoading ? null : handleTestConnection}
                      testConnectionResult={testConnectionResult}
                      testConnectionLoading={testConnectionLoading}
                      actionLoading={remoteActionLoading}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {canSeeMembers ? (
          <div className="mt-4 rounded-2xl border border-emerald-200/80 p-3 dark:border-emerald-500/30">
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Members
            </p>
            <div className="relative">
              <input
                value={memberQuery}
                onChange={(event) => {
                  setMemberQuery(event.target.value);
                  setMemberLimit(membersBatchSize);
                }}
                placeholder="Search members"
                lang={memberQueryHasPersian ? "fa" : "en"}
                dir={memberQueryHasPersian ? "rtl" : "ltr"}
                className={`w-full rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 pr-14 text-sm text-slate-700 outline-hidden transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                  memberQueryHasPersian ? "font-fa text-right" : "text-left"
                }`}
                style={{ unicodeBidi: "plaintext" }}
              />
              {memberQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setMemberQuery("")}
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-rose-600 transition hover:bg-rose-100 hover:shadow-[0_0_18px_rgba(244,63,94,0.22)] dark:text-rose-200 dark:hover:bg-rose-500/10"
                >
                  <Close size={14} className="icon-anim-pop" />
                </button>
              ) : null}
            </div>

            <div
              className="app-scroll mt-3 max-h-72 space-y-2 overflow-y-auto pr-1"
              ref={membersListRef}
            >
              {visibleMembers.map((member) => {
                const label = member.nickname || member.username;
                const memberInitials = getAvatarInitials(label);
                const memberIsOwner =
                  String(member.role || "").toLowerCase() === "owner";
                const memberIsOnline =
                  String(member.status || "").toLowerCase() === "online";
                return (
                  <ContextMenuSurface
                    as="div"
                    key={`member-row-${member.id}`}
                    className="flex items-center gap-2 rounded-xl border border-emerald-100/80 bg-white/80 px-2 py-2 transition hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.18)] dark:border-emerald-500/20 dark:bg-slate-900/70 dark:hover:border-emerald-500/35 dark:hover:shadow-[0_0_18px_rgba(16,185,129,0.12)]"
                    contextMenu={{
                      isMobile:
                        typeof window !== "undefined" &&
                        window.matchMedia("(max-width: 767px) and (pointer: coarse)")
                          .matches,
                      onOpen: ({ event, targetEl, isMobile }) =>
                        onOpenUserContextMenu?.({
                          kind: "user",
                          event,
                          targetEl,
                          isMobile,
                          data: {
                            member,
                            sourceChatType: chat?.type || "",
                            onOpenProfile: onOpenMember,
                          },
                        }),
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpenMember?.(member)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <Avatar
                        src={member.avatar_url}
                        alt={label}
                        name={label}
                        color={member.color || "#10b981"}
                        initials={memberInitials}
                        className="h-8 w-8 text-xs"
                      />
                      <div className="min-w-0">
                        <p
                          className={`truncate text-sm font-semibold ${hasPersian(label) ? "font-fa" : ""}`}
                          dir="auto"
                          title={label}
                        >
                          {label}
                        </p>
                        <p
                          className={`truncate text-xs ${
                            memberIsOnline
                              ? "font-semibold text-emerald-500 dark:text-emerald-300"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {memberIsOnline ? "online" : "last seen recently"}
                        </p>
                      </div>
                    </button>
                    {memberIsOwner ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                        Owner
                      </span>
                    ) : null}
                    {isOwner && !memberIsOwner ? (
                      <button
                        type="button"
                        onClick={() => onRemoveMember?.(member)}
                        className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-[0_0_14px_rgba(229,62,95,0.2)] dark:border-rose-500/30 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
                      >
                        Remove
                      </button>
                    ) : null}
                  </ContextMenuSurface>
                );
              })}
            </div>

            {hasMoreMembers ? (
              <div ref={membersSentinelRef} className="mt-2 h-4" aria-hidden="true" />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

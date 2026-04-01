import { useMemo, useState } from "react";
import {
  Bookmark,
  Chat,
  Close,
  Copy,
  LogIn,
  LogOut,
  Pencil,
  Users,
  Volume2,
  VolumeX,
} from "../icons/lucide.js";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import { hasPersian } from "../utils/fontUtils.js";

const MEMBERS_BATCH_SIZE = 10;

export default function ChatProfileModal({
  open,
  chat,
  targetUser,
  currentUser,
  muted,
  inviteLink,
  canViewInvite,
  onClose,
  onOpenChat,
  onToggleMute,
  onLeaveGroup,
  onOpenMember,
  onRemoveMember,
  onEditGroup,
  onEditSelfProfile,
  showJoinAction = false,
  onJoinChat,
  showMembers = true,
  readOnly = false,
  membersBatchSize = MEMBERS_BATCH_SIZE,
}) {
  const [memberQuery, setMemberQuery] = useState("");
  const [memberLimit, setMemberLimit] = useState(membersBatchSize);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const handleClose = () => {
    setMemberQuery("");
    setMemberLimit(membersBatchSize);
    setCopiedInviteLink(false);
    onClose?.();
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
  const profileName = isGroup || isChannel
    ? chat?.name || (isChannel ? "Channel" : "Group")
    : isSaved
      ? "Saved messages"
      : targetUser?.nickname || targetUser?.username || "User";
  const profileUsername = isGroup || isChannel
    ? chat?.group_username || ""
    : isSaved
      ? ""
      : targetUser?.username || "";
  const profileAvatarUrl = isGroup || isChannel
    ? chat?.group_avatar_url || null
    : isSaved
      ? null
      : targetUser?.avatar_url || null;
  const profileColor = isGroup || isChannel
    ? chat?.group_color || "#10b981"
    : isSaved
      ? "#10b981"
      : targetUser?.color || "#10b981";
  const initials = getAvatarInitials(profileName);
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

  const sortedMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    const normalized = members.filter((member) => {
      if (!query) return true;
      const nickname = String(member?.nickname || "").toLowerCase();
      const username = String(member?.username || "").toLowerCase();
      return nickname.includes(query) || username.includes(query);
    });
    const owners = normalized
      .filter((member) => String(member.role || "").toLowerCase() === "owner")
      .sort((a, b) =>
        String(a.username || "").localeCompare(String(b.username || "")),
      );
    const online = normalized
      .filter(
        (member) =>
          String(member.role || "").toLowerCase() !== "owner" &&
          String(member.status || "").toLowerCase() === "online",
      )
      .sort((a, b) =>
        String(a.username || "").localeCompare(String(b.username || "")),
      );
    const offline = normalized
      .filter(
        (member) =>
          String(member.role || "").toLowerCase() !== "owner" &&
          String(member.status || "").toLowerCase() !== "online",
      )
      .sort((a, b) =>
        String(a.username || "").localeCompare(String(b.username || "")),
      );
    return [...owners, ...online, ...offline];
  }, [memberQuery, members]);

  const visibleMembers = sortedMembers.slice(0, memberLimit);
  const hasMoreMembers = sortedMembers.length > memberLimit;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-5">
      <div className="app-scroll max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-emerald-100/70 bg-white p-5 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
        <div className="mb-3 flex items-center justify-between">
          {!isReadOnly && (isGroup || isChannel) && isOwner ? (
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
          {profileAvatarUrl ? (
            <img
              src={profileAvatarUrl}
              alt={profileName}
              className="mx-auto h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div
              className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold ${hasPersian(initials) ? "font-fa" : ""}`}
              style={getAvatarStyle(profileColor)}
            >
              {isSaved ? <Bookmark size={24} className="text-white" /> : initials}
            </div>
          )}
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
          <p className={`mt-1 whitespace-nowrap text-slate-500 dark:text-slate-400 ${
            membersCount >= 1_000_000 ? "text-[10px] sm:text-xs" : "text-xs"
          }`}>
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
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                Invite link
              </p>
              <button
                type="button"
                onClick={async () => {
                  const value = String(inviteLink || "");
                  if (!value) return;
                  try {
                    if (navigator.clipboard && window.isSecureContext) {
                      await navigator.clipboard.writeText(value);
                    } else {
                      const el = document.createElement("textarea");
                      el.value = value;
                      el.setAttribute("readonly", "");
                      el.style.position = "absolute";
                      el.style.left = "-9999px";
                      document.body.appendChild(el);
                      el.select();
                      document.execCommand("copy");
                      document.body.removeChild(el);
                    }
                    setCopiedInviteLink(true);
                    window.setTimeout(() => setCopiedInviteLink(false), 1400);
                  } catch {
                    // ignore clipboard errors
                  }
                }}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
              >
                <Copy size={12} className="icon-anim-pop" />
                {copiedInviteLink ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1 break-all text-xs text-slate-600 dark:text-slate-300">
              {inviteLink}
            </p>
          </div>
        ) : null}

        {canSeeMembers ? (
          <div className="mt-4 rounded-2xl border border-emerald-200/80 p-3 dark:border-emerald-500/30">
            <div className="relative">
              <input
                value={memberQuery}
                onChange={(event) => {
                  setMemberQuery(event.target.value);
                  setMemberLimit(membersBatchSize);
                }}
                placeholder="Search members"
                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 pr-14 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
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

            <div className="app-scroll mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {visibleMembers.map((member) => {
                const label = member.nickname || member.username;
                const memberInitials = getAvatarInitials(label);
                const memberIsOwner =
                  String(member.role || "").toLowerCase() === "owner";
                return (
                  <div
                    key={`member-row-${member.id}`}
                    className="flex items-center gap-2 rounded-xl border border-emerald-100/80 bg-white/80 px-2 py-2 transition hover:border-emerald-300 hover:shadow-[0_0_20px_rgba(16,185,129,0.18)] dark:border-emerald-500/20 dark:bg-slate-900/70 dark:hover:border-emerald-500/35 dark:hover:shadow-[0_0_18px_rgba(16,185,129,0.12)]"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenMember?.(member)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={label}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${hasPersian(memberInitials) ? "font-fa" : ""}`}
                          style={getAvatarStyle(member.color || "#10b981")}
                        >
                          {memberInitials}
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
                        <p className="inline-flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              String(member.status || "").toLowerCase() ===
                              "online"
                                ? "bg-emerald-400"
                                : "bg-slate-400"
                            }`}
                          />
                          {String(member.status || "").toLowerCase() ===
                          "online"
                            ? "online"
                            : "offline"}
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
                        className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-600 transition hover:border-rose-300 dark:border-rose-500/30 dark:bg-rose-900/30 dark:text-rose-200"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {hasMoreMembers ? (
              <button
                type="button"
                onClick={() =>
                  setMemberLimit((prev) => prev + membersBatchSize)
                }
                className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200"
              >
                Show more
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

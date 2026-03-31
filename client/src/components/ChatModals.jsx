import { useState } from "react";
import { Close, Copy, Globe, LoaderCircle, Lock, Trash, Upload, Users } from "../icons/lucide.js";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { hasPersian } from "../utils/fontUtils.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import { NICKNAME_MAX, USERNAME_MAX } from "../utils/nameLimits.js";
import ConfirmPasswordModal from "./ConfirmPasswordModal.jsx";

export function NewChatModal({
  open,
  newChatUsername,
  setNewChatUsername,
  newChatError,
  setNewChatError,
  newChatResults,
  newChatSelection,
  setNewChatSelection,
  newChatLoading,
  canStartChat,
  startDirectMessage,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-200">
            New DM
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
        </div>
        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Username
          </label>
          <div className="relative mt-2">
            <input
              value={newChatUsername}
              onChange={(event) => {
                setNewChatUsername(event.target.value);
                setNewChatError("");
                setNewChatSelection(null);
              }}
              placeholder="username"
              className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-14 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
            />
            {newChatUsername.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setNewChatUsername("");
                  setNewChatSelection(null);
                  setNewChatError("");
                }}
                className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-rose-600 transition hover:bg-rose-100 hover:shadow-[0_0_18px_rgba(244,63,94,0.22)] dark:text-rose-200 dark:hover:bg-rose-500/10"
                aria-label="Clear search"
              >
                <Close size={16} className="icon-anim-pop" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {newChatResults.length ? (
            <div className="app-scroll max-h-64 space-y-2 overflow-y-auto pr-1">
              {newChatResults.map((result) => {
                const label = result.nickname || result.username;
                const avatarInitials = getAvatarInitials(label);
                return (
              <button
                key={result.username}
                type="button"
                onClick={() => {
                  setNewChatSelection(result);
                  setNewChatUsername(result.username);
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                  newChatSelection?.username === result.username
                    ? "border-emerald-500 border-2 bg-emerald-50 text-emerald-900 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-100"
                    : "border-emerald-100/70 bg-white/80 text-slate-700 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900/50"
                }`}
              >
                {result.avatar_url ? (
                  <img
                    src={result.avatar_url}
                    alt={result.nickname || result.username}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${hasPersian(avatarInitials) ? "font-fa" : ""}`}
                    style={getAvatarStyle(result.color || "#10b981")}
                  >
                    {avatarInitials}
                  </div>
                )}
                <div className="min-w-0">
                  <p
                    className={`truncate font-semibold ${hasPersian(label) ? "font-fa" : ""}`}
                    dir="auto"
                    title={label}
                  >
                    {label}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400" dir="auto">
                    @{result.username}
                  </p>
                </div>
              </button>
                );
              })}
            </div>
          ) : newChatLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Searching...</p>
          ) : newChatUsername.trim() ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No users found.</p>
          ) : null}
          {newChatLoading && newChatResults.length ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Searching...</p>
          ) : null}
        </div>
        {!newChatSelection && newChatUsername.trim() && newChatResults.length > 0 ? (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Select a user from the list to start chatting.
          </p>
        ) : null}
        {newChatError ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
            {newChatError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={startDirectMessage}
          disabled={!canStartChat}
          className="mt-4 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Start chat
        </button>
      </div>
    </div>
  );
}

export function DeleteChatsModal({
  open,
  pendingDeleteIds,
  selectedChats,
  setConfirmDeleteOpen,
  confirmDeleteChats,
}) {
  if (!open) return null;
  const count = pendingDeleteIds.length ? pendingDeleteIds.length : selectedChats.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">Delete chats</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {count === 1
            ? "Are you sure you want to delete this chat?"
            : `Are you sure you want to delete these ${count} chats?`}
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(false)}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDeleteChats}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewGroupModal({
  open,
  groupForm,
  setGroupForm,
  groupSearchQuery,
  setGroupSearchQuery,
  groupSearchResults,
  groupSearchLoading,
  selectedGroupMembers,
  setSelectedGroupMembers,
  groupError,
  setGroupError,
  creatingGroup,
  onCreate,
  onClose,
  title = "New group",
  submitLabel = "Create",
  avatarPreview = "",
  avatarColor = "#10b981",
  avatarName = "Group",
  onAvatarChange,
  onAvatarRemove,
  showAvatarField = false,
  hideSelectedMemberChips = false,
  fileUploadEnabled = true,
  showInviteManagement = false,
  currentInviteLink = "",
  regeneratingInviteLink = false,
  onRegenerateInvite,
  entityLabel = "Group",
  onDeleteChat,
}) {
  const [copiedRegenerateLink, setCopiedRegenerateLink] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  if (!open) return null;

  const selectedMemberNames = new Set(
    selectedGroupMembers.map((member) => String(member?.username || "")),
  );

  return (
    <>
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6">
      <div className="app-scroll max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-200">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] dark:border-rose-500/30 dark:text-rose-200 dark:hover:bg-rose-500/10"
          >
            <Close size={18} className="icon-anim-pop" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {showAvatarField ? (
            <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {entityLabel} photo
              </p>
              <div className="mt-3 flex items-center gap-4">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Group avatar preview"
                    className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold ${hasPersian(getAvatarInitials(avatarName || "G")) ? "font-fa" : ""}`}
                    style={getAvatarStyle(avatarColor || "#10b981")}
                  >
                    {getAvatarInitials(avatarName || "G")}
                  </div>
                )}
                <div className="flex w-full flex-nowrap items-center gap-2">
                  <label
                    htmlFor="groupPhotoInput"
                    className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      fileUploadEnabled
                        ? "cursor-pointer border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:shadow-md dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20 dark:hover:shadow-md"
                        : "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
                    }`}
                  >
                    <Upload size={18} className="icon-anim-lift" />
                    <span>Upload Photo</span>
                  </label>
                  <input
                    id="groupPhotoInput"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={onAvatarChange}
                    disabled={!fileUploadEnabled}
                  />
                  {avatarPreview ? (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onAvatarRemove?.();
                      }}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-md dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200 dark:hover:bg-rose-800/50"
                      aria-label={`Remove ${entityLabel.toLowerCase()} photo`}
                    >
                      <Trash size={18} className="icon-anim-sway" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {entityLabel} nickname
            </label>
            <div className="relative mt-2">
              <input
                value={groupForm.nickname}
                onChange={(event) => {
                  setGroupForm((prev) => ({ ...prev, nickname: event.target.value }));
                  setGroupError("");
                }}
                maxLength={NICKNAME_MAX}
                placeholder={`My ${entityLabel.toLowerCase()}`}
                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-16 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-500">
                {String(groupForm.nickname || "").length}/{NICKNAME_MAX}
              </span>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {entityLabel} username
            </label>
            <div className="relative mt-2">
              <input
                value={groupForm.username}
                onChange={(event) => {
                  setGroupForm((prev) => ({
                    ...prev,
                    username: event.target.value.toLowerCase(),
                  }));
                  setGroupError("");
                }}
                maxLength={USERNAME_MAX}
                placeholder={`my${entityLabel.toLowerCase()}`}
                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-16 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-500">
                {String(groupForm.username || "").length}/{USERNAME_MAX}
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Visibility
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-emerald-200 p-1 dark:border-emerald-500/30">
              <button
                type="button"
                onClick={() =>
                  setGroupForm((prev) => ({ ...prev, visibility: "public" }))
                }
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  groupForm.visibility === "public"
                    ? "bg-emerald-500 text-white"
                    : "text-slate-700 hover:bg-emerald-50 dark:text-slate-200 dark:hover:bg-emerald-500/10"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Globe size={14} className="icon-anim-bob" />
                  Public
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setGroupForm((prev) => ({ ...prev, visibility: "private" }))
                }
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  groupForm.visibility === "private"
                    ? "bg-emerald-500 text-white"
                    : "text-slate-700 hover:bg-emerald-50 dark:text-slate-200 dark:hover:bg-emerald-500/10"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Lock size={14} className="icon-anim-bob" />
                  Private
                </span>
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {groupForm.visibility === "public"
                ? "Anyone can discover and join this group."
                : "Private groups can only be joined via invite link."}
            </p>
            {groupForm.visibility === "private" ? (
              <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={groupForm.allowMemberInvites !== false}
                  onChange={(event) =>
                    setGroupForm((prev) => ({
                      ...prev,
                      allowMemberInvites: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded-full border border-emerald-300 bg-white accent-emerald-500 focus:ring-2 focus:ring-emerald-300 dark:border-emerald-500/40 dark:bg-slate-900 dark:accent-emerald-400"
                />
                Allow members to invite others
              </label>
            ) : null}
          </div>

          {showInviteManagement ? (
            <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Invite link
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Regenerating creates a new link and expires the previous one.
              </p>
              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                <span className="break-all">{currentInviteLink || "No invite link available."}</span>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const value = String(currentInviteLink || "");
                    if (!value) return;
                    try {
                      if (
                        typeof navigator !== "undefined" &&
                        navigator.clipboard &&
                        window.isSecureContext
                      ) {
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
                    } catch {
                      // ignore clipboard errors
                    }
                    setCopiedRegenerateLink(true);
                    window.setTimeout(() => setCopiedRegenerateLink(false), 1400);
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                >
                  <Copy size={12} className="icon-anim-pop" />
                  {copiedRegenerateLink ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={onRegenerateInvite}
                  disabled={regeneratingInviteLink}
                  className="inline-flex h-8 items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] disabled:opacity-60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                >
                  {regeneratingInviteLink ? (
                    <LoaderCircle size={12} className="animate-spin" />
                  ) : null}
                  Regenerate
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Members
              </p>
            </div>
            <div className="relative mt-2">
              <input
                value={groupSearchQuery}
                onChange={(event) => {
                  setGroupSearchQuery(event.target.value);
                  setGroupError("");
                }}
                placeholder="username"
                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-14 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
              />
              {groupSearchQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setGroupSearchQuery("")}
                  className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-rose-600 transition hover:bg-rose-100 hover:shadow-[0_0_18px_rgba(244,63,94,0.22)] dark:text-rose-200 dark:hover:bg-rose-500/10"
                  aria-label="Clear member search"
                >
                  <Close size={16} className="icon-anim-pop" />
                </button>
              ) : null}
            </div>
            <div className="mt-3 space-y-2">
              {groupSearchResults.length ? (
                <div className="app-scroll max-h-64 space-y-2 overflow-y-auto pr-1">
                  {groupSearchResults.map((result) => {
                    const selected = selectedMemberNames.has(result.username);
                    const label = result.nickname || result.username;
                    const avatarInitials = getAvatarInitials(label);
                    return (
                      <button
                        key={result.username}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setSelectedGroupMembers((prev) =>
                              prev.filter((member) => member.username !== result.username),
                            );
                            return;
                          }
                          setSelectedGroupMembers((prev) => [...prev, result]);
                          setGroupSearchQuery("");
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                          selected
                            ? "border-emerald-500 border-2 bg-emerald-50 text-emerald-900 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-100"
                            : "border-emerald-100/70 bg-white/80 text-slate-700 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900/50"
                        }`}
                      >
                        {result.avatar_url ? (
                          <img
                            src={result.avatar_url}
                            alt={label}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full ${hasPersian(avatarInitials) ? "font-fa" : ""}`}
                            style={getAvatarStyle(result.color || "#10b981")}
                          >
                            {avatarInitials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p
                            className={`truncate font-semibold ${hasPersian(label) ? "font-fa" : ""}`}
                            dir="auto"
                            title={label}
                          >
                            {label}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400" dir="auto">
                            @{result.username}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : groupSearchLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Searching...</p>
              ) : groupSearchQuery.trim() ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No users found.</p>
              ) : null}
            </div>
            {selectedGroupMembers.length && !hideSelectedMemberChips ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedGroupMembers.map((member) => {
                  const label = member.nickname || member.username;
                  const initials = getAvatarInitials(label);
                  return (
                  <button
                    key={`member-chip-${member.username}`}
                    type="button"
                    onClick={() =>
                      setSelectedGroupMembers((prev) =>
                        prev.filter((item) => item.username !== member.username),
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                  >
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={label}
                        className="h-4 w-4 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${hasPersian(initials) ? "font-fa" : ""}`}
                        style={getAvatarStyle(member.color || "#10b981")}
                      >
                        {initials}
                      </div>
                    )}
                    <span className="max-w-[160px] truncate" dir="auto" title={member.username}>
                      @{member.username}
                    </span>
                    <Close size={12} />
                  </button>
                  );
                })}
              </div>
            ) : !hideSelectedMemberChips ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                No members selected yet.
              </p>
            ) : null}
          </div>
        </div>

        {groupError ? (
          <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
            {groupError}
          </p>
        ) : null}

        {onDeleteChat ? (
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50"
          >
            <Trash size={16} className="icon-anim-sway" />
            Delete {entityLabel.toLowerCase()}
          </button>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_0_14px_rgba(148,163,184,0.2)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={creatingGroup}
            className="inline-flex min-w-[88px] items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-70"
          >
            {creatingGroup ? (
              <>
                <LoaderCircle size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </div>
    </div>

    <ConfirmPasswordModal
      open={deleteModalOpen}
      title={`Delete ${entityLabel.toLowerCase()}`}
      description={`This permanently deletes the ${entityLabel.toLowerCase()}, removes all members, and erases all messages.`}
      confirmLabel="Continue"
      deleteLabel={`Delete ${entityLabel.toLowerCase()}`}
      onClose={() => setDeleteModalOpen(false)}
      onConfirm={async (password) => {
        await onDeleteChat?.(password);
      }}
    />
    </>
  );
}

export function GroupInviteLinkModal({
  open,
  inviteLink,
  onClose,
}) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-md rounded-2xl border border-emerald-100/70 bg-white p-6 shadow-xl dark:border-emerald-500/30 dark:bg-slate-950">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-emerald-700 dark:text-emerald-200">
          <Users size={18} />
          Group created
        </h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Share this invite link so others can join your group.
        </p>
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          <span className="break-all">{inviteLink}</span>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={async () => {
              const value = String(inviteLink || "");
              if (!value) return;
              try {
                if (
                  typeof navigator !== "undefined" &&
                  navigator.clipboard &&
                  window.isSecureContext
                ) {
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
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              } catch {
                // ignore clipboard errors
              }
            }}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
          >
            <Copy size={12} className="icon-anim-pop" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

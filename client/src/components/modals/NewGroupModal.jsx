import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Close,
  CloudSync,
  ImageIcon,
  LoaderCircle,
  Lock,
  Pencil,
  Refresh,
  SatelliteDish,
  Trash,
  UserPlus,
} from "../../icons/lucide.js";
import { copyTextToClipboard } from "../../utils/clipboard.js";
import { getAvatarStyle } from "../../utils/avatarColor.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import { NICKNAME_MAX, USERNAME_MAX } from "../../utils/nameLimits.js";
import ConfirmPasswordModal from "./ConfirmPasswordModal.jsx";
import Avatar from "../common/Avatar.jsx";

export default function NewGroupModal({
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
  showRemoteChannelSettings = false,
  remoteChannelAvailable = true,
  entityLabel = "Group",
  onDeleteChat,
}) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [remoteSourceMenuOpen, setRemoteSourceMenuOpen] = useState(false);
  const groupPhotoInputRef = useRef(null);
  const groupSearchInputRef = useRef(null);
  const remoteSourceButtonRef = useRef(null);
  const remoteSourceMenuRef = useRef(null);
  const ignoreRemoteSourceButtonClickRef = useRef(false);
  const remoteMenuShouldClose =
    !open ||
    !showRemoteChannelSettings ||
    groupForm.visibility === "private" ||
    !remoteChannelAvailable ||
    !groupForm.remoteChannelEnabled;

  useEffect(() => {
    if (!open || !remoteSourceMenuOpen) return undefined;
    const ownerDocument = remoteSourceMenuRef.current?.ownerDocument || document;
    const handleOutsideInteraction = (event) => {
      const menu = remoteSourceMenuRef.current;
      const button = remoteSourceButtonRef.current;
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];
      if (menu && (menu.contains(event.target) || path.includes(menu))) return;
      if (button && (button.contains(event.target) || path.includes(button))) {
        ignoreRemoteSourceButtonClickRef.current = true;
      }
      setRemoteSourceMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setRemoteSourceMenuOpen(false);
    };
    ownerDocument.addEventListener("pointerdown", handleOutsideInteraction, true);
    ownerDocument.addEventListener("mousedown", handleOutsideInteraction, true);
    ownerDocument.addEventListener("touchstart", handleOutsideInteraction, true);
    ownerDocument.addEventListener("focusin", handleOutsideInteraction, true);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener(
        "pointerdown",
        handleOutsideInteraction,
        true,
      );
      ownerDocument.removeEventListener(
        "mousedown",
        handleOutsideInteraction,
        true,
      );
      ownerDocument.removeEventListener(
        "touchstart",
        handleOutsideInteraction,
        true,
      );
      ownerDocument.removeEventListener(
        "focusin",
        handleOutsideInteraction,
        true,
      );
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, remoteSourceMenuOpen]);

  useEffect(() => {
    if (!remoteMenuShouldClose || !remoteSourceMenuOpen) return undefined;
    const timeoutId = window.setTimeout(() => setRemoteSourceMenuOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [remoteMenuShouldClose, remoteSourceMenuOpen]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const selectedMemberNames = new Set(
    selectedGroupMembers.map((member) => String(member?.username || "")),
  );
  const nicknameHasPersian = hasPersian(groupForm.nickname || "");
  const usernameHasPersian = hasPersian(groupForm.username || "");
  const groupSearchHasPersian = hasPersian(groupSearchQuery || "");
  const remoteSourceHasPersian = hasPersian(groupForm.remoteChannelSource || "");
  const remoteStatus = groupForm.remoteChannelStatus || null;
  const remoteSource = remoteStatus?.source || null;
  const remoteLastError =
    remoteSource?.lastError || remoteStatus?.error || "";
  const remoteChannelEnabled = Boolean(groupForm.remoteChannelEnabled);
  const remoteChannelSyncMetadata = Boolean(
    groupForm.remoteChannelSyncMetadata,
  );
  const remoteChannelStreamMedia =
    fileUploadEnabled && Boolean(groupForm.remoteChannelStreamMedia);
  const privateChatEnabled = groupForm.visibility === "private";
  const memberInvitesLocked = !privateChatEnabled;
  const memberInvitesEnabled =
    memberInvitesLocked || groupForm.allowMemberInvites !== false;
  const remoteChannelLocked = privateChatEnabled || !remoteChannelAvailable;
  const effectiveRemoteChannelEnabled =
    !remoteChannelLocked && remoteChannelEnabled;
  const remoteProviderLabel =
    groupForm.remoteChannelProvider === "telegram" ? "Telegram" : "Telegram";
  const privacyOptionClass = (locked = false) =>
    `flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
      locked
        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500"
        : "border-emerald-200/70 bg-white/90 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_18px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
    }`;
  const renderSwitch = (enabled, muted = false) => (
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
        enabled && muted
          ? "justify-end bg-emerald-300 dark:bg-emerald-500/50"
          : enabled
          ? "justify-end bg-emerald-500"
          : "justify-start bg-slate-300 dark:bg-slate-700"
      }`}
      aria-hidden="true"
    >
      <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition" />
    </span>
  );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 px-6">
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
              <div className="py-2">
                <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {entityLabel} photo
                </p>
                <div className="mt-3 flex justify-center">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (!fileUploadEnabled) return;
                        groupPhotoInputRef.current?.click();
                      }}
                      disabled={!fileUploadEnabled}
                      className={`group relative h-14 w-14 overflow-hidden rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-emerald-300/70 ${
                        fileUploadEnabled
                          ? "cursor-pointer border-emerald-200 hover:border-emerald-300 hover:shadow-lg dark:border-emerald-500/30 dark:hover:border-emerald-400/60"
                          : "cursor-not-allowed border-slate-300 opacity-70 dark:border-slate-700"
                      }`}
                      aria-label={`Change ${entityLabel.toLowerCase()} photo`}
                    >
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt={`${entityLabel} avatar preview`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span
                          className={`flex h-full w-full items-center justify-center text-lg font-bold ${hasPersian(getAvatarInitials(avatarName || "G")) ? "font-fa" : ""}`}
                          style={getAvatarStyle(avatarColor || "#10b981")}
                        >
                          {getAvatarInitials(avatarName || "G")}
                        </span>
                      )}
                      {fileUploadEnabled ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                          <Pencil size={18} className="icon-anim-pop" />
                        </span>
                      ) : null}
                    </button>
                    <input
                      ref={groupPhotoInputRef}
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
                        className="absolute -right-2 -top-2 z-10 inline-flex h-6 min-h-[1.5rem] w-6 min-w-[1.5rem] flex-none items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-0 text-rose-600 shadow-md transition hover:border-rose-300 hover:bg-rose-100 hover:shadow-lg dark:border-rose-500/30 dark:bg-rose-900 dark:text-rose-200 dark:hover:bg-rose-800"
                        aria-label={`Remove ${entityLabel.toLowerCase()} photo`}
                      >
                        <Trash size={12} className="icon-anim-sway" />
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
                    setGroupForm((prev) => ({
                      ...prev,
                      nickname: event.target.value,
                    }));
                    setGroupError("");
                  }}
                  maxLength={NICKNAME_MAX}
                  placeholder={`My ${entityLabel.toLowerCase()}`}
                  lang={nicknameHasPersian ? "fa" : "en"}
                  dir={nicknameHasPersian ? "rtl" : "ltr"}
                  className={`w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-16 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                    nicknameHasPersian ? "font-fa text-right" : "text-left"
                  }`}
                  style={{ unicodeBidi: "plaintext" }}
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
                  lang={usernameHasPersian ? "fa" : "en"}
                  dir={usernameHasPersian ? "rtl" : "ltr"}
                  className={`w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-16 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                    usernameHasPersian ? "font-fa text-right" : "text-left"
                  }`}
                  style={{ unicodeBidi: "plaintext" }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 dark:text-slate-500">
                  {String(groupForm.username || "").length}/{USERNAME_MAX}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Privacy
              </p>
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={privateChatEnabled}
                  onClick={() =>
                    setGroupForm((prev) => ({
                      ...prev,
                      visibility:
                        prev.visibility === "private" ? "public" : "private",
                      allowMemberInvites: true,
                      remoteChannelEnabled:
                        prev.visibility === "private"
                          ? prev.remoteChannelEnabled
                          : false,
                    }))
                  }
                  className={privacyOptionClass()}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Lock size={18} className="shrink-0 icon-anim-bob" />
                    <span className="truncate">Private {entityLabel}</span>
                  </span>
                  {renderSwitch(privateChatEnabled)}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={memberInvitesEnabled}
                  disabled={memberInvitesLocked}
                  onClick={() => {
                    if (memberInvitesLocked) return;
                    setGroupForm((prev) => ({
                      ...prev,
                      allowMemberInvites: prev.allowMemberInvites === false,
                    }));
                  }}
                  className={privacyOptionClass(memberInvitesLocked)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <UserPlus size={18} className="shrink-0 icon-anim-pop" />
                    <span className="truncate">Members Can Invite</span>
                  </span>
                  {renderSwitch(memberInvitesEnabled, memberInvitesLocked)}
                </button>
              </div>
            </div>

            {showInviteManagement ? (
              <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Invite link
                </p>
                {onRegenerateInvite ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Regenerating creates a new link and expires the previous one.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    const value = String(currentInviteLink || "");
                    if (!value) return;
                    await copyTextToClipboard(value);
                  }}
                  disabled={!currentInviteLink}
                  className="mt-2 block w-full rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-left text-xs text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-300/60 disabled:cursor-default disabled:opacity-70 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
                  aria-label="Copy invite link"
                >
                  <span className="break-all">
                    {currentInviteLink || "No invite link available."}
                  </span>
                </button>
                {onRegenerateInvite ? (
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!privateChatEnabled) return;
                        onRegenerateInvite();
                      }}
                      disabled={!privateChatEnabled || regeneratingInviteLink}
                      title={
                        privateChatEnabled
                          ? "Regenerate invite link"
                          : "Private chats can regenerate invite links"
                      }
                      className="inline-flex h-8 items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                    >
                      {regeneratingInviteLink ? (
                        <LoaderCircle size={12} className="animate-spin" />
                      ) : (
                        <Refresh size={12} className="icon-anim-spin-dir" />
                      )}
                      Regenerate
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {showRemoteChannelSettings ? (
              <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Connection
                </p>
                <div className="mt-1 min-w-0">
                  {groupForm.remoteChannelLoading ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Loading...
                    </p>
                  ) : remoteLastError ? (
                    <p className="mt-1 break-words text-xs text-rose-600 dark:text-rose-200">
                      {remoteLastError}
                    </p>
                  ) : null}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={effectiveRemoteChannelEnabled}
                    disabled={remoteChannelLocked}
                    onClick={() => {
                      if (remoteChannelLocked) return;
                      setRemoteSourceMenuOpen(false);
                      setGroupForm((prev) => ({
                        ...prev,
                        remoteChannelEnabled: !prev.remoteChannelEnabled,
                      }));
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      remoteChannelLocked
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500"
                        : "border-emerald-200/70 bg-white/90 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_18px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <SatelliteDish size={18} className="icon-anim-sway" />
                      Remote Channel
                    </span>
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                        effectiveRemoteChannelEnabled
                          ? "justify-end bg-emerald-500"
                          : "justify-start bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition" />
                    </span>
                  </button>
                </div>
                {effectiveRemoteChannelEnabled ? (
                  <div className="mt-3 space-y-3">
                    <div className="relative">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Source
                      </label>
                      <button
                        ref={remoteSourceButtonRef}
                        type="button"
                        onClick={() => {
                          if (ignoreRemoteSourceButtonClickRef.current) {
                            ignoreRemoteSourceButtonClickRef.current = false;
                            return;
                          }
                          setRemoteSourceMenuOpen((current) => !current);
                        }}
                        className="mt-2 flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-12 text-left text-sm font-semibold text-slate-700 outline-none transition hover:border-emerald-300 hover:bg-emerald-50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-emerald-500/10"
                        aria-expanded={remoteSourceMenuOpen}
                      >
                        <span>{remoteProviderLabel}</span>
                        <ChevronDown
                          size={16}
                          className={`absolute right-4 top-[2.95rem] text-emerald-500 transition-transform ${
                            remoteSourceMenuOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {remoteSourceMenuOpen ? (
                        <div
                          ref={remoteSourceMenuRef}
                          className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setRemoteSourceMenuOpen(false);
                              setGroupForm((prev) => ({
                                ...prev,
                                remoteChannelProvider: "telegram",
                              }));
                            }}
                            className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200"
                          >
                            <span>Telegram</span>
                            {groupForm.remoteChannelProvider === "telegram" ||
                            !groupForm.remoteChannelProvider ? (
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            ) : null}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Target Channel
                      </label>
                      <input
                        value={groupForm.remoteChannelSource || ""}
                        onChange={(event) => {
                          setGroupForm((prev) => ({
                            ...prev,
                            remoteChannelSource: event.target.value,
                          }));
                          setGroupError("");
                        }}
                        placeholder="@channel or https://t.me/channel"
                        lang={remoteSourceHasPersian ? "fa" : "en"}
                        dir={remoteSourceHasPersian ? "rtl" : "ltr"}
                        className={`mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                          remoteSourceHasPersian
                            ? "font-fa text-right"
                            : "text-left"
                        }`}
                        style={{ unicodeBidi: "plaintext" }}
                      />
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={remoteChannelSyncMetadata}
                      onClick={() =>
                        setGroupForm((prev) => ({
                          ...prev,
                          remoteChannelSyncMetadata:
                            !prev.remoteChannelSyncMetadata,
                        }))
                      }
                      className="flex w-full items-center justify-between rounded-2xl border border-emerald-200/70 bg-white/90 px-4 py-3 text-left text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_18px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                    >
                      <span className="flex items-center gap-3">
                        <CloudSync size={18} className="icon-anim-sway" />
                        Sync Channel Metadata
                      </span>
                      <span
                        className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                          remoteChannelSyncMetadata
                            ? "justify-end bg-emerald-500"
                            : "justify-start bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition" />
                      </span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={remoteChannelStreamMedia}
                      disabled={!fileUploadEnabled}
                      onClick={() => {
                        if (!fileUploadEnabled) return;
                        setGroupForm((prev) => ({
                          ...prev,
                          remoteChannelStreamMedia:
                            !prev.remoteChannelStreamMedia,
                        }));
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                        fileUploadEnabled
                          ? "border-emerald-200/70 bg-white/90 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_18px_rgba(16,185,129,0.18)] dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <ImageIcon size={18} className="icon-anim-pop" />
                        Stream Media Files
                      </span>
                      <span
                        className={`relative inline-flex h-6 w-11 items-center rounded-full p-0.5 transition ${
                          remoteChannelStreamMedia
                            ? "justify-end bg-emerald-500"
                            : "justify-start bg-slate-300 dark:bg-slate-700"
                        }`}
                      >
                        <span className="inline-block h-5 w-5 rounded-full bg-white shadow transition" />
                      </span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-2xl border border-emerald-200 p-3 dark:border-emerald-500/30">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Add Members
                </p>
              </div>
              <div className="relative mt-2">
                <input
                  ref={groupSearchInputRef}
                  value={groupSearchQuery}
                  onChange={(event) => {
                    setGroupSearchQuery(event.target.value);
                    setGroupError("");
                  }}
                  placeholder="username"
                  lang={groupSearchHasPersian ? "fa" : "en"}
                  dir={groupSearchHasPersian ? "rtl" : "ltr"}
                  className={`w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-14 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                    groupSearchHasPersian ? "font-fa text-right" : "text-left"
                  }`}
                  style={{ unicodeBidi: "plaintext" }}
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
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            if (selected) {
                              setSelectedGroupMembers((prev) =>
                                prev.filter(
                                  (member) =>
                                    member.username !== result.username,
                                ),
                              );
                              groupSearchInputRef.current?.focus?.();
                              return;
                            }
                            setSelectedGroupMembers((prev) => [
                              ...prev,
                              result,
                            ]);
                            setGroupSearchQuery("");
                            groupSearchInputRef.current?.focus?.();
                          }}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium transition ${
                            selected
                              ? "border-emerald-500 border-2 bg-emerald-50 text-emerald-900 shadow-md dark:border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-100"
                              : "border-emerald-100/70 bg-white/80 text-slate-700 hover:border-emerald-300 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900/50"
                          }`}
                        >
                          <Avatar
                            src={result.avatar_url}
                            alt={label}
                            name={label}
                            color={result.color || "#10b981"}
                            initials={avatarInitials}
                            className="h-8 w-8"
                          />
                          <div className="min-w-0">
                            <p
                              className={`truncate font-semibold ${hasPersian(label) ? "font-fa" : ""}`}
                              dir="auto"
                              title={label}
                            >
                              {label}
                            </p>
                            <p
                              className="truncate text-xs text-slate-500 dark:text-slate-400"
                              dir="auto"
                            >
                              @{result.username}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : groupSearchLoading ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Searching...
                  </p>
                ) : groupSearchQuery.trim() ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No users found.
                  </p>
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
                            prev.filter(
                              (item) => item.username !== member.username,
                            ),
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
                      >
                        <Avatar
                          src={member.avatar_url}
                          alt={label}
                          name={label}
                          color={member.color || "#10b981"}
                          initials={initials}
                          className="h-4 w-4 text-[9px]"
                        />
                        <span
                          className="max-w-[160px] truncate"
                          dir="auto"
                          title={member.username}
                        >
                          @{member.username}
                        </span>
                        <Close size={12} />
                      </button>
                    );
                  })}
                </div>
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
    </>,
    document.body,
  );
}

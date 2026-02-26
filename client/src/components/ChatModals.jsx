import { X as Close } from "lucide-react";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { hasPersian } from "../utils/fontUtils.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";

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
            New chat
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded-full border border-emerald-200 p-2 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_16px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
          >
            <Close size={18} />
          </button>
        </div>
        <div className="mt-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Username
          </label>
          <input
            value={newChatUsername}
            onChange={(event) => {
              setNewChatUsername(event.target.value);
              setNewChatError("");
              setNewChatSelection(null);
            }}
            placeholder="username"
            className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <div className="mt-3 space-y-2">
          {newChatResults.length ? (
            <div className="app-scroll max-h-64 space-y-2 overflow-y-auto pr-1">
              {newChatResults.slice(0, 5).map((result) => {
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
                <div>
                  <p className={`font-semibold ${hasPersian(label) ? "font-fa" : ""}`}>{label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">@{result.username}</p>
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

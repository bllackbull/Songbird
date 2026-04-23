import { createPortal } from "react-dom";
import { Close } from "../../icons/lucide.js";
import { hasPersian } from "../../utils/fontUtils.js";
import { getAvatarInitials } from "../../utils/avatarInitials.js";
import Avatar from "../common/Avatar.jsx";

export default function NewChatModal({
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
  if (typeof document === "undefined") return null;
  const dmSearchHasPersian = hasPersian(newChatUsername || "");

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 px-6 py-6"
      style={{
        minHeight: "100dvh",
        height: "100dvh",
        paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 1rem))",
        paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
        paddingLeft: "max(1.5rem, env(safe-area-inset-left))",
        paddingRight: "max(1.5rem, env(safe-area-inset-right))",
      }}
    >
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
              lang={dmSearchHasPersian ? "fa" : "en"}
              dir={dmSearchHasPersian ? "rtl" : "ltr"}
              className={`w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-14 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 ${
                dmSearchHasPersian ? "font-fa text-right" : "text-left"
              }`}
              style={{ unicodeBidi: "plaintext" }}
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
                    <Avatar
                      src={result.avatar_url}
                      alt={result.nickname || result.username}
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
          ) : newChatLoading ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Searching...
            </p>
          ) : newChatUsername.trim() ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No users found.
            </p>
          ) : null}
          {newChatLoading && newChatResults.length ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Searching...
            </p>
          ) : null}
        </div>
        {!newChatSelection &&
        newChatUsername.trim() &&
        newChatResults.length > 0 ? (
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
    </div>,
    document.body,
  );
}

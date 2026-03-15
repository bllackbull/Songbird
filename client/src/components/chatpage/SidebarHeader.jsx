import { Close, LoaderCircle, Pencil, Plus, Trash } from "../../icons/lucide.js";

export default function SidebarHeader({
  mobileTab,
  editMode,
  isConnected,
  hasChats,
  selectedChatsCount,
  onExitEdit,
  onEnterEdit,
  onDeleteChats,
  onNewChat,
}) {
  return (
    <div className="grid h-[72px] grid-cols-[1fr,auto,1fr] items-center border-b border-slate-300/80 bg-white px-6 py-4 dark:border-emerald-500/20 dark:bg-slate-900">
      {mobileTab === "settings" ? (
        <div className="col-span-3 text-center text-lg font-semibold md:hidden">
          <span className="inline-flex items-center gap-2">
            {!isConnected ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-emerald-500" />
            ) : null}
            {isConnected ? "Settings" : "Connecting..."}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {editMode ? (
              <button
                type="button"
                onClick={onExitEdit}
                className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                aria-label="Exit edit mode"
              >
                <Close size={18} className="icon-anim-pop" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnterEdit}
                disabled={!hasChats}
                className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-emerald-200 disabled:hover:shadow-none dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                aria-label="Edit chat list"
              >
                <Pencil size={18} className="icon-anim-sway" />
              </button>
            )}
          </div>
          <h2 className="text-center text-lg font-semibold">
            <span className="inline-flex items-center gap-2">
              {!editMode && !isConnected ? (
                <LoaderCircle className="h-5 w-5 animate-spin text-emerald-500" />
              ) : null}
              {editMode ? "Edit" : isConnected ? "Chats" : "Connecting..."}
            </span>
          </h2>
          <div className="flex justify-end">
            {editMode ? (
              <button
                type="button"
                onClick={onDeleteChats}
                disabled={!selectedChatsCount}
                className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 p-2 text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_16px_rgba(244,63,94,0.22)] disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200"
                aria-label="Delete chats"
              >
                <Trash size={18} className="icon-anim-slide" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onNewChat}
                className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                aria-label="New chat"
              >
                <Plus size={18} className="icon-anim-pop" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

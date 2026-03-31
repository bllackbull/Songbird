import { useEffect, useRef, useState } from "react";
import { Chat, Close, LoaderCircle, Megaphone, Pencil, Plus, Search, Trash, Users } from "../../icons/lucide.js";

export default function SidebarHeader({
  mobileTab,
  editMode,
  isConnected,
  isUpdating,
  hasChats,
  selectedChatsCount,
  onExitEdit,
  onEnterEdit,
  onDeleteChats,
  onNewChat,
  onNewGroup,
  onNewChannel,
  chatsSearchQuery,
  chatsSearchFocused,
  onChatsSearchChange,
  onChatsSearchFocus,
  onChatsSearchBlur,
  onCloseSearch,
  chatsScrollable = false,
  onScrollToTop,
}) {
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!showCreateMenu) return;
    const handleOutside = (event) => {
      if (createMenuRef.current?.contains(event.target)) return;
      setShowCreateMenu(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showCreateMenu]);

  return (
    <div className="border-b border-slate-300/80 bg-white px-6 py-3 dark:border-emerald-500/20 dark:bg-slate-900">
      {mobileTab === "settings" ? (
        <div className="text-center text-lg font-semibold md:hidden">
          <span className="inline-flex items-center gap-2">
            {!isConnected ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-emerald-500" />
            ) : null}
            {isConnected ? "Settings" : "Connecting..."}
          </span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr,auto,1fr] items-center">
            <div className="flex items-center gap-2">
              {chatsSearchFocused ? (
                <button
                  type="button"
                  onClick={() => {
                    searchInputRef.current?.blur?.();
                    onCloseSearch?.();
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white/80 p-2 text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_16px_rgba(244,63,94,0.22)] dark:border-rose-500/30 dark:bg-slate-950 dark:text-rose-200"
                  aria-label="Close search"
                >
                  <Close size={18} className="icon-anim-pop" />
                </button>
              ) : editMode ? (
                <button
                  type="button"
                  onClick={onExitEdit}
                  className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white/80 p-2 text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_16px_rgba(244,63,94,0.22)] dark:border-rose-500/30 dark:bg-slate-950 dark:text-rose-200"
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
                {!editMode && (!isConnected || isUpdating) ? (
                  <LoaderCircle className="h-5 w-5 animate-spin text-emerald-500" />
                ) : null}
                {editMode ? (
                  "Edit"
                ) : chatsSearchFocused ? (
                  "Search"
                ) : !isConnected ? (
                  "Connecting..."
                ) : isUpdating ? (
                  "Updating..."
                ) : chatsScrollable ? (
                  <button
                    type="button"
                    onClick={onScrollToTop}
                    className="inline-flex cursor-pointer items-center gap-2 px-1 py-0.5 text-inherit"
                    aria-label="Scroll chats to top"
                  >
                    Chats
                  </button>
                ) : (
                  "Chats"
                )}
              </span>
            </h2>
            <div className="flex justify-end">
              {chatsSearchFocused ? (
                <span className="inline-flex h-9 w-9" aria-hidden="true" />
              ) : editMode ? (
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
                <div className="relative" ref={createMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowCreateMenu((prev) => !prev)}
                    className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white/80 p-2 text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.22)] dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                    aria-label="Create"
                    aria-expanded={showCreateMenu}
                  >
                    <Plus size={18} className="icon-anim-pop" />
                  </button>
                  {showCreateMenu ? (
                    <div className="absolute right-0 top-12 z-20 w-44 rounded-xl border border-emerald-200/80 bg-white p-1.5 shadow-lg dark:border-emerald-500/30 dark:bg-slate-950">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateMenu(false);
                          onNewChat?.();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                      >
                        <Chat size={15} className="icon-anim-bob" />
                        New DM
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateMenu(false);
                          onNewGroup?.();
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                      >
                        <Users size={15} className="icon-anim-sway" />
                        New group
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateMenu(false);
                          onNewChannel?.();
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-2 text-left text-xs text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:text-emerald-200 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                      >
                        <Megaphone size={15} className="icon-anim-sway" />
                        New channel
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
          <div className="mt-3">
            <label className="group relative block">
              {!chatsSearchQuery.trim() && !chatsSearchFocused ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm leading-none text-slate-500 transition-colors group-hover:text-slate-600 dark:text-slate-400 dark:group-hover:text-slate-300">
                  <span className="inline-flex -translate-y-[1px] md:translate-y-0">
                    <Search
                      size={14}
                      className="icon-anim-pop block text-emerald-600 dark:text-emerald-300"
                    />
                  </span>
                  <span>Search</span>
                </span>
              ) : null}
              {chatsSearchFocused || chatsSearchQuery.trim() ? (
                <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-2 leading-none text-slate-500 dark:text-slate-400">
                  <span className="inline-flex -translate-y-[1px] md:translate-y-0">
                    <Search
                      size={14}
                      className="icon-anim-pop block text-emerald-600 dark:text-emerald-300"
                    />
                  </span>
                </span>
              ) : null}
              <input
                ref={searchInputRef}
                value={chatsSearchQuery}
                onChange={(event) => onChatsSearchChange?.(event.target.value)}
                onFocus={onChatsSearchFocus}
                onBlur={onChatsSearchBlur}
                placeholder="Search"
                className={`w-full rounded-2xl border border-emerald-200 bg-white py-2 pr-10 text-sm text-slate-700 outline-none transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] focus:border-emerald-400 focus:bg-white/80 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-emerald-500/50 dark:hover:shadow-[0_0_18px_rgba(16,185,129,0.12)] dark:focus:bg-slate-950 ${
                  chatsSearchFocused || chatsSearchQuery.trim()
                    ? "pl-9 text-left placeholder-slate-500 dark:placeholder-slate-400"
                    : "px-9 text-center placeholder-transparent"
                }`}
              />
              {chatsSearchQuery.trim() ? (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onChatsSearchChange?.("")}
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent bg-transparent text-rose-600 transition hover:bg-rose-100 hover:shadow-[0_0_18px_rgba(244,63,94,0.22)] dark:text-rose-200 dark:hover:bg-rose-500/10"
                  aria-label="Clear search"
                >
                  <Close size={14} className="icon-anim-pop" />
                </button>
              ) : null}
            </label>
          </div>
        </>
      )}
    </div>
  );
}

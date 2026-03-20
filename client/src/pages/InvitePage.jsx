import { useEffect, useState } from "react";
import { LoaderCircle, Moon, Sun, Users } from "../icons/lucide.js";
import { getGroupInviteInfo, joinGroupByInvite } from "../api/chatApi.js";
import { getAvatarStyle } from "../utils/avatarColor.js";
import { getAvatarInitials } from "../utils/avatarInitials.js";
import { hasPersian } from "../utils/fontUtils.js";

export default function InvitePage({
  token,
  user,
  isDark,
  onToggleTheme,
  onNavigateChat,
  onRequireLogin,
}) {
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [group, setGroup] = useState(null);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const parseResponseBody = async (res) => {
    const contentType = String(
      res.headers.get("content-type") || "",
    ).toLowerCase();
    if (contentType.includes("application/json")) {
      try {
        return await res.json();
      } catch {
        return {};
      }
    }
    const text = await res.text().catch(() => "");
    return { error: text };
  };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Invite token is missing.");
      return;
    }
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getGroupInviteInfo(token);
        if (res.status === 401) {
          onRequireLogin?.();
          return;
        }
        const data = await parseResponseBody(res);
        if (!res.ok) {
          throw new Error(data?.error || "Unable to validate invite link.");
        }
        if (!mounted) return;
        setGroup(data?.group || null);
        setAlreadyMember(Boolean(data?.alreadyMember));
      } catch (err) {
        if (!mounted) return;
        setError(err.message || "Unable to validate invite link.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [token, onRequireLogin]);

  const handleJoin = async () => {
    if (!token || !user?.username) return;
    setJoining(true);
    setError("");
    try {
      const res = await joinGroupByInvite(token, { username: user.username });
      const data = await parseResponseBody(res);
      if (!res.ok) {
        const checkRes = await getGroupInviteInfo(token);
        const checkData = await parseResponseBody(checkRes);
        if (
          checkRes.ok &&
          checkData?.alreadyMember &&
          Number(checkData?.group?.id || 0)
        ) {
          onNavigateChat?.(Number(checkData.group.id));
          return;
        }
        throw new Error(data?.error || "Unable to join this group.");
      }
      onNavigateChat?.(Number(data?.id || 0));
    } catch (err) {
      setError(err.message || "Unable to join this group.");
    } finally {
      setJoining(false);
    }
  };

  const handleOpenChats = async () => {
    if (!alreadyMember) {
      onNavigateChat?.();
      return;
    }
    await handleJoin();
  };

  const groupName = group?.name || "Group";
  const groupInitials = getAvatarInitials(groupName);

  return (
    <section className="app-scroll relative my-auto w-full max-w-md max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-3xl border border-emerald-200/70 bg-white/80 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur dark:border-white/5 dark:bg-slate-900/80 sm:max-h-none sm:overflow-visible sm:p-8">
      <div className="relative text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-300 sm:text-sm">
          Group Invite
        </p>
        <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">
          Join Group
        </h1>
        <button
          type="button"
          onClick={onToggleTheme}
          className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200 sm:h-10 sm:w-10"
          aria-label="Toggle dark mode"
        >
          {isDark ? (
            <Sun size={18} className="icon-anim-spin-dir" />
          ) : (
            <Moon size={18} className="icon-anim-spin-left" />
          )}
        </button>
      </div>

      <div className="mt-4 sm:mt-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-500" />
            Checking invite link...
          </div>
        ) : error ? (
          <>
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
              {error}
            </p>
            <button
              type="button"
              onClick={onNavigateChat}
              className="mt-4 w-full rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] dark:border-emerald-500/30 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-500/10"
            >
              Back to chats
            </button>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div
                className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold ${hasPersian(groupInitials) ? "font-fa" : ""}`}
                style={getAvatarStyle(group?.color || "#10b981")}
              >
                {groupInitials}
              </div>
              <p className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
                {groupName}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                @{group?.username || "group"}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <Users size={12} className="icon-anim-bob" />
                {Number(group?.membersCount || 0)} members
              </p>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              {alreadyMember
                ? "You are already a member of this group."
                : "You are about to join this group. Do you want to continue?"}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onNavigateChat}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_0_14px_rgba(148,163,184,0.2)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70"
              >
                Cancel
              </button>
              {!alreadyMember ? (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={joining}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-70"
                >
                  {joining ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="icon-anim-slide text-base leading-none">
                      ↪
                    </span>
                  )}
                  Join group
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenChats}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
                >
                  Open chats
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

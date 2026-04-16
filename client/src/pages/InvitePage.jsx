import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle, Moon, Sun, Users, LogIn } from "../icons/lucide.js";
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
  const cardRef = useRef(null);
  const [fitsViewport, setFitsViewport] = useState(true);
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
  const normalizeInviteError = (value) =>
    String(value || "")
      .replace(/removed from this group/gi, "removed from this chat")
      .replace(/join this group/gi, "join this chat");

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
          throw new Error(
            normalizeInviteError(
              data?.error || "Unable to validate invite link.",
            ),
          );
        }
        if (!mounted) return;
        setGroup(data?.group || null);
        setAlreadyMember(Boolean(data?.alreadyMember));
      } catch (err) {
        if (!mounted) return;
        setError(
          normalizeInviteError(err.message || "Unable to validate invite link."),
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [token, onRequireLogin]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node || typeof window === "undefined") return;

    const measure = () => {
      const parentHeight = Number(node.parentElement?.clientHeight || 0);
      const viewportHeight = Number(window.visualViewport?.height || window.innerHeight || 0);
      const availableHeight = parentHeight || viewportHeight;
      const cardHeight = Math.ceil(node.getBoundingClientRect().height);
      setFitsViewport(cardHeight <= Math.max(availableHeight - 8, 0));
    };

    measure();
    const rafId = window.requestAnimationFrame(measure);
    const timeoutId = window.setTimeout(measure, 120);
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => measure())
        : null;
    observer?.observe(node);
    if (node.parentElement) {
      observer?.observe(node.parentElement);
    }
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [alreadyMember, error, group, joining, loading]);

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
        throw new Error(
          normalizeInviteError(data?.error || "Unable to join this chat."),
        );
      }
      onNavigateChat?.(Number(data?.id || 0));
    } catch (err) {
      setError(normalizeInviteError(err.message || "Unable to join this chat."));
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

  const groupType = group?.type === "channel" ? "Channel" : "Group";
  const groupName = group?.name || groupType;
  const groupNameHasPersian = hasPersian(groupName);
  const groupInitials = getAvatarInitials(groupName);
  const rawGroupAvatarUrl = String(group?.avatarUrl || "").trim();
  const groupAvatarUrl = rawGroupAvatarUrl.startsWith("/uploads/")
    ? `/api${rawGroupAvatarUrl}`
    : rawGroupAvatarUrl;

  return (
    <section
      ref={cardRef}
      className={`relative w-full max-w-md rounded-3xl border border-emerald-200/70 bg-white/80 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur dark:border-white/5 dark:bg-slate-900/80 sm:p-8 ${
        fitsViewport ? "my-auto self-center" : "my-0 self-start"
      }`}
    >
      <div className="relative text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-300 sm:text-sm">
          {groupType} Invite
        </p>
        <h1 className="mt-2 text-2xl font-bold sm:mt-3 sm:text-3xl">
          Join {groupType}
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
              {groupAvatarUrl ? (
                <img
                  src={groupAvatarUrl}
                  alt={groupName}
                  className="mx-auto mb-3 h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div
                  className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold ${hasPersian(groupInitials) ? "font-fa" : ""}`}
                  style={getAvatarStyle(group?.color || "#10b981")}
                >
                  {groupInitials}
                </div>
              )}
              <p className="w-full text-center">
                <span
                  className={`mx-auto block w-fit max-w-full truncate text-base font-semibold text-emerald-800 dark:text-emerald-200 ${
                    groupNameHasPersian ? "font-fa text-right" : "text-center"
                  }`}
                  dir="auto"
                  style={{ unicodeBidi: "plaintext" }}
                  title={groupName}
                >
                  {groupName}
                </span>
              </p>
              <p
                className={`mt-1 w-full truncate text-xs text-slate-600 dark:text-slate-300 ${
                  hasPersian(group?.username || "") ? "font-fa text-right" : "text-center"
                }`}
                dir="auto"
                style={{ unicodeBidi: "plaintext" }}
                title={group?.username || "group"}
              >
                @{group?.username || "group"}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <Users size={12} className="icon-anim-bob" />
                {Number(group?.membersCount || 0)} members
              </p>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              {alreadyMember
                ? `You are already a member of this ${groupType.toLowerCase()}.`
                : `You are about to join this ${groupType.toLowerCase()}. Do you want to continue?`}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onNavigateChat}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:shadow-[0_0_14px_rgba(148,163,184,0.2)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800/70"
              >
                Cancel
              </button>
              {!alreadyMember ? (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={joining}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-70"
                >
                  {joining ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="icon-anim-slide text-base leading-none">
                      <LogIn />
                    </span>
                  )}
                  Join {groupType.toLowerCase()}
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

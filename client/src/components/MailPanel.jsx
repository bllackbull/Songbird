import { useEffect, useMemo, useState } from "react";
import {
  X as Close,
  Inbox,
  Mail,
  Plus,
  RefreshCw,
  SendHorizonal as Send,
  Trash2,
} from "lucide-react";

const API_BASE = "";

export default function MailPanel({ user, mobileTab }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mails, setMails] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [mailAddress, setMailAddress] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const selectedMail = useMemo(
    () =>
      mails.find((entry) => Number(entry.id) === Number(selectedId)) || null,
    [mails, selectedId],
  );

  const loadMailbox = async ({ silent = false } = {}) => {
    if (!user?.username) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${API_BASE}/api/mail?username=${encodeURIComponent(user.username)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to load mailbox.");
      }
      const nextMails = data.mails || [];
      setMails(nextMails);
      setMailAddress(data.address || "");
      setUnreadCount(Number(data.unreadCount || 0));
      setSelectedId((prev) => {
        if (
          prev &&
          nextMails.some((entry) => Number(entry.id) === Number(prev))
        ) {
          return prev;
        }
        return nextMails[0]?.id || null;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (mobileTab !== "mail") return;
    void loadMailbox();
    const interval = setInterval(() => {
      void loadMailbox({ silent: true });
    }, 15000);
    return () => clearInterval(interval);
  }, [mobileTab, user?.username]);

  useEffect(() => {
    if (!selectedMail || selectedMail.read_at) return;
    fetch(`${API_BASE}/api/mail/${selectedMail.id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user.username }),
    }).catch(() => null);
    setMails((prev) =>
      prev.map((entry) =>
        Number(entry.id) === Number(selectedMail.id)
          ? { ...entry, read_at: new Date().toISOString() }
          : entry,
      ),
    );
  }, [selectedMail?.id]);

  const handleSend = async (event) => {
    event.preventDefault();
    if (!composeTo.trim() || !composeBody.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUsername: user.username,
          toUsername: composeTo.trim().toLowerCase(),
          subject: composeSubject.trim(),
          body: composeBody.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to send mail.");
      }
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposeOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedMail) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/mail/${selectedMail.id}?username=${encodeURIComponent(
          user.username,
        )}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to delete mail.");
      }
      setMails((prev) =>
        prev.filter((entry) => Number(entry.id) !== Number(selectedMail.id)),
      );
      setSelectedId((prev) =>
        Number(prev) === Number(selectedMail.id) ? null : prev,
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (value) =>
    new Date(
      `${value}`.includes("T") ? value : `${value}`.replace(" ", "T"),
    ).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <section
      className={
        "fixed inset-0 top-0 z-0 flex h-full flex-1 flex-col overflow-hidden border-x border-slate-300/80 bg-white shadow-xl shadow-emerald-500/10 dark:border-white/5 dark:bg-slate-900 md:relative md:inset-auto md:top-auto md:z-auto md:w-[65%] md:border md:shadow-2xl md:shadow-emerald-500/15"
      }
      style={{ paddingTop: "max(0px, env(safe-area-inset-top))" }}
    >
      <div className="grid h-[72px] grid-cols-[1fr,auto,1fr] items-center border-b border-slate-300/80 bg-white px-4 py-4 dark:border-emerald-500/20 dark:bg-slate-900 sm:px-6">
        <button
          type="button"
          onClick={() => void loadMailbox()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
          aria-label="Refresh mail"
        >
          <RefreshCw size={16} className="icon-anim-spin-dir" />
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Mail</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mailAddress || "Loading address..."}
          </p>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white/80 text-emerald-700 transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
            aria-label="Compose mail"
          >
            <Plus size={18} className="icon-anim-pop" />
          </button>
        </div>
      </div>

      {composeOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSend}
            className="w-full max-w-lg space-y-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl dark:border-emerald-500/25 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                <Mail size={15} />
                Compose
              </div>
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 dark:border-emerald-500/25 dark:bg-slate-900 dark:text-slate-300"
                aria-label="Close compose window"
              >
                <Close size={15} />
              </button>
            </div>
            <input
              value={composeTo}
              onChange={(event) => setComposeTo(event.target.value)}
              placeholder="To username (inside Songbird)"
              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400 dark:border-emerald-500/25 dark:bg-slate-900"
            />
            <input
              value={composeSubject}
              onChange={(event) => setComposeSubject(event.target.value)}
              placeholder="Subject"
              className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400 dark:border-emerald-500/25 dark:bg-slate-900"
            />
            <textarea
              value={composeBody}
              onChange={(event) => setComposeBody(event.target.value)}
              placeholder="Write your mail..."
              rows={6}
              className="w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-400 dark:border-emerald-500/25 dark:bg-slate-900"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending}
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 hover:shadow-emerald-500/40 disabled:opacity-60"
              >
                <Send className="icon-anim-slide" />
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[260px,1fr]">
        <aside className="app-scroll min-h-0 overflow-y-auto border-b border-r border-slate-300/80 bg-emerald-50/45 pb-[104px] dark:border-emerald-500/20 dark:bg-slate-950/30 md:border-b-0 md:pb-0">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-300/80 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-600 backdrop-blur dark:border-emerald-500/20 dark:bg-slate-900/90 dark:text-slate-300">
            <span className="inline-flex items-center gap-2">
              <Inbox size={14} />
              Inbox
            </span>
            <span>{unreadCount} unread</span>
          </div>
          {loading ? (
            <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              Loading...
            </p>
          ) : mails.length ? (
            mails.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedId(entry.id)}
                className={`block w-full border-b border-slate-200/70 px-4 py-3 text-left transition dark:border-emerald-500/15 ${
                  Number(selectedId) === Number(entry.id)
                    ? "bg-emerald-100/80 dark:bg-emerald-900/30"
                    : "hover:bg-emerald-50/80 dark:hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {entry.sender_name || entry.sender_email}
                  </p>
                  {!entry.read_at ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ) : null}
                </div>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {entry.subject || "(no subject)"}
                </p>
              </button>
            ))
          ) : (
            <p className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">
              No messages yet.
            </p>
          )}
        </aside>

        <main className="app-scroll min-h-0 overflow-y-auto bg-white px-4 py-4 pb-[104px] dark:bg-slate-900 sm:px-6 md:pb-4">
          {error ? (
            <p className="mb-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-900/20 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          {selectedMail ? (
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-emerald-500/20 dark:bg-slate-950/30">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {selectedMail.subject || "(no subject)"}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    From:{" "}
                    {selectedMail.sender_name || selectedMail.sender_email}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(selectedMail.received_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:border-rose-300 dark:border-rose-500/30 dark:bg-rose-900/30 dark:text-rose-200"
                  aria-label="Delete mail"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">
                {selectedMail.body}
              </p>
            </article>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-emerald-500/20 dark:bg-slate-950/30 dark:text-slate-400">
              Select a message from inbox.
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

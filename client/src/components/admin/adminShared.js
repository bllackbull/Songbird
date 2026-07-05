import { apiFetch } from "../../api/chatApi.js";

// ─── Style constants ─────────────────────────────────────────────────────────

export const cardCls    = "rounded-2xl border border-emerald-200/70 bg-white/90 dark:border-emerald-500/30 dark:bg-slate-950/50";
export const inputCls   = "w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100";
export const inputSmCls = "h-9 w-full rounded-2xl border border-emerald-200/70 bg-white/90 px-3 text-sm text-slate-700 outline-none transition hover:border-emerald-300 hover:shadow-[0_0_16px_rgba(16,185,129,0.18)] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/40 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-200 dark:placeholder-slate-500 dark:hover:border-emerald-500/50 dark:hover:shadow-[0_0_18px_rgba(16,185,129,0.12)]";
export const searchIconCls = "text-emerald-500 transition-colors group-hover:text-emerald-600 dark:text-emerald-400 dark:group-hover:text-emerald-300 icon-anim-pop";
export const labelCls   = "block text-sm font-semibold text-slate-700 dark:text-slate-200";
export const btnPrimary = "inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-400 hover:shadow-[0_0_14px_rgba(16,185,129,0.3)]";
export const btnSecondary = "inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-white/5";
export const btnDanger  = "inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400";

export const iconBtn = (color = "slate") => {
  const map = {
    slate:   "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5",
    emerald: "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10",
    orange:  "border-orange-200 text-orange-500 hover:bg-orange-50 dark:border-orange-500/30 dark:text-orange-400 dark:hover:bg-orange-500/10",
    rose:    "border-rose-200 text-rose-500 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10",
  };
  return `inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40 ${map[color] || map.slate}`;
};

// ─── API helper ───────────────────────────────────────────────────────────────

export const api = {
  get:    (url)       => apiFetch(url).then((r) => r.json()),
  post:   (url, body) => apiFetch(url, { method: "POST",   headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patch:  (url, body) => apiFetch(url, { method: "PATCH",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  put:    (url, body) => apiFetch(url, { method: "PUT",    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  delete: (url)       => apiFetch(url, { method: "DELETE" }),
};

// ─── Formatters ────────────────────────────────────────────────────────────────

export function fmtBytes(b) {
  if (b == null || b < 0) return "—";
  if (b < 1024)      return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtUptime(secs) {
  if (!secs) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return "—"; }
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = iso.includes("T") ? new Date(iso) : new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

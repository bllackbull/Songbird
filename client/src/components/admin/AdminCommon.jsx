import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpDown,
  ChevronDown,
  Close,
  Globe,
  Lock,
  Megaphone,
  User,
  Users,
} from "../../icons/lucide.js";
import { labelCls } from "./adminShared.js";

// ─── Loading / empty states ─────────────────────────────────────────────────

export function LoadingRows() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((n) => (
        <div key={n} className="h-12 animate-pulse rounded-2xl border border-emerald-200/40 bg-white/60 dark:border-emerald-500/20 dark:bg-slate-900/40" />
      ))}
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
      <p className="text-sm text-slate-400 dark:text-slate-500">{message}</p>
    </div>
  );
}

// ─── Badges / icons ──────────────────────────────────────────────────────────

export function ChatTypeIcon({ type, size = 16 }) {
  if (type === "channel") return <Megaphone size={size} className="shrink-0 text-emerald-500" />;
  if (type === "group")   return <Users     size={size} className="shrink-0 text-emerald-500" />;
  return                         <User      size={size} className="shrink-0 text-slate-400" />;
}

export function ChatTypeBadge({ type, visibility }) {
  const label = type === "dm" ? "DM" : type === "channel" ? "Channel" : "Group";
  const VisIcon = type !== "dm" ? (visibility === "private" ? <Lock size={9} /> : <Globe size={9} />) : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
      {VisIcon}{label}
    </span>
  );
}

export function RoleBadge({ role }) {
  const r = (role === 0 || role === "0" || !role) ? "user" : String(role);
  if (r === "user") return <span className="text-[11px] text-slate-400 dark:text-slate-500">user</span>;
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">{r}</span>
  );
}

// ─── Sortable table header ─────────────────────────────────────────────────

export function SortTh({ field, sortBy, sortDir, onToggle, children }) {
  const active = sortBy === field;
  return (
    <th className="cursor-pointer select-none whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400" onClick={() => onToggle(field)}>
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown size={10} className={active ? "text-emerald-500" : "opacity-30"} />
        {active && <span className="text-[10px] text-emerald-500">{sortDir === "DESC" ? "↓" : "↑"}</span>}
      </span>
    </th>
  );
}

// ─── Dropdowns ────────────────────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      // Clicks on the trigger are handled by its own onClick (which toggles).
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const toggle = () => setOpen((o) => !o);
  return { open, setOpen, toggle, btnRef, menuRef };
}

export function CustomSelect({ value, onChange, options, placeholder = "Select…" }) {
  const { open, toggle, setOpen, btnRef, menuRef } = useDropdown();
  const selected = options.find(([v]) => v === value);
  const label = selected?.[1] ?? placeholder;
  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={toggle} aria-expanded={open}
        className="relative flex w-full items-center rounded-2xl border border-emerald-200 bg-white px-4 py-3 pr-10 text-left text-sm font-semibold text-slate-700 outline-none transition hover:border-emerald-300 hover:bg-emerald-50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-300/60 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-emerald-500/10">
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown size={15} className={`absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={menuRef} className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-2xl border border-emerald-200 bg-white p-1 text-sm font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100">
          {options.map(([v, l]) => (
            <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200 ${v === value ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
              <span className="truncate">{l}</span>
              {v === value && <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CompactSelect({ value, onChange, options, placeholder = "Select…" }) {
  const { open, toggle, setOpen, btnRef, menuRef } = useDropdown();
  const selected = options.find(([v]) => v === value);
  const label = selected?.[1] ?? placeholder;
  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={toggle} aria-expanded={open}
        className="relative flex w-full items-center rounded-xl border border-emerald-200/70 bg-white/90 py-1.5 pl-3 pr-7 text-left text-xs font-semibold text-slate-600 outline-none transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-emerald-500/5">
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown size={12} className={`absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={menuRef} className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-emerald-200 bg-white p-1 text-xs font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100">
          {options.map(([v, l]) => (
            <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200 ${v === value ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
              <span className="truncate">{l}</span>
              {v === value && <span className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FilterDropdown({ value, onChange, options }) {
  const { open, toggle, setOpen, btnRef, menuRef } = useDropdown();
  const selected = options.find(([v]) => v === value);
  const label = selected?.[1] ?? options[0]?.[1] ?? "Filter";
  return (
    <div className="relative">
      <button ref={btnRef} type="button" onClick={toggle} aria-expanded={open}
        className="relative flex items-center gap-1.5 rounded-xl border border-emerald-200/70 bg-white/90 py-2 pl-3 pr-7 text-xs font-semibold text-slate-600 outline-none transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-emerald-500/5">
        <span className="max-w-24 truncate">{label}</span>
        <ChevronDown size={11} className={`absolute right-2 top-1/2 -translate-y-1/2 text-emerald-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div ref={menuRef} className="absolute left-0 z-50 mt-1.5 min-w-max overflow-hidden rounded-2xl border border-emerald-200 bg-white p-1 text-xs font-semibold text-slate-700 shadow-xl shadow-emerald-950/10 dark:border-emerald-500/30 dark:bg-slate-900 dark:text-slate-100">
          {options.map(([v, l]) => (
            <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-200 ${v === value ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
              <span>{l}</span>
              {v === value && <span className="ml-3 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, wide = false }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`app-scroll relative w-full ${wide ? "sm:max-w-lg" : "sm:max-w-sm"} max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-emerald-100/70 bg-white shadow-xl dark:border-emerald-500/30 dark:bg-slate-950`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-white/5">
          <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">{title}</h3>
          <button type="button" onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10">
            <Close size={14} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </label>
  );
}

// App-style confirmation modal (matches LeaveGroup / DeleteMessage dialogs).
export function ConfirmModal({ open, title, message, confirmLabel = "Confirm", busy = false, onConfirm, onClose }) {
  if (!open) return null;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-6" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Confirmation modal that requires typing an exact phrase before enabling confirm.
export function TypedConfirmModal({ open, title, message, phrase, busy = false, onConfirm, onClose }) {
  const [text, setText] = useState("");
  useEffect(() => { if (open) setText(""); }, [open]);
  if (!open) return null;
  const matched = text.trim() === phrase;
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-6" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-rose-100/70 bg-white p-6 shadow-xl dark:border-rose-500/30 dark:bg-slate-950">
        <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-300">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Type <span className="font-semibold text-rose-600 dark:text-rose-300">{phrase}</span> to confirm.
        </p>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={phrase}
          className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-300/40 dark:border-rose-500/30 dark:bg-slate-900 dark:text-slate-100" />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:shadow-[0_0_14px_rgba(16,185,129,0.2)] disabled:opacity-50 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy || !matched}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:shadow-[0_0_14px_rgba(244,63,94,0.2)] disabled:opacity-40 dark:border-rose-500/30 dark:bg-rose-900/40 dark:text-rose-200">
            {busy ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { Crown, ShieldCheck } from "../../icons/lucide.js";

/**
 * UserRoleBadge — inline icon badge for server-level roles.
 *
 * Props:
 *   role      – "owner" | "admin" | "user" | falsy
 *   size      – icon size in px (default 13)
 *   className – extra classes on the wrapper span
 */
export default function UserRoleBadge({ role, size = 13, className = "" }) {
  const normalizedRole = String(role || "").toLowerCase();

  if (normalizedRole === "owner") {
    return (
      <span
        className={`inline-flex shrink-0 items-center text-amber-400 dark:text-amber-300 ${className}`}
        title="Server Owner"
        aria-label="Server Owner"
      >
        <Crown size={size} aria-hidden="true" />
      </span>
    );
  }

  if (normalizedRole === "admin") {
    return (
      <span
        className={`inline-flex shrink-0 items-center text-emerald-500 dark:text-emerald-400 ${className}`}
        title="Server Admin"
        aria-label="Server Admin"
      >
        <ShieldCheck size={size} aria-hidden="true" />
      </span>
    );
  }

  return null;
}

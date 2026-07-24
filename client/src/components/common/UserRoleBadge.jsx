/**
 * UserRoleBadge — inline filled icon badge for server-level roles.
 *
 * Mirrors the visual style of VerifiedBadge: a solid filled shape with
 * white interior details, so all three badges look like a consistent set.
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
        className={`inline-flex shrink-0 items-center ${className}`}
        title="Server Owner"
        aria-label="Server Owner"
      >
        {/*
          Crown — lucide path filled with amber, white base-line on top.
          Outer path: the crown silhouette (closed shape → solid fill).
          Inner path: the bottom bar M5 21h14, drawn white over the fill.
        */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          fill="none"
        >
          <path
            d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"
            fill="#fbbf24"
            className="dark:fill-amber-300"
          />
          <path
            d="M5 21h14"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  if (normalizedRole === "admin") {
    return (
      <span
        className={`inline-flex shrink-0 items-center ${className}`}
        title="Server Admin"
        aria-label="Server Admin"
      >
        {/*
          ShieldCheck — lucide path filled with emerald, white check on top.
          Outer path: the shield silhouette (closed shape → solid fill).
          Inner path: the checkmark m9 12 2 2 4-4, drawn white over the fill.
        */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          fill="none"
        >
          <path
            d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
            fill="#10b981"
            className="dark:fill-emerald-400"
          />
          <path
            d="m9 12 2 2 4-4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  return null;
}

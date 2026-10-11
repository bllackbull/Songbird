import Tooltip from "./Tooltip.jsx";

/**
 * VerifiedBadge — filled verification badge icon.
 *
 * Uses BadgeCheck from lucide as its shape but renders a solid sky-blue fill
 * inside the badge with a white check, giving the "filled" look rather than
 * the default outline-only appearance.
 *
 * Props:
 *   size      – icon size in px (default 15)
 *   className – extra classes on the wrapper span
 */
export default function VerifiedBadge({ size = 15, className = "" }) {
  return (
    <Tooltip label="Verified" className={`shrink-0 ${className}`}>
      <span className="inline-flex shrink-0 items-center" role="img" aria-label="Verified">
        {/*
          BadgeCheck from lucide is a badge outline + inner check path.
          We re-draw it as two layers:
            1. A solid filled path for the badge body (sky/blue fill)
            2. A white check path on top
          The paths are taken from the lucide BadgeCheck SVG source.
        */}
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          fill="none"
        >
          {/* Filled badge body — same shape as lucide BadgeCheck outer path */}
          <path
            d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
            fill="#0ea5e9"
            className="dark:fill-sky-400"
          />
          {/* White check mark */}
          <path
            d="m9 12 2 2 4-4"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </Tooltip>
  );
}

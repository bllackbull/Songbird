// Hand-rolled inline-SVG icons that mirror lucide's geometry but expose their
// inner parts so we can animate individual elements (e.g. the gauge needle) —
// something the plain lucide-react components don't allow.
//
// Each icon accepts the same `size`/`className` props as a lucide icon so it
// can be dropped in as a direct replacement. Animations are driven by CSS in
// index.css (see the `.sb-icon-*` rules), triggered on the nearest hovered
// button/label, matching the existing `icon-anim-*` pattern.

const baseProps = (size) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
});

// Gauge — the needle sweeps around its pivot on hover.
export function GaugeIcon({ size = 15, className = "" }) {
  return (
    <svg {...baseProps(size)} className={`sb-gauge ${className}`}>
      <path className="sb-gauge-needle" d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}

// LayoutDashboard — on hover the tall tiles shrink and the short tiles grow,
// swapping the grid's proportions. Each rect animates its y/height geometry.
export function LayoutDashboardIcon({ size = 15, className = "" }) {
  return (
    <svg {...baseProps(size)} className={`sb-dash ${className}`}>
      <rect className="sb-dash-tl" width="7" height="9" x="3" y="3" rx="1" />
      <rect className="sb-dash-tr" width="7" height="5" x="14" y="3" rx="1" />
      <rect className="sb-dash-br" width="7" height="9" x="14" y="12" rx="1" />
      <rect className="sb-dash-bl" width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}

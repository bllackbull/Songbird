import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip — the app-wide hover/focus tooltip.
 *
 * Replaces native `title` attributes so every hint in the app shares the same
 * emerald pill design that was introduced for the .env lock badge in the admin
 * Settings tab.
 *
 * Rendered through a portal with fixed positioning so it can never be clipped
 * by `overflow-hidden` cards, scrolling tables, or modal stacking contexts.
 *
 * Two attachment modes:
 *
 *   Wrapper mode (default) — the listeners live on a wrapper element around the
 *   child. This is the only mode that works for `disabled` controls, because
 *   browsers suppress pointer events on disabled form elements.
 *
 *   `asChild` mode — the listeners are cloned onto the child itself, adding no
 *   DOM. Use it for text that already carries layout-critical classes such as
 *   `truncate`, where an extra wrapper would change how the row lays out. This
 *   mode defaults to `whenTruncated`, since its purpose is revealing clipped
 *   text; pass `whenTruncated={false}` to always show.
 *
 * Props:
 *   label     – tooltip text. Falsy values render the children untouched.
 *   placement – "top" (default) or "bottom". Flips automatically when there is
 *               not enough room on the preferred side.
 *   className – extra classes for the wrapper (wrapper mode only).
 *   as        – wrapper element type, defaults to "span" (wrapper mode only).
 *   asChild   – attach to the child element instead of adding a wrapper.
 *   whenTruncated – only open when the anchor's text is actually clipped. Use
 *               this for truncated labels, where the tooltip exists to reveal
 *               text that does not fit; it stays silent when nothing is cut off.
 */

// Distance in px between the target edge and the tooltip.
const OFFSET = 6;
// Keep the pill this far away from the viewport edges.
const VIEWPORT_PADDING = 8;
// Elements that carry an implicit interactive role, so labelling them with
// `aria-label` is valid. Anything else keeps whatever name it already has.
const LABELLABLE_TAGS = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "summary",
]);

const TOOLTIP_CLS =
  "pointer-events-none fixed z-400 max-w-[min(18rem,calc(100vw-1rem))] break-words rounded-md bg-emerald-400 px-2 py-1 text-[10px] font-semibold leading-snug text-white shadow-lg";

// True when a node tree renders literal text somewhere inside it. Used to skip
// the automatic `aria-label` on controls that already have a visible text name,
// so the tooltip never contradicts it (WCAG 2.5.3 Label in Name).
function hasTextContent(node) {
  if (node == null || typeof node === "boolean") return false;
  if (typeof node === "string") return node.trim() !== "";
  if (typeof node === "number") return true;
  if (Array.isArray(node)) return node.some(hasTextContent);
  if (isValidElement(node)) return hasTextContent(node.props?.children);
  return false;
}

// True when an element (or any descendant) has text clipped by CSS truncation.
// `truncate`/`text-ellipsis` clip horizontally, so scrollWidth exceeds
// clientWidth. Sub-pixel layout rounding makes an exact comparison flaky, hence
// the 1px tolerance.
function isTextClipped(el) {
  if (!el) return false;
  if (el.scrollWidth - el.clientWidth > 1) return true;
  // The clipping element is often a nested span rather than the anchor itself.
  return Array.from(el.querySelectorAll("*")).some(
    (child) => child.scrollWidth - child.clientWidth > 1,
  );
}

export default function Tooltip({
  label,
  placement = "top",
  className = "",
  as: Wrapper = "span",
  asChild = false,
  // `asChild` targets are truncated labels, so gate on clipping by default.
  whenTruncated = asChild,
  children,
}) {
  const reactId = useId();
  const tooltipId = `tooltip-${reactId}`;
  const anchorRef = useRef(null);
  const bubbleRef = useRef(null);
  const [open, setOpen] = useState(false);
  // `null` until measured, so the pill is never painted at the wrong spot.
  const [coords, setCoords] = useState(null);

  const hide = useCallback(() => {
    setOpen(false);
    setCoords(null);
  }, []);

  const show = useCallback(
    (event) => {
      // A touch tap should activate the control, not leave a stuck pill behind.
      if (event?.pointerType === "touch") return;
      // Truncation-reveal tooltips stay silent when the text already fits.
      if (whenTruncated && !isTextClipped(anchorRef.current)) return;
      setOpen(true);
    },
    [whenTruncated],
  );

  // Measure after the bubble mounts so its real size drives the placement.
  useEffect(() => {
    if (!open) return undefined;

    const anchor = anchorRef.current?.getBoundingClientRect();
    const bubble = bubbleRef.current?.getBoundingClientRect();
    if (anchor && bubble) {
      const spaceAbove = anchor.top;
      const spaceBelow = window.innerHeight - anchor.bottom;
      const needed = bubble.height + OFFSET + VIEWPORT_PADDING;
      // Flip when the preferred side cannot fit but the other side can.
      const below =
        placement === "bottom"
          ? spaceBelow >= needed || spaceAbove < needed
          : spaceAbove < needed && spaceBelow >= needed;

      const top = below
        ? anchor.bottom + OFFSET
        : anchor.top - bubble.height - OFFSET;

      const centered = anchor.left + anchor.width / 2 - bubble.width / 2;
      const maxLeft = Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - bubble.width - VIEWPORT_PADDING,
      );
      const left = Math.min(Math.max(VIEWPORT_PADDING, centered), maxLeft);

      setCoords({ top, left });
    }

    // A fixed pill cannot follow its anchor, so dismiss it on scroll/resize.
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, placement, label, hide]);

  if (!label) return children;

  const bubble =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={bubbleRef}
            id={tooltipId}
            role="tooltip"
            className={TOOLTIP_CLS}
            style={{
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? "visible" : "hidden",
            }}
          >
            {label}
          </span>,
          document.body,
        )
      : null;

  const listeners = {
    onPointerEnter: show,
    onPointerLeave: hide,
    onPointerDown: hide,
    onFocusCapture: () => show(),
    onBlurCapture: hide,
  };

  if (asChild) {
    if (!isValidElement(children)) return children;
    return (
      <>
        {cloneElement(children, {
          ref: anchorRef,
          ...listeners,
          // Preserve any handlers the child already had.
          onPointerEnter: (event) => {
            children.props.onPointerEnter?.(event);
            show(event);
          },
          onPointerLeave: (event) => {
            children.props.onPointerLeave?.(event);
            hide();
          },
          onPointerDown: (event) => {
            children.props.onPointerDown?.(event);
            hide();
          },
        })}
        {bubble}
      </>
    );
  }

  // Give icon-only controls an accessible name matching the tooltip, but only
  // when the element has an interactive role and no name of its own.
  let child = children;
  if (
    isValidElement(children) &&
    typeof children.type === "string" &&
    LABELLABLE_TAGS.has(children.type) &&
    !children.props["aria-label"] &&
    !children.props["aria-labelledby"] &&
    !hasTextContent(children.props.children)
  ) {
    child = cloneElement(children, { "aria-label": label });
  }

  // Deliberately no `relative` here. The bubble is portaled to <body> with
  // position:fixed, so the wrapper needs no positioning context — and adding
  // one would override an `absolute` passed via className, since Tailwind emits
  // `.relative` after `.absolute` (equal specificity, so the later rule wins no
  // matter which order the classes appear in the attribute).
  return (
    <Wrapper
      ref={anchorRef}
      className={`inline-flex ${className}`}
      {...listeners}
    >
      {child}
      {bubble}
    </Wrapper>
  );
}

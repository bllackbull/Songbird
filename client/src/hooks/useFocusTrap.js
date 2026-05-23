/**
 * useFocusTrap
 *
 * Traps keyboard focus inside a container element while active.
 * Also moves focus into the container when it first becomes active,
 * and restores focus to the previously-focused element on cleanup.
 *
 * @param {React.RefObject} containerRef - ref to the dialog/modal container
 * @param {boolean} active - whether the trap is currently active
 */
import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  "details > summary",
].join(", ");

export function useFocusTrap(containerRef, active) {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    // Save the element that had focus before the modal opened
    previousFocusRef.current =
      typeof document !== "undefined" ? document.activeElement : null;

    // Move focus into the container
    const container = containerRef.current;
    if (container) {
      const firstFocusable = container.querySelector(FOCUSABLE_SELECTORS);
      if (firstFocusable) {
        try {
          firstFocusable.focus({ preventScroll: true });
        } catch {
          firstFocusable.focus();
        }
      } else {
        // Make the container itself focusable as a fallback
        container.setAttribute("tabindex", "-1");
        try {
          container.focus({ preventScroll: true });
        } catch {
          container.focus();
        }
      }
    }

    const handleKeyDown = (event) => {
      if (event.key !== "Tab") return;
      const currentContainer = containerRef.current;
      if (!currentContainer) return;

      const focusableEls = Array.from(
        currentContainer.querySelectorAll(FOCUSABLE_SELECTORS),
      ).filter((el) => !el.closest("[aria-hidden='true']"));

      if (!focusableEls.length) {
        event.preventDefault();
        return;
      }

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first || !currentContainer.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !currentContainer.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the element that was focused before the modal opened
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus({ preventScroll: true });
        } catch {
          // ignore
        }
      }
      previousFocusRef.current = null;
    };
  }, [active, containerRef]);
}

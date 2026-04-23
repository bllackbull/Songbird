import { useEffect, useMemo, useRef } from "react";

const DEFAULT_HOLD_DELAY_MS = 300;
const MOVE_TOLERANCE_PX = 12;
const SCROLL_INTENT_PX = 4;

const findScrollableAncestor = (node) => {
  if (typeof window === "undefined" || !node) return null;
  let current = node instanceof Element ? node : node?.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    const overflowY = String(style.overflowY || "").toLowerCase();
    const overflowX = String(style.overflowX || "").toLowerCase();
    const canScrollY =
      (overflowY === "auto" || overflowY === "scroll") &&
      current.scrollHeight > current.clientHeight;
    const canScrollX =
      (overflowX === "auto" || overflowX === "scroll") &&
      current.scrollWidth > current.clientWidth;
    if (canScrollY || canScrollX) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement || null;
};

export function useContextMenuTrigger({
  disabled = false,
  isMobile = false,
  holdDelayMs = DEFAULT_HOLD_DELAY_MS,
  moveTolerancePx = MOVE_TOLERANCE_PX,
  onOpen,
}) {
  const holdTimerRef = useRef(null);
  const pointerRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    scrollTarget: null,
    startScrollTop: 0,
    startScrollLeft: 0,
  });
  const suppressClickRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(holdTimerRef.current);
    }
    holdTimerRef.current = null;
  };

  useEffect(() => clearHoldTimer, []);

  useEffect(() => {
    if (!isMobile || disabled) return undefined;
    const handleScroll = () => {
      if (!pointerRef.current.active) return;
      pointerRef.current.active = false;
      clearHoldTimer();
    };
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [disabled, isMobile]);

  return useMemo(() => {
    if (disabled || typeof onOpen !== "function") {
      return {};
    }

    const openMenu = (event, source = "desktop") => {
      const targetEl = event?.currentTarget || null;
      onOpen({
        event,
        source,
        targetEl,
        isMobile: source === "mobile",
      });
    };

    const onContextMenu = (event) => {
      if (isMobile) return;
      event.preventDefault();
      openMenu(event, "desktop");
    };

    const onPointerDown = (event) => {
      if (!isMobile || event.pointerType !== "touch") return;
      clearHoldTimer();
      suppressClickRef.current = false;
      const scrollTarget = findScrollableAncestor(event.target);
      pointerRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: Number(event.clientX || 0),
        startY: Number(event.clientY || 0),
        scrollTarget,
        startScrollTop: Number(scrollTarget?.scrollTop || 0),
        startScrollLeft: Number(scrollTarget?.scrollLeft || 0),
      };
      holdTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = true;
        pointerRef.current.active = false;
        openMenu(event, "mobile");
      }, holdDelayMs);
    };

    const cancelPointer = (event) => {
      if (!isMobile) return;
      if (!pointerRef.current.active) return;
      if (
        pointerRef.current.pointerId !== null &&
        Number(event?.pointerId) !== Number(pointerRef.current.pointerId)
      ) {
        return;
      }
      pointerRef.current.active = false;
      clearHoldTimer();
    };

    const onPointerMove = (event) => {
      if (!isMobile || !pointerRef.current.active) return;
      if (event.defaultPrevented) {
        cancelPointer(event);
        return;
      }
      const dx = Math.abs(
        Number(event.clientX || 0) - pointerRef.current.startX,
      );
      const dy = Math.abs(
        Number(event.clientY || 0) - pointerRef.current.startY,
      );
      const scrollTarget = pointerRef.current.scrollTarget;
      const scrollTop = Number(scrollTarget?.scrollTop || 0);
      const scrollLeft = Number(scrollTarget?.scrollLeft || 0);
      if (
        Math.abs(scrollTop - Number(pointerRef.current.startScrollTop || 0)) > 0 ||
        Math.abs(scrollLeft - Number(pointerRef.current.startScrollLeft || 0)) > 0
      ) {
        cancelPointer(event);
        return;
      }
      if (dy >= SCROLL_INTENT_PX && dy >= dx) {
        cancelPointer(event);
        return;
      }
      if (dx > moveTolerancePx || dy > moveTolerancePx) {
        cancelPointer(event);
      }
    };

    const onClickCapture = (event) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    };

    return {
      onContextMenu,
      onPointerDown,
      onPointerMove,
      onPointerUp: cancelPointer,
      onPointerCancel: cancelPointer,
      onClickCapture,
    };
  }, [disabled, holdDelayMs, isMobile, moveTolerancePx, onOpen]);
}

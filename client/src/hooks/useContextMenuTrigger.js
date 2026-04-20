import { useEffect, useMemo, useRef } from "react";

const DEFAULT_HOLD_DELAY_MS = 300;
const MOVE_TOLERANCE_PX = 12;

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
  });
  const suppressClickRef = useRef(false);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(holdTimerRef.current);
    }
    holdTimerRef.current = null;
  };

  useEffect(() => clearHoldTimer, []);

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
      pointerRef.current = {
        active: true,
        pointerId: event.pointerId,
        startX: Number(event.clientX || 0),
        startY: Number(event.clientY || 0),
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
      if (dy > 6 && dy > dx) {
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

import { useCallback, useEffect, useRef, useState } from "react";

export function useFloatingDayChip() {
  const [floatingDay, setFloatingDay] = useState({ key: "", label: "" });
  const [isTimelineScrollable, setIsTimelineScrollable] = useState(false);
  const floatingChipRef = useRef(null);
  const floatingDayLockUntilRef = useRef(0);
  const floatingDayLockByClickRef = useRef(false);
  const floatingChipAlignTimerRef = useRef(null);

  const resetFloatingLocks = useCallback(() => {
    floatingDayLockByClickRef.current = false;
    floatingDayLockUntilRef.current = 0;
  }, []);

  const updateFloatingDayFromScroll = useCallback((target) => {
    if (!target) return;
    if (
      floatingDayLockByClickRef.current ||
      Date.now() < Number(floatingDayLockUntilRef.current || 0)
    ) {
      return;
    }
    const scrollerRect = target.getBoundingClientRect();
    const floatingRect = floatingChipRef.current?.getBoundingClientRect();
    const targetTop = floatingRect
      ? floatingRect.top + floatingRect.height / 2
      : scrollerRect.top + 108;
    const groups = Array.from(target.querySelectorAll("[id^='day-group-']"));
    if (groups.length) {
      let chosen = groups[0];
      groups.forEach((groupNode) => {
        if (groupNode.getBoundingClientRect().top <= targetTop + 1) {
          chosen = groupNode;
        }
      });
      const key = (chosen.id || "").replace(/^day-group-/, "");
      const labelNode = chosen.querySelector("[data-day-chip]");
      const label = labelNode?.textContent?.trim() || "";
      if (key && label) {
        setFloatingDay((prev) =>
          prev.key === key && prev.label === label ? prev : { key, label },
        );
      }
    }
  }, []);

  const handleFloatingChipClick = useCallback(
    (event, { chatScrollRef, isDesktop, floatingDay }) => {
      const node = document.getElementById(`day-group-${floatingDay.key}`);
      const scroller = chatScrollRef?.current;
      if (!node || !scroller) return;
      const floatingChip = event.currentTarget;
      const currentKey = floatingDay.key;
      const currentLabel = floatingDay.label;
      floatingDayLockByClickRef.current = true;
      floatingDayLockUntilRef.current = Date.now() + 1800;
      setFloatingDay({ key: currentKey, label: currentLabel });
      if (floatingChipAlignTimerRef.current) {
        window.clearTimeout(floatingChipAlignTimerRef.current);
        floatingChipAlignTimerRef.current = null;
      }

      const stickyChip = node.querySelector("[data-day-chip]")?.parentElement || node;
      const stickyRect = stickyChip.getBoundingClientRect();
      const floatingRect = floatingChip.getBoundingClientRect();
      // Device-specific alignment nudge tuned to match visual chip overlap.
      const alignOffsetPx = isDesktop ? 0 : -1;
      const desiredStickyTopInViewport = floatingRect.top + alignOffsetPx;
      const delta = stickyRect.top - desiredStickyTopInViewport;
      const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const targetTop = Math.max(0, Math.min(maxTop, scroller.scrollTop + delta));

      scroller.scrollTo({ top: targetTop, behavior: "smooth" });

      const runFinalAlign = (releaseLock = false) => {
        const nextStickyChip = node.querySelector("[data-day-chip]")?.parentElement || node;
        const nextStickyRect = nextStickyChip.getBoundingClientRect();
        const nextFloatingRect = floatingChip.getBoundingClientRect();
        const nextDesiredTop = nextFloatingRect.top + alignOffsetPx;
        const nextDelta = nextStickyRect.top - nextDesiredTop;
        if (Math.abs(nextDelta) > 0.5) {
          const finalMaxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
          const finalTop = Math.max(0, Math.min(finalMaxTop, scroller.scrollTop + nextDelta));
          scroller.scrollTo({ top: finalTop, behavior: "auto" });
        }
        if (releaseLock) {
          floatingDayLockByClickRef.current = false;
          floatingDayLockUntilRef.current = Date.now() + 120;
        }
      };

      if (isDesktop) {
        // Desktop: no post-correction jump; just unlock after smooth scroll finishes.
        floatingChipAlignTimerRef.current = window.setTimeout(() => {
          floatingDayLockByClickRef.current = false;
          floatingDayLockUntilRef.current = Date.now() + 120;
          floatingChipAlignTimerRef.current = null;
        }, 420);
      } else {
        // Mobile: one final correction removes the tiny residual offset.
        floatingChipAlignTimerRef.current = window.setTimeout(() => {
          runFinalAlign(true);
          floatingChipAlignTimerRef.current = null;
        }, 380);
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (floatingChipAlignTimerRef.current) {
        window.clearTimeout(floatingChipAlignTimerRef.current);
        floatingChipAlignTimerRef.current = null;
      }
    };
  }, []);

  return {
    floatingDay,
    setFloatingDay,
    floatingChipRef,
    floatingDayLockByClickRef,
    floatingDayLockUntilRef,
    floatingChipAlignTimerRef,
    isTimelineScrollable,
    setIsTimelineScrollable,
    resetFloatingLocks,
    updateFloatingDayFromScroll,
    handleFloatingChipClick,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";

export function useFloatingDayChip() {
  const [floatingDay, setFloatingDay] = useState({ key: "", label: "" });
  const [isTimelineScrollable, setIsTimelineScrollable] = useState(false);
  const floatingChipRef = useRef(null);
  const floatingDayLockUntilRef = useRef(0);
  const floatingDayLockByClickRef = useRef(false);
  const floatingChipAlignTimerRef = useRef(null);
  const floatingChipScrollFrameRef = useRef(null);
  const floatingChipScrollTokenRef = useRef(0);

  const cancelFloatingChipScroll = useCallback(() => {
    floatingChipScrollTokenRef.current += 1;
    if (floatingChipScrollFrameRef.current) {
      cancelAnimationFrame(floatingChipScrollFrameRef.current);
      floatingChipScrollFrameRef.current = null;
    }
    if (floatingChipAlignTimerRef.current) {
      window.clearTimeout(floatingChipAlignTimerRef.current);
      floatingChipAlignTimerRef.current = null;
    }
  }, []);

  const resetFloatingLocks = useCallback(() => {
    cancelFloatingChipScroll();
    floatingDayLockByClickRef.current = false;
    floatingDayLockUntilRef.current = 0;
  }, [cancelFloatingChipScroll]);

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
      ? floatingRect.top + Math.max(8, floatingRect.height * 0.18)
      : scrollerRect.top + 92;
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
      const scroller = chatScrollRef?.current;
      const escapedDayKey =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(floatingDay.key)
          : String(floatingDay.key || "").replace(/["\\]/g, "\\$&");
      const node =
        scroller?.querySelector?.(`#day-group-${escapedDayKey}`) ||
        document.getElementById(`day-group-${floatingDay.key}`);
      if (!node || !scroller) return;
      const floatingChip = event.currentTarget;
      const currentKey = floatingDay.key;
      const currentLabel = floatingDay.label;
      cancelFloatingChipScroll();
      const scrollToken = floatingChipScrollTokenRef.current + 1;
      floatingChipScrollTokenRef.current = scrollToken;

      floatingDayLockByClickRef.current = true;
      floatingDayLockUntilRef.current = Date.now() + 1800;
      setFloatingDay({ key: currentKey, label: currentLabel });
      // Device-specific alignment nudge tuned to match visual chip overlap.
      const alignOffsetPx = isDesktop ? 0 : -1;

      const getAlignedScrollTop = () => {
        const stickyChip =
          node.querySelector("[data-day-chip]")?.parentElement || node;
        const floatingRect = floatingChip.getBoundingClientRect();
        const stickyRect = stickyChip.getBoundingClientRect();
        const desiredStickyTopInViewport = floatingRect.top + alignOffsetPx;
        const delta = stickyRect.top - desiredStickyTopInViewport;
        const maxTop = Math.max(
          0,
          scroller.scrollHeight - scroller.clientHeight,
        );
        return Math.max(0, Math.min(maxTop, scroller.scrollTop + delta));
      };

      const nextTargetTop = getAlignedScrollTop();
      const startTop = scroller.scrollTop;
      const distance = Math.abs(nextTargetTop - startTop);
      const durationMs = Math.min(520, Math.max(180, distance * 0.14));
      const releaseDelayMs = durationMs + 80;

      const runFinalAlign = (releaseLock = false) => {
        if (floatingChipScrollTokenRef.current !== scrollToken) return;
        const finalTop = getAlignedScrollTop();
        if (Math.abs(finalTop - scroller.scrollTop) > 0.5) {
          scroller.scrollTo({ top: finalTop, behavior: "auto" });
        }
        floatingChipScrollFrameRef.current = null;
        if (releaseLock) {
          floatingDayLockByClickRef.current = false;
          floatingDayLockUntilRef.current = Date.now() + 120;
        }
      };

      if (distance <= 1) {
        scroller.scrollTo({ top: nextTargetTop, behavior: "auto" });
        floatingChipAlignTimerRef.current = window.setTimeout(() => {
          runFinalAlign(true);
          floatingChipAlignTimerRef.current = null;
        }, 80);
        return;
      }

      const startTime = performance.now();
      const easeOutCubic = (progress) => 1 - Math.pow(1 - progress, 3);
      const step = (now) => {
        if (floatingChipScrollTokenRef.current !== scrollToken) return;
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        scroller.scrollTop =
          startTop + (nextTargetTop - startTop) * easeOutCubic(progress);
        if (progress < 1) {
          floatingChipScrollFrameRef.current = requestAnimationFrame(step);
          return;
        }
        runFinalAlign(false);
      };
      floatingChipScrollFrameRef.current = requestAnimationFrame(step);

      floatingChipAlignTimerRef.current = window.setTimeout(() => {
        runFinalAlign(true);
        floatingChipAlignTimerRef.current = null;
      }, releaseDelayMs);

      /*
       * This second measurement catches late layout changes from media without
       * letting a previous animation continue toward an old offset.
       */
      window.setTimeout(() => {
        if (
          floatingChipScrollTokenRef.current === scrollToken &&
          Date.now() < Number(floatingDayLockUntilRef.current || 0)
        ) {
          runFinalAlign(false);
        }
      }, releaseDelayMs + 160);
    },
    [cancelFloatingChipScroll],
  );

  useEffect(() => {
    return () => {
      cancelFloatingChipScroll();
    };
  }, [cancelFloatingChipScroll]);

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

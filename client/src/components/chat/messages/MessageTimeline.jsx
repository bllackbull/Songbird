import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const INITIAL_VIRTUAL_WINDOW_ROWS = 40;
const MAX_VIRTUAL_WINDOW_ROWS = 72;
const VIRTUAL_SHIFT_BATCH = 18;
const VIRTUAL_EXPAND_TRIGGER_PX = 720;
const BOTTOM_STRETCH_MAX_PX = 84;
const BOTTOM_STRETCH_GAIN = 0.2;
const BOTTOM_STRETCH_RELEASE_MS = 320;
const ESTIMATED_ROW_HEIGHT_PX = 96;

export function MessageTimeline({
  loadingMessages,
  messages,
  groupedMessages,
  loadingOlderMessages,
  handleGroupChipClick,
  renderMessageItem,
  chatScrollRef,
  handlePanelScroll,
  handleScrollIntent,
  chatScrollStyle,
  timelineBottomSpacerPx,
}) {
  const scrollContainerRef = useRef(null);
  const timelineRows = useMemo(() => {
    const rows = [];
    groupedMessages.forEach((group, groupIndex) => {
      const dayKey = group?.dayKey || `group-${groupIndex}`;
      rows.push({
        type: "day",
        key: `day-${dayKey}`,
        dayKey,
        dayLabel: group?.dayLabel || "",
      });
      (group?.items || []).forEach((msg, messageIndex) => {
        const stableKey =
          msg?._clientId ??
          msg?._serverId ??
          msg?.id ??
          `msg-${groupIndex}-${messageIndex}`;
        rows.push({
          type: "message",
          key: `message-${stableKey}`,
          msg,
          isFirstInGroup: messageIndex === 0,
        });
      });
    });
    return rows;
  }, [groupedMessages]);
  const [windowRange, setWindowRange] = useState(() => {
    const end = timelineRows.length;
    return {
      start: Math.max(0, end - INITIAL_VIRTUAL_WINDOW_ROWS),
      end,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
    };
  });
  const [bottomStretchPx, setBottomStretchPx] = useState(0);
  const [isReleasingStretch, setIsReleasingStretch] = useState(false);
  const bottomStretchRef = useRef(0);
  const releaseTimerRef = useRef(null);
  const rowHeightsRef = useRef(new Map());
  const averageRowHeightRef = useRef(ESTIMATED_ROW_HEIGHT_PX);
  const effectiveVisibleStartRow = Math.min(windowRange.start, timelineRows.length);
  const effectiveVisibleEndRow = Math.min(
    Math.max(effectiveVisibleStartRow, windowRange.end),
    timelineRows.length,
  );

  const visibleRows = useMemo(
    () =>
      timelineRows.slice(
        Math.max(0, effectiveVisibleStartRow),
        Math.max(0, effectiveVisibleEndRow),
      ),
    [timelineRows, effectiveVisibleEndRow, effectiveVisibleStartRow],
  );

  const sumRowHeights = (start, end) => {
    let total = 0;
    for (let index = start; index < end; index += 1) {
      total +=
        Number(rowHeightsRef.current.get(index) || 0) ||
        averageRowHeightRef.current;
    }
    return total;
  };

  const normalizeWindowRange = useCallback(
    (range) => {
      if (!timelineRows.length) {
        return {
          start: 0,
          end: 0,
          topSpacerPx: 0,
          bottomSpacerPx: 0,
        };
      }
      const nextStart = Math.max(0, Math.min(range.start, timelineRows.length));
      const nextEnd = Math.max(nextStart, Math.min(range.end, timelineRows.length));
      return {
        start: nextStart,
        end: nextEnd,
        topSpacerPx: nextStart <= 0 ? 0 : Math.max(0, range.topSpacerPx),
        bottomSpacerPx:
          nextEnd >= timelineRows.length ? 0 : Math.max(0, range.bottomSpacerPx),
      };
    },
    [timelineRows.length],
  );

  const syncWindowToViewport = useCallback(
    (scrollTop, clientHeight) => {
      if (!timelineRows.length) return;
      setWindowRange((prev) => {
        let next = normalizeWindowRange(prev);
        let changed = false;
        const averageRowHeight = Math.max(1, averageRowHeightRef.current || 1);
        const overscanPx = Math.max(
          VIRTUAL_EXPAND_TRIGGER_PX,
          Math.round(clientHeight * 0.9),
        );

        const getVisibleBottom = () =>
          next.topSpacerPx + sumRowHeights(next.start, next.end);

        if (next.start > 0) {
          const missingAbovePx = next.topSpacerPx + overscanPx - scrollTop;
          if (missingAbovePx > 0) {
            const rowsToAdd = Math.min(
              next.start,
              Math.max(
                VIRTUAL_SHIFT_BATCH,
                Math.ceil(missingAbovePx / averageRowHeight) + VIRTUAL_SHIFT_BATCH,
              ),
            );
            const nextStart = next.start - rowsToAdd;
            next = {
              ...next,
              start: nextStart,
              topSpacerPx:
                nextStart <= 0
                  ? 0
                  : Math.max(0, next.topSpacerPx - sumRowHeights(nextStart, next.start)),
            };
            changed = true;
          }
        }

        const viewportBottom = scrollTop + clientHeight;
        const canExtendBelow =
          next.end < timelineRows.length || next.bottomSpacerPx > 0;
        if (canExtendBelow) {
          const missingBelowPx = viewportBottom + overscanPx - getVisibleBottom();
          if (missingBelowPx > 0) {
            const rowsToAdd = Math.min(
              Math.max(0, timelineRows.length - next.end),
              Math.max(
                VIRTUAL_SHIFT_BATCH,
                Math.ceil(missingBelowPx / averageRowHeight) + VIRTUAL_SHIFT_BATCH,
              ),
            );
            const nextEnd = Math.min(timelineRows.length, next.end + rowsToAdd);
            next = {
              ...next,
              end: nextEnd,
              bottomSpacerPx:
                nextEnd >= timelineRows.length
                  ? 0
                  : Math.max(
                      0,
                      next.bottomSpacerPx - sumRowHeights(next.end, nextEnd),
                    ),
            };
            changed = true;
          }
        }

        const visibleCount = next.end - next.start;
        if (visibleCount > MAX_VIRTUAL_WINDOW_ROWS) {
          const atLatest = next.end >= timelineRows.length && next.bottomSpacerPx <= 0;
          const trimCount = visibleCount - MAX_VIRTUAL_WINDOW_ROWS;
          if (atLatest) {
            next = {
              ...next,
              start: next.start + trimCount,
              topSpacerPx:
                next.topSpacerPx + sumRowHeights(next.start, next.start + trimCount),
            };
          } else {
            next = {
              ...next,
              end: next.end - trimCount,
              bottomSpacerPx:
                next.bottomSpacerPx + sumRowHeights(next.end - trimCount, next.end),
            };
          }
          changed = true;
        }

        next = normalizeWindowRange(next);
        if (
          !changed ||
          (next.start === prev.start &&
            next.end === prev.end &&
            next.topSpacerPx === prev.topSpacerPx &&
            next.bottomSpacerPx === prev.bottomSpacerPx)
        ) {
          return prev;
        }
        return next;
      });
    },
    [normalizeWindowRange, timelineRows.length],
  );

  const clearReleaseTimer = useCallback(() => {
    if (!releaseTimerRef.current) return;
    window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = null;
  }, []);

  const releaseBottomStretch = useCallback(() => {
    clearReleaseTimer();
    if (bottomStretchRef.current <= 0) return;
    setIsReleasingStretch(true);
    bottomStretchRef.current = 0;
    setBottomStretchPx(0);
  }, [clearReleaseTimer]);

  const scheduleStretchRelease = useCallback(() => {
    clearReleaseTimer();
    releaseTimerRef.current = window.setTimeout(() => {
      releaseBottomStretch();
    }, 90);
  }, [clearReleaseTimer, releaseBottomStretch]);

  useEffect(
    () => () => {
      clearReleaseTimer();
    },
    [clearReleaseTimer],
  );

  useEffect(() => {
    if (messages.length) return;
    releaseBottomStretch();
    setWindowRange({
      start: 0,
      end: 0,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    setWindowRange((prev) => {
      const nextEnd = timelineRows.length;
      if (nextEnd > 0 && prev.end === 0) {
        return {
          start: Math.max(0, nextEnd - INITIAL_VIRTUAL_WINDOW_ROWS),
          end: nextEnd,
          topSpacerPx: 0,
          bottomSpacerPx: 0,
        };
      }
      if (nextEnd > prev.end) {
        const addedCount = nextEnd - prev.end;
        const isPinnedToLatest = prev.bottomSpacerPx <= 0;
        if (!isPinnedToLatest) {
          return prev;
        }
        let nextStart = prev.start;
        let nextTopSpacerPx = prev.topSpacerPx;
        const nextVisibleCount = nextEnd - nextStart;
        if (nextVisibleCount > MAX_VIRTUAL_WINDOW_ROWS) {
          const trimCount = nextVisibleCount - MAX_VIRTUAL_WINDOW_ROWS;
          nextTopSpacerPx += sumRowHeights(nextStart, nextStart + trimCount);
          nextStart += trimCount;
        } else if (addedCount > 0 && prev.topSpacerPx > 0) {
          nextTopSpacerPx = prev.topSpacerPx;
        }
        return {
          start: nextStart,
          end: nextEnd,
          topSpacerPx: nextTopSpacerPx,
          bottomSpacerPx: 0,
        };
      }
      if (nextEnd === prev.end) return prev;
      const nextStart = Math.min(prev.start, nextEnd);
      return {
        start: nextStart,
        end: nextEnd,
        topSpacerPx: prev.topSpacerPx,
        bottomSpacerPx: 0,
      };
    });
  }, [timelineRows.length]);

  const shiftWindowUp = () => {
    setWindowRange((prev) => {
      if (prev.start <= 0) return prev;
      const addedCount = Math.min(VIRTUAL_SHIFT_BATCH, prev.start);
      const nextStart = prev.start - addedCount;
      let nextEnd = prev.end;
      const nextTopSpacerPx = Math.max(
        0,
        prev.topSpacerPx - sumRowHeights(nextStart, prev.start),
      );
      let nextBottomSpacerPx = prev.bottomSpacerPx;
      const nextVisibleCount = nextEnd - nextStart;
      if (nextVisibleCount > MAX_VIRTUAL_WINDOW_ROWS) {
        const trimCount = nextVisibleCount - MAX_VIRTUAL_WINDOW_ROWS;
        const trimStart = nextEnd - trimCount;
        nextBottomSpacerPx += sumRowHeights(trimStart, nextEnd);
        nextEnd = trimStart;
      }
      return {
        start: nextStart,
        end: nextEnd,
        topSpacerPx: nextTopSpacerPx,
        bottomSpacerPx: nextBottomSpacerPx,
      };
    });
  };

  const shiftWindowDown = () => {
    setWindowRange((prev) => {
      if (prev.end >= timelineRows.length && prev.topSpacerPx <= 0) return prev;
      const addedCount = Math.min(
        VIRTUAL_SHIFT_BATCH,
        Math.max(0, timelineRows.length - prev.end),
      );
      let nextEnd = prev.end + addedCount;
      let nextTopSpacerPx = prev.topSpacerPx;
      const nextBottomSpacerPx = Math.max(
        0,
        prev.bottomSpacerPx - sumRowHeights(prev.end, nextEnd),
      );
      let nextStart = prev.start;
      const nextVisibleCount = nextEnd - nextStart;
      if (nextVisibleCount > MAX_VIRTUAL_WINDOW_ROWS) {
        const trimCount = nextVisibleCount - MAX_VIRTUAL_WINDOW_ROWS;
        nextTopSpacerPx += sumRowHeights(nextStart, nextStart + trimCount);
        nextStart += trimCount;
      }
      return {
        start: nextStart,
        end: nextEnd,
        topSpacerPx: nextTopSpacerPx,
        bottomSpacerPx: nextBottomSpacerPx,
      };
    });
  };

  const handleTimelineScroll = (event) => {
    const target = event?.currentTarget;
    if (!target) return;
    syncWindowToViewport(target.scrollTop, target.clientHeight);
    if (effectiveVisibleStartRow > 0 && target.scrollTop <= VIRTUAL_EXPAND_TRIGGER_PX) {
      shiftWindowUp();
    }
    const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
    if (
      (windowRange.bottomSpacerPx > 0 ||
        effectiveVisibleEndRow < timelineRows.length) &&
      target.scrollTop >= maxScrollTop - VIRTUAL_EXPAND_TRIGGER_PX
    ) {
      shiftWindowDown();
    }
    const atBottom = target.scrollTop >= maxScrollTop - 2;
    if (!atBottom && bottomStretchRef.current > 0) {
      releaseBottomStretch();
    }
    handlePanelScroll(event);
  };

  const handleTimelineWheel = useCallback((event) => {
    const target = event?.currentTarget;
    if (!target) return;
    const deltaY = Number(event.deltaY || 0);
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    if (deltaY < 0 && bottomStretchRef.current > 0) {
      const reduced = Math.max(0, bottomStretchRef.current + deltaY * 0.7);
      setIsReleasingStretch(false);
      bottomStretchRef.current = reduced;
      setBottomStretchPx(reduced);
      if (reduced <= 0) {
        scheduleStretchRelease();
      }
      return;
    }
    if (deltaY <= 0) return;
    const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
    const atBottom = target.scrollTop >= maxScrollTop - 2;
    if (!atBottom && bottomStretchRef.current <= 0) return;
    event.preventDefault();
    handleScrollIntent?.();
    const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 96 : 1;
    const normalizedDelta = Math.max(0, deltaY * deltaScale);
    const nextStretch = Math.min(
      BOTTOM_STRETCH_MAX_PX,
      bottomStretchRef.current + normalizedDelta * BOTTOM_STRETCH_GAIN,
    );
    setIsReleasingStretch(false);
    bottomStretchRef.current = nextStretch;
    setBottomStretchPx(nextStretch);
    scheduleStretchRelease();
  }, [handleScrollIntent, scheduleStretchRelease]);

  const setScrollRef = useCallback(
    (node) => {
      scrollContainerRef.current = node;
      if (!chatScrollRef) return;
      if (typeof chatScrollRef === "function") {
        chatScrollRef(node);
        return;
      }
      chatScrollRef.current = node;
    },
    [chatScrollRef],
  );

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return undefined;
    const nativeWheelHandler = (event) => {
      handleTimelineWheel(event);
    };
    node.addEventListener("wheel", nativeWheelHandler, { passive: false });
    return () => {
      node.removeEventListener("wheel", nativeWheelHandler, { passive: false });
    };
  }, [handleTimelineWheel]);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    syncWindowToViewport(node.scrollTop, node.clientHeight);
  }, [syncWindowToViewport, timelineRows.length]);

  const timelineContentStyle = {
    transform: `translateY(${-bottomStretchPx}px)`,
    transition: isReleasingStretch
      ? `transform ${BOTTOM_STRETCH_RELEASE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
      : "none",
    willChange: bottomStretchPx > 0 ? "transform" : "auto",
  };

  if (loadingMessages) {
    return (
      <div
        ref={setScrollRef}
        className="chat-scroll h-full space-y-3 overflow-y-auto overflow-x-hidden px-6 py-6"
        onScroll={handleTimelineScroll}
        style={chatScrollStyle}
      >
        {Array.from({ length: 7 }).map((_, index) => {
          const own = index % 2 === 0;
          return (
            <div
              key={`message-skeleton-${index}`}
              className={`flex ${own ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`animate-pulse rounded-2xl ${
                  own
                    ? "h-12 w-40 bg-emerald-300/70 dark:bg-emerald-700/60"
                    : "h-14 w-52 bg-white/80 dark:bg-slate-800/80"
                }`}
              />
            </div>
          );
        })}
      </div>
    );
  }

  if (messages.length) {
    return (
      <div
        ref={setScrollRef}
        onScroll={handleTimelineScroll}
        onTouchStartCapture={handleScrollIntent}
        onWheelCapture={handleScrollIntent}
        className="chat-scroll h-full overflow-y-auto overflow-x-hidden px-0 pb-3 pt-1 md:px-2"
        style={chatScrollStyle}
      >
        <div style={timelineContentStyle}>
          {windowRange.topSpacerPx > 0 ? (
            <div style={{ height: `${windowRange.topSpacerPx}px` }} />
          ) : null}
          {loadingOlderMessages ? (
            <div className="px-3 pb-3 pt-1 md:px-0">
              <div className="mx-auto h-10 w-40 animate-pulse rounded-2xl bg-white/80 dark:bg-slate-800/80" />
            </div>
          ) : null}
          {visibleRows.map((row, rowIndex) => (
            <div
              id={row.type === "day" ? `day-group-${row.dayKey}` : undefined}
              key={row.key}
              ref={(node) => {
                const absoluteIndex = effectiveVisibleStartRow + rowIndex;
                if (!node) {
                  rowHeightsRef.current.delete(absoluteIndex);
                  return;
                }
                const nextHeight = Number(node.offsetHeight || 0);
                if (nextHeight > 0) {
                  rowHeightsRef.current.set(absoluteIndex, nextHeight);
                  const measuredHeights = Array.from(rowHeightsRef.current.values());
                  if (measuredHeights.length) {
                    averageRowHeightRef.current =
                      measuredHeights.reduce((sum, value) => sum + value, 0) /
                      measuredHeights.length;
                  }
                }
              }}
            >
              {row.type === "day" ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleGroupChipClick(row.dayKey)}
                    className="inline-flex w-max items-center justify-center rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                  >
                    <span
                      data-day-chip={row.dayLabel || ""}
                      className="leading-none"
                    >
                      {row.dayLabel || ""}
                    </span>
                  </button>
                </div>
              ) : (
                <div>
                  {renderMessageItem(row.msg, {
                    isFirstInGroup: row.isFirstInGroup,
                  })}
                </div>
              )}
            </div>
          ))}
          <div
            style={{
              height: `${windowRange.bottomSpacerPx + timelineBottomSpacerPx}px`,
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setScrollRef}
      className="chat-scroll flex h-full items-center justify-center overflow-y-auto overflow-x-hidden px-6 py-6"
      onScroll={handleTimelineScroll}
      style={chatScrollStyle}
    >
      <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
        Say something to start
      </div>
    </div>
  );
}

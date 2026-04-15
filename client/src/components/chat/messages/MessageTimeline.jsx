import { useEffect, useMemo, useRef, useState } from "react";

const VIRTUAL_WINDOW_GROUPS = 16;
const VIRTUAL_EXPAND_BATCH = 8;
const VIRTUAL_EXPAND_TRIGGER_PX = 720;
const BOTTOM_STRETCH_MAX_PX = 84;
const BOTTOM_STRETCH_GAIN = 0.2;
const BOTTOM_STRETCH_RELEASE_MS = 320;

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
  const [visibleStartGroup, setVisibleStartGroup] = useState(() =>
    Math.max(0, groupedMessages.length - VIRTUAL_WINDOW_GROUPS),
  );
  const [bottomStretchPx, setBottomStretchPx] = useState(0);
  const [isReleasingStretch, setIsReleasingStretch] = useState(false);
  const bottomStretchRef = useRef(0);
  const releaseTimerRef = useRef(null);
  const effectiveVisibleStartGroup = Math.min(
    visibleStartGroup,
    Math.max(0, groupedMessages.length - 1),
  );

  const visibleGroups = useMemo(
    () => groupedMessages.slice(Math.max(0, effectiveVisibleStartGroup)),
    [groupedMessages, effectiveVisibleStartGroup],
  );

  const clearReleaseTimer = () => {
    if (!releaseTimerRef.current) return;
    window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = null;
  };

  const releaseBottomStretch = () => {
    clearReleaseTimer();
    if (bottomStretchRef.current <= 0) return;
    setIsReleasingStretch(true);
    bottomStretchRef.current = 0;
    setBottomStretchPx(0);
  };

  const scheduleStretchRelease = () => {
    clearReleaseTimer();
    releaseTimerRef.current = window.setTimeout(() => {
      releaseBottomStretch();
    }, 90);
  };

  useEffect(
    () => () => {
      clearReleaseTimer();
    },
    [],
  );

  useEffect(() => {
    if (messages.length) return;
    releaseBottomStretch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const handleTimelineScroll = (event) => {
    const target = event?.currentTarget;
    if (!target) return;
    if (
      effectiveVisibleStartGroup > 0 &&
      target.scrollTop <= VIRTUAL_EXPAND_TRIGGER_PX
    ) {
      const prevHeight = Number(target.scrollHeight || 0);
      setVisibleStartGroup((prev) => Math.max(0, prev - VIRTUAL_EXPAND_BATCH));
      requestAnimationFrame(() => {
        const nextHeight = Number(target.scrollHeight || 0);
        const growth = Math.max(0, nextHeight - prevHeight);
        if (growth > 0) {
          target.scrollTop = Number(target.scrollTop || 0) + growth;
        }
      });
    }
    const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight);
    const atBottom = target.scrollTop >= maxScrollTop - 2;
    if (!atBottom && bottomStretchRef.current > 0) {
      releaseBottomStretch();
    }
    handlePanelScroll(event);
  };

  const handleTimelineWheel = (event) => {
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
  };

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
        ref={chatScrollRef}
        className="chat-scroll h-full space-y-3 overflow-y-auto overflow-x-hidden px-6 py-6"
        onScroll={handleTimelineScroll}
        onWheel={handleTimelineWheel}
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
        ref={chatScrollRef}
        onScroll={handleTimelineScroll}
        onTouchStartCapture={handleScrollIntent}
        onWheelCapture={handleScrollIntent}
        onWheel={handleTimelineWheel}
        className="chat-scroll h-full overflow-y-auto overflow-x-hidden px-0 pb-3 pt-1 md:px-2"
        style={chatScrollStyle}
      >
        <div style={timelineContentStyle}>
          {loadingOlderMessages ? (
            <div className="px-3 pb-3 pt-1 md:px-0">
              <div className="mx-auto h-10 w-40 animate-pulse rounded-2xl bg-white/80 dark:bg-slate-800/80" />
            </div>
          ) : null}
          {visibleGroups.map((group, groupIndex) => (
            <div
              id={`day-group-${group.dayKey || effectiveVisibleStartGroup + groupIndex}`}
              key={`single-group-${group.dayKey || effectiveVisibleStartGroup + groupIndex}`}
            >
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => handleGroupChipClick(groupIndex)}
                  className="inline-flex w-max items-center justify-center rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
                >
                  <span
                    data-day-chip={group.dayLabel || ""}
                    className="leading-none"
                  >
                    {group.dayLabel || ""}
                  </span>
                </button>
              </div>
              {group.items.map((msg, index) => {
                const stableKey =
                  msg?._clientId ??
                  msg?._serverId ??
                  msg?.id ??
                  `msg-${effectiveVisibleStartGroup + groupIndex}-${index}`;
                return (
                  <div key={stableKey}>
                    {renderMessageItem(msg, { isFirstInGroup: index === 0 })}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ height: `${timelineBottomSpacerPx}px` }} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={chatScrollRef}
      className="chat-scroll flex h-full items-center justify-center overflow-y-auto overflow-x-hidden px-6 py-6"
      onScroll={handleTimelineScroll}
      onWheel={handleTimelineWheel}
      style={chatScrollStyle}
    >
      <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
        Say something to start
      </div>
    </div>
  );
}

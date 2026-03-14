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
  if (loadingMessages) {
    return (
      <div
        ref={chatScrollRef}
        className="chat-scroll h-full space-y-3 overflow-y-auto overflow-x-hidden px-6 py-6"
        onScroll={handlePanelScroll}
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
        onScroll={handlePanelScroll}
        onTouchStartCapture={handleScrollIntent}
        onWheelCapture={handleScrollIntent}
        className="chat-scroll h-full overflow-y-auto overflow-x-hidden px-0 pb-3 pt-1 md:px-2"
        style={chatScrollStyle}
      >
        {loadingOlderMessages ? (
          <div className="px-3 pb-3 pt-1 md:px-0">
            <div className="mx-auto h-10 w-40 animate-pulse rounded-2xl bg-white/80 dark:bg-slate-800/80" />
          </div>
        ) : null}
        {groupedMessages.map((group, groupIndex) => (
          <div
            id={`day-group-${group.dayKey || groupIndex}`}
            key={`single-group-${group.dayKey || groupIndex}`}
          >
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => handleGroupChipClick(groupIndex)}
                className="inline-flex w-max items-center justify-center rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:shadow-md dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200"
              >
                <span data-day-chip={group.dayLabel || ""} className="leading-none">
                  {group.dayLabel || ""}
                </span>
              </button>
            </div>
            {group.items.map((msg, index) => (
              <div
                key={String(msg?._clientId ?? msg?.id ?? `single-msg-${index}`)}
              >
                {renderMessageItem(msg, { isFirstInGroup: index === 0 })}
              </div>
            ))}
          </div>
        ))}
        <div style={{ height: `${timelineBottomSpacerPx}px` }} />
      </div>
    );
  }

  return (
    <div
      ref={chatScrollRef}
      className="chat-scroll flex h-full items-center justify-center overflow-y-auto overflow-x-hidden px-6 py-6"
      onScroll={handlePanelScroll}
      style={chatScrollStyle}
    >
      <div className="rounded-full border border-emerald-200 bg-white/80 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-slate-950 dark:text-emerald-200">
        Say something to start
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef } from "react";

export function useChatScroll({
  activeChatId,
  canMarkReadInCurrentView,
  chatScrollRef,
  clearUnreadAlignTimers,
  smoothScrollLockRef,
  messages,
  user,
  isAppActive,
  markMessagesRead,
  pendingScrollToUnreadRef,
  isAtBottomRef,
  userScrolledUpRef,
  unreadAnchorLockUntilRef,
  suppressScrolledUpRef,
  mediaLoadSnapTimerRef,
  activeChatIdRef,
  isMarkingReadRef,
  setUnreadInChat,
  setIsAtBottom,
  setUserScrolledUp,
}) {
  const CHAT_BOTTOM_THRESHOLD_PX = 24;
  const SCROLLED_UP_INDICATOR_THRESHOLD_PX = 160;
  const JUMP_TO_LATEST_SECOND_SNAP_THRESHOLD_PX = 24;
  const JUMP_TO_LATEST_DURATION_MS = 860;
  const pendingScrollToBottomRef = useRef(false);
  const smoothScrollAnimRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const cancelSmoothScroll = useCallback(() => {
    if (smoothScrollAnimRef.current) {
      cancelAnimationFrame(smoothScrollAnimRef.current);
      smoothScrollAnimRef.current = null;
    }
    if (smoothScrollLockRef) {
      smoothScrollLockRef.current = 0;
    }
  }, [smoothScrollLockRef]);

  const setSmoothScrollLock = useCallback(
    (durationMs = 680) => {
      const next = Date.now() + durationMs;
      if (smoothScrollLockRef) {
        smoothScrollLockRef.current = next;
      }
    },
    [smoothScrollLockRef],
  );

  const smoothScrollToBottom = useCallback(
    (durationMs = JUMP_TO_LATEST_DURATION_MS) => {
      const container = chatScrollRef.current;
      if (!container) return;
      setSmoothScrollLock(Math.max(720, durationMs + 140));
      if (smoothScrollAnimRef.current) {
        cancelAnimationFrame(smoothScrollAnimRef.current);
        smoothScrollAnimRef.current = null;
      }
      const startTop = container.scrollTop;
      const maxScrollTop = Math.max(
        0,
        container.scrollHeight - container.clientHeight,
      );
      const targetTop = maxScrollTop;
      const distance = targetTop - startTop;
      if (Math.abs(distance) < 2) {
        container.scrollTop = maxScrollTop;
        return;
      }
      const startTime = performance.now();
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const step = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        const easedTop = startTop + distance * easeOutCubic(progress);
        container.scrollTop = easedTop;
        if (progress < 1) {
          smoothScrollAnimRef.current = requestAnimationFrame(step);
        } else {
          smoothScrollAnimRef.current = null;
          container.scrollTop = Math.max(
            0,
            container.scrollHeight - container.clientHeight,
          );
        }
      };
      smoothScrollAnimRef.current = requestAnimationFrame(step);
    },
    [chatScrollRef, setSmoothScrollLock],
  );

  const scrollChatToBottom = useCallback(
    (behavior = "auto") => {
      const container = chatScrollRef.current;
      if (!container) return;
      if (behavior === "smooth") {
        smoothScrollToBottom();
        return;
      }
      container.scrollTo({
        top: container.scrollHeight + 1000,
        behavior,
      });
    },
    [chatScrollRef, smoothScrollToBottom],
  );

  const handleChatScroll = useCallback(
    (event) => {
      const target = event.currentTarget;
      const previousTop = Number(lastScrollTopRef.current || 0);
      const currentTop = Number(target.scrollTop || 0);
      const scrolledUpByUser = Boolean(
        event?.isTrusted && currentTop < previousTop - 1,
      );
      lastScrollTopRef.current = currentTop;
      const threshold = CHAT_BOTTOM_THRESHOLD_PX;
      const distanceFromBottom =
        target.scrollHeight - currentTop - target.clientHeight;
      const atBottom =
        distanceFromBottom < threshold;
      if (isAtBottomRef.current !== atBottom) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
      if (atBottom && !scrolledUpByUser) {
        suppressScrolledUpRef.current = false;
        unreadAnchorLockUntilRef.current = 0;
        clearUnreadAlignTimers();
        if (userScrolledUpRef.current) {
          userScrolledUpRef.current = false;
          setUserScrolledUp(false);
        }
      } else {
        if (event?.isTrusted) {
          suppressScrolledUpRef.current = false;
          unreadAnchorLockUntilRef.current = 0;
          clearUnreadAlignTimers();
        }
        if (suppressScrolledUpRef.current) {
          return;
        }
        if (!userScrolledUpRef.current) {
          if (distanceFromBottom < SCROLLED_UP_INDICATOR_THRESHOLD_PX) {
            return;
          }
          pendingScrollToBottomRef.current = false;
          pendingScrollToUnreadRef.current = null;
          userScrolledUpRef.current = true;
          setUserScrolledUp(true);
          if (mediaLoadSnapTimerRef.current) {
            window.clearTimeout(mediaLoadSnapTimerRef.current);
            mediaLoadSnapTimerRef.current = null;
          }
        }
      }
      if (atBottom) {
        pendingScrollToBottomRef.current = false;
        setUnreadInChat(0);
        const activeId = activeChatIdRef.current;
        if (
          activeId &&
          user?.username &&
          isAppActive &&
          canMarkReadInCurrentView &&
          !isMarkingReadRef.current
        ) {
          if (
            pendingScrollToUnreadRef.current !== null ||
            Number(unreadAnchorLockUntilRef.current || 0) > Date.now()
          ) {
            return;
          }
          const hasUnreadFromOthers = messages.some(
            (msg) => msg.username !== user.username && !msg._readByMe,
          );
          if (hasUnreadFromOthers) {
            isMarkingReadRef.current = true;
            markMessagesRead({ chatId: activeId, username: user.username })
              .catch(() => null)
              .finally(() => {
                isMarkingReadRef.current = false;
              });
          }
        }
      }
    },
    [
      activeChatIdRef,
      canMarkReadInCurrentView,
      clearUnreadAlignTimers,
      isAppActive,
      isMarkingReadRef,
      isAtBottomRef,
      markMessagesRead,
      mediaLoadSnapTimerRef,
      messages,
      pendingScrollToUnreadRef,
      setIsAtBottom,
      setUnreadInChat,
      setUserScrolledUp,
      suppressScrolledUpRef,
      unreadAnchorLockUntilRef,
      user,
      userScrolledUpRef,
      SCROLLED_UP_INDICATOR_THRESHOLD_PX,
    ],
  );

  const handleJumpToLatest = useCallback(() => {
    pendingScrollToUnreadRef.current = null;
    suppressScrolledUpRef.current = true;
    scrollChatToBottom("smooth");
    requestAnimationFrame(() => {
      const next = chatScrollRef.current;
      if (!next) return;
      const distance = next.scrollHeight - (next.scrollTop + next.clientHeight);
      if (distance > JUMP_TO_LATEST_SECOND_SNAP_THRESHOLD_PX) {
        scrollChatToBottom("smooth");
      }
    });
    setUnreadInChat(0);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    userScrolledUpRef.current = false;
    setUserScrolledUp(false);
  }, [
    chatScrollRef,
    isAtBottomRef,
    pendingScrollToUnreadRef,
    scrollChatToBottom,
    setIsAtBottom,
    setUnreadInChat,
    setUserScrolledUp,
    suppressScrolledUpRef,
    userScrolledUpRef,
  ]);

  const handleMessageMediaLoaded = useCallback(() => {
    if (!activeChatId) return;
    if (!isAtBottomRef.current || userScrolledUpRef.current) return;
    if (mediaLoadSnapTimerRef.current) {
      window.clearTimeout(mediaLoadSnapTimerRef.current);
    }
    mediaLoadSnapTimerRef.current = window.setTimeout(() => {
      scrollChatToBottom("auto");
    }, 60);
  }, [
    activeChatId,
    isAtBottomRef,
    mediaLoadSnapTimerRef,
    scrollChatToBottom,
    userScrolledUpRef,
  ]);

  useEffect(() => {
    return () => {
      if (mediaLoadSnapTimerRef.current) {
        window.clearTimeout(mediaLoadSnapTimerRef.current);
        mediaLoadSnapTimerRef.current = null;
      }
      if (smoothScrollAnimRef.current) {
        cancelAnimationFrame(smoothScrollAnimRef.current);
        smoothScrollAnimRef.current = null;
      }
    };
  }, [mediaLoadSnapTimerRef]);

  return {
    handleChatScroll,
    handleJumpToLatest,
    handleMessageMediaLoaded,
    scrollChatToBottom,
    cancelSmoothScroll,
  };
}

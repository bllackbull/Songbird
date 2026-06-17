import { useCallback, useEffect, useRef } from "react";
import { isMessageFromOtherUser } from "../../utils/messageOwnership.js";

// How long a message must be visible before it counts as "seen" (ms).
const VISIBILITY_DWELL_MS = 300;
// Max time to wait before flushing a batch of seen message IDs (ms).
const BATCH_FLUSH_MS = 600;

/**
 * Tracks which unread messages have scrolled into view and fires
 * onMessageSeen(messageId) for each one.
 *
 * Returns `registerMessageRef(msg)` — a stable callback ref factory.
 * Pass the result of `registerMessageRef(msg)` as the `ref` prop on the
 * message's root DOM element. Only attaches an observer for messages that
 * are unread and from another user; for all others it returns null.
 *
 * The chip (unreadMarkerId) is intentionally NOT touched here — it stays
 * fixed at the original first-unread position for the session. It only
 * repositions on the next open of the chat.
 */
export function useMessageVisibility({
  activeChatId,
  user,
  canMarkReadInCurrentView,
  isAppActive,
  chatScrollRef,
  onMessageSeen,
}) {
  // Use refs for values read inside the observer callback to avoid stale closures
  const canMarkReadRef = useRef(canMarkReadInCurrentView);
  const isAppActiveRef = useRef(isAppActive);
  const onMessageSeenRef = useRef(onMessageSeen);

  useEffect(() => { canMarkReadRef.current = canMarkReadInCurrentView; }, [canMarkReadInCurrentView]);
  useEffect(() => { isAppActiveRef.current = isAppActive; }, [isAppActive]);
  useEffect(() => { onMessageSeenRef.current = onMessageSeen; }, [onMessageSeen]);

  // Map of messageId → dwell timer id
  const dwellTimersRef = useRef(new Map());
  // Set of messageIds already reported as seen this session
  const reportedRef = useRef(new Set());
  // Pending batch of messageIds to flush
  const pendingBatchRef = useRef([]);
  const batchTimerRef = useRef(null);
  const observerRef = useRef(null);
  // Map of element → messageId for cleanup
  const elementToIdRef = useRef(new Map());

  // Reset everything when the active chat changes
  useEffect(() => {
    dwellTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    dwellTimersRef.current.clear();
    reportedRef.current.clear();
    pendingBatchRef.current = [];
    if (batchTimerRef.current) {
      window.clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    elementToIdRef.current.clear();
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, [activeChatId]);

  // Flush the pending batch
  const flushBatch = useCallback(() => {
    batchTimerRef.current = null;
    const ids = pendingBatchRef.current.splice(0);
    for (const id of ids) {
      onMessageSeenRef.current?.(id);
    }
  }, []);

  const scheduleBatchFlush = useCallback(() => {
    if (batchTimerRef.current) return;
    batchTimerRef.current = window.setTimeout(flushBatch, BATCH_FLUSH_MS);
  }, [flushBatch]);

  const reportSeen = useCallback(
    (messageId) => {
      const id = Number(messageId);
      if (!id || reportedRef.current.has(id)) return;
      reportedRef.current.add(id);
      pendingBatchRef.current.push(id);
      scheduleBatchFlush();
    },
    [scheduleBatchFlush],
  );

  // Build (or reuse) the IntersectionObserver.
  // The observer is recreated when the scroll container changes (chat switch).
  const getObserver = useCallback(() => {
    if (observerRef.current) return observerRef.current;
    const root = chatScrollRef?.current ?? null;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Read current values from refs — no stale closures
        if (!canMarkReadRef.current || !isAppActiveRef.current) return;
        for (const entry of entries) {
          const el = entry.target;
          const id = elementToIdRef.current.get(el);
          if (!id) continue;
          if (entry.isIntersecting) {
            if (!dwellTimersRef.current.has(id)) {
              const timer = window.setTimeout(() => {
                dwellTimersRef.current.delete(id);
                reportSeen(id);
              }, VISIBILITY_DWELL_MS);
              dwellTimersRef.current.set(id, timer);
            }
          }
        }
      },
      {
        root,
        // Message must be at least 40% visible to count as seen
        threshold: 0.4,
      },
    );
    return observerRef.current;
  }, [chatScrollRef, reportSeen]);

  /**
   * Returns a ref callback for a message element, or null if the message
   * doesn't need visibility tracking (own messages, already-read messages).
   */
  const registerMessageRef = useCallback(
    (msg) => {
      const messageId = Number(msg?._serverId || msg?.id || 0);
      if (!messageId) return null;
      if (!user) return null;
      if (!isMessageFromOtherUser(msg, user)) return null;
      if (msg._readByMe) return null;

      return (el) => {
        if (!el) {
          // Element unmounted — clean up
          const observer = observerRef.current;
          if (observer) {
            for (const [node, id] of elementToIdRef.current) {
              if (id === messageId) {
                observer.unobserve(node);
                elementToIdRef.current.delete(node);
                break;
              }
            }
          }
          const timer = dwellTimersRef.current.get(messageId);
          if (timer !== undefined) {
            window.clearTimeout(timer);
            dwellTimersRef.current.delete(messageId);
          }
          return;
        }
        // Already registered this element or already seen
        if (elementToIdRef.current.has(el)) return;
        if (reportedRef.current.has(messageId)) return;
        elementToIdRef.current.set(el, messageId);
        getObserver().observe(el);
      };
    },
    [user, getObserver],
  );

  // Cleanup on unmount
  useEffect(
    () => () => {
      dwellTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      if (batchTimerRef.current) window.clearTimeout(batchTimerRef.current);
      observerRef.current?.disconnect();
    },
    [],
  );

  return { registerMessageRef };
}

import { useEffect, useRef } from "react";

export function useResumeRefresh({
  isAppActive,
  user,
  loadChatsRef,
  scheduleMessageRefreshRef,
  activeChatIdRef,
}) {
  const wasAppActiveRef = useRef(
    document.visibilityState === "visible" && document.hasFocus(),
  );

  useEffect(() => {
    if (!user?.username) {
      wasAppActiveRef.current = isAppActive;
      return;
    }
    const becameActive = isAppActive && !wasAppActiveRef.current;
    wasAppActiveRef.current = isAppActive;
    if (!becameActive) return;
    loadChatsRef.current?.({ silent: true, showUpdating: true });
    const activeId = Number(activeChatIdRef.current || 0);
    if (activeId > 0) {
      scheduleMessageRefreshRef.current?.(activeId, {
        delayMs: 120,
        preserveHistory: true,
      });
    }
  }, [
    isAppActive,
    user?.username,
    loadChatsRef,
    scheduleMessageRefreshRef,
    activeChatIdRef,
  ]);
}

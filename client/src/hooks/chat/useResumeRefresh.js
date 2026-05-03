import { useEffect, useRef } from "react";

const BLUR_ONLY_RESUME_THRESHOLD_MS = 30000;

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
  const hiddenSinceActiveRef = useRef(false);
  const inactiveStartedAtRef = useRef(0);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceActiveRef.current = true;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!user?.username) {
      wasAppActiveRef.current = isAppActive;
      if (!isAppActive) {
        inactiveStartedAtRef.current = Date.now();
      } else {
        hiddenSinceActiveRef.current = false;
        inactiveStartedAtRef.current = 0;
      }
      return;
    }
    const becameActive = isAppActive && !wasAppActiveRef.current;
    if (!isAppActive && wasAppActiveRef.current) {
      inactiveStartedAtRef.current = Date.now();
    }
    wasAppActiveRef.current = isAppActive;
    if (!becameActive) return;
    const inactiveForMs = inactiveStartedAtRef.current
      ? Date.now() - inactiveStartedAtRef.current
      : 0;
    const shouldRefresh =
      hiddenSinceActiveRef.current ||
      inactiveForMs >= BLUR_ONLY_RESUME_THRESHOLD_MS;
    hiddenSinceActiveRef.current = false;
    inactiveStartedAtRef.current = 0;
    if (!shouldRefresh) return;
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

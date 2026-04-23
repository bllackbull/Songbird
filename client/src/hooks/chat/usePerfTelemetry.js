import { useEffect, useRef } from "react";
import { APP_CONFIG } from "../../settings/appConfig.js";

const PERF_TELEMETRY_KEY = "songbird-perf-telemetry-v1";
const PERF_MAX_ENTRIES = 120;

const readTelemetry = () => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PERF_TELEMETRY_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeTelemetry = (entries) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PERF_TELEMETRY_KEY,
      JSON.stringify(entries.slice(-PERF_MAX_ENTRIES)),
    );
  } catch {
    // ignore storage failures
  }
};

const pushTelemetry = (entry) => {
  const entries = readTelemetry();
  entries.push({
    t: Date.now(),
    ...entry,
  });
  writeTelemetry(entries);
};

export function usePerfTelemetry({ activeChatId, messagesLength, loadingMessages }) {
  const openStartRef = useRef(null);

  useEffect(() => {
    if (!APP_CONFIG.debugEnabled) return;
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
      return;
    }
    const supportedEntryTypes = Array.isArray(PerformanceObserver.supportedEntryTypes)
      ? PerformanceObserver.supportedEntryTypes
      : [];
    if (!supportedEntryTypes.includes("longtask")) {
      return;
    }
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          const duration = Number(entry?.duration || 0);
          if (!Number.isFinite(duration) || duration < 120) return;
          pushTelemetry({
            type: "longtask",
            durationMs: Math.round(duration),
          });
        });
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      observer = null;
    }
    return () => {
      observer?.disconnect?.();
    };
  }, []);

  useEffect(() => {
    if (!APP_CONFIG.debugEnabled) {
      openStartRef.current = null;
      return;
    }
    const chatId = Number(activeChatId || 0);
    if (!chatId) {
      openStartRef.current = null;
      return;
    }
    openStartRef.current = performance.now();
  }, [activeChatId]);

  useEffect(() => {
    if (!APP_CONFIG.debugEnabled) return;
    if (loadingMessages) return;
    const chatId = Number(activeChatId || 0);
    if (!chatId) return;
    if (messagesLength <= 0) return;
    const startedAt = Number(openStartRef.current || 0);
    if (!startedAt) return;
    const elapsed = performance.now() - startedAt;
    if (!Number.isFinite(elapsed) || elapsed < 0) return;
    pushTelemetry({
      type: "chat_open",
      chatId,
      messageCount: Number(messagesLength || 0),
      durationMs: Math.round(elapsed),
    });
    openStartRef.current = null;
  }, [activeChatId, loadingMessages, messagesLength]);
}

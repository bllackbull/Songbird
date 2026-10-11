import { useEffect, useState } from "react";

// Survive ChatPage remounts (e.g. any path that still tears the page down) so
// the UI does not flash "Connecting..." after a recently successful check.
let lastKnownConnected = false;

export function useHealthCheck({ fetchHealth, intervalMs }) {
  const [isConnected, setIsConnected] = useState(lastKnownConnected);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetchHealth();
        if (!res.ok) throw new Error("Not connected");
        const data = await res.json();
        const next = Boolean(data?.ok);
        lastKnownConnected = next;
        if (isMounted) {
          setIsConnected(next);
        }
      } catch {
        lastKnownConnected = false;
        if (isMounted) {
          setIsConnected(false);
        }
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, intervalMs);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [fetchHealth, intervalMs]);

  return { isConnected, setIsConnected };
}

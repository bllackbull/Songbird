import { useEffect, useState } from "react";

export function useHealthCheck({ fetchHealth, intervalMs }) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetchHealth();
        if (!res.ok) throw new Error("Not connected");
        const data = await res.json();
        if (isMounted) {
          setIsConnected(Boolean(data?.ok));
        }
      } catch {
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

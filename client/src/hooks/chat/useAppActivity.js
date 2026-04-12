import { useEffect, useState } from "react";

export function useAppActivity() {
  const [isAppActive, setIsAppActive] = useState(
    document.visibilityState === "visible" && document.hasFocus(),
  );

  useEffect(() => {
    const syncActiveState = () => {
      setIsAppActive(
        document.visibilityState === "visible" && document.hasFocus(),
      );
    };
    syncActiveState();
    document.addEventListener("visibilitychange", syncActiveState);
    window.addEventListener("focus", syncActiveState);
    window.addEventListener("blur", syncActiveState);
    return () => {
      document.removeEventListener("visibilitychange", syncActiveState);
      window.removeEventListener("focus", syncActiveState);
      window.removeEventListener("blur", syncActiveState);
    };
  }, []);

  return { isAppActive };
}

import { useEffect, useState } from "react";

export function useMobileViewport(query = "(max-width: 767px)") {
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    const update = () => setIsMobileViewport(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, [query]);

  return { isMobileViewport };
}

import { useEffect, useRef } from "react";

// When `isOpen` becomes true, pushes a sentinel history entry; when the
// system back gesture pops that entry (popstate), calls onClose;
// when the overlay closes by other means, pops the sentinel to keep the
// history stack in sync with the UI. `stateKey` must be unique per overlay so
// stacked overlays ignore each other's pops.
export function useOverlayBack(isOpen, onClose, stateKey = "sbOverlayBack") {
  const pushedRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen && !pushedRef.current) {
      // Push a sentinel entry so the back gesture lands on us instead of
      // being handled by the OS (which would exit the app).
      window.history.pushState({ [stateKey]: true }, "");
      pushedRef.current = true;
    } else if (!isOpen && pushedRef.current) {
      // Pop the sentinel only if ours is the current (topmost) entry. If a
      // newer overlay's sentinel sits above ours (e.g. an overlay closed
      // while another stayed open), leave it — the user's back gestures
      // drain it and our entry no-ops in the popstate handler.
      if (window.history.state?.[stateKey] === true) {
        pushedRef.current = false;
        window.history.back();
      }
    }
  }, [isOpen, stateKey]);

  useEffect(() => {
    const handlePopState = (event) => {
      if (!pushedRef.current) return;
      if (event.state?.[stateKey]) return; // moving forward into our entry
      pushedRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [stateKey]);
}

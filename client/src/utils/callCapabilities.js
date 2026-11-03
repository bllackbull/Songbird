/**
 * Checks whether WebRTC calling is supported in the current environment.
 * Requires a secure context (HTTPS or localhost) and mediaDevices support.
 */
export function isCallSupported() {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext === false) return false;
  if (
    window.location.protocol === "http:" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.hostname !== "::1" &&
    !window.location.hostname.endsWith(".localhost")
  ) {
    return false;
  }
  return Boolean(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function",
  );
}

/**
 * Checks whether the current browser can share its screen during a call.
 * Desktop browsers expose getDisplayMedia; most mobile browsers (Android
 * Chrome, iOS Safari) do not, so the share control stays hidden there.
 */
export function isScreenShareSupported() {
  if (!isCallSupported()) return false;
  return typeof navigator.mediaDevices.getDisplayMedia === "function";
}

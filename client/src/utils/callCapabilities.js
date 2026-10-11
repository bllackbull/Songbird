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

export function isLoopbackRequest(req) {
  // Use the raw socket address, not req.ip. With "trust proxy" enabled,
  // req.ip is derived from the client-supplied X-Forwarded-For header,
  // which lets a remote caller spoof a loopback address. The socket's
  // remoteAddress reflects the actual TCP peer and cannot be forged.
  const source = String(req.socket?.remoteAddress || "");

  return (
    source === "::1" || source === "127.0.0.1" || source === "::ffff:127.0.0.1"
  );
}

export function parseUploadFileMetadata(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(String(rawValue));

    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

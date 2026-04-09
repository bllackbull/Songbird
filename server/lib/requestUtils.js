export function isLoopbackRequest(req) {
  const source = String(req.ip || req.socket?.remoteAddress || "");

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

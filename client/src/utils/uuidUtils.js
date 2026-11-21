const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeUuid(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (UUID_REGEX.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export function isValidUuid(value) {
  return normalizeUuid(value) !== null;
}

// A message can still carry a pending client `id` alongside its echoed
// server `_serverId`; prefer the server id as the canonical identity.
export function resolveServerMessageId(message) {
  return normalizeUuid(message?._serverId || message?.id) || null;
}

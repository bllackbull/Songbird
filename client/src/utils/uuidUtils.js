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

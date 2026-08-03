import crypto from "node:crypto";

/**
 * UUID Utility Module
 *
 * Provides standardized UUID v4 generation and validation using Node.js native crypto module.
 */

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Generate a new UUID v4 string.
 */
export function generateUuid() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments where randomUUID might be mocked or unavailable
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (c ^ (crypto.randomBytes(1)[0] & (15 >> (c / 4)))).toString(16),
  );
}

/**
 * Validates if a value is a valid UUID string.
 */
export function isValidUuid(value) {
  if (!value || typeof value !== "string") return false;
  return UUID_REGEX.test(value.trim());
}

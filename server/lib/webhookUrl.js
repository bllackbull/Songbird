const CALLBACK_PATH = "/api/uploads/webhook/processed";

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function hasEmptyExplicitPort(url) {
  // Matches "http://host:/path" — a host followed by a colon with no port.
  // This is what an uninterpolated "${{PORT}}" template produces and fetch
  // treats it as port 80, so such a value must never be used as-is.
  return /:\/\/[^/:?#]+:\//.test(String(url || ""));
}

/**
 * Resolve the webhook callback URL the media worker uses to report back.
 *
 * An explicitly configured WEBHOOK_URL (or its aliases) wins, unless it
 * carries an empty explicit port from a failed variable interpolation.
 * Otherwise the URL is derived from runtime-known values: on Railway,
 * RAILWAY_PRIVATE_DOMAIN and PORT are only known inside the running
 * container, so no IaC-time template can capture the port — it must be
 * assembled here.
 *
 * @param {object} [env=process.env]
 * @returns {string}
 */
export function resolveWebhookCallbackUrl(env = process.env) {
  const source = env || {};
  const explicit = [
    source.WEBHOOK_URL,
    source.WEBHOOK_CALLBACK_URL,
    source.SONGBIRD_WEBHOOK_URL,
    source.SONGBIRD_WEBHOOK_CALLBACK_URL,
  ]
    .map(clean)
    .find(Boolean);
  if (explicit && !hasEmptyExplicitPort(explicit)) return explicit;

  const port = clean(source.PORT || source.SERVER_PORT) || "5174";
  const privateDomain = clean(source.RAILWAY_PRIVATE_DOMAIN);
  if (privateDomain) {
    return `http://${privateDomain}:${port}${CALLBACK_PATH}`;
  }

  const publicDomain = clean(source.RAILWAY_PUBLIC_DOMAIN).replace(
    /^https?:\/\//,
    "",
  );
  if (publicDomain) {
    return `https://${publicDomain.replace(/\/+$/, "")}${CALLBACK_PATH}`;
  }

  return `http://127.0.0.1:${port}${CALLBACK_PATH}`;
}

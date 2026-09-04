const REQUIRED_METHODS = ["GET", "PUT", "HEAD", "POST"];
// Coverage only demands the methods Songbird actually uses (presigned PUT
// uploads, GET/HEAD downloads). POST is still written for completeness.
const COVERAGE_METHODS = ["GET", "PUT", "HEAD"];

export function normalizeOrigin(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function splitOrigins(value) {
  return String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

/**
 * Work out which public origins serve the app UI (and therefore need to
 * PUT directly to the bucket). Explicit APP_PUBLIC_URL wins; otherwise
 * platform-injected domains are used (Railway, Render).
 *
 * @param {object} [env=process.env]
 * @returns {string[]}
 */
export function resolveAppOrigins(env = process.env) {
  const source = env || {};
  const explicit = splitOrigins(source.APP_PUBLIC_URL);
  if (explicit.length > 0) return [...new Set(explicit)];

  const platform =
    normalizeOrigin(source.RAILWAY_PUBLIC_DOMAIN) ||
    normalizeOrigin(source.RENDER_EXTERNAL_URL);
  return platform ? [platform] : [];
}

export function buildUploadCorsRule(origins) {
  return {
    AllowedHeaders: ["*"],
    AllowedMethods: [...REQUIRED_METHODS],
    AllowedOrigins: [...origins],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600,
  };
}

/**
 * Whether any existing CORSRules entry already allows all given origins
 * with the methods browsers need for presigned uploads.
 */
export function ruleCoversOrigins(rules, origins) {
  const list = Array.isArray(rules) ? rules : [];
  return origins.every((origin) =>
    list.some((rule) => {
      const allowedOrigins = rule?.AllowedOrigins || rule?.allowedOrigins || [];
      const allowedMethods = (
        rule?.AllowedMethods ||
        rule?.allowedMethods ||
        []
      ).map((method) => String(method || "").toUpperCase());
      return (
        allowedOrigins.includes(origin) &&
        COVERAGE_METHODS.every((method) => allowedMethods.includes(method))
      );
    }),
  );
}

/**
 * Derive the browser origin that needs bucket access from an incoming
 * request. Prefers the Origin header (the exact page origin), falling back
 * to the Host the client used to reach us (X-Forwarded-Host, then Host).
 * This lets the server learn its own public origin at runtime — no need to
 * know the domain at boot or to redeploy after attaching one.
 *
 * @param {object} [req]
 * @returns {string} normalized origin or ""
 */
export function deriveRequestOrigin(req) {
  const headers = req?.headers || {};
  const first = (value) =>
    String(value || "")
      .split(",")[0]
      .trim();
  return (
    normalizeOrigin(first(headers.origin)) ||
    normalizeOrigin(first(headers["x-forwarded-host"])) ||
    normalizeOrigin(first(headers.host)) ||
    ""
  );
}

const requestCheckCache = new Map();

export function clearBucketCorsRequestCache() {
  requestCheckCache.clear();
}

/**
 * Request-driven variant of ensureBucketCors: derives the needed origin
 * from the incoming request and ensures the bucket allows it. Results are
 * cached per origin (10 min positive, 60 s negative) so the steady state
 * costs zero S3 calls. Never throws.
 *
 * Note: presign callers are authenticated, and a CORS entry grants no object
 * access by itself (presigned URLs do), so learning origins from requests
 * is safe here.
 *
 * @param {{getCorsRules: Function, setCorsRules: Function}|null} provider
 * @param {object} req Express-style request (only headers are read)
 * @param {object} [options]
 * @param {number} [options.now=Date.now()]
 * @param {number} [options.positiveTtlMs=600000]
 * @param {number} [options.negativeTtlMs=60000]
 * @returns {Promise<{status: "ok"|"applied"|"skipped"|"error", error?: string}>}
 */
export async function ensureBucketCorsForRequest(provider, req, options = {}) {
  const now = options.now ?? Date.now();
  const positiveTtlMs = options.positiveTtlMs ?? 10 * 60 * 1000;
  const negativeTtlMs = options.negativeTtlMs ?? 60 * 1000;
  if (!provider || typeof provider.getCorsRules !== "function") {
    return { status: "skipped" };
  }
  const origin = deriveRequestOrigin(req);
  if (!origin) return { status: "skipped" };
  const cached = requestCheckCache.get(origin);
  if (cached && now - cached.at < (cached.ok ? positiveTtlMs : negativeTtlMs)) {
    return cached.result;
  }
  const result = await ensureBucketCors(provider, [origin]);
  requestCheckCache.set(origin, {
    at: now,
    ok: result.status !== "error",
    result,
  });
  return result;
}

/**
 * Idempotently ensure the bucket CORS policy allows browser uploads from
 * the given origins. Existing unrelated rules are preserved (merged, never
 * replaced). When a PUT actually happens, propagation is awaited (bounded
 * poll) so a presigned upload issued right after does not race an
 * unenforced policy on eventually-consistent stores. Never throws —
 * returns a status object instead so boot and request paths can log and
 * continue.
 *
 * @param {{getCorsRules: Function, setCorsRules: Function}|null} provider
 * @param {string[]} origins
 * @param {object} [options]
 * @param {boolean} [options.awaitPropagation=true]
 * @param {number} [options.propagationAttempts=6]
 * @param {number} [options.propagationIntervalMs=1000]
 * @param {Function} [options.sleep=(ms) => new Promise((r) => setTimeout(r, ms))]
 * @returns {Promise<{status: "ok"|"applied"|"applied_unverified"|"skipped"|"error", error?: string}>}
 */
export async function ensureBucketCors(provider, origins, options = {}) {
  const wanted = [...new Set((origins || []).filter(Boolean))];
  if (!provider || typeof provider.getCorsRules !== "function") {
    return { status: "skipped" };
  }
  if (wanted.length === 0) {
    return { status: "skipped" };
  }
  const awaitPropagation = options.awaitPropagation ?? true;
  const attempts = options.propagationAttempts ?? 6;
  const intervalMs = options.propagationIntervalMs ?? 1000;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  try {
    const current = (await provider.getCorsRules()) || [];
    if (ruleCoversOrigins(current, wanted)) {
      return { status: "ok" };
    }
    const merged = [...current, buildUploadCorsRule(wanted)];
    await provider.setCorsRules(merged);
    if (!awaitPropagation) return { status: "applied" };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await sleep(intervalMs);
      try {
        const visible = (await provider.getCorsRules()) || [];
        if (ruleCoversOrigins(visible, wanted)) {
          return { status: "applied" };
        }
      } catch (_) {}
    }
    return { status: "applied_unverified" };
  } catch (err) {
    return { status: "error", error: err?.message || String(err) };
  }
}

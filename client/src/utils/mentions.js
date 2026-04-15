import { resolveMentions } from "../api/chatApi.js";

const MENTION_TTL_MS = 5 * 60 * 1000;
const INVALID_TTL_MS = 30 * 1000;
const mentionCache = new Map();
const pending = new Map();

const now = () => Date.now();

export function getCachedMention(username, options = {}) {
  const key = String(username || "").toLowerCase();
  const allowStale = Boolean(options.allowStale);
  const cached = mentionCache.get(key);
  if (!cached) return null;
  const age = now() - cached.checkedAt;
  if (cached.status === "invalid" && age > INVALID_TTL_MS) return null;
  if (!allowStale && age > MENTION_TTL_MS) return null;
  return cached;
}

export async function resolveMention(username, currentUser, options = {}) {
  const key = String(username || "").toLowerCase();
  if (!key) return null;
  const force = Boolean(options?.force);
  const cached = getCachedMention(key, {
    allowStale: Boolean(options?.allowStale || options?.fallbackToCacheOnError),
  });
  if (cached && !force) return cached;
  if (pending.has(key)) return pending.get(key);

  const promise = (async () => {
    try {
      const res = await resolveMentions({
        username: currentUser,
        mentions: [key],
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Unable to resolve mention.");
      }
      const match = Array.isArray(data?.mentions)
        ? data.mentions.find(
            (item) => String(item?.username || "").toLowerCase() === key,
          )
        : null;
      const result = match
        ? { status: "valid", data: match, checkedAt: now() }
        : { status: "invalid", data: null, checkedAt: now() };
      mentionCache.set(key, result);
      return result;
    } catch {
      if (cached && options?.fallbackToCacheOnError) {
        return cached;
      }
      const result = { status: "invalid", data: null, checkedAt: now() };
      mentionCache.set(key, result);
      return result;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, promise);
  return promise;
}

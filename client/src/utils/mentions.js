import { resolveMentions } from "../api/chatApi.js";

const MENTION_TTL_MS = 15 * 1000;
const mentionCache = new Map();
const pending = new Map();

const now = () => Date.now();

export function getCachedMention(username) {
  const key = String(username || "").toLowerCase();
  const cached = mentionCache.get(key);
  if (!cached) return null;
  if (now() - cached.checkedAt > MENTION_TTL_MS) return null;
  return cached;
}

export async function resolveMention(username, currentUser) {
  const key = String(username || "").toLowerCase();
  if (!key) return null;
  const cached = getCachedMention(key);
  if (cached) return cached;
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

import { useCallback, useEffect, useRef, useState } from "react";

// Survives component unmount/remount within the same browser session.
// Keyed by sorted join of fetcher keys so distinct consumers get independent stores.
const _stores = {};
function getStore(keys) {
  const id = [...keys].sort().join(',');
  if (!_stores[id]) _stores[id] = {};
  return _stores[id];
}

/**
 * Lightweight cache for admin panel tab data.
 *
 * Each entry stores { data, fetchedAt, loading } keyed by a string ID.
 * Data remains fresh indefinitely in memory until explicitly invalidated or
 * refreshed via mutations or real-time updates. Switching to a tab whose cache
 * exists is instant; switching to an unloaded tab triggers a fetch automatically.
 *
 * After a mutation (create/edit/delete) callers should call `invalidate(key)`
 * so the next visit to that tab always gets fresh data.
 */
export function useAdminCache(fetchers) {
  // Keep the module-level store stable for this hook instance without reading
  // a ref during render. The lazy initializer also preserves it on remounts.
  const [store] = useState(() => getStore(Object.keys(fetchers)));

  // cache: { [key]: { data: any, fetchedAt: number, loading: boolean } | null }
  // Seeds from the module store on remount so cached data survives navigation.
  // On first visit the store is empty → store[k] ?? null === null (unchanged).
  const [cache, setCache] = useState(() => (
    Object.fromEntries(
      Object.keys(fetchers).map((k) => [k, store[k] ?? null])
    )
  ));

  // Wrapper around setCache that also writes every key back to the module
  // store so that cached data survives the next unmount/remount cycle.
  const setAndPersistCache = useCallback((updater) => {
    setCache((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Write each key back to the module store so data survives unmount
      Object.keys(next).forEach((k) => { store[k] = next[k]; });
      return next;
    });
  }, [store]);

  // Keep a stable ref to the latest fetchers so the interval callback
  // always calls the current version without going stale.
  const fetchersRef = useRef(fetchers);
  useEffect(() => { fetchersRef.current = fetchers; });

  // Track which fetches are in-flight so we never double-fetch.
  const loadingRef = useRef(new Set());

  const fetchKey = useCallback(async (key) => {
    if (loadingRef.current.has(key)) return;
    loadingRef.current.add(key);
    // Mark as loading
    setAndPersistCache((prev) => ({
      ...prev,
      [key]: prev[key] ? { ...prev[key], loading: true } : { data: null, fetchedAt: 0, loading: true },
    }));
    try {
      const data = await fetchersRef.current[key]();
      setAndPersistCache((prev) => ({ ...prev, [key]: { data, fetchedAt: Date.now(), loading: false } }));
    } catch {
      // Leave stale data in place on error; mark loading as false.
      setAndPersistCache((prev) => ({
        ...prev,
        [key]: prev[key] ? { ...prev[key], loading: false } : { data: null, fetchedAt: 0, loading: false },
      }));
    } finally {
      loadingRef.current.delete(key);
    }
  }, [setAndPersistCache]);

  /**
   * Ensure the cache for `key` is present. Fetches immediately if missing.
   * Called whenever a tab becomes visible.
   */
  const ensureFresh = useCallback((key) => {
    const entry = cache[key];
    if (!entry) fetchKey(key);
  }, [cache, fetchKey]);

  /**
   * Fetch a cache entry only when it has never been loaded. Use this for
   * process/session-stable data that should not expire while the app is open.
   */
  const ensureLoaded = useCallback((key) => {
    if (!cache[key]) fetchKey(key);
  }, [cache, fetchKey]);

  /**
   * Force-invalidate a cache entry so the next `ensureFresh` always refetches.
   * Call this after any mutation (create / edit / delete).
   */
  const invalidate = useCallback((key) => {
    setAndPersistCache((prev) => ({ ...prev, [key]: null }));
  }, [setAndPersistCache]);

  /**
   * Immediately refetch `key` regardless of freshness, and return the result.
   * Used by the manual refresh button and post-mutation reloads.
   */
  const refresh = useCallback((key) => fetchKey(key), [fetchKey]);

  /**
   * Refresh multiple keys in parallel.
   */
  const refreshAll = useCallback((...keys) => {
    return Promise.all((keys.length ? keys : Object.keys(fetchers)).map(fetchKey));
  }, [fetchers, fetchKey]);

  return { cache, ensureFresh, ensureLoaded, invalidate, refresh, refreshAll };
}

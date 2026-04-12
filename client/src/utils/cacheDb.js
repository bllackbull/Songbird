const DB_NAME = "songbird-cache";
const DB_VERSION = 2;

const STORES = {
  chatList: "chatList",
  messages: "messages",
  index: "messagesIndex",
  channelSeen: "channelSeen",
  mediaThumbs: "mediaThumbs",
  mediaPosters: "mediaPosters",
  voiceWaveforms: "voiceWaveforms",
};

let dbPromise;

export const isIdbAvailable = () =>
  typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

const openDb = () => {
  if (!isIdbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      Object.values(STORES).forEach((store) => {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
};

const withStore = async (storeName, mode, callback) => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store, tx);
    tx.oncomplete = () => {
      if (result && typeof result.then === "function") {
        result.then(resolve).catch(() => resolve(null));
        return;
      }
      resolve(result ?? true);
    };
    tx.onerror = () => resolve(null);
    tx.onabort = () => resolve(null);
  });
};

const estimateSizeBytes = (value) => {
  try {
    const raw = JSON.stringify(value);
    if (typeof Blob !== "undefined") {
      return new Blob([raw]).size;
    }
    return raw.length;
  } catch {
    return 0;
  }
};

export const idbGet = async (storeName, key) =>
  withStore(storeName, "readonly", (store) => {
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  });

export const idbSet = async (storeName, key, value) =>
  withStore(storeName, "readwrite", (store) => {
    const payload = {
      data: value,
      sizeBytes: estimateSizeBytes(value),
      updatedAt: Date.now(),
    };
    store.put(payload, key);
  });

export const idbDelete = async (storeName, key) =>
  withStore(storeName, "readwrite", (store) => {
    store.delete(key);
  });

export const idbClearStore = async (storeName) =>
  withStore(storeName, "readwrite", (store) => {
    store.clear();
  });

export const idbGetAllEntries = async (storeName) =>
  withStore(storeName, "readonly", (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () =>
        resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  });

/**
 * Get detailed statistics about IndexedDB storage usage
 * Useful for cache size reporting and diagnostics
 */
export const idbGetStats = async () => {
  if (!isIdbAvailable()) {
    return {
      available: false,
      totalBytes: 0,
      storeStats: {},
    };
  }

  try {
    const storeStats = {};
    let totalBytes = 0;

    for (const [storeName] of Object.entries(STORES)) {
      const entries = await idbGetAllEntries(storeName);
      let storeBytes = 0;
      let count = 0;

      entries.forEach((entry) => {
        if (entry && typeof entry === "object") {
          const entrySize = Number(entry.sizeBytes || 0);
          storeBytes += entrySize;
          count += 1;
        }
      });

      totalBytes += storeBytes;
      storeStats[storeName] = {
        count,
        bytes: storeBytes,
      };
    }

    return {
      available: true,
      totalBytes,
      storeStats,
    };
  } catch {
    return {
      available: false,
      totalBytes: 0,
      storeStats: {},
    };
  }
};

export const CACHE_STORES = STORES;

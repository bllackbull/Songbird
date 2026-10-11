import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  mapLegacyToNewKey,
  isLegacyKey,
  detectLegacyLayout,
  migrateLegacyStorageLayout,
} from "../lib/storageLayoutMigration.js";

function makeProvider(objectsByPrefix = {}, overrides = {}) {
  const store = new Map();
  for (const [prefix, keys] of Object.entries(objectsByPrefix)) {
    void prefix;
    for (const key of keys) store.set(key, { key });
  }
  return {
    type: "s3",
    listObjects: vi.fn(async (prefix) => {
      const clean = String(prefix || "");
      return [...store.keys()]
        .filter((k) => k.startsWith(clean))
        .map((k) => ({ key: k }));
    }),
    exists: vi.fn(async (key) => store.has(key)),
    copyFile: vi.fn(async (src, dest) => {
      if (!store.has(src)) throw new Error(`NoSuchKey: ${src}`);
      store.set(dest, { key: dest });
      return { key: dest };
    }),
    deleteFile: vi.fn(async (key) => {
      store.delete(key);
      return true;
    }),
    __store: store,
    ...overrides,
  };
}

describe("storage layout migration key mapping", () => {
  test("maps legacy avatar keys to uploads/avatars/", () => {
    expect(mapLegacyToNewKey("avatars/a.png")).toBe("uploads/avatars/a.png");
    expect(mapLegacyToNewKey("avatars/nested/a.png")).toBe(
      "uploads/avatars/nested/a.png",
    );
  });

  test("maps legacy uploads keys to uploads/messages/", () => {
    expect(mapLegacyToNewKey("uploads/photo.png")).toBe(
      "uploads/messages/photo.png",
    );
    expect(mapLegacyToNewKey("uploads/a-thumb.jpg")).toBe(
      "uploads/messages/a-thumb.jpg",
    );
  });

  test("leaves unified keys and unknown prefixes alone", () => {
    expect(mapLegacyToNewKey("uploads/avatars/a.png")).toBeNull();
    expect(mapLegacyToNewKey("uploads/messages/b.png")).toBeNull();
    expect(mapLegacyToNewKey("thumbs/c.jpg")).toBeNull();
    expect(mapLegacyToNewKey("")).toBeNull();
    expect(isLegacyKey("avatars/a.png")).toBe(true);
    expect(isLegacyKey("uploads/avatars/a.png")).toBe(false);
  });
});

describe("detectLegacyLayout", () => {
  test("reports no legacy keys for unified buckets", async () => {
    const provider = makeProvider({
      "uploads/avatars/": ["uploads/avatars/a.png"],
      "uploads/": ["uploads/avatars/a.png", "uploads/messages/b.png"],
    });
    const result = await detectLegacyLayout(provider);
    expect(result.hasLegacy).toBe(false);
  });

  test("finds legacy avatar and message keys", async () => {
    const provider = makeProvider({
      "avatars/": ["avatars/old.png"],
      "uploads/": ["uploads/old-msg.png", "uploads/messages/new.png"],
    });
    const result = await detectLegacyLayout(provider);
    expect(result.hasLegacy).toBe(true);
    expect(result.legacyAvatarKeys).toEqual(["avatars/old.png"]);
    expect(result.legacyMessageKeys).toEqual(["uploads/old-msg.png"]);
  });
});

describe("migrateLegacyStorageLayout", () => {
  let rewriteStorageKeys;
  let adminSave;

  beforeEach(() => {
    rewriteStorageKeys = vi.fn(() => 2);
    adminSave = vi.fn();
  });

  test("copies legacy objects, rewrites DB keys, deletes legacy originals", async () => {
    const provider = makeProvider({
      "avatars/": ["avatars/a.png"],
      "uploads/": ["uploads/b.png", "uploads/messages/keep.png"],
    });

    const summary = await migrateLegacyStorageLayout({
      storageProvider: provider,
      rewriteStorageKeys,
      adminSave,
      logger: { warn: () => {} },
    });

    expect(summary.hasLegacy).toBe(true);
    expect(summary.moved).toEqual([
      { from: "avatars/a.png", to: "uploads/avatars/a.png" },
      { from: "uploads/b.png", to: "uploads/messages/b.png" },
    ]);
    expect(provider.copyFile).toHaveBeenCalledTimes(2);
    expect(rewriteStorageKeys).toHaveBeenCalledWith(summary.moved);
    expect(adminSave).toHaveBeenCalled();
    expect(provider.deleteFile).toHaveBeenCalledWith("avatars/a.png");
    expect(provider.deleteFile).toHaveBeenCalledWith("uploads/b.png");
    expect(summary.deletedLegacy).toEqual(["avatars/a.png", "uploads/b.png"]);
    expect(provider.__store.has("uploads/avatars/a.png")).toBe(true);
    expect(provider.__store.has("uploads/messages/b.png")).toBe(true);
  });

  test("dry run lists pending moves without side effects", async () => {
    const provider = makeProvider({ "avatars/": ["avatars/a.png"] });

    const summary = await migrateLegacyStorageLayout({
      storageProvider: provider,
      rewriteStorageKeys,
      adminSave,
      dryRun: true,
      logger: { warn: () => {} },
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.pending).toEqual([
      { from: "avatars/a.png", to: "uploads/avatars/a.png" },
    ]);
    expect(provider.copyFile).not.toHaveBeenCalled();
    expect(rewriteStorageKeys).not.toHaveBeenCalled();
    expect(provider.deleteFile).not.toHaveBeenCalled();
  });

  test("skips copy when destination already exists but still rewrites DB and deletes legacy", async () => {
    const provider = makeProvider({
      "avatars/": ["avatars/a.png"],
      "uploads/avatars/": ["uploads/avatars/a.png"],
    });

    const summary = await migrateLegacyStorageLayout({
      storageProvider: provider,
      rewriteStorageKeys,
      adminSave,
      logger: { warn: () => {} },
    });

    expect(summary.copySkipped).toEqual([
      { from: "avatars/a.png", to: "uploads/avatars/a.png" },
    ]);
    expect(provider.copyFile).not.toHaveBeenCalled();
    expect(rewriteStorageKeys).toHaveBeenCalledWith(summary.moved);
    expect(provider.deleteFile).toHaveBeenCalledWith("avatars/a.png");
  });

  test("records copy failures without DB rewrite or delete for that key", async () => {
    const provider = makeProvider(
      { "avatars/": ["avatars/a.png"] },
      {
        copyFile: vi.fn(async () => {
          throw new Error("CopyFailed");
        }),
      },
    );

    const summary = await migrateLegacyStorageLayout({
      storageProvider: provider,
      rewriteStorageKeys,
      adminSave,
      logger: { warn: () => {} },
    });

    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0].from).toBe("avatars/a.png");
    expect(rewriteStorageKeys).not.toHaveBeenCalled();
    expect(provider.deleteFile).not.toHaveBeenCalled();
  });

  test("skips local-driver providers", async () => {
    const provider = makeProvider({});
    provider.type = "local";
    const summary = await migrateLegacyStorageLayout({
      storageProvider: provider,
      rewriteStorageKeys,
      adminSave,
      logger: { warn: () => {} },
    });
    expect(summary.skipped).toBe("local-driver");
    expect(provider.listObjects).not.toHaveBeenCalled();
  });

  test("returns empty summary for already-unified buckets", async () => {
    const provider = makeProvider({
      "uploads/": ["uploads/messages/a.png"],
    });
    const summary = await migrateLegacyStorageLayout({
      storageProvider: provider,
      rewriteStorageKeys,
      adminSave,
      logger: { warn: () => {} },
    });
    expect(summary.hasLegacy).toBe(false);
    expect(provider.copyFile).not.toHaveBeenCalled();
    expect(rewriteStorageKeys).not.toHaveBeenCalled();
  });
});

import { describe, test, expect, beforeEach } from "vitest";
import { normalizeEnvSecret, ensureSystemSecrets } from "../../lib/secrets.js";

describe("secrets.js", () => {
  beforeEach(() => {
    delete process.env.ADMIN_API_TOKEN;
    delete process.env.STORAGE_ENCRYPTION_KEY;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  test("normalizeEnvSecret strips surrounding quotes", () => {
    expect(normalizeEnvSecret('"secret"')).toBe("secret");
    expect(normalizeEnvSecret("'secret'")).toBe("secret");
    expect(normalizeEnvSecret("  secret  ")).toBe("secret");
  });

  test("ensureSystemSecrets loads existing secrets from database if process.env is missing", async () => {
    const dbStore = {
      ADMIN_API_TOKEN: "db-admin-token",
      STORAGE_ENCRYPTION_KEY: "db-storage-key",
      WEBHOOK_SECRET: "db-webhook-secret",
    };

    const mockGetRow = async (query) => {
      const compiled =
        typeof query?.toSQL === "function" ? query.toSQL() : null;
      const sql = String(compiled?.sql || query?.sql || query || "");
      const bindings = compiled?.bindings || query?.bindings || [];
      const key = bindings[0];
      if (dbStore[key]) {
        return { value: dbStore[key] };
      }
      return null;
    };

    const mockRun = async () => {};

    await ensureSystemSecrets({
      dbGetRow: mockGetRow,
      dbRun: mockRun,
      projectRootDir: "/tmp",
      fsImpl: {
        existsSync: () => false,
        readFileSync: () => "",
        writeFileSync: () => {},
      },
    });

    expect(process.env.ADMIN_API_TOKEN).toBe("db-admin-token");
    expect(process.env.STORAGE_ENCRYPTION_KEY).toBe("db-storage-key");
    expect(process.env.WEBHOOK_SECRET).toBe("db-webhook-secret");
  });

  test("ensureSystemSecrets generates new secrets when missing from process.env and DB", async () => {
    const dbStore = {};
    const mockGetRow = async () => null;
    const mockRun = async (query) => {
      const compiled =
        typeof query?.toSQL === "function" ? query.toSQL() : null;
      const bindings = compiled?.bindings || query?.bindings || [];
      if (bindings.length >= 2) {
        dbStore[bindings[0]] = bindings[1];
      }
    };

    await ensureSystemSecrets({
      dbGetRow: mockGetRow,
      dbRun: mockRun,
      projectRootDir: "/tmp",
      fsImpl: {
        existsSync: () => false,
        readFileSync: () => "",
        writeFileSync: () => {},
      },
      webpushImpl: {
        generateVAPIDKeys: () => ({
          publicKey:
            "test-pub-key-12345678901234567890123456789012345678901234567890123456789012345",
          privateKey: "test-priv-key-12345678901234567890123",
        }),
      },
    });

    expect(process.env.ADMIN_API_TOKEN).toBeTruthy();
    expect(process.env.STORAGE_ENCRYPTION_KEY).toBeTruthy();
    expect(process.env.WEBHOOK_SECRET).toBeTruthy();
    expect(process.env.VAPID_PUBLIC_KEY).toBeTruthy();
  });

  test("ensureSystemSecrets saves env secrets to database if available in environment but missing from DB", async () => {
    process.env.ADMIN_API_TOKEN = "env-admin-token";
    process.env.STORAGE_ENCRYPTION_KEY = "env-storage-key";
    process.env.WEBHOOK_SECRET = "env-webhook-secret";
    process.env.VAPID_PUBLIC_KEY = "env-vapid-pub";
    process.env.VAPID_PRIVATE_KEY = "env-vapid-priv";
    process.env.VAPID_SUBJECT = "mailto:env@example.com";

    const dbStore = {};
    const mockGetRow = async () => null; // DB is empty
    const mockRun = async (query) => {
      const compiled =
        typeof query?.toSQL === "function" ? query.toSQL() : null;
      const bindings = compiled?.bindings || query?.bindings || [];
      if (bindings.length >= 2) {
        dbStore[bindings[0]] = bindings[1];
      }
    };

    await ensureSystemSecrets({
      dbGetRow: mockGetRow,
      dbRun: mockRun,
      projectRootDir: "/tmp",
      fsImpl: {
        existsSync: () => false,
        readFileSync: () => "",
        writeFileSync: () => {},
      },
    });

    expect(dbStore.ADMIN_API_TOKEN).toBe("env-admin-token");
    expect(dbStore.STORAGE_ENCRYPTION_KEY).toBe("env-storage-key");
    expect(dbStore.WEBHOOK_SECRET).toBe("env-webhook-secret");
    expect(dbStore.VAPID_PUBLIC_KEY).toBe("env-vapid-pub");
    expect(dbStore.VAPID_PRIVATE_KEY).toBe("env-vapid-priv");
    expect(dbStore.VAPID_SUBJECT).toBe("mailto:env@example.com");
  });
});

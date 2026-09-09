import { describe, test, expect, beforeEach } from "vitest";
import { normalizeEnvSecret, ensureSystemSecrets, updateEnvValue } from "../../lib/secrets.js";

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

  test("ensureSystemSecrets loads existing secrets from database if process.env is missing and writes them to .env", async () => {
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
    let writtenEnv = {};

    await ensureSystemSecrets({
      dbGetRow: mockGetRow,
      dbRun: mockRun,
      projectRootDir: "/tmp",
      fsImpl: {
        existsSync: () => true,
        readFileSync: () => "",
        writeFileSync: (_path, content) => {
          content.split("\n").forEach((line) => {
            const [k, v] = line.split("=");
            if (k && v) writtenEnv[k] = v;
          });
        },
      },
    });

    expect(process.env.ADMIN_API_TOKEN).toBe("db-admin-token");
    expect(process.env.STORAGE_ENCRYPTION_KEY).toBe("db-storage-key");
    expect(process.env.WEBHOOK_SECRET).toBe("db-webhook-secret");
    expect(writtenEnv.ADMIN_API_TOKEN).toBe("db-admin-token");
    expect(writtenEnv.STORAGE_ENCRYPTION_KEY).toBe("db-storage-key");
    expect(writtenEnv.WEBHOOK_SECRET).toBe("db-webhook-secret");
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

  test("ensureSystemSecrets prefers env secrets over DB values and updates DB with env secret without overwriting .env", async () => {
    process.env.ADMIN_API_TOKEN = "new-env-token";
    process.env.STORAGE_ENCRYPTION_KEY = "new-env-storage-key";
    process.env.WEBHOOK_SECRET = "new-env-webhook-secret";
    process.env.VAPID_PUBLIC_KEY = "new-env-vapid-pub";
    process.env.VAPID_PRIVATE_KEY = "new-env-vapid-priv";

    const dbStore = {
      ADMIN_API_TOKEN: "original-db-token",
      STORAGE_ENCRYPTION_KEY: "original-db-storage-key",
      WEBHOOK_SECRET: "original-db-webhook-secret",
      VAPID_PUBLIC_KEY: "original-db-vapid-pub",
      VAPID_PRIVATE_KEY: "original-db-vapid-priv",
      VAPID_SUBJECT: "mailto:original@example.com",
    };

    const mockGetRow = async (query) => {
      const compiled =
        typeof query?.toSQL === "function" ? query.toSQL() : null;
      const bindings = compiled?.bindings || query?.bindings || [];
      const key = bindings[0];
      if (dbStore[key]) {
        return { value: dbStore[key] };
      }
      return null;
    };

    let envContent = "STORAGE_ENCRYPTION_KEY=new-env-storage-key\n";
    let envUpdated = {};
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
        existsSync: () => true,
        readFileSync: () => envContent,
        writeFileSync: (_path, content) => {
          envContent = content;
          content.split("\n").forEach((line) => {
            const [k, v] = line.split("=");
            if (k && v) envUpdated[k] = v;
          });
        },
      },
    });

    // Env secrets MUST win (order of truth: env > database > generate):
    expect(process.env.ADMIN_API_TOKEN).toBe("new-env-token");
    expect(process.env.STORAGE_ENCRYPTION_KEY).toBe("new-env-storage-key");
    expect(process.env.WEBHOOK_SECRET).toBe("new-env-webhook-secret");
    expect(process.env.VAPID_PUBLIC_KEY).toBe("new-env-vapid-pub");
    expect(process.env.VAPID_PRIVATE_KEY).toBe("new-env-vapid-priv");

    // DB store MUST be updated to the env values:
    expect(dbStore.ADMIN_API_TOKEN).toBe("new-env-token");
    expect(dbStore.STORAGE_ENCRYPTION_KEY).toBe("new-env-storage-key");
    expect(dbStore.WEBHOOK_SECRET).toBe("new-env-webhook-secret");
    expect(dbStore.VAPID_PUBLIC_KEY).toBe("new-env-vapid-pub");
    expect(dbStore.VAPID_PRIVATE_KEY).toBe("new-env-vapid-priv");

    // .env file must NOT be overwritten with the old DB value:
    expect(envUpdated.STORAGE_ENCRYPTION_KEY).toBeUndefined();
  });

  test("updateEnvValue does not write to file if content is unchanged", () => {
    let writeCount = 0;
    const mockFs = {
      existsSync: () => true,
      readFileSync: () => "FOO=bar\nBAZ=qux\n",
      writeFileSync: () => {
        writeCount++;
      },
    };

    updateEnvValue("/tmp/.env", "FOO", "bar", { fsImpl: mockFs });
    expect(writeCount).toBe(0);

    updateEnvValue("/tmp/.env", "FOO", "new_val", { fsImpl: mockFs });
    expect(writeCount).toBe(1);
  });
});

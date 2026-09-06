import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { ensureAdminApiToken } from "../../lib/adminApiToken.js";
import { ensureWebhookSecret } from "../../lib/webhookSecret.js";
import { ensureValidVapidKeys } from "../../lib/vapid.js";

const envBackup = { ...process.env };

beforeEach(() => {
  delete process.env.ADMIN_API_TOKEN;
  delete process.env.WEBHOOK_SECRET;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
});

afterEach(() => {
  Object.assign(process.env, envBackup);
});

describe("adminApiToken helper", () => {
  test("returns existing ADMIN_API_TOKEN if set", () => {
    process.env.ADMIN_API_TOKEN = "my-admin-token";
    const token = ensureAdminApiToken({ projectRootDir: "/tmp" });
    expect(token).toBe("my-admin-token");
  });

  test("generates and persists ADMIN_API_TOKEN if missing", () => {
    let written = "";
    const mockFs = {
      existsSync: () => false,
      readFileSync: () => "",
      writeFileSync: (p, c) => {
        written = c;
      },
    };
    const token = ensureAdminApiToken({
      projectRootDir: "/tmp",
      fsImpl: mockFs,
    });
    expect(token).toBeTruthy();
    expect(process.env.ADMIN_API_TOKEN).toBe(token);
    expect(written).toContain(`ADMIN_API_TOKEN=${token}`);
  });
});

describe("webhookSecret helper", () => {
  test("returns existing WEBHOOK_SECRET if set", () => {
    process.env.WEBHOOK_SECRET = "my-webhook-secret";
    const secret = ensureWebhookSecret({ projectRootDir: "/tmp" });
    expect(secret).toBe("my-webhook-secret");
  });

  test("generates and persists WEBHOOK_SECRET if missing", () => {
    let written = "";
    const mockFs = {
      existsSync: () => false,
      readFileSync: () => "",
      writeFileSync: (p, c) => {
        written = c;
      },
    };
    const secret = ensureWebhookSecret({
      projectRootDir: "/tmp",
      fsImpl: mockFs,
    });
    expect(secret).toBeTruthy();
    expect(process.env.WEBHOOK_SECRET).toBe(secret);
    expect(written).toContain(`WEBHOOK_SECRET=${secret}`);
  });
});

describe("vapid helper", () => {
  test("generates VAPID keys if missing or invalid", () => {
    let written = "";
    const mockFs = {
      existsSync: () => false,
      readFileSync: () => "",
      writeFileSync: (p, c) => {
        written += c;
      },
    };
    const mockWebpush = {
      setVapidDetails: () => {},
      generateVAPIDKeys: () => ({
        publicKey:
          "pub-key-65-chars-1234567890123456789012345678901234567890123456789",
        privateKey: "priv-key-32-chars-12345678901234",
      }),
    };
    const result = ensureValidVapidKeys({
      projectRootDir: "/tmp",
      fs: mockFs,
      path: { join: (...args) => args.join("/") },
      webpush: mockWebpush,
    });

    expect(result.publicKey).toBeTruthy();
    expect(result.privateKey).toBeTruthy();
    expect(process.env.VAPID_PUBLIC_KEY).toBe(result.publicKey);
    expect(process.env.VAPID_PRIVATE_KEY).toBe(result.privateKey);
  });
});

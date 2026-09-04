import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  resolveAppOrigins,
  ruleCoversOrigins,
  ensureBucketCors,
  deriveRequestOrigin,
  ensureBucketCorsForRequest,
  clearBucketCorsRequestCache,
} from "../../lib/bucketCors.js";

describe("resolveAppOrigins", () => {
  test("prefers explicit APP_PUBLIC_URL (comma-separated)", () => {
    expect(
      resolveAppOrigins({
        APP_PUBLIC_URL: "https://app.example.com, https://admin.example.com/",
        RAILWAY_PUBLIC_DOMAIN: "songbird.up.railway.app",
      }),
    ).toEqual(["https://app.example.com", "https://admin.example.com"]);
  });

  test("adds https scheme to bare hosts", () => {
    expect(resolveAppOrigins({ APP_PUBLIC_URL: "app.example.com" })).toEqual([
      "https://app.example.com",
    ]);
  });

  test("falls back to RAILWAY_PUBLIC_DOMAIN", () => {
    expect(
      resolveAppOrigins({
        RAILWAY_PUBLIC_DOMAIN: "songbird.up.railway.app",
      }),
    ).toEqual(["https://songbird.up.railway.app"]);
  });

  test("falls back to RENDER_EXTERNAL_URL", () => {
    expect(
      resolveAppOrigins({
        RENDER_EXTERNAL_URL: "https://songbird.onrender.com",
      }),
    ).toEqual(["https://songbird.onrender.com"]);
  });

  test("returns empty array when nothing is known", () => {
    expect(resolveAppOrigins({})).toEqual([]);
  });
});

describe("ruleCoversOrigins", () => {
  test("true when a rule allows the origins with PUT", () => {
    expect(
      ruleCoversOrigins(
        [
          {
            AllowedOrigins: ["https://app.example.com"],
            AllowedMethods: ["GET", "PUT", "HEAD"],
          },
        ],
        ["https://app.example.com"],
      ),
    ).toBe(true);
  });

  test("false when PUT is missing", () => {
    expect(
      ruleCoversOrigins(
        [
          {
            AllowedOrigins: ["https://app.example.com"],
            AllowedMethods: ["GET"],
          },
        ],
        ["https://app.example.com"],
      ),
    ).toBe(false);
  });

  test("false when origin is missing", () => {
    expect(ruleCoversOrigins([], ["https://app.example.com"])).toBe(false);
  });
});

function mockProvider(initialRules) {
  let rules = [...initialRules];
  return {
    getCorsRules: vi.fn(async () => rules),
    setCorsRules: vi.fn(async (next) => {
      rules = [...next];
      return true;
    }),
  };
}

describe("deriveRequestOrigin", () => {
  test("prefers the Origin header", () => {
    expect(
      deriveRequestOrigin({
        headers: {
          origin: "https://app.example.com",
          host: "other.example.com",
        },
      }),
    ).toBe("https://app.example.com");
  });

  test("falls back to x-forwarded-host then host", () => {
    expect(
      deriveRequestOrigin({
        headers: { "x-forwarded-host": "app.example.com" },
      }),
    ).toBe("https://app.example.com");
    expect(deriveRequestOrigin({ headers: { host: "app.example.com" } })).toBe(
      "https://app.example.com",
    );
  });

  test("returns empty string without headers", () => {
    expect(deriveRequestOrigin({})).toBe("");
    expect(deriveRequestOrigin(null)).toBe("");
  });
});

describe("ensureBucketCorsForRequest", () => {
  beforeEach(() => {
    clearBucketCorsRequestCache();
  });

  test("applies CORS for the request origin and caches the result", async () => {
    const provider = mockProvider([]);
    const req = { headers: { origin: "https://new.example.com" } };
    const first = await ensureBucketCorsForRequest(provider, req, { now: 0 });
    expect(first.status).toBe("applied");
    const second = await ensureBucketCorsForRequest(provider, req, {
      now: 1000,
    });
    expect(second.status).toBe("applied");
    // Initial check + one propagation-verification read; second call served
    // from cache.
    expect(provider.getCorsRules).toHaveBeenCalledTimes(2);
  });

  test("re-checks after the cache TTL expires", async () => {
    const provider = mockProvider([]);
    const req = { headers: { origin: "https://new.example.com" } };
    await ensureBucketCorsForRequest(provider, req, { now: 0 });
    await ensureBucketCorsForRequest(provider, req, {
      now: 11 * 60 * 1000,
    });
    // First ensure: initial check + verification read. Expired re-check finds
    // the rule covered with a single read.
    expect(provider.getCorsRules).toHaveBeenCalledTimes(3);
  });

  test("skips when no origin can be derived", async () => {
    const provider = mockProvider([]);
    const result = await ensureBucketCorsForRequest(provider, {}, { now: 0 });
    expect(result.status).toBe("skipped");
    expect(provider.getCorsRules).not.toHaveBeenCalled();
  });
});

describe("ensureBucketCors", () => {
  test("skips without calling S3 when no origins are known", async () => {
    const provider = mockProvider([]);
    const result = await ensureBucketCors(provider, []);
    expect(result.status).toBe("skipped");
    expect(provider.getCorsRules).not.toHaveBeenCalled();
    expect(provider.setCorsRules).not.toHaveBeenCalled();
  });

  test("applies a rule when the bucket has no CORS policy", async () => {
    const provider = mockProvider([]);
    const result = await ensureBucketCors(provider, [
      "https://app.example.com",
    ]);
    expect(result.status).toBe("applied");
    expect(provider.setCorsRules).toHaveBeenCalledOnce();
    const rules = provider.setCorsRules.mock.calls[0][0];
    expect(rules).toHaveLength(1);
    expect(rules[0].AllowedOrigins).toEqual(["https://app.example.com"]);
    expect(rules[0].AllowedMethods).toContain("PUT");
  });

  test("does nothing when the existing policy already covers the origins", async () => {
    const provider = mockProvider([
      {
        AllowedOrigins: ["https://app.example.com"],
        AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
      },
    ]);
    const result = await ensureBucketCors(provider, [
      "https://app.example.com",
    ]);
    expect(result.status).toBe("ok");
    expect(provider.setCorsRules).not.toHaveBeenCalled();
  });

  test("merges without clobbering unrelated existing rules", async () => {
    const existing = {
      AllowedOrigins: ["https://other.example.com"],
      AllowedMethods: ["GET"],
    };
    const provider = mockProvider([existing]);
    const result = await ensureBucketCors(provider, [
      "https://app.example.com",
    ]);
    expect(result.status).toBe("applied");
    const rules = provider.setCorsRules.mock.calls[0][0];
    expect(rules[0]).toEqual(existing);
    expect(rules).toHaveLength(2);
  });

  test("waits for the applied rule to become visible before returning", async () => {
    const covering = {
      AllowedOrigins: ["https://app.example.com"],
      AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
    };
    let calls = 0;
    const provider = {
      getCorsRules: vi.fn(async () => {
        calls += 1;
        return calls < 3 ? [] : [covering];
      }),
      setCorsRules: vi.fn(async () => true),
    };
    const sleep = vi.fn(async () => {});
    const result = await ensureBucketCors(
      provider,
      ["https://app.example.com"],
      { sleep, propagationIntervalMs: 5 },
    );
    expect(result.status).toBe("applied");
    expect(provider.setCorsRules).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalled();
    expect(provider.getCorsRules.mock.calls.length).toBeGreaterThan(1);
  });

  test("returns applied_unverified when propagation never becomes visible", async () => {
    // Reads never reflect the write here (stale store), unlike mockProvider.
    const provider = {
      getCorsRules: vi.fn(async () => []),
      setCorsRules: vi.fn(async () => true),
    };
    const sleep = vi.fn(async () => {});
    const result = await ensureBucketCors(
      provider,
      ["https://app.example.com"],
      { sleep, propagationAttempts: 2, propagationIntervalMs: 5 },
    );
    expect(result.status).toBe("applied_unverified");
  });

  test("never throws when S3 rejects (e.g. missing PutBucketCORS permission)", async () => {
    const provider = {
      getCorsRules: vi.fn(async () => {
        throw Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
        });
      }),
      setCorsRules: vi.fn(),
    };
    const result = await ensureBucketCors(provider, [
      "https://app.example.com",
    ]);
    expect(result.status).toBe("error");
    expect(result.error).toMatch(/Access Denied/);
  });
});

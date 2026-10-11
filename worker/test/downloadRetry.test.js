import { describe, it, expect, vi } from "vitest";
import { isMissingKeyError, downloadWithRetry } from "../index.js";

const noSuchKey = () =>
  Object.assign(new Error("NoSuchKey: The specified key does not exist."), {
    name: "NoSuchKey",
    Code: "NoSuchKey",
    $metadata: { httpStatusCode: 404 },
  });

describe("isMissingKeyError", () => {
  it("detects S3 missing-key errors", () => {
    expect(isMissingKeyError(noSuchKey())).toBe(true);
    expect(isMissingKeyError({ code: "NotFound" })).toBe(true);
    expect(isMissingKeyError({ $metadata: { httpStatusCode: 404 } })).toBe(
      true,
    );
  });

  it("rejects unrelated errors", () => {
    expect(isMissingKeyError(new Error("Access Denied"))).toBe(false);
    expect(isMissingKeyError({ code: "Forbidden" })).toBe(false);
    expect(isMissingKeyError(null)).toBe(false);
  });
});

describe("downloadWithRetry", () => {
  it("succeeds on the first attempt without sleeping", async () => {
    const sleep = vi.fn(async () => {});
    const downloadFn = vi.fn(async () => {});
    await downloadWithRetry(downloadFn, { sleep });
    expect(downloadFn).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries missing-key errors until the object appears", async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    await downloadWithRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw noSuchKey();
      },
      { sleep, baseDelayMs: 10, maxDelayMs: 50 },
    );
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("fails fast on non-missing-key errors", async () => {
    const sleep = vi.fn(async () => {});
    const downloadFn = vi.fn(async () => {
      throw new Error("Access Denied");
    });
    await expect(downloadWithRetry(downloadFn, { sleep })).rejects.toThrow(
      "Access Denied",
    );
    expect(downloadFn).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after exhausting attempts", async () => {
    const sleep = vi.fn(async () => {});
    const downloadFn = vi.fn(async () => {
      throw noSuchKey();
    });
    await expect(
      downloadWithRetry(downloadFn, { sleep, attempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow("NoSuchKey");
    expect(downloadFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});

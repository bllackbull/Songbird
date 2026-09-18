import { describe, test, expect, vi } from "vitest";
import { createMirrorJobRegistry } from "../../lib/remoteMirrorJobs.js";
import { dispatchMirrorJob } from "../../lib/remoteMirrorDispatch.js";

function makeRegistry() {
  return createMirrorJobRegistry({ ttlMs: 60_000 });
}

const baseJob = {
  filePath: "/tmp/x.bin",
  storedName: "x.bin",
  mimeType: "image/jpeg",
};

describe("dispatchMirrorJob", () => {
  test("declines without a storage key or registry", async () => {
    expect(await dispatchMirrorJob({})).toEqual({ dispatched: false });
    expect(
      await dispatchMirrorJob({ storageKey: "k", registry: makeRegistry() }),
    ).toBeDefined();
  });

  test("dispatches to the loopback worker in auto mode", async () => {
    const registry = makeRegistry();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 202 }));
    const res = await dispatchMirrorJob({
      storageProcessingMode: "auto",
      workerUrl: null,
      serverPort: "5174",
      webhookSecret: "shh",
      fetchImpl,
      registry,
      storageKey: "uploads/messages/x.bin",
      jobMeta: baseJob,
      onFallback: async () => {},
    });
    expect(res.dispatched).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8080/mirror-media");
    const body = JSON.parse(opts.body);
    expect(body.storageKey).toBe("uploads/messages/x.bin");
    expect(body.downloadUrl).toContain("/api/remote-channel/blob/");
    expect(body.callbackUrl).toContain(
      "/api/remote-channel/webhook/mirror-done",
    );
    expect(opts.headers["x-songbird-webhook-secret"]).toBe("shh");
    registry.sweep();
  });

  test("worker rejection removes the job and declines", async () => {
    const registry = makeRegistry();
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 }));
    const res = await dispatchMirrorJob({
      storageProcessingMode: "auto",
      workerUrl: null,
      fetchImpl,
      registry,
      storageKey: "uploads/messages/x.bin",
      jobMeta: baseJob,
    });
    expect(res).toEqual({ dispatched: false });
  });

  test("remote worker without a public server URL declines", async () => {
    const registry = makeRegistry();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 202 }));
    const res = await dispatchMirrorJob({
      storageProcessingMode: "remote",
      workerUrl: "https://worker.example.com",
      webhookBaseUrl: null,
      fetchImpl,
      registry,
      storageKey: "uploads/messages/x.bin",
      jobMeta: baseJob,
    });
    expect(res).toEqual({ dispatched: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("remote worker with WEBHOOK_URL dispatches without a fallback", async () => {
    const registry = makeRegistry();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 202 }));
    const res = await dispatchMirrorJob({
      storageProcessingMode: "remote",
      workerUrl: "https://worker.example.com",
      webhookBaseUrl: "https://app.example.com",
      fetchImpl,
      registry,
      storageKey: "uploads/messages/x.bin",
      jobMeta: baseJob,
      onFallback: async () => {
        throw new Error("must not run in remote mode");
      },
    });
    expect(res.dispatched).toBe(true);
    const [, opts] = fetchImpl.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.downloadUrl.startsWith("https://app.example.com")).toBe(true);
  });

  test("a full WEBHOOK_URL callback path is reduced to the server origin", async () => {
    const registry = makeRegistry();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 202 }));
    const res = await dispatchMirrorJob({
      storageProcessingMode: "remote",
      workerUrl: "https://worker.example.com",
      // Production WEBHOOK_URL is the uploads-callback URL; the mirror flow
      // must not append its own paths to it (worker got 404s on blob +
      // mirror-done and every photo fell back to the 120s inline timer).
      webhookBaseUrl:
        "https://app.example.com/api/uploads/webhook/processed",
      fetchImpl,
      registry,
      storageKey: "uploads/messages/x.bin",
      jobMeta: baseJob,
    });
    expect(res.dispatched).toBe(true);
    const [, opts] = fetchImpl.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.callbackUrl).toBe(
      "https://app.example.com/api/remote-channel/webhook/mirror-done",
    );
    expect(body.downloadUrl).toContain(
      "https://app.example.com/api/remote-channel/blob/",
    );
    expect(body.downloadUrl).not.toContain("/api/uploads/webhook/processed");
  });

  test("local mode always targets loopback", async () => {
    const registry = makeRegistry();
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 202 }));
    const res = await dispatchMirrorJob({
      storageProcessingMode: "local",
      workerUrl: "https://worker.example.com",
      fetchImpl,
      registry,
      storageKey: "uploads/messages/x.bin",
      jobMeta: baseJob,
    });
    expect(res.dispatched).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "http://127.0.0.1:8080/mirror-media",
    );
  });
});

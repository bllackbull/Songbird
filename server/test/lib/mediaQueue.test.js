import { describe, test, expect, vi } from "vitest";

const seen = { queues: [], workers: [] };

vi.mock("bullmq", () => ({
  Queue: vi.fn(function (name, opts) {
    seen.queues.push(opts?.connection);
    return { close: async () => {} };
  }),
  Worker: vi.fn(function (name, fn, opts) {
    seen.workers.push(opts?.connection);
    return { close: async () => {} };
  }),
}));

import { createMediaQueueManager } from "../../lib/mediaQueue.js";

function fakeUrlParsedClient() {
  // Simulates ioredis client built from redis://default:secret@host:6379
  return {
    options: {
      host: "redis.railway.internal",
      port: 6379,
      username: "default",
      password: "secret",
      db: 0,
    },
    duplicate() {
      return fakeUrlParsedClient();
    },
  };
}

describe("media queue redis auth", () => {
  test("forwards username/password to BullMQ connections", async () => {
    seen.queues.length = 0;
    seen.workers.length = 0;
    const mgr = createMediaQueueManager({ redisClient: fakeUrlParsedClient() });
    expect(seen.queues).toHaveLength(1);
    expect(seen.workers).toHaveLength(1);
    expect(seen.queues[0]).toMatchObject({
      username: "default",
      password: "secret",
    });
    expect(seen.workers[0]).toMatchObject({
      username: "default",
      password: "secret",
    });
    await mgr.close();
  });
});

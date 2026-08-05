import { Queue, Worker } from "bullmq";

export function createMediaQueueManager({
  redisClient,
  storageProvider,
  s3ProcessingMode = "auto",
  s3ProcessingTimeoutMs = 30000,
  adminGetRow,
  adminRun,
  emitChatEvent,
}) {
  const isRealRedis =
    redisClient &&
    typeof redisClient.duplicate === "function" &&
    redisClient.constructor.name !== "InProcessRedisClient";

  let bullQueue = null;
  let bullWorker = null;
  const inMemoryQueue = [];
  const activeTimers = new Map();

  async function processMediaJob(jobData) {
    const { fileId, storageKey, reason } = jobData;
    if (!fileId) return;

    // Check DB status to see if remote provider already processed it
    const row = adminGetRow
      ? adminGetRow("SELECT * FROM message_files WHERE id = ?", [fileId])
      : null;

    if (!row) return;
    if (row.processing_status === "ready") return; // Already processed by remote compute

    try {
      // Execute local fallback processing
      // Update DB status to ready
      if (adminRun) {
        adminRun(
          "UPDATE message_files SET processing_status = 'ready' WHERE id = ?",
          [fileId],
        );
      }

      // Broadcast SSE notification
      if (typeof emitChatEvent === "function") {
        emitChatEvent("songbird:realtime-event", {
          type: "video:ready",
          fileId,
          storageKey: row.storage_key || storageKey,
        });
      }
    } catch (err) {
      if (adminRun) {
        adminRun(
          "UPDATE message_files SET processing_status = 'failed' WHERE id = ?",
          [fileId],
        );
      }
    }
  }

  if (isRealRedis) {
    try {
      const connection = redisClient.options
        ? { host: redisClient.options.host, port: redisClient.options.port }
        : { host: "127.0.0.1", port: 6379 };

      bullQueue = new Queue("media-processing", { connection });
      bullWorker = new Worker(
        "media-processing",
        async (job) => {
          await processMediaJob(job.data);
        },
        { connection },
      );
    } catch (e) {
      bullQueue = null;
      bullWorker = null;
    }
  }

  function enqueueJob(data, delayMs = 0) {
    if (bullQueue) {
      bullQueue.add("process-media", data, { delay: delayMs });
    } else {
      if (delayMs > 0) {
        const timer = setTimeout(() => {
          activeTimers.delete(data.fileId);
          processMediaJob(data);
        }, delayMs);
        if (typeof timer.unref === "function") timer.unref();
        activeTimers.set(data.fileId, timer);
      } else {
        inMemoryQueue.push(data);
        setImmediate(() => processMediaJob(data));
      }
    }
  }

  function scheduleFallbackCheck({ fileId, storageKey }) {
    if (s3ProcessingMode === "remote") return; // Pure remote, no local fallback timer

    enqueueJob(
      { fileId, storageKey, reason: "fallback_timer" },
      s3ProcessingTimeoutMs,
    );
  }

  function cancelFallbackCheck(fileId) {
    if (activeTimers.has(fileId)) {
      clearTimeout(activeTimers.get(fileId));
      activeTimers.delete(fileId);
    }
  }

  async function close() {
    for (const timer of activeTimers.values()) {
      clearTimeout(timer);
    }
    activeTimers.clear();

    if (bullWorker) await bullWorker.close();
    if (bullQueue) await bullQueue.close();
  }

  return {
    enqueueJob,
    scheduleFallbackCheck,
    cancelFallbackCheck,
    processMediaJob,
    close,
  };
}

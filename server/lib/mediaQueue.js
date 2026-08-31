import { Queue, Worker } from "bullmq";
import { dbKnex } from "../db/knex.js";
import { readEnvBool } from "../settings/env.js";

export function createMediaQueueManager({
  redisClient,
  storageProvider,
  s3ProcessingMode = "auto",
  s3ProcessingTimeoutMs = 30000,
  adminGetRow,
  adminRun,
  emitChatEvent,
  enqueueVideoTranscodeJob,
  transcodeVideosToH264,
  getSetting,
}) {
  const isRealRedis =
    redisClient &&
    typeof redisClient.duplicate === "function" &&
    redisClient.constructor.name !== "InProcessRedisClient";

  let bullQueue = null;
  let bullWorker = null;
  const inMemoryQueue = [];
  const activeTimers = new Map();

  function toSql(builder) {
    if (builder && typeof builder.toSQL === "function") {
      const c = builder.toSQL();
      return { sql: c.sql, params: c.bindings || [] };
    }
    return { sql: builder, params: [] };
  }

  async function processMediaJob(jobData) {
    const { fileId, storageKey, reason } = jobData;
    if (!fileId) return;

    // Check DB status to see if remote provider already processed it
    const { sql: checkSql, params: checkParams } = toSql(
      dbKnex("chat_message_files").where("id", fileId).first(),
    );
    const row = adminGetRow ? adminGetRow(checkSql, checkParams) : null;

    if (!row) return;
    if (row.processing_status === "ready") return; // Already processed by remote compute

    try {
      // Execute local fallback processing
      const isVideo = String(row.mime_type || "").toLowerCase().startsWith("video/");
      const isTranscodeEnabled = () => {
        if (typeof transcodeVideosToH264 === "boolean") return transcodeVideosToH264;
        if (typeof getSetting === "function") {
          const val = getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS");
          if (val !== undefined && val !== null) return Boolean(val);
        }
        return readEnvBool("FILE_UPLOAD_TRANSCODE_VIDEOS", true);
      };

      if (isVideo && isTranscodeEnabled() && typeof enqueueVideoTranscodeJob === "function") {
        enqueueVideoTranscodeJob({
          fileId,
          storedName: row.stored_name,
          storageKey: row.storage_key || storageKey,
          storageDriver: row.storage_driver,
          messageId: row.message_id,
        });
      } else {
        // Update DB status to ready
        if (adminRun) {
          const { sql: updateSql, params: updateParams } = toSql(
            dbKnex("chat_message_files").where("id", fileId).update({ processing_status: "ready" }),
          );
          adminRun(updateSql, updateParams);
        }

        // Broadcast SSE notification
        if (typeof emitChatEvent === "function") {
          emitChatEvent("songbird:realtime-event", {
            type: "video:ready",
            fileId,
            storageKey: row.storage_key || storageKey,
          });
        }
      }
    } catch (err) {
      if (adminRun) {
        const { sql: failSql, params: failParams } = toSql(
          dbKnex("chat_message_files").where("id", fileId).update({ processing_status: "failed" }),
        );
        adminRun(failSql, failParams);
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

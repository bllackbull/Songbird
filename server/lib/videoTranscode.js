import { dbKnex } from "../db/knex.js";
import { dispatchMediaWorkerJob } from "./mediaWorker.js";
import { resolveWebhookCallbackUrl } from "./webhookUrl.js";
import { readEnvBool } from "../settings/env.js";

export function createVideoTranscodeManager({
  spawn,
  fs,
  path,
  crypto,
  adminRun,
  adminGetRow,
  adminSave,
  listMessageFilesByMessageIds,
  emitChatEvent,
  debugLog = () => {},
  uploadRootDir,
  transcodeVideosToH264,
  getSetting,
  storageEncryption,
  storageProvider,
  storageProcessingMode,
  storageProcessingTimeoutMs,
  workerUrl,
  mediaWorkerUrl,
  webhookSecret,
  callbackUrl,
  fetchImpl = globalThis.fetch,
}) {
  const TRANSCODED_VIDEO_NAME_TAG = "-h264-";

  const sanitizePositiveInt = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n <= 0) return null;
    return Math.round(n);
  };

  const sanitizeDurationSeconds = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return null;
    return Math.round(n * 1000) / 1000;
  };

  const runFfprobe = (args = []) =>
    new Promise((resolve, reject) => {
      if (typeof spawn !== "function") {
        return reject(new Error("spawn is not a function"));
      }
      const child = spawn("ffprobe", args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk || "");
      });

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
        if (stderr.length > 16000) {
          stderr = stderr.slice(-16000);
        }
      });

      child.on("error", (error) => reject(error));

      child.on("close", (code) => {
        if (code === 0) return resolve(stdout);
        const details = stderr.trim();
        reject(
          new Error(
            details
              ? `ffprobe failed: ${details}`
              : `ffprobe failed with exit code ${String(code)}`,
          ),
        );
      });
    });

  const probeVideoMetadata = async (filePath) => {
    try {
      const output = await runFfprobe([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,duration:stream_tags=rotate:stream_side_data=rotation:format=duration",
        "-of",
        "json",
        filePath,
      ]);

      const parsed = JSON.parse(String(output || "{}"));
      const stream = Array.isArray(parsed?.streams)
        ? parsed.streams[0] || {}
        : {};
      const format = parsed?.format || {};
      const rawWidth = sanitizePositiveInt(stream?.width);
      const rawHeight = sanitizePositiveInt(stream?.height);
      const tagRotate = Number(stream?.tags?.rotate);
      const sideDataRotate = Array.isArray(stream?.side_data_list)
        ? Number(
            stream.side_data_list.find((item) =>
              Number.isFinite(Number(item?.rotation)),
            )?.rotation,
          )
        : NaN;
      const rotation = Number.isFinite(sideDataRotate)
        ? sideDataRotate
        : Number.isFinite(tagRotate)
          ? tagRotate
          : 0;
      const normalizedRotation = Math.abs(Math.round(rotation)) % 360;
      const shouldSwapAxes =
        normalizedRotation === 90 || normalizedRotation === 270;
      const widthPx = shouldSwapAxes ? rawHeight : rawWidth;
      const heightPx = shouldSwapAxes ? rawWidth : rawHeight;
      const durationSeconds = sanitizeDurationSeconds(
        stream?.duration ?? format?.duration,
      );

      return { widthPx, heightPx, durationSeconds };
    } catch (_) {
      return { widthPx: null, heightPx: null, durationSeconds: null };
    }
  };

  const ensureFfmpegAvailable = async () => {
    return true;
  };

  const summarizeMessageFiles = (rows = []) => {
    if (!Array.isArray(rows) || rows.length === 0) return "";
    let videoCount = 0;
    let imageCount = 0;
    let audioCount = 0;
    let docCount = 0;

    rows.forEach((row) => {
      const mime = String(row?.mime_type || "").toLowerCase();
      if (mime.startsWith("video/")) videoCount += 1;
      else if (mime.startsWith("image/")) imageCount += 1;
      else if (mime.startsWith("audio/")) audioCount += 1;
      else docCount += 1;
    });

    if (rows.length === 1) {
      if (videoCount === 1) return "Sent a video";
      if (imageCount === 1) return "Sent a photo";
      if (audioCount === 1) return "Sent a voice message";
      return "Sent a document";
    }
    if (
      audioCount > 0 &&
      videoCount === 0 &&
      imageCount === 0 &&
      docCount === 0
    ) {
      return `Sent ${audioCount} voice message${audioCount > 1 ? "s" : ""}`;
    }
    if (videoCount > 0 && imageCount === 0 && docCount === 0) {
      return `Sent ${videoCount} video${videoCount > 1 ? "s" : ""}`;
    }
    if (imageCount > 0 && videoCount === 0 && docCount === 0) {
      return `Sent ${imageCount} photo${imageCount > 1 ? "s" : ""}`;
    }
    if (docCount > 0 && imageCount === 0 && videoCount === 0) {
      return `Sent ${docCount} document${docCount > 1 ? "s" : ""}`;
    }
    return `Sent ${rows.length} files`;
  };

  const enqueueVideoTranscodeJob = async (job) => {
    const fileId = job?.fileId;
    if (!fileId) return false;

    const isTranscodeEnabled = () => {
      if (typeof job?.transcodeVideosToH264 === "boolean") return job.transcodeVideosToH264;
      if (typeof job?.transcodeVideos === "boolean") return job.transcodeVideos;
      if (typeof job?.transcodeEnabled === "boolean") return job.transcodeEnabled;
      if (typeof transcodeVideosToH264 === "boolean") return transcodeVideosToH264;
      if (typeof getSetting === "function") {
        const val = getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS");
        if (val !== undefined && val !== null) return Boolean(val);
      }
      return readEnvBool("FILE_UPLOAD_TRANSCODE_VIDEOS", true);
    };

    if (!isTranscodeEnabled()) {
      return false;
    }

    const currentMode = String(
      job?.storageProcessingMode ||
      storageProcessingMode ||
      process.env.STORAGE_PROCESSING_MODE ||
      "auto",
    ).toLowerCase();

    const workerUrl =
      job?.workerUrl !== undefined
        ? job?.workerUrl
        : job?.mediaWorkerUrl !== undefined
        ? job?.mediaWorkerUrl
        : mediaWorkerUrl !== undefined
        ? mediaWorkerUrl
        : process.env.WORKER_URL || process.env.MEDIA_WORKER_URL || null;

    const secret =
      webhookSecret !== undefined
        ? webhookSecret
        : process.env.WEBHOOK_SECRET || null;
    const cbUrl = callbackUrl || resolveWebhookCallbackUrl();

    let fileRow = null;
    if (typeof adminGetRow === "function") {
      fileRow = adminGetRow(
        dbKnex("chat_message_files").where("id", fileId).first(),
      );
    }

    const storageKey =
      job?.storageKey ||
      fileRow?.storage_key ||
      fileRow?.stored_name ||
      job?.storedName;
    const storedName =
      job?.storedName ||
      fileRow?.stored_name ||
      fileRow?.storage_key ||
      job?.storageKey;
    const mimeType = job?.mimeType || fileRow?.mime_type || "video/mp4";
    const encryptionType =
      job?.encryptionType ||
      fileRow?.encryption_type ||
      (storageEncryption &&
      typeof storageEncryption.hasKey === "function" &&
      storageEncryption.hasKey()
        ? "local"
        : "none");

    if (typeof adminRun === "function") {
      adminRun(
        dbKnex("chat_message_files")
          .where("id", fileId)
          .update({ processing_status: "pending" }),
      );
      if (typeof adminSave === "function") adminSave();
    }

    return dispatchMediaWorkerJob({
      workerUrl,
      mediaWorkerUrl: workerUrl,
      storageProcessingMode: currentMode,
      storageProcessingTimeoutMs:
        job?.storageProcessingTimeoutMs ||
        storageProcessingTimeoutMs ||
        (process.env.STORAGE_PROCESSING_TIMEOUT_MS ? Number(process.env.STORAGE_PROCESSING_TIMEOUT_MS) : undefined),
      retryDelayMs: job?.retryDelayMs,
      workerPort: job?.workerPort || process.env.WORKER_PORT || "8080",
      webhookSecret: secret,
      callbackUrl: cbUrl,
      fileId,
      storageKey,
      storedName,
      mimeType,
      encryptionType,
      fetchImpl: job?.fetchImpl || fetchImpl,
    });
  };

  const isVideoFileProcessing = (row) => {
    if (!transcodeVideosToH264) return false;

    const mimeType = String(row?.mime_type || row?.mimeType || "").toLowerCase();
    if (!mimeType.startsWith("video/")) return false;

    const status = row?.processing_status || row?.processingStatus;
    if (status === "ready") return false;
    if (status === "failed") return false;
    if (status === "pending") return true;

    const storageKey = String(
      row?.storage_key || row?.storageKey || "",
    ).toLowerCase();
    if (storageKey.includes(TRANSCODED_VIDEO_NAME_TAG)) return false;

    const storedName = String(
      row?.stored_name || row?.storedName || "",
    ).toLowerCase();
    if (storedName.includes(TRANSCODED_VIDEO_NAME_TAG)) return false;

    return true;
  };

  const hydrateMissingVideoMetadata = async (rows = []) => {
    if (!Array.isArray(rows) || !rows.length) return rows;

    const startedAt = Date.now();
    let updated = false;
    let probedCount = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const mime = String(row?.mime_type || "").toLowerCase();
      if (!mime.startsWith("video/")) {
        continue;
      }

      const storedName = row?.stored_name ? String(row.stored_name).trim() : "";
      if (!storedName) {
        continue;
      }

      const hasWidth = sanitizePositiveInt(row?.width_px) !== null;
      const hasHeight = sanitizePositiveInt(row?.height_px) !== null;
      const hasDuration =
        sanitizeDurationSeconds(row?.duration_seconds) !== null;

      if (hasWidth && hasHeight && hasDuration) {
        continue;
      }

      const targetPath =
        uploadRootDir && path ? path.join(uploadRootDir, storedName) : null;
      if (!targetPath || (fs && !fs.existsSync(targetPath))) {
        continue;
      }

      let decryptedTarget = null;
      try {
        if (
          storageEncryption &&
          typeof storageEncryption.decryptFileToTempPath === "function"
        ) {
          decryptedTarget = storageEncryption.decryptFileToTempPath(
            targetPath,
            storedName,
          );
        }
      } catch (_) {
        decryptedTarget = null;
      }

      const probePath = decryptedTarget?.path || targetPath;
      let metadata = {
        widthPx: null,
        heightPx: null,
        durationSeconds: null,
      };
      try {
        // eslint-disable-next-line no-await-in-loop
        metadata = await probeVideoMetadata(probePath);
        probedCount += 1;
      } finally {
        if (
          decryptedTarget &&
          typeof decryptedTarget.cleanup === "function"
        ) {
          decryptedTarget.cleanup();
        }
      }

      const nextWidth = hasWidth ? row.width_px : metadata.widthPx;
      const nextHeight = hasHeight ? row.height_px : metadata.heightPx;
      const nextDuration = hasDuration
        ? row.duration_seconds
        : metadata.durationSeconds;

      const widthChanged =
        sanitizePositiveInt(nextWidth) !== sanitizePositiveInt(row?.width_px);
      const heightChanged =
        sanitizePositiveInt(nextHeight) !== sanitizePositiveInt(row?.height_px);
      const durationChanged =
        sanitizeDurationSeconds(nextDuration) !==
        sanitizeDurationSeconds(row?.duration_seconds);

      if (widthChanged || heightChanged || durationChanged) {
        row.width_px = nextWidth;
        row.height_px = nextHeight;
        row.duration_seconds = nextDuration;
        updated = true;

        if (typeof adminRun === "function") {
          adminRun(
            dbKnex("chat_message_files").where("id", row.id).update({
              width_px: nextWidth,
              height_px: nextHeight,
              duration_seconds: nextDuration,
            }),
          );
        }
      }
    }

    if (updated && typeof adminSave === "function") {
      adminSave();
    }

    if (probedCount > 0) {
      debugLog("video-metadata:hydrate", {
        rows: rows.length,
        probed: probedCount,
        updated,
        elapsedMs: Date.now() - startedAt,
      });
    }

    return rows;
  };

  return {
    enqueueVideoTranscodeJob,
    ensureFfmpegAvailable,
    probeVideoMetadata,
    isVideoFileProcessing,
    hydrateMissingVideoMetadata,
    summarizeMessageFiles,
    sanitizePositiveInt,
    sanitizeDurationSeconds,
  };
}

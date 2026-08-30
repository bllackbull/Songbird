import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createStorage } from "./storage.js";
import { decryptFileToTempPath, encryptBuffer } from "./encryption.js";
import {
  transcodeVideo,
  probeVideoMetadata,
  probeVideoDetails,
  faststartVideo,
  generateThumbnail,
} from "./ffmpeg.js";

const workerDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(workerDir, "..");

if (typeof process.loadEnvFile === "function") {
  try { process.loadEnvFile(path.join(projectRootDir, ".env")); } catch {}
  try { process.loadEnvFile(path.join(workerDir, ".env")); } catch {}
}

const PORT = Number(process.env.WORKER_PORT || 8080);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const DEFAULT_CALLBACK_URL =
  process.env.WEBHOOK_URL ||
  process.env.SONGBIRD_WEBHOOK_URL ||
  process.env.WEBHOOK_CALLBACK_URL ||
  `http://127.0.0.1:${process.env.SERVER_PORT || "5174"}/api/uploads/webhook/processed`;
const WORKER_CONCURRENCY = Math.max(
  1,
  parseInt(
    process.env.WORKER_CONCURRENCY || process.env.CONCURRENCY || "2",
    10,
  ),
);

const storage = createStorage({
  driver: process.env.STORAGE_DRIVER || process.env.STORAGE_DRIVE,
  dataDir: process.env.DATA_DIR,
  endpoint: process.env.STORAGE_ENDPOINT,
  region: process.env.STORAGE_REGION,
  bucket: process.env.STORAGE_BUCKET,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE,
});

class AsyncQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  push(fn) {
    this.queue.push(fn);
    this._next();
  }

  _next() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      this.running += 1;
      task()
        .catch((err) => {
          console.error("[worker] Background job execution error:", err);
        })
        .finally(() => {
          this.running -= 1;
          this._next();
        });
    }
  }

  get size() {
    return this.queue.length;
  }

  get pending() {
    return this.running;
  }
}

const jobQueue = new AsyncQueue(WORKER_CONCURRENCY);

const tmpDir = path.join(os.tmpdir(), "songbird-media-worker");
fs.mkdirSync(tmpDir, { recursive: true });

const tempPath = (suffix = "") =>
  path.join(
    tmpDir,
    `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${suffix}`,
  );

async function notifyCallback(url, payload, secret, maxRetries = 5) {
  if (!url) {
    console.warn(
      `[worker] Callback notification skipped for file ${payload?.fileId}: no callbackUrl provided or configured.`,
    );
    return;
  }
  const effectiveSecret = secret || WEBHOOK_SECRET || "";
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(effectiveSecret
            ? { "x-songbird-webhook-secret": effectiveSecret }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log(
          `[worker] Callback webhook delivered successfully to ${url} for file ${payload.fileId}`,
        );
        return;
      }
      const errText = await res.text();
      console.warn(
        `[worker] Callback webhook to ${url} returned HTTP ${res.status} (attempt ${attempt}/${maxRetries}): ${errText}`,
      );
    } catch (err) {
      console.error(
        `[worker] Failed to notify callback ${url} for file ${payload.fileId} (attempt ${attempt}/${maxRetries}):`,
        err?.message || err,
      );
    }
    if (attempt < maxRetries) {
      const delayMs = Math.min(16000, 1000 * Math.pow(2, attempt - 1));
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function processTranscodeJob({
  fileId,
  storageKey,
  storedName,
  encryptionType,
  callbackUrl,
  webhookSecret,
  storageConfig,
  downloadUrl,
  uploadUrl,
  thumbUploadUrl,
}) {
  const targetCallback = callbackUrl || DEFAULT_CALLBACK_URL;
  const isEncrypted =
    String(encryptionType || "").toLowerCase() === "local" ||
    String(encryptionType || "").toLowerCase() === "aes-256-gcm" ||
    String(encryptionType || "").toLowerCase() === "app";

  const ext = path.extname(storedName || storageKey || "video.mp4");
  const inputPath = tempPath(ext || ".mp4");
  const outputPath = tempPath(".mp4");
  const thumbPath = tempPath(".jpg");

  const effectiveStorage = storageConfig
    ? createStorage(storageConfig)
    : storage;

  console.log(
    `[worker] Starting transcode job for file ${fileId} (${storageKey})`,
  );

  try {
    if (downloadUrl) {
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        throw new Error(
          `Failed to download from downloadUrl: HTTP ${res.status}`,
        );
      }
      await pipeline(res.body, fs.createWriteStream(inputPath));
    } else {
      await effectiveStorage.downloadToPath(storageKey, inputPath);
    }

    let workingInputPath = inputPath;
    let decryptCleanup = () => {};
    if (isEncrypted) {
      const decrypted = decryptFileToTempPath(
        inputPath,
        storedName || "video.mp4",
      );
      workingInputPath = decrypted.path;
      decryptCleanup = decrypted.cleanup;
    }

    try {
      const details = await probeVideoDetails(workingInputPath);
      let meta = details;

      let finalOutputPath = workingInputPath;
      let usedTranscodedFile = false;

      if (details.needsTranscode) {
        console.log(
          `[worker] File ${fileId} requires transcoding (codec=${details.videoCodec}, pix_fmt=${details.pixFmt}, format=${details.formatName})`,
        );
        await transcodeVideo({ inputPath: workingInputPath, outputPath });
        meta = await probeVideoMetadata(outputPath);
        finalOutputPath = outputPath;
        usedTranscodedFile = true;
      } else {
        console.log(
          `[worker] File ${fileId} is already web-compatible H.264/AAC. Skipping re-encoding.`,
        );
        try {
          await faststartVideo({ inputPath: workingInputPath, outputPath });
          finalOutputPath = outputPath;
          usedTranscodedFile = true;
        } catch (faststartErr) {
          console.warn(
            `[worker] Faststart copy skipped for file ${fileId}:`,
            faststartErr?.message,
          );
          finalOutputPath = workingInputPath;
          usedTranscodedFile = false;
        }
      }

      let thumbStorageKey = null;
      try {
        await generateThumbnail({
          inputPath: workingInputPath,
          outputPath: thumbPath,
        });
        thumbStorageKey = `${storageKey.replace(/\.[^.]*$/, "")}-thumb.jpg`;
        if (thumbUploadUrl) {
          const res = await fetch(thumbUploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/jpeg" },
            body: fs.createReadStream(thumbPath),
            duplex: "half",
          });
          if (!res.ok) {
            throw new Error(`Failed to upload thumbnail: HTTP ${res.status}`);
          }
        } else {
          await effectiveStorage.uploadFile(
            thumbStorageKey,
            thumbPath,
            "image/jpeg",
          );
        }
      } catch (thumbErr) {
        console.warn(
          `[worker] Thumbnail generation skipped for file ${fileId}:`,
          thumbErr?.message,
        );
        thumbStorageKey = null;
      }

      let transcodedStorageKey = storageKey;
      if (usedTranscodedFile) {
        if (isEncrypted) {
          const rawOutput = fs.readFileSync(finalOutputPath);
          const encryptedOutput = encryptBuffer(rawOutput);
          fs.writeFileSync(finalOutputPath, encryptedOutput);
        }
        transcodedStorageKey = `${storageKey.replace(/(\.[^.]*)?$/, "")}-h264-${crypto
          .randomBytes(4)
          .toString("hex")}.mp4`;

        if (uploadUrl) {
          const res = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "video/mp4" },
            body: fs.createReadStream(finalOutputPath),
            duplex: "half",
          });
          if (!res.ok) {
            throw new Error(
              `Failed to upload transcoded video: HTTP ${res.status}`,
            );
          }
        } else {
          await effectiveStorage.uploadFile(
            transcodedStorageKey,
            finalOutputPath,
            "video/mp4",
          );
        }

        // Delete the original raw file from remote storage to avoid storing duplicate orphaned video files
        if (transcodedStorageKey !== storageKey && !uploadUrl) {
          await effectiveStorage.deleteFile(storageKey);
          console.log(
            `[worker] Deleted original raw video ${storageKey} from storage`,
          );
        }
      }

      console.log(`[worker] Process completed for file ${fileId}:`, {
        transcodedStorageKey,
        thumbStorageKey,
        meta,
        transcoded: details.needsTranscode,
      });

      await notifyCallback(targetCallback, {
        fileId,
        status: "ready",
        transcodedStorageKey,
        thumbStorageKey,
        width: Number(meta?.widthPx || meta?.width || 0) || null,
        height: Number(meta?.heightPx || meta?.height || 0) || null,
        duration: Number(meta?.durationSeconds || meta?.duration || 0) || null,
      }, webhookSecret);
    } finally {
      decryptCleanup();
    }
  } catch (err) {
    console.error(`[worker] Transcode failed for file ${fileId}:`, err);
    await notifyCallback(targetCallback, {
      fileId,
      status: "failed",
    }, webhookSecret);
  } finally {
    for (const p of [inputPath, outputPath, thumbPath]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk || "");
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function createWorkerServer(options = {}) {
  const effectiveWebhookSecret =
    options.webhookSecret !== undefined ? options.webhookSecret : WEBHOOK_SECRET;
  const effectiveQueue = options.jobQueue || jobQueue;
  const processJobFn = options.processTranscodeJob || processTranscodeJob;

  const appServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    // Health check
    if (
      req.method === "GET" &&
      (url.pathname === "/health" || url.pathname === "/")
    ) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          status: "ok",
          service: "songbird-media-worker",
          queue: {
            pending: effectiveQueue.pending,
            queued: effectiveQueue.size,
            concurrency: effectiveQueue.concurrency,
          },
        }),
      );
    }

    // Transcode dispatch endpoint
    if (req.method === "POST" && url.pathname === "/transcode") {
      const incomingSecret = req.headers["x-songbird-webhook-secret"];
      if (effectiveWebhookSecret) {
        if (incomingSecret !== effectiveWebhookSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Unauthorized" }));
        }
      }

      let payload;
      try {
        payload = await parseJsonBody(req);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid JSON body" }));
      }

      const {
        fileId,
        storageKey,
        storedName,
        encryptionType,
        callbackUrl,
        webhookSecret,
        storageConfig,
        downloadUrl,
        uploadUrl,
        thumbUploadUrl,
      } = payload;
      const effectiveStorageKey = storageKey || storedName;
      const effectiveStoredName = storedName || storageKey;
      if (!fileId || (!effectiveStorageKey && !downloadUrl)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error:
              "fileId and storageKey (or storedName/downloadUrl) are required",
          }),
        );
      }

      // Acknowledge receipt immediately (202 Accepted)
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          message: "Transcode job accepted",
          fileId,
          queuePosition: effectiveQueue.size,
        }),
      );

      // Process via async queue with concurrency limit
      effectiveQueue.push(() =>
        processJobFn({
          fileId,
          storageKey: effectiveStorageKey,
          storedName: effectiveStoredName,
          encryptionType,
          callbackUrl,
          webhookSecret: webhookSecret || incomingSecret || null,
          storageConfig,
          downloadUrl,
          uploadUrl,
          thumbUploadUrl,
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return appServer;
}

export const server = createWorkerServer();

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  server.listen(PORT, () => {
    console.log(
      `[songbird-worker] listening on port ${PORT} (storage: ${storage.type})`,
    );
  });

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      console.log(`[worker] ${sig} received, shutting down gracefully...`);
      server.close(() => process.exit(0));
    });
  }
}

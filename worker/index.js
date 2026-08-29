import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createStorage } from "./storage.js";
import { decryptFileToTempPath, encryptBuffer } from "./encryption.js";
import {
  transcodeVideo,
  probeVideoMetadata,
  probeVideoDetails,
  faststartVideo,
  generateThumbnail,
} from "./ffmpeg.js";

const PORT = Number(process.env.PORT || 8080);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const DEFAULT_CALLBACK_URL = process.env.SONGBIRD_WEBHOOK_URL || "";

const storage = createStorage({
  endpoint: process.env.STORAGE_ENDPOINT,
  region: process.env.STORAGE_REGION,
  bucket: process.env.STORAGE_BUCKET,
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE,
});

const tmpDir = path.join(os.tmpdir(), "songbird-media-worker");
fs.mkdirSync(tmpDir, { recursive: true });

const tempPath = (suffix = "") =>
  path.join(
    tmpDir,
    `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${suffix}`,
  );

async function notifyCallback(url, payload, maxRetries = 5) {
  if (!url) return;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(WEBHOOK_SECRET
            ? { "x-songbird-webhook-secret": WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log(
          `[worker] Callback webhook delivered successfully for file ${payload.fileId}`,
        );
        return;
      }
      const errText = await res.text();
      console.warn(
        `[worker] Callback webhook returned ${res.status} (attempt ${attempt}/${maxRetries}): ${errText}`,
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

  console.log(
    `[worker] Starting transcode job for file ${fileId} (${storageKey})`,
  );

  try {
    await storage.downloadToPath(storageKey, inputPath);

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
        await storage.uploadFile(thumbStorageKey, thumbPath, "image/jpeg");
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
        await storage.uploadFile(transcodedStorageKey, finalOutputPath, "video/mp4");
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
      });
    } finally {
      decryptCleanup();
    }
  } catch (err) {
    console.error(`[worker] Transcode failed for file ${fileId}:`, err);
    await notifyCallback(targetCallback, {
      fileId,
      status: "failed",
    });
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  // Health check
  if (
    req.method === "GET" &&
    (url.pathname === "/health" || url.pathname === "/")
  ) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({ status: "ok", service: "songbird-media-worker" }),
    );
  }

  // Transcode dispatch endpoint
  if (req.method === "POST" && url.pathname === "/transcode") {
    if (WEBHOOK_SECRET) {
      const incomingSecret = req.headers["x-songbird-webhook-secret"];
      if (incomingSecret !== WEBHOOK_SECRET) {
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

    const { fileId, storageKey, storedName, encryptionType, callbackUrl } =
      payload;
    if (!fileId || !storageKey) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "fileId and storageKey are required" }),
      );
    }

    // Acknowledge receipt immediately (202 Accepted)
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        message: "Transcode job accepted",
        fileId,
      }),
    );

    // Process in background asynchronously
    processTranscodeJob({
      fileId,
      storageKey,
      storedName,
      encryptionType,
      callbackUrl,
    }).catch((err) => {
      console.error(`[worker] Unhandled error processing file ${fileId}:`, err);
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`[songbird-media-worker] listening on port ${PORT}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[worker] ${sig} received, shutting down gracefully...`);
    server.close(() => process.exit(0));
  });
}

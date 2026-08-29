import { dbKnex } from "../db/knex.js";

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
  debugLog,
  uploadRootDir,
  transcodeVideosToH264,
  storageEncryption,
  storageProvider,
}) {
  const TRANSCODED_VIDEO_NAME_TAG = "-h264-";
  const videoTranscodeQueue = [];
  let videoTranscodeWorkerRunning = false;
  let ffmpegAvailabilityChecked = false;
  let ffmpegAvailable = false;

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

  const runFfmpeg = (args = []) =>
    new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stderr = "";

      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
        if (stderr.length > 16000) {
          stderr = stderr.slice(-16000);
        }
      });

      child.on("error", (error) => reject(error));

      child.on("close", (code) => {
        if (code === 0) return resolve();
        const details = stderr.trim();
        reject(
          new Error(
            details
              ? `ffmpeg failed: ${details}`
              : `ffmpeg failed with exit code ${String(code)}`,
          ),
        );
      });
    });

  const runFfprobe = (args = []) =>
    new Promise((resolve, reject) => {
      const child = spawn("ffprobe", args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk || "");
        if (stdout.length > 160000) {
          stdout = stdout.slice(-160000);
        }
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
    if (ffmpegAvailabilityChecked) {
      if (!ffmpegAvailable) {
        throw new Error("ffmpeg is not installed or not available in PATH.");
      }
      return;
    }

    ffmpegAvailabilityChecked = true;

    try {
      await runFfmpeg(["-version"]);
      ffmpegAvailable = true;
    } catch (_) {
      ffmpegAvailable = false;
      throw new Error("ffmpeg is not installed or not available in PATH.");
    }
  };

  const summarizeMessageFiles = (rows = []) => {
    if (!Array.isArray(rows) || rows.length === 0) return "";
    const videoCount = rows.filter((file) =>
      String(file?.mime_type || "")
        .toLowerCase()
        .startsWith("video/"),
    ).length;
    const imageCount = rows.filter((file) =>
      String(file?.mime_type || "")
        .toLowerCase()
        .startsWith("image/"),
    ).length;
    const audioCount = rows.filter((file) =>
      String(file?.mime_type || "")
        .toLowerCase()
        .startsWith("audio/"),
    ).length;
    const docCount = Math.max(
      0,
      rows.length - videoCount - imageCount - audioCount,
    );
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

  const runVideoTranscodeJob = async (job) => {
    const fileId = job?.fileId;
    if (!fileId) return;

    const fileRow = adminGetRow
      ? adminGetRow(dbKnex("chat_message_files").where("id", fileId).first())
      : null;

    const driver = String(
      fileRow?.storage_driver || fileRow?.storageDriver || job?.storageDriver || "local",
    ).toLowerCase();

    const storageKey = fileRow?.storage_key || job?.storageKey || null;
    const isRemote = driver === "remote" || driver === "s3" || Boolean(storageKey && driver !== "local");
    const rawStoredName = fileRow?.stored_name || job?.storedName || "";
    const inputStoredName = path.basename(String(rawStoredName).trim());

    if (!inputStoredName && !storageKey) return;

    let inputPath = "";
    let isTempInput = false;
    let decryptedInput = null;
    let outputPath = "";

    try {
      if (isRemote) {
        if (!storageProvider) {
          console.error(`[video-transcode] storageProvider missing for remote file ${fileId}`);
          return;
        }
        isTempInput = true;
        const keyToFetch = storageKey || inputStoredName;
        inputPath = path.join(
          uploadRootDir,
          `tmp-input-${crypto.randomBytes(6).toString("hex")}-${inputStoredName || "video.mp4"}`,
        );
        if (typeof storageProvider.downloadToPath === "function") {
          await storageProvider.downloadToPath(keyToFetch, inputPath);
        } else if (typeof storageProvider.getDownloadUrl === "function") {
          const fetchImpl = globalThis.fetch;
          const downloadUrl = await storageProvider.getDownloadUrl(keyToFetch);
          const resp = await fetchImpl(downloadUrl);
          if (!resp.ok) throw new Error(`Failed to fetch remote file: ${resp.status}`);
          const buf = Buffer.from(await resp.arrayBuffer());
          fs.writeFileSync(inputPath, buf);
        } else {
          throw new Error("storageProvider does not support downloading files.");
        }
      } else {
        inputPath = path.join(uploadRootDir, inputStoredName);
        if (!fs.existsSync(inputPath)) return;
      }

      const parsed = path.parse(inputStoredName || "video.mp4");
      const outputName = `${parsed.name}-h264-${crypto.randomBytes(4).toString("hex")}.mp4`;
      outputPath = path.join(uploadRootDir, outputName);
      decryptedInput = storageEncryption.decryptFileToTempPath(
        inputPath,
        inputStoredName || "video.mp4",
      );

      debugLog("video-transcode:start", {
        fileId,
        messageId: job?.messageId || fileRow?.message_id || null,
        chatId: job?.chatId || null,
        inputStoredName,
        isRemote,
      });

      await runFfmpeg([
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        decryptedInput.path,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        outputPath,
      ]);

      const outputStat = fs.statSync(outputPath);
      const outputMeta = await probeVideoMetadata(outputPath);

      const isRemoteUpload =
        isRemote ||
        Boolean(
          storageProvider &&
            (storageProvider.type === "remote" || storageProvider.type === "s3"),
        );

      const encType = String(
        fileRow?.encryption_type ||
          fileRow?.encryptionType ||
          job?.encryptionType ||
          process.env.STORAGE_ENCRYPTION_MODE ||
          (isRemoteUpload ? "remote" : "none"),
      ).toLowerCase();

      if (
        encType === "aes-256-gcm" ||
        encType === "local" ||
        encType === "app"
      ) {
        storageEncryption.encryptFileInPlace(outputPath);
      }
      let finalStorageKey = storageKey;

      if (isRemoteUpload) {
        finalStorageKey = storageKey
          ? storageKey.replace(/(\.[^.]*)?$/, `-h264-${crypto.randomBytes(4).toString("hex")}.mp4`)
          : `uploads/${outputName}`;

        if (typeof storageProvider.uploadFile === "function") {
          await storageProvider.uploadFile(finalStorageKey, outputPath, "video/mp4");
        } else if (typeof storageProvider.uploadBuffer === "function") {
          await storageProvider.uploadBuffer(
            finalStorageKey,
            fs.readFileSync(outputPath),
            "video/mp4",
          );
        }

        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (_) {}
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch (_) {}
      } else {
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch (_) {}
      }

      if (isTempInput) {
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch (_) {}
      }

      if (adminRun) {
        adminRun(
          dbKnex("chat_message_files")
            .where("id", fileId)
            .update({
              stored_name: outputName,
              storage_driver: storageProvider?.type || "local",
              ...(finalStorageKey ? { storage_key: finalStorageKey } : {}),
              mime_type: "video/mp4",
              size_bytes: Number(outputStat.size || 0),
              processing_status: "ready",
              ...(Number.isFinite(Number(outputMeta?.widthPx)) ? { width_px: Number(outputMeta.widthPx) } : {}),
              ...(Number.isFinite(Number(outputMeta?.heightPx)) ? { height_px: Number(outputMeta.heightPx) } : {}),
              ...(Number.isFinite(Number(outputMeta?.durationSeconds)) ? { duration_seconds: Number(outputMeta.durationSeconds) } : {}),
            }),
        );
        if (adminSave) adminSave();
      }

      debugLog("video-transcode:done", {
        fileId,
        outputName,
        storageKey: finalStorageKey,
        width: outputMeta?.widthPx ?? null,
        height: outputMeta?.heightPx ?? null,
        durationSeconds: outputMeta?.durationSeconds ?? null,
        sizeBytes: Number(outputStat.size || 0),
      });

      const messageId = job?.messageId || fileRow?.message_id || null;
      const messageRow = messageId && adminGetRow
        ? adminGetRow(dbKnex("chat_messages").select("body", "chat_id", "user_id", "username").where("id", messageId).first())
        : null;
      const chatId = job?.chatId || messageRow?.chat_id || null;

      if (typeof emitChatEvent === "function") {
        emitChatEvent("songbird:realtime-event", {
          type: "video:ready",
          fileId,
          status: "ready",
          storageKey: finalStorageKey,
        });
      }

      if (chatId && messageId && typeof emitChatEvent === "function") {
        const messageBody = storageEncryption?.decryptText
          ? storageEncryption.decryptText(String(messageRow?.body || "").trim()).trim()
          : String(messageRow?.body || "").trim();
        const rawFiles = listMessageFilesByMessageIds
          ? listMessageFilesByMessageIds([messageId])
          : [];
        const filesForMessage =
          (rawFiles && typeof rawFiles.then === "function" ? await rawFiles : rawFiles) || [];
        const summaryText = summarizeMessageFiles(filesForMessage);

        const resolvedFiles = await Promise.all(
          filesForMessage.map(async (f) => {
            const driver = f.storage_driver || f.storageDriver;
            const sKey = f.storage_key || f.storageKey;
            const storedName = f.stored_name || f.storedName || "";
            let fileUrl = storedName ? `/api/uploads/messages/${storedName}` : null;
            if (
              (driver === "remote" || driver === "s3") &&
              sKey &&
              storageProvider &&
              typeof storageProvider.getDownloadUrl === "function"
            ) {
              try {
                fileUrl = await storageProvider.getDownloadUrl(sKey);
              } catch (_) {}
            }
            return {
              id: f.id,
              kind: f.kind,
              name: f.original_name || f.originalName || "",
              mimeType: f.mime_type || f.mimeType || "",
              processing: false,
              sizeBytes: Number(f.size_bytes || f.sizeBytes || 0),
              width: Number.isFinite(Number(f.width_px ?? f.widthPx))
                ? Number(f.width_px ?? f.widthPx)
                : null,
              height: Number.isFinite(Number(f.height_px ?? f.heightPx))
                ? Number(f.height_px ?? f.heightPx)
                : null,
              durationSeconds: Number.isFinite(Number(f.duration_seconds ?? f.durationSeconds))
                ? Number(f.duration_seconds ?? f.durationSeconds)
                : null,
              blurhash: f.blurhash || null,
              expiresAt: f.expires_at || f.expiresAt || null,
              storageDriver: driver || null,
              storageKey: sKey || null,
              url: fileUrl,
            };
          }),
        );

        const userId = job?.userId || messageRow?.user_id || null;
        const senderUsername = String(job?.username || messageRow?.username || "");

        emitChatEvent(chatId, {
          type: "chat_message_updated",
          chatId,
          messageId,
          username: senderUsername,
          userId,
          body: messageBody,
          summaryText,
          files: resolvedFiles,
        });

        emitChatEvent(chatId, {
          type: "chat_message",
          chatId,
          messageId,
          username: senderUsername,
          userId,
          body: messageBody,
          summaryText,
          files: resolvedFiles,
        });
      }
    } catch (error) {
      if (adminRun) {
        adminRun(
          dbKnex("chat_message_files")
            .where("id", fileId)
            .update({ processing_status: "failed" }),
        );
        if (adminSave) adminSave();
      }

      try {
        if (outputPath && fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch (_) {}

      try {
        if (isTempInput && inputPath && fs.existsSync(inputPath)) {
          fs.unlinkSync(inputPath);
        }
      } catch (_) {}

      console.error(
        `[video-transcode] failed for ${inputStoredName || fileId}: ${String(error?.message || error)}`,
      );

      debugLog("video-transcode:error", {
        fileId,
        inputStoredName,
        error: String(error?.message || error),
      });
    } finally {
      if (decryptedInput && typeof decryptedInput.cleanup === "function") {
        decryptedInput.cleanup();
      }
    }
  };

  const processVideoTranscodeQueue = async () => {
    if (videoTranscodeWorkerRunning) return;
    videoTranscodeWorkerRunning = true;

    try {
      while (videoTranscodeQueue.length) {
        const job = videoTranscodeQueue.shift();
        // eslint-disable-next-line no-await-in-loop
        await runVideoTranscodeJob(job);
      }
    } finally {
      videoTranscodeWorkerRunning = false;
    }
  };

  const enqueueVideoTranscodeJob = (job) => {
    // Cap the in-memory queue to prevent unbounded growth when uploads arrive
    // faster than ffmpeg can process them.
    const MAX_QUEUE_DEPTH = 200;
    if (videoTranscodeQueue.length >= MAX_QUEUE_DEPTH) {
      console.warn(
        `[video-transcode] queue full (${videoTranscodeQueue.length} jobs); dropping job for file ${Number(job?.fileId || 0)}`,
      );
      return false;
    }
    videoTranscodeQueue.push(job);
    void processVideoTranscodeQueue();
    return true;
  };

  const isVideoFileProcessing = (row) => {
    if (!transcodeVideosToH264) return false;

    const mimeType = String(row?.mime_type || "").toLowerCase();
    if (!mimeType.startsWith("video/")) return false;

    const driver = row?.storage_driver || row?.storageDriver;
    const status = row?.processing_status || row?.processingStatus;
    if (driver === "remote" || driver === "s3") {
      if (status === "ready") return false;
      if (status === "pending") return true;
    }

    const storageKey = String(row?.storage_key || row?.storageKey || "").toLowerCase();
    if (storageKey.includes(TRANSCODED_VIDEO_NAME_TAG)) return false;

    const storedName = String(row?.stored_name || row?.storedName || "").toLowerCase();
    if (storedName.includes(TRANSCODED_VIDEO_NAME_TAG)) return false;

    if (status === "ready") return false;
    return true;
  };

  const hydrateMissingVideoMetadata = async (rows = []) => {
    if (!Array.isArray(rows) || !rows.length) return rows;

    const startedAt = Date.now();
    let updated = false;
    let probedCount = 0;
    let probesRemaining = 8;

    for (const row of rows) {
      const mimeType = String(row?.mime_type || "").toLowerCase();
      if (!mimeType.startsWith("video/")) continue;

      const hasWidth =
        Number.isFinite(Number(row?.width_px)) && Number(row.width_px) > 0;
      const hasHeight =
        Number.isFinite(Number(row?.height_px)) && Number(row.height_px) > 0;
      const hasDuration =
        Number.isFinite(Number(row?.duration_seconds)) &&
        Number(row.duration_seconds) >= 0;

      if (hasWidth && hasHeight && hasDuration) continue;
      if (probesRemaining <= 0) break;

      const storedName = path.basename(String(row?.stored_name || "").trim());
      if (!storedName) continue;

      const inputPath = path.join(uploadRootDir, storedName);
      if (!fs.existsSync(inputPath)) continue;

      const decryptedInput = storageEncryption.decryptFileToTempPath(
        inputPath,
        storedName,
      );

      probesRemaining -= 1;

      // Sequential probing avoids burst-spawning ffprobe processes under load.
      // eslint-disable-next-line no-await-in-loop
      let meta;
      try {
        meta = await probeVideoMetadata(decryptedInput.path);
      } finally {
        decryptedInput.cleanup();
      }
      probedCount += 1;
      const nextWidth =
        hasWidth || !Number.isFinite(Number(meta?.widthPx))
          ? row.width_px
          : Number(meta.widthPx);
      const nextHeight =
        hasHeight || !Number.isFinite(Number(meta?.heightPx))
          ? row.height_px
          : Number(meta.heightPx);
      const nextDuration =
        hasDuration || !Number.isFinite(Number(meta?.durationSeconds))
          ? row.duration_seconds
          : Number(meta.durationSeconds);

      if (
        Number(nextWidth || 0) === Number(row.width_px || 0) &&
        Number(nextHeight || 0) === Number(row.height_px || 0) &&
        Number(nextDuration || 0) === Number(row.duration_seconds || 0)
      ) {
        continue;
      }

      const updateMetaPayload = {};
      if (Number.isFinite(Number(nextWidth))) updateMetaPayload.width_px = Number(nextWidth);
      if (Number.isFinite(Number(nextHeight))) updateMetaPayload.height_px = Number(nextHeight);
      if (Number.isFinite(Number(nextDuration))) updateMetaPayload.duration_seconds = Number(nextDuration);

      if (Object.keys(updateMetaPayload).length > 0) {
        adminRun(
          dbKnex("chat_message_files")
            .where("id", Number(row.id))
            .update(updateMetaPayload),
        );
      }

      row.width_px = Number.isFinite(Number(nextWidth))
        ? Number(nextWidth)
        : row.width_px;
      row.height_px = Number.isFinite(Number(nextHeight))
        ? Number(nextHeight)
        : row.height_px;
      row.duration_seconds = Number.isFinite(Number(nextDuration))
        ? Number(nextDuration)
        : row.duration_seconds;

      updated = true;
    }

    if (updated) {
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

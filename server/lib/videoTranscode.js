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
    const fileId = Number(job?.fileId || 0);
    const inputStoredName = path.basename(String(job?.storedName || "").trim());
    if (!fileId || !inputStoredName) return;

    const inputPath = path.join(uploadRootDir, inputStoredName);
    if (!fs.existsSync(inputPath)) return;

    const parsed = path.parse(inputStoredName);
    const outputName = `${parsed.name}-h264-${crypto.randomBytes(4).toString("hex")}.mp4`;
    const outputPath = path.join(uploadRootDir, outputName);
    const decryptedInput = storageEncryption.decryptFileToTempPath(
      inputPath,
      inputStoredName,
    );

    try {
      debugLog("video-transcode:start", {
        fileId,
        messageId: Number(job?.messageId || 0) || null,
        chatId: Number(job?.chatId || 0) || null,
        inputStoredName,
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
      storageEncryption.encryptFileInPlace(outputPath);

      fs.unlinkSync(inputPath);

      adminRun(
        `UPDATE chat_message_files
         SET stored_name = ?, mime_type = ?, size_bytes = ?, width_px = COALESCE(?, width_px), height_px = COALESCE(?, height_px), duration_seconds = COALESCE(?, duration_seconds)
         WHERE id = ?`,
        [
          outputName,
          "video/mp4",
          Number(outputStat.size || 0),
          Number.isFinite(Number(outputMeta?.widthPx))
            ? Number(outputMeta.widthPx)
            : null,
          Number.isFinite(Number(outputMeta?.heightPx))
            ? Number(outputMeta.heightPx)
            : null,
          Number.isFinite(Number(outputMeta?.durationSeconds))
            ? Number(outputMeta.durationSeconds)
            : null,
          fileId,
        ],
      );

      adminSave();

      debugLog("video-transcode:done", {
        fileId,
        outputName,
        width: outputMeta?.widthPx ?? null,
        height: outputMeta?.heightPx ?? null,
        durationSeconds: outputMeta?.durationSeconds ?? null,
        sizeBytes: Number(outputStat.size || 0),
      });

      const chatId = Number(job?.chatId || 0);
      const messageId = Number(job?.messageId || 0);
      const messageRow = messageId
        ? adminGetRow("SELECT body FROM chat_messages WHERE id = ?", [
            messageId,
          ])
        : null;
      const messageBody = storageEncryption
        .decryptText(String(messageRow?.body || "").trim())
        .trim();
      const filesForMessage = messageId
        ? listMessageFilesByMessageIds([messageId])
        : [];
      const summaryText = summarizeMessageFiles(filesForMessage);

      if (chatId > 0) {
        emitChatEvent(chatId, {
          type: "chat_message",
          chatId,
          messageId: messageId || null,
          username: String(job?.username || ""),
          body: messageBody,
          summaryText,
        });
      }
    } catch (error) {
      try {
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
      } catch (_) {
        // best effort cleanup
      }

      console.error(
        `[video-transcode] failed for ${inputStoredName}: ${String(error?.message || error)}`,
      );

      debugLog("video-transcode:error", {
        fileId,
        inputStoredName,
        error: String(error?.message || error),
      });
    } finally {
      decryptedInput.cleanup();
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
    videoTranscodeQueue.push(job);
    void processVideoTranscodeQueue();
  };

  const isVideoFileProcessing = (row) => {
    if (!transcodeVideosToH264) return false;
    if (String(row?.kind || "").toLowerCase() === "document") return false;

    const mimeType = String(row?.mime_type || "").toLowerCase();
    if (!mimeType.startsWith("video/")) return false;

    const storedName = String(row?.stored_name || "").toLowerCase();
    return !storedName.includes(TRANSCODED_VIDEO_NAME_TAG);
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

      adminRun(
        `UPDATE chat_message_files
         SET width_px = COALESCE(?, width_px), height_px = COALESCE(?, height_px), duration_seconds = COALESCE(?, duration_seconds)
         WHERE id = ?`,
        [
          Number.isFinite(Number(nextWidth)) ? Number(nextWidth) : null,
          Number.isFinite(Number(nextHeight)) ? Number(nextHeight) : null,
          Number.isFinite(Number(nextDuration)) ? Number(nextDuration) : null,
          Number(row.id),
        ],
      );

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

import crypto from "node:crypto";
import path from "node:path";
import { storageEncryption as defaultStorageEncryption } from "../lib/storageEncryption.js";

export function registerRemoteUploadRoutes(app, deps) {
  const {
    storageProvider,
    mediaQueueManager,
    adminGetRow,
    adminRun,
    adminSave,
    getSession,
    createMessageFiles,
    findMessageFileById,
    emitChatEvent,
    storageProcessingMode = "sync",
    s3ProcessingMode = "sync",
    webhookSecret,
    requireSession,
    getSessionFromRequest,
    storageEncryption = defaultStorageEncryption,
  } = deps;

  const parseCookies = (cookieHeader = "") => {
    const list = {};
    cookieHeader.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      if (parts.length >= 2) {
        list[parts.shift().trim()] = decodeURIComponent(parts.join("=").trim());
      }
    });
    return list;
  };

  const authenticateSession = async (req, res) => {
    if (typeof requireSession === "function") {
      return await requireSession(req, res);
    }
    let session = null;
    if (typeof getSessionFromRequest === "function") {
      session = getSessionFromRequest(req);
    } else if (typeof getSession === "function") {
      const cookies = parseCookies(req.headers.cookie || "");
      const token =
        cookies.sid || req.headers.authorization?.replace(/^Bearer\s+/i, "");
      session = getSession(token);
    }
    if (!session) {
      res.status(401).json({ error: "Not authenticated." });
      return null;
    }
    return session;
  };

  // POST /api/uploads/presign
  app.post("/api/uploads/presign", async (req, res) => {
    const session = authenticateSession(req, res);
    if (!session) return;

    const {
      filename,
      originalName,
      contentType,
      mimeType,
      fileSize,
      sizeBytes,
      width,
      height,
      duration,
      clientWebpThumbBase64,
      blurhash,
      waveform,
      messageId,
      encryptionType,
      encryption_type,
    } = req.body || {};

    const name = filename || originalName || "upload.bin";
    const mime = contentType || mimeType || "application/octet-stream";
    const size = Number(fileSize ?? sizeBytes ?? 0);

    const maxLimit =
      deps.MESSAGE_FILE_LIMITS?.maxFileSizeBytes ||
      (deps.getSetting ? deps.getSetting("FILE_UPLOAD_MAX_SIZE") : null) ||
      100 * 1024 * 1024;

    if (!size || size <= 0 || size > maxLimit) {
      return res
        .status(400)
        .json({ error: "File size exceeds maximum allowed limit." });
    }

    const ext = path.extname(name).toLowerCase();
    const generatedKey = `uploads/${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;

    if (
      !storageProvider ||
      typeof storageProvider.getUploadUrl !== "function"
    ) {
      return res
        .status(500)
        .json({ error: "Storage provider not configured." });
    }

    try {
      const uploadResult = await storageProvider.getUploadUrl({
        filename: name,
        contentType: mime,
        fileSize: size,
        key: generatedKey,
      });

      const finalStorageKey =
        uploadResult.storageKey || uploadResult.key || generatedKey;
      const providerType = storageProvider.type || uploadResult.type || "s3";

      let kind = "document";
      if (mime.startsWith("image/")) kind = "image";
      else if (mime.startsWith("video/")) kind = "video";
      else if (mime.startsWith("audio/")) kind = "audio";

      const fileObj = {
        kind,
        originalName: name,
        storedName: path.basename(finalStorageKey),
        mimeType: mime,
        sizeBytes: size,
        widthPx: Number.isFinite(Number(width)) ? Number(width) : null,
        heightPx: Number.isFinite(Number(height)) ? Number(height) : null,
        durationSeconds: Number.isFinite(Number(duration))
          ? Number(duration)
          : null,
        processingStatus: "pending",
        storageDriver: providerType,
        storageKey: finalStorageKey,
        blurhash: clientWebpThumbBase64 || blurhash || null,
        waveform: waveform
          ? typeof waveform === "string"
            ? waveform
            : JSON.stringify(waveform)
          : null,
        encryptionType:
          encryptionType ||
          encryption_type ||
          process.env.STORAGE_ENCRYPTION_MODE ||
          "remote",
      };

      const targetMsgId = messageId || null;
      let inserted = null;
      if (typeof createMessageFiles === "function") {
        inserted = createMessageFiles(targetMsgId, [fileObj]);
      }

      let fileId = null;
      if (Array.isArray(inserted) && inserted[0]?.id) {
        fileId = inserted[0].id;
      } else if (inserted && typeof inserted === "object" && inserted.id) {
        fileId = inserted.id;
      } else if (typeof adminGetRow === "function") {
        const row = adminGetRow(
          "SELECT id FROM chat_message_files WHERE storage_key = ? ORDER BY id DESC LIMIT 1",
          [finalStorageKey],
        );
        fileId = row?.id || null;
      }

      return res.json({
        success: true,
        type: providerType,
        uploadUrl: uploadResult.uploadUrl,
        storageKey: finalStorageKey,
        fileId,
      });
    } catch (err) {
      return res.status(500).json({
        error: err.message || "Failed to generate presigned upload URL.",
      });
    }
  });

  // POST /api/uploads/complete
  app.post("/api/uploads/complete", async (req, res) => {
    const session = authenticateSession(req, res);
    if (!session) return;

    const { fileId, storageKey } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required." });
    }

    let file = null;
    if (typeof findMessageFileById === "function") {
      file = findMessageFileById(Number(fileId));
    }
    if (!file && typeof adminGetRow === "function") {
      file = adminGetRow("SELECT * FROM chat_message_files WHERE id = ?", [
        Number(fileId),
      ]);
    }

    if (!file) {
      return res.status(404).json({ error: "File not found." });
    }

    if (storageKey && file.storage_key && file.storage_key !== storageKey) {
      return res.status(400).json({ error: "Storage key mismatch." });
    }

    if (
      file.message_id &&
      file.message_id > 0 &&
      typeof adminGetRow === "function"
    ) {
      const msg = adminGetRow(
        "SELECT user_id, username FROM chat_messages WHERE id = ?",
        [file.message_id],
      );
      if (
        msg &&
        msg.user_id &&
        session.userId &&
        msg.user_id !== session.userId
      ) {
        return res.status(403).json({ error: "Access denied." });
      }
    }

    const mode = String(
      deps.storageProcessingMode || storageProcessingMode || "sync",
    ).toLowerCase();
    const newStatus =
      mode === "webhook" || mode === "remote" || mode === "async"
        ? "pending"
        : "ready";

    if (typeof adminRun === "function") {
      adminRun(
        "UPDATE chat_message_files SET processing_status = ? WHERE id = ?",
        [newStatus, Number(fileId)],
      );
      if (typeof adminSave === "function") adminSave();
    }

    if (newStatus === "pending" && mediaQueueManager?.scheduleFallbackCheck) {
      mediaQueueManager.scheduleFallbackCheck({
        fileId: Number(fileId),
        storageKey: file.storage_key || storageKey,
      });
    }

    return res.json({
      success: true,
      fileId: Number(fileId),
      status: newStatus,
    });
  });

  // POST /api/uploads/webhook/processed
  app.post("/api/uploads/webhook/processed", async (req, res) => {
    const expectedSecret =
      deps.webhookSecret !== undefined ? deps.webhookSecret : webhookSecret;
    if (expectedSecret) {
      const headerSecret = req.headers["x-songbird-webhook-secret"];
      if (headerSecret !== expectedSecret) {
        return res.status(401).json({ error: "Unauthorized webhook request." });
      }
    }

    const { fileId, status, transcodedStorageKey, thumbStorageKey } =
      req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required." });
    }

    let file = null;
    if (typeof findMessageFileById === "function") {
      file = findMessageFileById(Number(fileId));
    }
    if (!file && typeof adminGetRow === "function") {
      file = adminGetRow("SELECT * FROM chat_message_files WHERE id = ?", [
        Number(fileId),
      ]);
    }

    if (!file) {
      return res.status(404).json({ error: "File not found." });
    }

    const finalStatus = status || "ready";
    if (typeof adminRun === "function") {
      adminRun(
        `UPDATE chat_message_files
         SET processing_status = ?,
             storage_key = COALESCE(?, storage_key),
             thumb_storage_key = COALESCE(?, thumb_storage_key)
         WHERE id = ?`,
        [
          finalStatus,
          transcodedStorageKey || null,
          thumbStorageKey || null,
          Number(fileId),
        ],
      );
      if (typeof adminSave === "function") adminSave();
    }

    if (mediaQueueManager?.cancelFallbackCheck) {
      mediaQueueManager.cancelFallbackCheck(Number(fileId));
    }

    let chatId = null;
    if (file.message_id && typeof adminGetRow === "function") {
      const msg = adminGetRow(
        "SELECT chat_id FROM chat_messages WHERE id = ?",
        [file.message_id],
      );
      chatId = msg?.chat_id || null;
    }

    if (typeof emitChatEvent === "function") {
      emitChatEvent(chatId, {
        type: "video:ready",
        fileId: Number(fileId),
        status: finalStatus,
        storageKey: transcodedStorageKey || file.storage_key,
        thumbStorageKey: thumbStorageKey || file.thumb_storage_key,
      });
    }

    return res.json({ success: true });
  });

  // POST /api/uploads (fallback multipart upload)
  app.post("/api/uploads", async (req, res) => {
    const session = authenticateSession(req, res);
    if (!session) return;

    if (deps.getSetting && !deps.getSetting("FILE_UPLOAD")) {
      return res
        .status(503)
        .json({ error: "File uploads are disabled on this server." });
    }

    const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
    const filename =
      req.body?.filename || file?.originalname || file?.name || "upload.bin";
    const mimeType =
      req.body?.contentType ||
      req.body?.mimeType ||
      file?.mimetype ||
      file?.type ||
      "application/octet-stream";
    const fileSize = Number(
      req.body?.fileSize || req.body?.size || file?.size || 0,
    );

    const ext = path.extname(filename).toLowerCase();
    const generatedKey = `uploads/${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;

    let kind = "document";
    if (mimeType.startsWith("image/")) kind = "image";
    else if (mimeType.startsWith("video/")) kind = "video";
    else if (mimeType.startsWith("audio/")) kind = "audio";

    const fileObj = {
      kind,
      originalName: filename,
      storedName: path.basename(generatedKey),
      mimeType,
      sizeBytes: fileSize,
      widthPx: Number.isFinite(Number(req.body?.width))
        ? Number(req.body?.width)
        : null,
      heightPx: Number.isFinite(Number(req.body?.height))
        ? Number(req.body?.height)
        : null,
      durationSeconds: Number.isFinite(Number(req.body?.duration))
        ? Number(req.body?.duration)
        : null,
      processingStatus: "ready",
      storageDriver: "local",
      storageKey: generatedKey,
      blurhash: req.body?.clientWebpThumbBase64 || req.body?.blurhash || null,
      waveform: req.body?.waveform
        ? typeof req.body.waveform === "string"
          ? req.body.waveform
          : JSON.stringify(req.body.waveform)
        : null,
      encryptionType: "none",
    };

    let inserted = null;
    if (typeof createMessageFiles === "function") {
      inserted = createMessageFiles(0, [fileObj]);
    }

    let fileId = null;
    if (Array.isArray(inserted) && inserted[0]?.id) {
      fileId = inserted[0].id;
    } else if (inserted && typeof inserted === "object" && inserted.id) {
      fileId = inserted.id;
    } else if (typeof adminGetRow === "function") {
      const row = adminGetRow(
        "SELECT id FROM chat_message_files WHERE storage_key = ? ORDER BY id DESC LIMIT 1",
        [generatedKey],
      );
      fileId = row?.id || 1;
    } else {
      fileId = 1;
    }

    return res.json({
      success: true,
      fileId,
      url: `/api/uploads/file/${fileId}`,
      filename,
      mimeType,
      fileSize,
      waveform: fileObj.waveform,
      blurhash: fileObj.blurhash,
    });
  });

  // GET /api/uploads/file/:id
  app.get("/api/uploads/file/:id", async (req, res) => {
    const idParam = req.params?.id;
    if (!idParam) return res.status(404).end();

    let file = null;
    if (typeof findMessageFileById === "function" && !isNaN(Number(idParam))) {
      file = findMessageFileById(Number(idParam));
    }
    if (!file && typeof adminGetRow === "function") {
      file = adminGetRow(
        "SELECT * FROM chat_message_files WHERE id = ? OR stored_name = ? OR storage_key = ?",
        [Number(idParam) || 0, idParam, idParam],
      );
    }

    if (!file) return res.status(404).end();

    const driver = file.storage_driver || file.storageDriver;
    if (driver === "s3" || driver === "remote") {
      if (
        !storageProvider ||
        typeof storageProvider.getDownloadUrl !== "function"
      ) {
        return res
          .status(500)
          .json({ error: "Storage provider not available." });
      }

      try {
        const downloadUrl = await storageProvider.getDownloadUrl(
          file.storage_key,
        );

        const encType = file.encryption_type || "remote";
        if (
          encType === "remote" ||
          encType === "none" ||
          encType === "provider_sse"
        ) {
          return res.redirect(302, downloadUrl);
        }

        if (
          encType === "local" ||
          encType === "app" ||
          encType === "aes-256-gcm"
        ) {
          const fetchImpl = deps.fetch || globalThis.fetch;
          const resp = await fetchImpl(downloadUrl);
          if (!resp.ok) return res.status(resp.status).end();

          const arrayBuf = await resp.arrayBuffer();
          const cipherBuf = Buffer.from(arrayBuf);
          const decrypted = (
            deps.storageEncryption || defaultStorageEncryption
          ).decryptBuffer(cipherBuf);

          if (file.mime_type) res.type(file.mime_type);
          return res.send(decrypted);
        }

        return res.redirect(302, downloadUrl);
      } catch (err) {
        return res
          .status(500)
          .json({ error: err.message || "Download failed." });
      }
    }

    // Local storage driver
    if (file.mime_type) res.type(file.mime_type);
    return res.status(200).send("OK");
  });
}

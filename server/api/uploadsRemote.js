import crypto from "node:crypto";
import path from "node:path";
import { storageEncryption as defaultStorageEncryption } from "../lib/storageEncryption.js";
import { dbKnex } from "../db/knex.js";
import { dispatchMediaWorkerJob } from "../lib/mediaWorker.js";

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
    recordPendingPresignedUpload,
    storageProcessingMode = "auto",
    s3ProcessingMode = "auto",
    webhookSecret,
    mediaWorkerUrl = deps.mediaWorkerUrl || process.env.MEDIA_WORKER_URL || null,
    requireSession,
    getSessionFromRequest,
    storageEncryption = defaultStorageEncryption,
    enqueueVideoTranscodeJob = deps.enqueueVideoTranscodeJob,
    listMessageFilesByMessageIds = deps.listMessageFilesByMessageIds,
  } = deps;

  function toSql(builder, p = []) {
    if (builder && typeof builder.toSQL === "function") {
      const c = builder.toSQL();
      return { sql: c.sql, params: c.bindings || [] };
    }
    return { sql: builder, params: p };
  }

  const callAdminGetRow = (builder, p) => {
    const { sql, params } = toSql(builder, p);
    return adminGetRow(sql, params);
  };
  const callAdminRun = (builder, p) => {
    const { sql, params } = toSql(builder, p);
    return adminRun(sql, params);
  };

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
      const rawSession = getSessionFromRequest(req);
      session = rawSession && typeof rawSession.then === "function" ? await rawSession : rawSession;
    } else if (typeof getSession === "function") {
      const cookies = parseCookies(req.headers.cookie || "");
      const token =
        cookies.sid || req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const rawSession = getSession(token);
      session = rawSession && typeof rawSession.then === "function" ? await rawSession : rawSession;
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
      let fileId = null;
      if (targetMsgId && typeof createMessageFiles === "function") {
        const rawInserted = createMessageFiles(targetMsgId, [fileObj]);
        const inserted = rawInserted && typeof rawInserted.then === "function" ? await rawInserted : rawInserted;
        if (Array.isArray(inserted) && inserted[0]?.id) {
          fileId = inserted[0].id;
        } else if (inserted && typeof inserted === "object" && inserted.id) {
          fileId = inserted.id;
        }
      }
      if (!fileId && targetMsgId && typeof adminGetRow === "function") {
        const row = callAdminGetRow(
          dbKnex("chat_message_files")
            .select("id")
            .where("storage_key", finalStorageKey)
            .orderBy("id", "desc")
            .first(),
        );
        fileId = row?.id || null;
      }

      if (typeof recordPendingPresignedUpload === "function") {
        try {
          recordPendingPresignedUpload({
            storageKey: finalStorageKey,
            userId: session?.userId || null,
          });
        } catch (_) {}
      } else if (typeof adminRun === "function") {
        try {
          callAdminRun(
            dbKnex("pending_presigned_uploads").insert({
              storage_key: finalStorageKey,
              user_id: session?.userId || null,
              created_at: new Date().toISOString(),
            }),
          );
          if (typeof adminSave === "function") adminSave();
        } catch (_) {}
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
      const raw = findMessageFileById(fileId);
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }
    if (!file && typeof adminGetRow === "function") {
      const raw = callAdminGetRow(dbKnex("chat_message_files").where("id", fileId).first());
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }

    if (!file) {
      return res.status(404).json({ error: "File not found." });
    }

    if (storageKey && file.storage_key && file.storage_key !== storageKey) {
      return res.status(400).json({ error: "Storage key mismatch." });
    }

    if (
      file.message_id &&
      typeof adminGetRow === "function"
    ) {
      const rawMsg = callAdminGetRow(
        dbKnex("chat_messages").select("user_id", "username").where("id", file.message_id).first(),
      );
      const msg = rawMsg && typeof rawMsg.then === "function" ? await rawMsg : rawMsg;
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
      deps.storageProcessingMode || storageProcessingMode || "auto",
    ).toLowerCase();
    const isVideo = String(file.mime_type || file.mimeType || "")
      .toLowerCase()
      .startsWith("video/");

    const defaultWorkerPort = process.env.WORKER_PORT || "8080";
    const effectiveWorkerUrl =
      deps.mediaWorkerUrl !== undefined
        ? deps.mediaWorkerUrl
        : mediaWorkerUrl ||
          process.env.MEDIA_WORKER_URL ||
          `http://127.0.0.1:${defaultWorkerPort}`;
    const transcodeFn = deps.enqueueVideoTranscodeJob || enqueueVideoTranscodeJob;
    const transcodeEnabled = deps.getSetting
      ? deps.getSetting("FILE_UPLOAD_TRANSCODE_VIDEOS")
      : true;

    let newStatus = "ready";
    if (mode === "remote") {
      newStatus = "pending";
    } else if (isVideo && transcodeEnabled) {
      newStatus = (effectiveWorkerUrl || typeof transcodeFn === "function") ? "pending" : "ready";
    }

    if (typeof adminRun === "function") {
      callAdminRun(
        dbKnex("chat_message_files").where("id", fileId).update({ processing_status: newStatus }),
      );
      if (typeof adminSave === "function") adminSave();
    }

    if (isVideo && transcodeEnabled) {
      if (effectiveWorkerUrl) {
        const defaultCallback = `http://127.0.0.1:${process.env.SERVER_PORT || process.env.PORT || "5174"}/api/uploads/webhook/processed`;
        dispatchMediaWorkerJob({
          mediaWorkerUrl: effectiveWorkerUrl,
          webhookSecret:
            deps.webhookSecret !== undefined
              ? deps.webhookSecret
              : webhookSecret || process.env.WEBHOOK_SECRET || null,
          callbackUrl:
            deps.webhookCallbackUrl ||
            process.env.WEBHOOK_CALLBACK_URL ||
            process.env.SONGBIRD_WEBHOOK_CALLBACK_URL ||
            defaultCallback,
          fileId,
          storageKey: file.storage_key || storageKey,
          storedName: file.stored_name || file.storedName,
          mimeType: file.mime_type || file.mimeType,
          encryptionType: file.encryption_type || file.encryptionType || "none",
          fetchImpl: deps.fetchImpl || globalThis.fetch,
        }).catch(() => {});
      } else if (typeof transcodeFn === "function") {
        transcodeFn({
          fileId,
          storedName: file.stored_name || file.storedName,
          storageKey: file.storage_key || storageKey,
          storageDriver: file.storage_driver || file.storageDriver,
          chatId: file.chat_id || file.chatId,
          messageId: file.message_id || file.messageId,
        });
      }
    }

    if (newStatus === "pending" && mediaQueueManager?.scheduleFallbackCheck) {
      mediaQueueManager.scheduleFallbackCheck({
        fileId,
        storageKey: file.storage_key || storageKey,
      });
    }

    return res.json({
      success: true,
      fileId,
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

    const {
      fileId,
      status,
      transcodedStorageKey,
      thumbStorageKey,
      width,
      height,
      duration,
    } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: "fileId is required." });
    }

    let file = null;
    if (typeof findMessageFileById === "function") {
      const raw = findMessageFileById(fileId);
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }
    if (!file && typeof adminGetRow === "function") {
      const raw = callAdminGetRow(dbKnex("chat_message_files").where("id", fileId).first());
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }

    if (!file) {
      return res.status(404).json({ error: "File not found." });
    }

    const finalStatus = status || "ready";
    if (typeof adminRun === "function") {
      const updatePayload = { processing_status: finalStatus };
      if (transcodedStorageKey) {
        updatePayload.storage_key = transcodedStorageKey;
        updatePayload.stored_name = path.basename(transcodedStorageKey);
      }
      if (thumbStorageKey) updatePayload.thumb_storage_key = thumbStorageKey;
      if (Number.isFinite(Number(width)) && Number(width) > 0) {
        updatePayload.width_px = Number(width);
      }
      if (Number.isFinite(Number(height)) && Number(height) > 0) {
        updatePayload.height_px = Number(height);
      }
      if (Number.isFinite(Number(duration)) && Number(duration) >= 0) {
        updatePayload.duration_seconds = Number(duration);
      }
      const rawUpdate = callAdminRun(
        dbKnex("chat_message_files").where("id", fileId).update(updatePayload),
      );
      if (rawUpdate && typeof rawUpdate.then === "function") await rawUpdate;
      if (typeof adminSave === "function") adminSave();
    }

    if (mediaQueueManager?.cancelFallbackCheck) {
      mediaQueueManager.cancelFallbackCheck(fileId);
    }

    let chatId = null;
    let messageRow = null;
    if (file.message_id && typeof adminGetRow === "function") {
      const rawMsg = callAdminGetRow(
        dbKnex("chat_messages").where("id", file.message_id).first(),
      );
      messageRow = rawMsg && typeof rawMsg.then === "function" ? await rawMsg : rawMsg;
      chatId = messageRow?.chat_id || null;
    }

    if (typeof emitChatEvent === "function") {
      if (chatId && file.message_id) {
        const rawFiles = typeof listMessageFilesByMessageIds === "function"
          ? listMessageFilesByMessageIds([file.message_id])
          : [];
        const filesForMessage =
          (rawFiles && typeof rawFiles.then === "function" ? await rawFiles : rawFiles) || [];

        const enc = deps.storageEncryption || defaultStorageEncryption;
        const decryptedBody = enc
          ? enc.decryptText(messageRow?.body || "")
          : messageRow?.body || "";

        const resolvedFiles = await Promise.all(
          filesForMessage.map(async (f) => {
            const isTargetFile = String(f.id) === String(fileId);
            const driver = f.storage_driver || f.storageDriver;
            const sKey = (isTargetFile && transcodedStorageKey)
              ? transcodedStorageKey
              : (f.storage_key || f.storageKey);
            const thumbKey = (isTargetFile && thumbStorageKey)
              ? thumbStorageKey
              : (f.thumb_storage_key || f.thumbStorageKey);
            const storedName = f.stored_name || f.storedName || "";
            let fileUrl = storedName ? `/api/uploads/messages/${storedName}` : null;
            let thumbUrl = null;
            if (
              (driver === "remote" || driver === "s3") &&
              storageProvider &&
              typeof storageProvider.getDownloadUrl === "function"
            ) {
              if (sKey) {
                try {
                  fileUrl = await storageProvider.getDownloadUrl(sKey);
                } catch (_) {}
              }
              if (thumbKey) {
                try {
                  thumbUrl = await storageProvider.getDownloadUrl(thumbKey);
                } catch (_) {}
              }
            }
            const isThisPending = isTargetFile
              ? finalStatus === "pending"
              : (f.processing_status || f.processingStatus) === "pending";

            const fileWidth = isTargetFile && Number.isFinite(Number(width)) && Number(width) > 0
              ? Number(width)
              : Number.isFinite(Number(f.width_px ?? f.widthPx))
                ? Number(f.width_px ?? f.widthPx)
                : null;
            const fileHeight = isTargetFile && Number.isFinite(Number(height)) && Number(height) > 0
              ? Number(height)
              : Number.isFinite(Number(f.height_px ?? f.heightPx))
                ? Number(f.height_px ?? f.heightPx)
                : null;
            const fileDuration = isTargetFile && Number.isFinite(Number(duration)) && Number(duration) >= 0
              ? Number(duration)
              : Number.isFinite(Number(f.duration_seconds ?? f.durationSeconds))
                ? Number(f.duration_seconds ?? f.durationSeconds)
                : null;

            return {
              id: f.id,
              kind: f.kind,
              name: f.original_name || f.originalName || "",
              mimeType: f.mime_type || f.mimeType || "",
              processing: isThisPending,
              sizeBytes: Number(f.size_bytes || f.sizeBytes || 0),
              width: fileWidth,
              height: fileHeight,
              durationSeconds: fileDuration,
              blurhash: f.blurhash || null,
              expiresAt: f.expires_at || f.expiresAt || null,
              storageDriver: driver || null,
              storageKey: sKey || null,
              thumbStorageKey: thumbKey || null,
              thumbUrl: thumbUrl || null,
              url: fileUrl,
            };
          }),
        );

        emitChatEvent(chatId, {
          type: "chat_message_updated",
          chatId,
          messageId: file.message_id,
          username: messageRow?.username || "",
          userId: messageRow?.user_id || null,
          body: decryptedBody || "",
          files: resolvedFiles,
        });
      }

      emitChatEvent(chatId, {
        type: "video:ready",
        fileId,
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
      const row = callAdminGetRow(
        dbKnex("chat_message_files")
          .select("id")
          .where("storage_key", generatedKey)
          .orderBy("id", "desc")
          .first(),
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
    if (typeof findMessageFileById === "function") {
      const raw = findMessageFileById(idParam);
      file = raw && typeof raw.then === "function" ? await raw : raw;
    }
    if (!file && typeof adminGetRow === "function") {
      const raw = callAdminGetRow(
        dbKnex("chat_message_files")
          .where((builder) => {
            builder.where("id", idParam).orWhere("stored_name", idParam).orWhere("storage_key", idParam);
          })
          .first(),
      );
      file = raw && typeof raw.then === "function" ? await raw : raw;
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

import rateLimit from "express-rate-limit";
import { dbKnex } from "../db/knex.js";

export function createUploadTools({
  fs,
  path,
  crypto,
  multer,
  adminGetRow,
  adminRun,
  adminSave,
  uploadRootDir,
  avatarUploadRootDir,
  fileUploadMaxSize,
  fileUploadMaxFiles,
  fileUploadMaxTotalSize,
  storageEncryption,
  storageProvider,
}) {
  const MESSAGE_FILE_LIMITS = {
    maxFiles: fileUploadMaxFiles,
    maxFileSizeBytes: fileUploadMaxSize,
    maxTotalBytes: fileUploadMaxTotalSize,
  };

  const AVATAR_FILE_LIMITS = {
    maxFileSizeBytes: fileUploadMaxSize,
  };

  const SAFE_INLINE_MESSAGE_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".bmp",
    ".mp4",
    ".mov",
    ".webm",
    ".mkv",
    ".avi",
    ".m4v",
    ".pdf",
  ]);

  const DANGEROUS_FILE_EXTENSIONS = new Set([
    ".html",
    ".htm",
    ".xhtml",
    ".svg",
    ".xml",
    ".js",
    ".mjs",
    ".cjs",
    ".wasm",
  ]);

  const DANGEROUS_MIME_SNIPPETS = [
    "text/html",
    "application/xhtml+xml",
    "image/svg+xml",
    "application/xml",
    "text/xml",
    "javascript",
  ];

  const ALLOWED_AVATAR_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
  ]);

  const uploadDownloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  if (!fs.existsSync(uploadRootDir)) {
    fs.mkdirSync(uploadRootDir, { recursive: true });
  }
  if (!fs.existsSync(avatarUploadRootDir)) {
    fs.mkdirSync(avatarUploadRootDir, { recursive: true });
  }

  const uploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRootDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
    },
  });

  const uploadFiles = multer({
    storage: uploadStorage,
    limits: {
      fileSize: MESSAGE_FILE_LIMITS.maxFileSizeBytes,
      files: MESSAGE_FILE_LIMITS.maxFiles,
    },
  });

  const avatarUploadStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarUploadRootDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      cb(
        null,
        `avatar-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`,
      );
    },
  });

  const uploadAvatar = multer({
    storage: avatarUploadStorage,
    limits: {
      fileSize: AVATAR_FILE_LIMITS.maxFileSizeBytes,
      files: 1,
    },
  });

  const buildDownloadFilename = (value) => {
    const raw = String(value || "download");
    const cleaned = raw
      .replace(/[\r\n"]/g, "")
      .replace(/[\\/:*?<>|%]/g, "_")
      .trim();
    return cleaned || "download";
  };

  const buildAsciiFallbackFilename = (value) => {
    const cleaned = buildDownloadFilename(value)
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || "download";
  };

  const decodeOriginalFilename = (name = "") => {
    try {
      return Buffer.from(String(name), "latin1").toString("utf8");
    } catch (_) {
      return String(name || "file");
    }
  };

  const inferMimeFromFilename = (name = "") => {
    const ext = path.extname(String(name || "")).toLowerCase();
    const map = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".svg": "image/svg+xml",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
      ".avi": "video/x-msvideo",
      ".m4v": "video/mp4",
    };
    return map[ext] || "";
  };

  const getUploadKind = (uploadType, mimeType = "") => {
    const type = String(mimeType || "").toLowerCase();

    if (type.startsWith("video/")) {
      return "media";
    }

    if (uploadType === "media") {
      if (
        type.startsWith("image/") ||
        type.startsWith("video/") ||
        type.startsWith("audio/")
      ) {
        return "media";
      }
      return null;
    }

    if (uploadType === "document") {
      return "document";
    }
    return null;
  };

  const removeUploadedFiles = (files = [], uploadDir = uploadRootDir) => {
    if (!Array.isArray(files) || !files.length) return;
    const baseDir = path.resolve(String(uploadDir || ""));
    if (!baseDir) return;

    files.forEach((file) => {
      try {
        const fileName = path.basename(String(file?.filename || "").trim());
        if (!fileName) return;

        const diskPath = path.join(baseDir, fileName);

        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      } catch (_) {
        // best effort cleanup
      }
    });
  };

  const removeStoredFileNames = (storedNames = []) => {
    storedNames.forEach((storedName) => {
      try {
        const fileName = path.basename(String(storedName || "").trim());
        if (!fileName) return;
        const stillReferenced = adminGetRow(
          dbKnex("chat_message_files").select(dbKnex.raw("1 as found")).where("stored_name", fileName).first(),
        );
        if (stillReferenced?.found) return;

        const filePath = path.join(uploadRootDir, fileName);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (_) {
        // best effort cleanup
      }
    });
  };

  const removeAvatarByUrl = (avatarUrl = "") => {
    try {
      const raw = String(avatarUrl || "").trim();
      if (!raw) return;

      let cleanPath = raw;
      try {
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
          const parsed = new URL(raw);
          cleanPath = parsed.pathname;
        } else {
          cleanPath = raw.split("?")[0].split("#")[0];
        }
      } catch (_) {
        cleanPath = raw.split("?")[0].split("#")[0];
      }

      const fileName = path.basename(cleanPath);
      if (!fileName) return;

      const isAvatarPath =
        cleanPath.startsWith("/api/uploads/avatars/") ||
        cleanPath.startsWith("/uploads/avatars/") ||
        cleanPath.includes("/avatars/") ||
        fileName.startsWith("avatar-");

      if (!isAvatarPath) return;

      const filePath = path.join(avatarUploadRootDir, fileName);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (
        storageProvider &&
        (storageProvider.type === "remote" || storageProvider.type === "s3") &&
        typeof storageProvider.deleteFile === "function"
      ) {
        const newKey = `uploads/avatars/${fileName}`;
        storageProvider.deleteFile(newKey).catch((err) => {
          console.warn(
            `[uploads] Failed to delete avatar "${newKey}" from storage:`,
            err?.message || err,
          );
        });
        // Best-effort cleanup of legacy keys stored before the
        // uploads/avatars + uploads/messages unification.
        const legacyKey = `avatars/${fileName}`;
        if (legacyKey !== newKey) {
          storageProvider.deleteFile(legacyKey).catch(() => {});
        }
      }
    } catch (_) {
      // best effort cleanup
    }
  };

  const resolveAvatarDiskPath = (avatarUrl = "") => {
    const raw = String(avatarUrl || "").trim();

    if (
      !raw.startsWith("/api/uploads/avatars/") &&
      !raw.startsWith("/uploads/avatars/")
    )
      return null;

    const fileName = path.basename(raw);
    if (!fileName) return null;

    return path.join(avatarUploadRootDir, fileName);
  };

  const normalizeAvatarPublicUrl = (avatarUrl = "") => {
    const raw = String(avatarUrl || "").trim();
    if (!raw) return "";

    if (raw.startsWith("/api/uploads/avatars/")) return raw;

    if (raw.startsWith("/uploads/avatars/")) {
      return `/api${raw}`;
    }
    return raw;
  };

  const ensureAvatarExists = (userId, avatarUrl) => {
    const value = String(avatarUrl || "").trim();
    if (!value) return null;

    const diskPath = resolveAvatarDiskPath(value);
    const normalized = normalizeAvatarPublicUrl(value);
    if (!diskPath) return normalized || null;

    if (fs.existsSync(diskPath)) return normalized || null;

    const isRemote =
      (storageProvider &&
        (storageProvider.type === "remote" || storageProvider.type === "s3")) ||
      (!storageProvider &&
        (process.env.STORAGE_DRIVER === "remote" ||
          process.env.STORAGE_DRIVER === "s3"));
    if (isRemote) {
      return normalized || null;
    }

    if (userId) {
      adminRun(dbKnex("users").where("id", userId).update({ avatar_url: null }));
      adminSave();
    }
    return null;
  };

  const storeAvatarFile = async (file) => {
    if (!file) {
      throw new Error("Avatar file is required.");
    }
    const avatarUrl = `/api/uploads/avatars/${file.filename}`;

    if (
      storageProvider &&
      (storageProvider.type === "remote" || storageProvider.type === "s3") &&
      typeof storageProvider.uploadBuffer === "function"
    ) {
      const fileKey = `uploads/avatars/${file.filename}`;
      const fileBuf = await fs.promises.readFile(file.path);
      const uploadBuf = storageEncryption.decryptBuffer(fileBuf);
      await storageProvider.uploadBuffer(
        fileKey,
        uploadBuf,
        file.mimetype || "image/jpeg",
      );
      await fs.promises.unlink(file.path).catch(() => {});
      return {
        avatarUrl,
        storageDriver: storageProvider.type || "s3",
        storageKey: fileKey,
      };
    }

    storageEncryption.encryptFileInPlace(file.path);
    return {
      avatarUrl,
      storageDriver: "local",
      storageKey: null,
    };
  };

  const isDangerousUploadFile = (originalName, mimeType) => {
    const ext = path.extname(String(originalName || "")).toLowerCase();
    const lowerMime = String(mimeType || "").toLowerCase();

    if (DANGEROUS_FILE_EXTENSIONS.has(ext)) return true;
    return DANGEROUS_MIME_SNIPPETS.some((snippet) =>
      lowerMime.includes(snippet),
    );
  };

  const registerUploadRoutes = (app, { adminGetRow }) => {
    app.get(
      "/api/uploads/messages/:storedName",
      uploadDownloadLimiter,
      async (req, res) => {
        const storedName = path.basename(
          String(req.params?.storedName || "").trim(),
        );
        if (!storedName) return res.status(404).end();

        const filePath = path.join(uploadRootDir, storedName);

        let row = null;
        try {
          const rawRow = adminGetRow(
            dbKnex("chat_message_files")
              .select("original_name", "mime_type", "storage_key", "storage_driver")
              .where("stored_name", storedName)
              .first(),
          );
          row = (rawRow && typeof rawRow.then === "function") ? await rawRow : rawRow;
        } catch (_) {}

        const driver = row?.storage_driver || row?.storageDriver;
        if (
          (driver === "s3" || driver === "remote" || !fs.existsSync(filePath)) &&
          storageProvider &&
          (storageProvider.type === "s3" || storageProvider.type === "remote") &&
          typeof storageProvider.getDownloadUrl === "function"
        ) {
          try {
            const key = row?.storage_key || `uploads/messages/${storedName}`;
            const url = await storageProvider.getDownloadUrl(key);
            if (url && url !== `/api/uploads/messages/${storedName}`) {
              return res.redirect(302, url);
            }
          } catch (_) {}
        }

        if (!fs.existsSync(filePath)) return res.status(404).end();
        const originalName = buildDownloadFilename(row?.original_name);
        const fallbackName = buildAsciiFallbackFilename(originalName);
        const mimeType = String(row?.mime_type || "").trim();
        const ext = path.extname(storedName).toLowerCase();

        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.setHeader("Vary", "Accept-Encoding");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Accept-Ranges", "bytes");

        if (mimeType) {
          res.type(mimeType);
        }

        const forceDownload =
          String(req.query?.download || "").toLowerCase() === "1" ||
          String(req.query?.download || "").toLowerCase() === "true";
        if (forceDownload || !SAFE_INLINE_MESSAGE_EXTENSIONS.has(ext)) {
          const encoded = encodeURIComponent(originalName);
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fallbackName}"; filename*=UTF-8''${encoded}`,
          );
        }

        const totalSize = storageEncryption.getDecryptedFileSize(filePath);
        if (!totalSize) return res.status(404).end();

        const rangeHeader = req.headers.range;
        if (rangeHeader && rangeHeader.startsWith("bytes=")) {
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10) || 0;
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

          if (start >= totalSize || end >= totalSize || start > end) {
            res.setHeader("Content-Range", `bytes */${totalSize}`);
            return res.status(416).end();
          }

          const chunkSize = end - start + 1;
          const chunkBuffer = storageEncryption.decryptFileRange(filePath, start, end);
          if (!chunkBuffer) return res.status(500).end();

          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
          res.setHeader("Content-Length", chunkSize);
          return res.send(chunkBuffer);
        }

        const fileBuffer = storageEncryption.decryptFileToBuffer(filePath);
        if (!fileBuffer) return res.status(404).end();
        res.setHeader("Content-Length", fileBuffer.length);
        return res.send(fileBuffer);
      },
    );

    app.get(
      "/api/uploads/avatars/:storedName",
      uploadDownloadLimiter,
      async (req, res) => {
        const storedName = path.basename(
          String(req.params?.storedName || "").trim(),
        );
        if (!storedName) return res.status(404).end();

        const filePath = path.join(avatarUploadRootDir, storedName);
        if (!fs.existsSync(filePath)) {
          if (
            storageProvider &&
            (storageProvider.type === "s3" || storageProvider.type === "remote") &&
            typeof storageProvider.getDownloadUrl === "function"
          ) {
            try {
              const tryKeys = [
                `uploads/avatars/${storedName}`,
                // Legacy key from before uploads/avatars unification.
                `avatars/${storedName}`,
              ];
              for (const tryKey of tryKeys) {
                try {
                  const url = await storageProvider.getDownloadUrl(tryKey);
                  if (url && url !== `/api/uploads/file/avatars/${storedName}`) {
                    return res.redirect(302, url);
                  }
                  break;
                } catch (_) {
                  continue;
                }
              }
            } catch (_) {}
          }
          return res.status(404).end();
        }

        const fileBuffer = storageEncryption.decryptFileToBuffer(filePath);
        if (!fileBuffer) return res.status(404).end();

        const stat = fs.statSync(filePath);
        const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        const ifNoneMatch = String(req.headers?.["if-none-match"] || "");
        const ifModifiedSince = String(req.headers?.["if-modified-since"] || "");
        const modifiedSinceMs = ifModifiedSince
          ? Date.parse(ifModifiedSince)
          : NaN;

        res.setHeader("Cache-Control", "public, max-age=2592000");
        res.setHeader("Vary", "Accept-Encoding");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("ETag", etag);
        res.setHeader("Last-Modified", stat.mtime.toUTCString());
        res.type(inferMimeFromFilename(storedName) || "application/octet-stream");

        if (
          ifNoneMatch === etag ||
          (!ifNoneMatch &&
            Number.isFinite(modifiedSinceMs) &&
            stat.mtime.getTime() <= modifiedSinceMs)
        ) {
          return res.status(304).end();
        }

        return res.send(fileBuffer);
      },
    );
  };

  return {
    MESSAGE_FILE_LIMITS,
    AVATAR_FILE_LIMITS,
    SAFE_INLINE_MESSAGE_EXTENSIONS,
    ALLOWED_AVATAR_MIME_TYPES,
    uploadFiles,
    uploadAvatar,
    buildDownloadFilename,
    buildAsciiFallbackFilename,
    decodeOriginalFilename,
    inferMimeFromFilename,
    getUploadKind,
    removeUploadedFiles,
    removeStoredFileNames,
    removeAvatarByUrl,
    resolveAvatarDiskPath,
    normalizeAvatarPublicUrl,
    ensureAvatarExists,
    storeAvatarFile,
    isDangerousUploadFile,
    registerUploadRoutes,
    storageEncryption,
  };
}

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
          "SELECT 1 AS found FROM chat_message_files WHERE stored_name = ? LIMIT 1",
          [fileName],
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

      if (
        !raw.startsWith("/api/uploads/avatars/") &&
        !raw.startsWith("/uploads/avatars/")
      )
        return;

      const fileName = path.basename(raw);
      if (!fileName) return;

      const filePath = path.join(avatarUploadRootDir, fileName);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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

    if (Number.isFinite(Number(userId)) && Number(userId) > 0) {
      adminRun("UPDATE users SET avatar_url = NULL WHERE id = ?", [
        Number(userId),
      ]);
      adminSave();
    }
    return null;
  };

  const isDangerousUploadFile = (originalName, mimeType) => {
    const ext = path.extname(String(originalName || "")).toLowerCase();
    const lowerMime = String(mimeType || "").toLowerCase();

    if (DANGEROUS_FILE_EXTENSIONS.has(ext)) return true;
    return DANGEROUS_MIME_SNIPPETS.some((snippet) =>
      lowerMime.includes(snippet),
    );
  };

  const registerUploadRoutes = (app, { express, adminGetRow }) => {
    app.get("/api/uploads/messages/:storedName", (req, res) => {
      const storedName = path.basename(
        String(req.params?.storedName || "").trim(),
      );
      if (!storedName) return res.status(404).end();

      const filePath = path.join(uploadRootDir, storedName);
      if (!fs.existsSync(filePath)) return res.status(404).end();

      const row = adminGetRow(
        "SELECT original_name, mime_type FROM chat_message_files WHERE stored_name = ?",
        [storedName],
      );
      const originalName = buildDownloadFilename(row?.original_name);
      const fallbackName = buildAsciiFallbackFilename(originalName);
      const mimeType = String(row?.mime_type || "").trim();
      const ext = path.extname(storedName).toLowerCase();

      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("Vary", "Accept-Encoding");
      res.setHeader("X-Content-Type-Options", "nosniff");

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

      const fileBuffer = storageEncryption.decryptFileToBuffer(filePath);
      if (!fileBuffer) return res.status(404).end();

      return res.send(fileBuffer);
    });

    app.use(
      "/api/uploads/avatars",
      express.static(avatarUploadRootDir, {
        etag: true,
        lastModified: true,
        maxAge: "30d",
        setHeaders: (res) => {
          res.setHeader("Cache-Control", "public, max-age=2592000");
          res.setHeader("Vary", "Accept-Encoding");
          res.setHeader("X-Content-Type-Options", "nosniff");
        },
      }),
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
    isDangerousUploadFile,
    registerUploadRoutes,
    storageEncryption,
  };
}

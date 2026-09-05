import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(workerDir, "..");

const cleanString = (val) => {
  if (val === undefined || val === null) return "";
  const str = String(val).trim();
  return str.replace(/^["']|["']$/g, "").trim();
};

const toBool = (v) => {
  if (v === undefined || v === null) return true;
  const str = cleanString(v).toLowerCase();
  return str === "true" || str === "1" || v === true;
};

export function resolveDataDir(customDataDir) {
  const cleaned = cleanString(customDataDir || process.env.DATA_DIR);
  if (cleaned) return path.resolve(cleaned);
  if (fs.existsSync("/opt/songbird/data")) return "/opt/songbird/data";
  if (fs.existsSync("/app/data")) return "/app/data";
  if (fs.existsSync(path.join(projectRootDir, "data"))) {
    return path.join(projectRootDir, "data");
  }
  return path.resolve(projectRootDir, "data");
}

export function createStorage({
  driver = process.env.STORAGE_DRIVER || process.env.STORAGE_DRIVE || "local",
  dataDir = process.env.DATA_DIR,
  endpoint = process.env.STORAGE_ENDPOINT,
  region = process.env.STORAGE_REGION,
  bucket = process.env.STORAGE_BUCKET,
  accessKeyId = process.env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY,
  forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE,
} = {}) {
  const normDriver = cleanString(driver).toLowerCase();
  const rawBucket = cleanString(bucket);
  const rawEndpoint = cleanString(endpoint);
  const rawAccessKey = cleanString(accessKeyId);
  const rawSecretKey = cleanString(secretAccessKey);
  const rawRegion = cleanString(region) || "auto";

  const isRemote =
    normDriver === "remote" ||
    normDriver === "s3" ||
    normDriver === "r2" ||
    normDriver === "cloudflare" ||
    (normDriver !== "local" && (Boolean(rawBucket) || Boolean(rawEndpoint)));

  if (!isRemote) {
    const baseDataDir = resolveDataDir(dataDir);
    const resolvedUploadDir = path.join(baseDataDir, "uploads", "messages");
    try {
      fs.mkdirSync(resolvedUploadDir, { recursive: true });
    } catch {
      // Best-effort directory creation
    }

    const resolveLocalPath = (key) => {
      const cleanKey = String(key || "").replace(/^\/+/, "");
      if (!cleanKey) return resolvedUploadDir;
      if (path.isAbsolute(cleanKey)) return cleanKey;
      if (cleanKey.startsWith("uploads/messages/")) {
        return path.join(baseDataDir, cleanKey);
      }
      if (cleanKey.startsWith("messages/")) {
        return path.join(baseDataDir, "uploads", cleanKey);
      }
      return path.join(resolvedUploadDir, cleanKey);
    };

    const findLocalFile = (key) => {
      if (!key) return null;
      const cleanKey = String(key || "").replace(/^\/+/, "");
      if (path.isAbsolute(cleanKey)) {
        return fs.existsSync(cleanKey) ? cleanKey : null;
      }
      const primaryPath = resolveLocalPath(key);
      if (fs.existsSync(primaryPath)) return primaryPath;

      const baseName = path.basename(cleanKey);
      const candidates = [
        path.join(resolvedUploadDir, baseName),
        path.join(baseDataDir, "uploads", cleanKey),
        path.join(baseDataDir, "uploads", baseName),
        path.join(baseDataDir, cleanKey),
      ];

      for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
          return candidate;
        }
      }
      return null;
    };

    const downloadToPath = async (key, destPath) => {
      const foundPath = findLocalFile(key);
      if (!foundPath) {
        const checkedPath = resolveLocalPath(key);
        throw new Error(`Local file not found: ${key} (checked ${checkedPath})`);
      }
      await fs.promises.copyFile(foundPath, destPath);
    };

    const uploadFile = async (key, srcPath, contentType) => {
      const destPath = resolveLocalPath(key);
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.copyFile(srcPath, destPath);
    };

    const deleteFile = async (key) => {
      if (!key) return;
      try {
        const foundPath = findLocalFile(key);
        if (foundPath && fs.existsSync(foundPath)) {
          await fs.promises.unlink(foundPath);
        }
      } catch (err) {
        console.warn(
          "[worker] Failed to delete local file %s:",
          key,
          err?.message || err,
        );
      }
    };

    const exists = async (key) => {
      if (!key) return false;
      return Boolean(findLocalFile(key));
    };

    return {
      type: "local",
      driver: "local",
      uploadDir: resolvedUploadDir,
      downloadToPath,
      uploadFile,
      deleteFile,
      exists,
    };
  }

  const client = new S3Client({
    region: rawRegion,
    ...(rawAccessKey && rawSecretKey
      ? { credentials: { accessKeyId: rawAccessKey, secretAccessKey: rawSecretKey } }
      : {}),
    forcePathStyle: toBool(forcePathStyle),
    ...(rawEndpoint ? { endpoint: rawEndpoint } : {}),
  });

  const downloadToPath = async (key, filePath) => {
    const cleanKey = String(key || "").replace(/^\/+/, "");
    const res = await client.send(
      new GetObjectCommand({ Bucket: rawBucket, Key: cleanKey }),
    );
    await pipeline(res.Body, fs.createWriteStream(filePath));
  };

  const uploadFile = async (key, filePath, contentType) => {
    const cleanKey = String(key || "").replace(/^\/+/, "");
    await client.send(
      new PutObjectCommand({
        Bucket: rawBucket,
        Key: cleanKey,
        Body: fs.createReadStream(filePath),
        ContentType: contentType,
      }),
    );
  };

  const deleteFile = async (key) => {
    if (!key) return;
    try {
      const cleanKey = String(key || "").replace(/^\/+/, "");
      await client.send(
        new DeleteObjectCommand({ Bucket: rawBucket, Key: cleanKey }),
      );
    } catch (err) {
      console.warn(
        "[worker] Failed to delete file %s:",
        key,
        err?.message || err,
      );
    }
  };

  return { type: "remote", downloadToPath, uploadFile, deleteFile };
}

import fs from "fs";
import path from "path";
import { StorageProvider } from "./StorageProvider.js";

export class LocalStorageProvider extends StorageProvider {
  constructor(options = {}) {
    super();
    this.type = "local";
    this.uploadDir =
      options.uploadDir || options.STORAGE_LOCAL_DIR || "./uploads";
    this.uploadUrl =
      options.uploadUrl || options.STORAGE_LOCAL_UPLOAD_URL || "/api/uploads";
    this.downloadBaseUrl =
      options.downloadBaseUrl ||
      options.STORAGE_LOCAL_DOWNLOAD_BASE_URL ||
      "/api/uploads/file";
  }

  /**
   * Get local upload configuration object.
   * @param {string|object} fileInfo
   * @returns {Promise<{type: 'local', uploadUrl: string}>}
   */
  async getUploadUrl(fileInfo) {
    return {
      type: "local",
      uploadUrl: this.uploadUrl,
    };
  }

  /**
   * Get local download URL for a fileKey.
   * @param {string} fileKey
   * @param {object} [options]
   * @returns {Promise<string>}
   */
  async getDownloadUrl(fileKey, options) {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const base = this.downloadBaseUrl.replace(/\/$/, "");
    return `${base}/${cleanKey}`;
  }

  /**
   * Upload raw buffer directly to local storage.
   * @param {string} fileKey
   * @param {Buffer|Uint8Array|string} body
   * @returns {Promise<{key: string}>}
   */
  async uploadBuffer(fileKey, body) {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const filePath = path.isAbsolute(cleanKey)
      ? cleanKey
      : path.join(this.uploadDir, cleanKey);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, body);
    return { key: cleanKey };
  }

  /**
   * Remove file from local disk asynchronously if present.
   * @param {string} fileKey
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileKey) {
    const filePath = path.isAbsolute(fileKey)
      ? fileKey
      : path.join(this.uploadDir, fileKey);

    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (err) {
      if (err.code === "ENOENT") {
        return false;
      }
      throw err;
    }
  }

  /**
   * Check if file exists on disk.
   * @param {string} fileKey
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      await fs.promises.access(this.uploadDir, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  async exists(fileKey) {
    const filePath = path.isAbsolute(fileKey)
      ? fileKey
      : path.join(this.uploadDir, fileKey);

    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Copy local stored file to a destination path.
   * @param {string} fileKey
   * @param {string} destPath
   * @returns {Promise<string>}
   */
  async downloadToPath(fileKey, destPath) {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const srcPath = path.isAbsolute(cleanKey)
      ? cleanKey
      : path.join(this.uploadDir, cleanKey);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.copyFile(srcPath, destPath);
    return destPath;
  }

  /**
   * Save a local file into local storage.
   * @param {string} fileKey
   * @param {string} filePath
   * @returns {Promise<{key: string}>}
   */
  async uploadFile(fileKey, filePath) {
    const cleanKey = String(fileKey || "").replace(/^\//, "");
    const dest = path.isAbsolute(cleanKey)
      ? cleanKey
      : path.join(this.uploadDir, cleanKey);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(filePath, dest);
    return { key: cleanKey };
  }

  /**
   * List local files matching a prefix.
   * @param {string} [prefix=""]
   * @returns {Promise<Array<{ key: string, lastModified?: Date, size?: number }>>}
   */
  async listObjects(prefix = "") {
    const cleanPrefix = String(prefix || "").replace(/^\//, "");
    const targetDir = path.isAbsolute(cleanPrefix)
      ? cleanPrefix
      : path.join(this.uploadDir, cleanPrefix);

    if (!fs.existsSync(targetDir)) {
      return [];
    }

    const items = [];
    const entries = await fs.promises.readdir(targetDir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(entry.parentPath || targetDir, entry.name);
        const rel = path.relative(this.uploadDir, fullPath).replace(/\\/g, "/");
        const stat = await fs.promises.stat(fullPath).catch(() => null);
        items.push({
          key: rel,
          lastModified: stat?.mtime || null,
          size: stat?.size || 0,
        });
      }
    }
    return items;
  }

  /**
   * Copy one stored file to a new key within the same uploadDir.
   * @param {string} srcKey
   * @param {string} destKey
   * @returns {Promise<{key: string}>}
   */
  async copyFile(srcKey, destKey) {
    const cleanSrc = String(srcKey || "").replace(/^\//, "");
    const cleanDest = String(destKey || "").replace(/^\//, "");
    if (!cleanSrc || !cleanDest) {
      throw new Error("copyFile requires srcKey and destKey.");
    }
    const srcPath = path.isAbsolute(cleanSrc)
      ? cleanSrc
      : path.join(this.uploadDir, cleanSrc);
    const destPath = path.isAbsolute(cleanDest)
      ? cleanDest
      : path.join(this.uploadDir, cleanDest);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.copyFile(srcPath, destPath);
    return { key: cleanDest };
  }
}

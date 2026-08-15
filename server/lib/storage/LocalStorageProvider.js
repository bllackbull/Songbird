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
}

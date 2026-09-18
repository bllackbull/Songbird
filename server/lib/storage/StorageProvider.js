export class StorageProvider {
  /**
   * Get an upload target for a file.
   * @param {string|object} fileInfo
   * @returns {Promise<{type: string, uploadUrl: string}>}
   */
  async getUploadUrl(fileInfo) {
    throw new Error("getUploadUrl not implemented");
  }

  /**
   * Get a download URL for a stored file.
   * @param {string} fileKey
   * @param {object} [options]
   * @returns {Promise<string>}
   */
  async getDownloadUrl(fileKey, options) {
    throw new Error("getDownloadUrl not implemented");
  }

  /**
   * Delete a file by fileKey.
   * @param {string} fileKey
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileKey) {
    throw new Error("deleteFile not implemented");
  }

  /**
   * Check if a file exists by fileKey.
   * @param {string} fileKey
   * @returns {Promise<boolean>}
   */
  async exists(fileKey) {
    throw new Error("exists not implemented");
  }

  /**
   * Download a file from storage to local destination path.
   * @param {string} fileKey
   * @param {string} destPath
   * @returns {Promise<string>}
   */
  async downloadToPath(fileKey, destPath) {
    throw new Error("downloadToPath not implemented");
  }

  /**
   * Upload a local file path to storage.
   * @param {string} fileKey
   * @param {string} filePath
   * @param {string} [contentType]
   * @returns {Promise<{key: string}>}
   */
  async uploadFile(fileKey, filePath, contentType) {
    throw new Error("uploadFile not implemented");
  }

  /**
   * List object keys matching a prefix.
   * @param {string} [prefix]
   * @returns {Promise<Array<{ key: string, lastModified?: Date, size?: number }>>}
   */
  async listObjects(prefix = "") {
    throw new Error("listObjects not implemented");
  }

  /**
   * Read-only reachability probe for admin health checks.
   * Resolves true when the backing store answers, rejects otherwise.
   * Must not write or mutate anything.
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    throw new Error("checkHealth not implemented");
  }

  /**
   * Server-side copy of one stored object to a new key.
   * Used by the legacy storage-layout migration
   * (avatars/* + uploads/* → uploads/avatars/* + uploads/messages/*).
   * @param {string} srcKey
   * @param {string} destKey
   * @returns {Promise<{key: string}>}
   */
  async copyFile(srcKey, destKey) {
    throw new Error("copyFile not implemented");
  }
}

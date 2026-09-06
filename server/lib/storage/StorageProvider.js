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
}

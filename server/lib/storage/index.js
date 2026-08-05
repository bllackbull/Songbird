import { StorageProvider } from "./StorageProvider.js";
import { LocalStorageProvider } from "./LocalStorageProvider.js";
import { S3StorageProvider } from "./S3StorageProvider.js";

export { StorageProvider, LocalStorageProvider, S3StorageProvider };

/**
 * Factory to create a storage provider instance based on config.
 * @param {object} [config={}]
 * @returns {StorageProvider}
 */
export function createStorageProvider(config = {}) {
  const driver = (
    config.STORAGE_DRIVER ||
    config.driver ||
    "local"
  ).toLowerCase();

  if (driver === "local") {
    return new LocalStorageProvider(config);
  }

  if (driver === "s3") {
    return new S3StorageProvider(config);
  }

  throw new Error(`Unsupported storage driver: ${driver}`);
}

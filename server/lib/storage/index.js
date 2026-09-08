import { StorageProvider } from "./StorageProvider.js";
import { LocalStorageProvider } from "./LocalStorageProvider.js";
import { RemoteStorageProvider } from "./RemoteStorageProvider.js";

export { StorageProvider, LocalStorageProvider, RemoteStorageProvider };

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

  if (driver === "remote" || driver === "s3") {
    return new RemoteStorageProvider(config);
  }

  throw new Error(`Unsupported storage driver: ${driver}`);
}

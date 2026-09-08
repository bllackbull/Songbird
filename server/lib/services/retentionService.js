/**
 * Retention & File Reconciliation Domain Service
 *
 * Idempotent maintenance service for missing-file detection and message file retention.
 */

export function createRetentionService(dbApi) {
  const {
    cleanupMissingMessageFiles,
    deleteExpiredMessages,
  } = dbApi;

  /**
   * Run retention cleanup for expired messages and missing disk files.
   */
  function runRetentionCleanup() {
    let missingFilesCleaned = 0;
    let expiredMessagesDeleted = 0;

    if (typeof cleanupMissingMessageFiles === "function") {
      const cleaned = cleanupMissingMessageFiles();
      missingFilesCleaned = Array.isArray(cleaned) ? cleaned.length : Number(cleaned || 0);
    }

    if (typeof deleteExpiredMessages === "function") {
      const deleted = deleteExpiredMessages();
      expiredMessagesDeleted = Number(deleted || 0);
    }

    return {
      success: true,
      missingFilesCleaned,
      expiredMessagesDeleted,
    };
  }

  return {
    runRetentionCleanup,
  };
}

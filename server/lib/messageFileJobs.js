export function createMessageFileJobs({
  adminGetAll,
  adminGetRow,
  adminRun,
  adminSave,
  listMessageFilesByMessageIds,
  removeStoredFileNames,
  uploadRootDir,
  fs,
  path,
  getSetting,
}) {
  // Always read the live setting instead of a value captured once at startup,
  // so admin-panel changes to retention take effect without a restart.
  const getMessageFileRetentionDays = () =>
    Number(getSetting("MESSAGE_FILE_RETENTION")) || 0;
  const chunkArray = (items = [], size = 500) => {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  };

  const resolveSharedMessageIdsByStoredNames = (storedNames = []) => {
    const normalized = Array.from(
      new Set(
        (Array.isArray(storedNames) ? storedNames : [])
          .map((name) => path.basename(String(name || "").trim()))
          .filter(Boolean),
      ),
    );
    if (!normalized.length) return [];
    const placeholders = normalized.map(() => "?").join(", ");
    const rawRes = adminGetAll(
      `SELECT DISTINCT message_id
       FROM chat_message_files
       WHERE stored_name IN (${placeholders})`,
      normalized,
    );
    const processRows = (rows) =>
      (rows || []).map((row) => row?.message_id).filter(Boolean);

    return rawRes && typeof rawRes.then === "function"
      ? rawRes.then(processRows)
      : processRows(rawRes);
  };

  const cleanupMissingMessageFiles = (messageIds = []) => {
    const normalized = Array.from(
      new Set((Array.isArray(messageIds) ? messageIds : []).filter(Boolean)),
    );

    if (!normalized.length)
      return {
        deletedMessageIds: [],
        deletedByChat: new Map(),
        changed: false,
      };

    const rawRows = listMessageFilesByMessageIds(normalized);
    const processRows = (rows) => {
      const safeRows = rows || [];
      if (!safeRows.length)
        return {
          deletedMessageIds: [],
          deletedByChat: new Map(),
          changed: false,
        };

      const missingMessageIds = new Set();

      safeRows.forEach((row) => {
        const stored = path.basename(String(row.stored_name || "").trim());
        if (!stored) return;

        const filePath = path.join(uploadRootDir, stored);

        if (!fs.existsSync(filePath)) {
          missingMessageIds.add(row.message_id);
        }
      });

      if (!missingMessageIds.size) {
        return {
          deletedMessageIds: [],
          deletedByChat: new Map(),
          changed: false,
        };
      }

      const initialMessageIds = Array.from(missingMessageIds);
      const initialPlaceholders = initialMessageIds.map(() => "?").join(", ");
      const rawAllFiles = adminGetAll(
        `SELECT stored_name FROM chat_message_files WHERE message_id IN (${initialPlaceholders})`,
        initialMessageIds,
      );
      const processAllFiles = (allFilesRows) => {
        const storedNames = (allFilesRows || []).map((row) => row.stored_name);
        const rawTargetIds = resolveSharedMessageIdsByStoredNames(storedNames);
        const processTargetIds = (targetMessageIds) => {
          const uniqueTargetIds = Array.from(new Set(targetMessageIds));
          const placeholders = uniqueTargetIds.map(() => "?").join(", ");
          const rawPairs = adminGetAll(
            `SELECT id, chat_id FROM chat_messages WHERE id IN (${placeholders})`,
            uniqueTargetIds,
          );
          const processPairs = (messageChatPairs) => {
            const deletedByChat = new Map();
            (messageChatPairs || []).forEach((row) => {
              const chatId = row?.chat_id;
              const messageId = row?.id;
              if (!chatId || !messageId) return;
              const list = deletedByChat.get(chatId) || [];
              list.push(messageId);
              deletedByChat.set(chatId, list);
            });

            adminRun("BEGIN");
            try {
              chunkArray(uniqueTargetIds, 500).forEach((chunk) => {
                const chunkPlaceholders = chunk.map(() => "?").join(", ");

                adminRun(
                  `DELETE FROM chat_message_files WHERE message_id IN (${chunkPlaceholders})`,
                  chunk,
                );

                adminRun(
                  `DELETE FROM chat_messages WHERE id IN (${chunkPlaceholders})`,
                  chunk,
                );
              });
              adminRun("COMMIT");
            } catch (error) {
              adminRun("ROLLBACK");
              throw error;
            }

            removeStoredFileNames(storedNames);
            adminSave();

            return {
              deletedMessageIds: uniqueTargetIds,
              deletedByChat,
              changed: true,
            };
          };
          return rawPairs && typeof rawPairs.then === "function"
            ? rawPairs.then(processPairs)
            : processPairs(rawPairs);
        };
        return rawTargetIds && typeof rawTargetIds.then === "function"
          ? rawTargetIds.then(processTargetIds)
          : processTargetIds(rawTargetIds);
      };
      return rawAllFiles && typeof rawAllFiles.then === "function"
        ? rawAllFiles.then(processAllFiles)
        : processAllFiles(rawAllFiles);
    };

    return rawRows && typeof rawRows.then === "function"
      ? rawRows.then(processRows)
      : processRows(rawRows);
  };

  const cleanupExpiredMessageFiles = () => {
    if (getMessageFileRetentionDays() <= 0) {
      return { removedMessages: 0, removedFiles: 0 };
    }

    const nowIso = new Date().toISOString();

    const rawRows = adminGetAll(
      `SELECT DISTINCT stored_name
       FROM chat_message_files
       WHERE expires_at IS NOT NULL AND expires_at != '' AND julianday(expires_at) <= julianday(?)`,
      [nowIso],
    );
    const processRows = (rows) => {
      const storedNames = (rows || []).map((row) => row.stored_name);
      const rawMsgIds = resolveSharedMessageIdsByStoredNames(storedNames);
      const processMsgIds = (messageIds) => {
        const uniqueMsgIds = Array.from(new Set(messageIds));
        if (!uniqueMsgIds.length) {
          return { removedMessages: 0, removedFiles: 0 };
        }

        const placeholders = uniqueMsgIds.map(() => "?").join(", ");
        const rawFiles = adminGetAll(
          `SELECT stored_name FROM chat_message_files WHERE message_id IN (${placeholders})`,
          uniqueMsgIds,
        );
        const processFileRows = (fileRows) => {
          const allStoredNames = (fileRows || []).map((row) => row.stored_name);

          adminRun("BEGIN");
          try {
            chunkArray(uniqueMsgIds, 500).forEach((chunk) => {
              const chunkPlaceholders = chunk.map(() => "?").join(", ");

              adminRun(
                `DELETE FROM chat_message_files WHERE message_id IN (${chunkPlaceholders})`,
                chunk,
              );

              adminRun(
                `DELETE FROM chat_messages WHERE id IN (${chunkPlaceholders})`,
                chunk,
              );
            });
            adminRun("COMMIT");
          } catch (error) {
            adminRun("ROLLBACK");
            throw error;
          }

          removeStoredFileNames(allStoredNames);
          adminSave();

          return {
            removedMessages: uniqueMsgIds.length,
            removedFiles: allStoredNames.length,
          };
        };
        return rawFiles && typeof rawFiles.then === "function"
          ? rawFiles.then(processFileRows)
          : processFileRows(rawFiles);
      };
      return rawMsgIds && typeof rawMsgIds.then === "function"
        ? rawMsgIds.then(processMsgIds)
        : processMsgIds(rawMsgIds);
    };

    return rawRows && typeof rawRows.then === "function"
      ? rawRows.then(processRows)
      : processRows(rawRows);
  };

  const backfillMessageFileExpiry = () => {
    const nowDays = getMessageFileRetentionDays();
    if (nowDays <= 0) return 0;

    const rawRow = adminGetRow(
      `SELECT COUNT(*) AS n
       FROM chat_message_files
       WHERE (expires_at IS NULL OR expires_at = '')`,
    );
    const processRow = (row) => {
      const pending = Number(row?.n || 0);
      if (!pending) return 0;

      adminRun(
        `UPDATE chat_message_files
         SET expires_at = datetime(created_at, '+' || ? || ' days')
         WHERE (expires_at IS NULL OR expires_at = '')`,
        [nowDays],
      );

      adminSave();

      return pending;
    };

    return rawRow && typeof rawRow.then === "function"
      ? rawRow.then(processRow)
      : processRow(rawRow);
  };

  const removeAllMessageUploads = () => {
    try {
      if (fs.existsSync(uploadRootDir)) {
        fs.rmSync(uploadRootDir, { recursive: true, force: true });
      }

      fs.mkdirSync(uploadRootDir, { recursive: true });
    } catch (_) {
      // ignore
    }
  };

  const computeExpiryIso = (
    createdAt = new Date(),
    days = getMessageFileRetentionDays(),
  ) => {
    const safeDays = Number(days || 0);
    if (!Number.isFinite(safeDays) || safeDays <= 0) return null;

    const base = createdAt instanceof Date ? createdAt : new Date(createdAt);
    const expiry = new Date(base.getTime() + safeDays * 24 * 60 * 60 * 1000);

    return expiry.toISOString();
  };

  return {
    chunkArray,
    cleanupMissingMessageFiles,
    cleanupExpiredMessageFiles,
    backfillMessageFileExpiry,
    removeAllMessageUploads,
    computeExpiryIso,
  };
}

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
  messageFileRetentionDays,
}) {
  const chunkArray = (items = [], size = 500) => {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  };

  const cleanupMissingMessageFiles = (messageIds = []) => {
    const normalized = Array.from(
      new Set(
        (Array.isArray(messageIds) ? messageIds : [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );

    if (!normalized.length)
      return {
        deletedMessageIds: [],
        deletedByChat: new Map(),
        changed: false,
      };

    const rows = listMessageFilesByMessageIds(normalized);
    if (!rows.length)
      return {
        deletedMessageIds: [],
        deletedByChat: new Map(),
        changed: false,
      };

    const missingMessageIds = new Set();

    rows.forEach((row) => {
      const stored = path.basename(String(row.stored_name || "").trim());
      if (!stored) return;

      const filePath = path.join(uploadRootDir, stored);

      if (!fs.existsSync(filePath)) {
        missingMessageIds.add(Number(row.message_id));
      }
    });

    if (!missingMessageIds.size) {
      return {
        deletedMessageIds: [],
        deletedByChat: new Map(),
        changed: false,
      };
    }

    const targetMessageIds = Array.from(missingMessageIds);
    const placeholders = targetMessageIds.map(() => "?").join(", ");
    const allFilesRows = adminGetAll(
      `SELECT stored_name FROM chat_message_files WHERE message_id IN (${placeholders})`,
      targetMessageIds,
    );
    const storedNames = allFilesRows.map((row) => row.stored_name);
    const messageChatPairs = adminGetAll(
      `SELECT id, chat_id FROM chat_messages WHERE id IN (${placeholders})`,
      targetMessageIds,
    );
    const deletedByChat = new Map();
    messageChatPairs.forEach((row) => {
      const chatId = Number(row?.chat_id || 0);
      const messageId = Number(row?.id || 0);
      if (!chatId || !messageId) return;
      const list = deletedByChat.get(chatId) || [];
      list.push(messageId);
      deletedByChat.set(chatId, list);
    });

    adminRun("BEGIN");
    try {
      chunkArray(targetMessageIds, 500).forEach((chunk) => {
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
      deletedMessageIds: targetMessageIds,
      deletedByChat,
      changed: true,
    };
  };

  const cleanupExpiredMessageFiles = () => {
    if (messageFileRetentionDays <= 0) {
      return { removedMessages: 0, removedFiles: 0 };
    }

    const nowIso = new Date().toISOString();

    const rows = adminGetAll(
      `SELECT DISTINCT message_id
       FROM chat_message_files
       WHERE expires_at IS NOT NULL AND expires_at != '' AND julianday(expires_at) <= julianday(?)`,
      [nowIso],
    );

    const messageIds = rows
      .map((row) => Number(row.message_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!messageIds.length) {
      return { removedMessages: 0, removedFiles: 0 };
    }

    const placeholders = messageIds.map(() => "?").join(", ");
    const fileRows = adminGetAll(
      `SELECT stored_name FROM chat_message_files WHERE message_id IN (${placeholders})`,
      messageIds,
    );
    const storedNames = fileRows.map((row) => row.stored_name);

    adminRun("BEGIN");
    try {
      chunkArray(messageIds, 500).forEach((chunk) => {
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
      removedMessages: messageIds.length,
      removedFiles: storedNames.length,
    };
  };

  const backfillMessageFileExpiry = () => {
    if (messageFileRetentionDays <= 0) return 0;

    const nowDays = Number(messageFileRetentionDays);

    const row = adminGetRow(
      `SELECT COUNT(*) AS n
       FROM chat_message_files
       WHERE (expires_at IS NULL OR expires_at = '')`,
    );

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
    days = messageFileRetentionDays,
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

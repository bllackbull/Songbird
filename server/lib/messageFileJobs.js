import { dbKnex } from "../db/knex.js";

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
  storageProvider,
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
    const rawRes = adminGetAll(
      dbKnex("chat_message_files")
        .distinct("message_id")
        .whereIn("stored_name", normalized),
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
        const driver = String(row.storage_driver || "local").toLowerCase();
        if (driver === "remote" || driver === "s3") return;

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
      const rawAllFiles = adminGetAll(
        dbKnex("chat_message_files")
          .select("stored_name")
          .whereIn("message_id", initialMessageIds),
      );
      const processAllFiles = (allFilesRows) => {
        const storedNames = (allFilesRows || []).map((row) => row.stored_name);
        const rawTargetIds = resolveSharedMessageIdsByStoredNames(storedNames);
        const processTargetIds = (targetMessageIds) => {
          const uniqueTargetIds = Array.from(new Set(targetMessageIds));
          const rawPairs = adminGetAll(
            dbKnex("chat_messages")
              .select("id", "chat_id")
              .whereIn("id", uniqueTargetIds),
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
                adminRun(
                  dbKnex("chat_message_files").whereIn("message_id", chunk).del(),
                );

                adminRun(
                  dbKnex("chat_messages").whereIn("id", chunk).del(),
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

  const collectRemoteKeysFromFileRows = (fileRows = []) => {
    const keys = new Set();
    (fileRows || []).forEach((row) => {
      const driver = String(
        row?.storage_driver ?? row?.storageDriver ?? "local",
      ).toLowerCase();
      if (driver !== "remote" && driver !== "s3") return;

      const storageKey = String(
        row?.storage_key ?? row?.storageKey ?? "",
      ).trim();
      if (storageKey) {
        keys.add(storageKey);
      } else {
        const stored = path.basename(String(row?.stored_name || "").trim());
        if (stored) keys.add(`uploads/messages/${stored}`);
      }

      const thumbKey = String(
        row?.thumb_storage_key ?? row?.thumbStorageKey ?? "",
      ).trim();
      if (thumbKey) keys.add(thumbKey);
    });
    return Array.from(keys);
  };

  const activeStorageProviderDelete = (provider) =>
    provider && typeof provider.deleteFile === "function"
      ? provider.deleteFile.bind(provider)
      : null;

  const deleteRemoteKeysBestEffort = async (keys = [], activeProvider) => {
    if (
      !keys.length ||
      !activeProvider ||
      typeof activeStorageProviderDelete(activeProvider) !== "function"
    ) {
      return [];
    }
    // Re-check the DB after the message/file rows were deleted so a key
    // shared with a non-expired message is never removed from the bucket.
    let stillReferenced = new Set();
    try {
      const rawRemaining = adminGetAll(
        dbKnex("chat_message_files")
          .select("storage_key", "thumb_storage_key")
          .where(function () {
            this.whereIn("storage_key", keys).orWhereIn(
              "thumb_storage_key",
              keys,
            );
          }),
      );
      const remaining =
        rawRemaining && typeof rawRemaining.then === "function"
          ? await rawRemaining
          : rawRemaining;
      (remaining || []).forEach((row) => {
        const sk = String(row?.storage_key || "").trim();
        if (sk) stillReferenced.add(sk);
        const tk = String(row?.thumb_storage_key || "").trim();
        if (tk) stillReferenced.add(tk);
      });
    } catch (_) {
      // Best effort — if the check fails, fall through and attempt deletion
      // of the keys collected from the expired rows.
    }

    const toDelete = keys.filter((key) => !stillReferenced.has(key));
    const deleted = [];
    const doDelete = activeStorageProviderDelete(activeProvider);
    for (const key of toDelete) {
      try {
        await doDelete(key);
        deleted.push(key);
      } catch (_) {
        // best effort per object — a missing object or transient S3 error
        // must not fail retention cleanup
      }
    }
    return deleted;
  };

  const removeLocalThumbFiles = (fileRows = []) => {
    const thumbKeys = new Set();
    (fileRows || []).forEach((row) => {
      const driver = String(
        row?.storage_driver ?? row?.storageDriver ?? "local",
      ).toLowerCase();
      if (driver === "remote" || driver === "s3") return;
      const thumbKey = String(
        row?.thumb_storage_key ?? row?.thumbStorageKey ?? "",
      ).trim();
      if (thumbKey) thumbKeys.add(thumbKey);
    });
    if (!thumbKeys.size) return 0;

    // Don't remove a thumb still referenced by a live (non-expired) row.
    const stillReferenced = new Set();
    try {
      const rawRemaining = adminGetAll(
        dbKnex("chat_message_files")
          .select("thumb_storage_key")
          .whereIn("thumb_storage_key", Array.from(thumbKeys)),
      );
      if (rawRemaining && typeof rawRemaining.then === "function") {
      } else {
        (rawRemaining || []).forEach((row) => {
          const key = String(row?.thumb_storage_key || "").trim();
          if (key) stillReferenced.add(key);
        });
      }
    } catch (_) {
      // best effort — fall through and attempt deletion
    }

    let removed = 0;
    thumbKeys.forEach((thumbKey) => {
      if (stillReferenced.has(thumbKey)) return;
      const base = path.basename(String(thumbKey));
      const candidates =
        base && base !== String(thumbKey)
          ? [
              path.join(uploadRootDir, String(thumbKey)),
              path.join(uploadRootDir, base),
            ]
          : [path.join(uploadRootDir, String(thumbKey))];
      for (const candidate of candidates) {
        try {
          if (fs.existsSync(candidate)) {
            fs.unlinkSync(candidate);
            removed += 1;
            break;
          }
        } catch (_) {
          // best effort cleanup
          break;
        }
      }
    });
    return removed;
  };

  const cleanupExpiredMessageFiles = (options = {}) => {
    if (getMessageFileRetentionDays() <= 0) {
      return { removedMessages: 0, removedFiles: 0 };
    }

    const nowIso = new Date().toISOString();

    const rawRows = adminGetAll(
      dbKnex("chat_message_files")
        .distinct("stored_name")
        .whereNotNull("expires_at")
        .where("expires_at", "!=", "")
        .whereRaw("julianday(expires_at) <= julianday(?)", [nowIso]),
    );
    const processRows = (rows) => {
      const storedNames = (rows || []).map((row) => row.stored_name);
      const rawMsgIds = resolveSharedMessageIdsByStoredNames(storedNames);
      const processMsgIds = (messageIds) => {
        const uniqueMsgIds = Array.from(new Set(messageIds));
        if (!uniqueMsgIds.length) {
          return { removedMessages: 0, removedFiles: 0 };
        }

        const rawFiles = adminGetAll(
          dbKnex("chat_message_files")
            .select(
              "stored_name",
              "storage_key",
              "storage_driver",
              "thumb_storage_key",
            )
            .whereIn("message_id", uniqueMsgIds),
        );
        const processFileRows = (fileRows) => {
          const safeFileRows = fileRows || [];
          const allStoredNames = safeFileRows.map((row) => row.stored_name);
          const remoteKeys = collectRemoteKeysFromFileRows(safeFileRows);
          const activeProvider =
            (options && options.storageProvider) || storageProvider;

          adminRun("BEGIN");
          try {
            chunkArray(uniqueMsgIds, 500).forEach((chunk) => {
              adminRun(
                dbKnex("chat_message_files").whereIn("message_id", chunk).del(),
              );

              adminRun(
                dbKnex("chat_messages").whereIn("id", chunk).del(),
              );
            });
            adminRun("COMMIT");
          } catch (error) {
            adminRun("ROLLBACK");
            throw error;
          }

          removeStoredFileNames(allStoredNames);
          const removedLocalThumbs = removeLocalThumbFiles(safeFileRows);
          adminSave();

          const result = {
            removedMessages: uniqueMsgIds.length,
            removedFiles: allStoredNames.length,
            removedLocalThumbs,
          };

          if (!remoteKeys.length || !activeStorageProviderDelete(activeProvider)) {
            return result;
          }

          return deleteRemoteKeysBestEffort(remoteKeys, activeProvider).then(
            (deletedKeys) => ({
              ...result,
              removedRemoteFiles: deletedKeys.length,
              removedRemoteKeys: deletedKeys,
            }),
          );
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
      dbKnex("chat_message_files")
        .count("* as n")
        .where(function () {
          this.whereNull("expires_at").orWhere("expires_at", "");
        })
        .first(),
    );
    const processRow = (row) => {
      const pending = Number(row?.n || 0);
      if (!pending) return 0;

      adminRun(
        dbKnex("chat_message_files")
          .where(function () {
            this.whereNull("expires_at").orWhere("expires_at", "");
          })
          .update({
            expires_at: dbKnex.raw("datetime(created_at, '+' || ? || ' days')", [nowDays]),
          }),
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

  const pruneOrphanRemoteObjects = async (options = {}) => {
    const {
      maxAgeMs = 60 * 60 * 1000,
      storageProvider: activeStorageProvider = storageProvider,
      storageKeys: customKeys = null,
    } = options;

    const cutoffIso = new Date(Date.now() - maxAgeMs).toISOString();

    let keysToCheck = [];

    if (Array.isArray(customKeys) && customKeys.length > 0) {
      keysToCheck = customKeys;
    } else {
      const rawPending = adminGetAll(
        dbKnex("pending_presigned_uploads")
          .select("storage_key")
          .where("created_at", "<=", cutoffIso),
      );
      const pendingRows =
        (rawPending && typeof rawPending.then === "function"
          ? await rawPending
          : rawPending) || [];

      keysToCheck = pendingRows.map((r) => r.storage_key).filter(Boolean);
    }

    if (!keysToCheck.length) {
      return { prunedCount: 0, prunedKeys: [] };
    }

    const rawReferenced = adminGetAll(
      dbKnex("chat_message_files")
        .select("storage_key")
        .whereIn("storage_key", keysToCheck),
    );
    const referencedRows =
      (rawReferenced && typeof rawReferenced.then === "function"
        ? await rawReferenced
        : rawReferenced) || [];

    const referencedKeysSet = new Set(
      (referencedRows || []).map((r) => r.storage_key).filter(Boolean),
    );

    const avatarKeysToCheck = keysToCheck.filter(
      (k) =>
        k.startsWith("uploads/avatars/") ||
        k.startsWith("avatars/") ||
        k.includes("avatar-"),
    );
    if (avatarKeysToCheck.length) {
      const rawUsers = adminGetAll(
        dbKnex("users").select("avatar_url").whereNotNull("avatar_url"),
      );
      const userRows =
        (rawUsers && typeof rawUsers.then === "function"
          ? await rawUsers
          : rawUsers) || [];
      userRows.forEach((row) => {
        const fn = path.basename(String(row?.avatar_url || "").trim());
        if (fn) {
          avatarKeysToCheck.forEach((k) => {
            if (k.endsWith(fn)) referencedKeysSet.add(k);
          });
        }
      });

      const rawChats = adminGetAll(
        dbKnex("chats").select("group_avatar_url").whereNotNull("group_avatar_url"),
      );
      const chatRows =
        (rawChats && typeof rawChats.then === "function"
          ? await rawChats
          : rawChats) || [];
      chatRows.forEach((row) => {
        const fn = path.basename(String(row?.group_avatar_url || "").trim());
        if (fn) {
          avatarKeysToCheck.forEach((k) => {
            if (k.endsWith(fn)) referencedKeysSet.add(k);
          });
        }
      });

      try {
        const rawSources = adminGetAll(
          dbKnex("remote_channel_sources")
            .select("source_avatar_url")
            .whereNotNull("source_avatar_url"),
        );
        const sourceRows =
          (rawSources && typeof rawSources.then === "function"
            ? await rawSources
            : rawSources) || [];
        sourceRows.forEach((row) => {
          const fn = path.basename(String(row?.source_avatar_url || "").trim());
          if (fn) {
            avatarKeysToCheck.forEach((k) => {
              if (k.endsWith(fn)) referencedKeysSet.add(k);
            });
          }
        });
      } catch (_) {}
    }

    const orphanKeys = keysToCheck.filter((key) => !referencedKeysSet.has(key));
    const claimedKeys = keysToCheck.filter((key) => referencedKeysSet.has(key));

    if (claimedKeys.length) {
      adminRun(
        dbKnex("pending_presigned_uploads")
          .whereIn("storage_key", claimedKeys)
          .del(),
      );
    }

    const prunedKeys = [];
    for (const key of orphanKeys) {
      try {
        if (
          activeStorageProvider &&
          typeof activeStorageProvider.deleteFile === "function"
        ) {
          await activeStorageProvider.deleteFile(key);
        }
        prunedKeys.push(key);
      } catch (_) {
        // best effort cleanup per object
      }
    }

    if (prunedKeys.length) {
      adminRun(
        dbKnex("pending_presigned_uploads")
          .whereIn("storage_key", prunedKeys)
          .del(),
      );
      if (typeof adminSave === "function") adminSave();
    }

    return {
      prunedCount: prunedKeys.length,
      prunedKeys,
    };
  };

  const pruneOrphanAvatarObjects = async (options = {}) => {
    const {
      maxAgeMs = 60 * 60 * 1000,
      storageProvider: activeStorageProvider = storageProvider,
    } = options;

    if (
      !activeStorageProvider ||
      (activeStorageProvider.type !== "remote" &&
        activeStorageProvider.type !== "s3") ||
      typeof activeStorageProvider.listObjects !== "function"
    ) {
      return { prunedCount: 0, prunedKeys: [] };
    }

    const s3ObjectsNew =
      (await activeStorageProvider.listObjects("uploads/avatars/")) || [];
    // Legacy prefix from before uploads/avatars unification — still swept
    // so old orphan avatars don't linger forever.
    let s3ObjectsLegacy = [];
    try {
      s3ObjectsLegacy =
        (await activeStorageProvider.listObjects("avatars/")) || [];
    } catch (_) {
      s3ObjectsLegacy = [];
    }
    const seenKeys = new Set();
    const s3Objects = [...s3ObjectsNew, ...s3ObjectsLegacy].filter((obj) => {
      if (!obj?.key || seenKeys.has(obj.key)) return false;
      seenKeys.add(obj.key);
      return true;
    });
    if (!s3Objects || !s3Objects.length) {
      return { prunedCount: 0, prunedKeys: [] };
    }

    const cutoffTime = Date.now() - maxAgeMs;
    const candidates = s3Objects.filter((obj) => {
      if (obj.lastModified && obj.lastModified.getTime() > cutoffTime) {
        return false;
      }
      return true;
    });

    if (!candidates.length) {
      return { prunedCount: 0, prunedKeys: [] };
    }

    const activeFileNames = new Set();

    const rawUsers = adminGetAll(
      dbKnex("users").select("avatar_url").whereNotNull("avatar_url"),
    );
    const userRows =
      (rawUsers && typeof rawUsers.then === "function"
        ? await rawUsers
        : rawUsers) || [];
    userRows.forEach((r) => {
      const fn = path.basename(String(r?.avatar_url || "").trim());
      if (fn) activeFileNames.add(fn);
    });

    const rawChats = adminGetAll(
      dbKnex("chats").select("group_avatar_url").whereNotNull("group_avatar_url"),
    );
    const chatRows =
      (rawChats && typeof rawChats.then === "function"
        ? await rawChats
        : rawChats) || [];
    chatRows.forEach((r) => {
      const fn = path.basename(String(r?.group_avatar_url || "").trim());
      if (fn) activeFileNames.add(fn);
    });

    try {
      const rawSources = adminGetAll(
        dbKnex("remote_channel_sources")
          .select("source_avatar_url")
          .whereNotNull("source_avatar_url"),
      );
      const sourceRows =
        (rawSources && typeof rawSources.then === "function"
          ? await rawSources
          : rawSources) || [];
      sourceRows.forEach((r) => {
        const fn = path.basename(String(r?.source_avatar_url || "").trim());
        if (fn) activeFileNames.add(fn);
      });
    } catch (_) {}

    const prunedKeys = [];
    for (const obj of candidates) {
      const fileName = path.basename(obj.key);
      if (fileName && !activeFileNames.has(fileName)) {
        try {
          if (typeof activeStorageProvider.deleteFile === "function") {
            await activeStorageProvider.deleteFile(obj.key);
          }
          prunedKeys.push(obj.key);
        } catch (_) {}
      }
    }

    return {
      prunedCount: prunedKeys.length,
      prunedKeys,
    };
  };

  return {
    chunkArray,
    cleanupMissingMessageFiles,
    cleanupExpiredMessageFiles,
    backfillMessageFileExpiry,
    removeAllMessageUploads,
    computeExpiryIso,
    pruneOrphanRemoteObjects,
    pruneOrphanAvatarObjects,
  };
}

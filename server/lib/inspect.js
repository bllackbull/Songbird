export function createInspector({ fs, dataDir, adminGetRow, adminGetAll }) {
  const getDiskUsageInfo = () => {
    try {
      if (typeof fs.statfsSync !== "function") return null;

      const stat = fs.statfsSync(dataDir);
      const blockSize = Number(stat.bsize || 0);
      const blocks = Number(stat.blocks || 0);
      const freeBlocks = Number(stat.bavail || stat.bfree || 0);
      const totalBytes = blockSize * blocks;
      const freeBytes = blockSize * freeBlocks;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

      return {
        totalBytes,
        usedBytes,
        freeBytes,
        usedPercent,
        freePercent: Math.max(0, 100 - usedPercent),
      };
    } catch (_) {
      return null;
    }
  };

  const buildInspectSnapshot = (kind = "all", limit = 25) => {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 25));
    const mode = String(kind || "all").toLowerCase();

    const counts = {
      users: Number(adminGetRow("SELECT COUNT(*) AS n FROM users")?.n || 0),
      chats: Number(adminGetRow("SELECT COUNT(*) AS n FROM chats")?.n || 0),
      messages: Number(
        adminGetRow("SELECT COUNT(*) AS n FROM chat_messages")?.n || 0,
      ),
      files: Number(
        adminGetRow("SELECT COUNT(*) AS n FROM chat_message_files")?.n || 0,
      ),
    };

    const snapshot = {
      kind: mode,
      limit: safeLimit,
      counts,
      disk: getDiskUsageInfo(),
    };

    if (mode === "all" || mode === "user") {
      snapshot.users = adminGetAll(
        `SELECT id, username, nickname, status, banned, avatar_url, created_at
         FROM users
         ORDER BY id ASC
         LIMIT ?`,
        [safeLimit],
      );
    }

    if (mode === "all" || mode === "chat") {
      snapshot.chats = adminGetAll(
        `SELECT c.id, c.type, c.name,
                (SELECT COUNT(*) FROM chat_members cm WHERE cm.chat_id = c.id) AS members,
                (SELECT GROUP_CONCAT(cm.user_id, ',') FROM chat_members cm WHERE cm.chat_id = c.id ORDER BY cm.user_id ASC) AS member_ids_csv,
                (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = c.id) AS messages,
                c.created_at
         FROM chats c
         ORDER BY c.id ASC
         LIMIT ?`,
        [safeLimit],
      ).map((chat) => ({
        ...chat,
        member_ids: String(chat.member_ids_csv || "")
          .split(",")
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      }));
    }

    if (mode === "all" || mode === "file") {
      snapshot.messageFiles = adminGetAll(
        `SELECT cmf.id, cmf.message_id, cm.chat_id, cm.user_id, cmf.kind, cmf.original_name, cmf.stored_name, cmf.mime_type, cmf.size_bytes, cmf.created_at
         FROM chat_message_files cmf
         JOIN chat_messages cm ON cm.id = cmf.message_id
         ORDER BY cmf.id ASC
         LIMIT ?`,
        [safeLimit],
      );

      snapshot.avatarFiles = adminGetAll(
        `SELECT id AS user_id, username, nickname, avatar_url
         FROM users
         WHERE avatar_url IS NOT NULL AND avatar_url != ''
         ORDER BY id ASC
         LIMIT ?`,
        [safeLimit],
      );

      snapshot.fileStorage = {
        messageFilesBytes: Number(
          adminGetRow(
            "SELECT COALESCE(SUM(size_bytes), 0) AS n FROM chat_message_files",
          )?.n || 0,
        ),
      };
    }

    return snapshot;
  };

  const hasEnoughFreeDiskSpace = (requiredBytes = 0) => {
    const required = Number(requiredBytes || 0);
    if (!Number.isFinite(required) || required <= 0) return true;

    const disk = getDiskUsageInfo();
    if (!disk || !Number.isFinite(Number(disk.freeBytes))) return true;

    const safetyBuffer = 1 * 1024 * 1024;

    return Number(disk.freeBytes) >= required + safetyBuffer;
  };

  return {
    buildInspectSnapshot,
    getDiskUsageInfo,
    hasEnoughFreeDiskSpace,
  };
}

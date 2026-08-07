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

  const buildInspectSnapshot = async (kind = "all", limit = 25) => {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 25));
    const mode = String(kind || "all").toLowerCase();

    const [userCount, chatCount, messageCount, fileCount] = await Promise.all([
      adminGetRow("SELECT COUNT(*) AS n FROM users"),
      adminGetRow("SELECT COUNT(*) AS n FROM chats"),
      adminGetRow("SELECT COUNT(*) AS n FROM chat_messages"),
      adminGetRow("SELECT COUNT(*) AS n FROM chat_message_files"),
    ]);
    const counts = {
      users: Number(userCount?.n || 0),
      chats: Number(chatCount?.n || 0),
      messages: Number(messageCount?.n || 0),
      files: Number(fileCount?.n || 0),
    };

    const snapshot = {
      kind: mode,
      limit: safeLimit,
      counts,
      disk: getDiskUsageInfo(),
    };

    if (mode === "all" || mode === "user") {
      snapshot.users = await adminGetAll(
        `SELECT id, username, nickname, status, banned, avatar_url, created_at
         FROM users
         ORDER BY id ASC
         LIMIT ?`,
        [safeLimit],
      );
    }

    if (mode === "all" || mode === "chat") {
      const chats = await adminGetAll(
        `SELECT c.id, c.type, c.name,
                (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = c.id) AS messages,
                c.created_at
         FROM chats c
         ORDER BY c.id ASC
         LIMIT ?`,
        [safeLimit],
      );
      const chatIds = chats.map((chat) => Number(chat.id)).filter(Number.isFinite);
      const members = chatIds.length
        ? await adminGetAll(
            `SELECT chat_id, user_id
             FROM chat_members
             WHERE chat_id IN (${chatIds.map(() => "?").join(", ")})
             ORDER BY chat_id ASC, user_id ASC`,
            chatIds,
          )
        : [];
      const memberIdsByChat = new Map();
      members.forEach((member) => {
        const chatId = Number(member.chat_id);
        const userId = Number(member.user_id);
        if (!Number.isFinite(chatId) || !Number.isFinite(userId) || userId <= 0) return;
        const memberIds = memberIdsByChat.get(chatId) || [];
        memberIds.push(userId);
        memberIdsByChat.set(chatId, memberIds);
      });
      snapshot.chats = chats.map((chat) => ({
        ...chat,
        members: memberIdsByChat.get(Number(chat.id))?.length || 0,
        member_ids: memberIdsByChat.get(Number(chat.id)) || [],
        messages: Number(chat.messages || 0),
      }));
    }

    if (mode === "all" || mode === "file") {
      snapshot.messageFiles = await adminGetAll(
        `SELECT cmf.id, cmf.message_id, cm.chat_id, cm.user_id, cmf.kind, cmf.original_name, cmf.stored_name, cmf.mime_type, cmf.size_bytes, cmf.created_at
         FROM chat_message_files cmf
         JOIN chat_messages cm ON cm.id = cmf.message_id
         ORDER BY cmf.id ASC
         LIMIT ?`,
        [safeLimit],
      );

      snapshot.avatarFiles = await adminGetAll(
        `SELECT id AS user_id, username, nickname, avatar_url
         FROM users
         WHERE avatar_url IS NOT NULL AND avatar_url != ''
         ORDER BY id ASC
         LIMIT ?`,
        [safeLimit],
      );

      snapshot.fileStorage = {
        messageFilesBytes: Number(
          (await adminGetRow(
            "SELECT COALESCE(SUM(size_bytes), 0) AS n FROM chat_message_files",
          ))?.n || 0,
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

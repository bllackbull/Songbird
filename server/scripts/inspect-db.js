import fs from "node:fs";
import { getCliArgs, getFlagValue, getPositionalArgs } from "./_cli.js";
import { dataDir } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";

function getDiskUsageInfo() {
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
}

function toMB(bytes) {
  const value = Number(bytes || 0) / (1024 * 1024);
  return `${value.toFixed(2)} MB`;
}

function printSnapshot(snapshot) {
  const counts = snapshot.counts || {};
  const disk = snapshot.disk || getDiskUsageInfo();
  console.log(`DB Inspect kind=${snapshot.kind} limit=${snapshot.limit}`);
  console.log(
    `Counts: users=${counts.users || 0}, chats=${counts.chats || 0}, messages=${counts.messages || 0}, files=${counts.files || 0}`,
  );
  if (disk) {
    console.log(
      `Disk: free=${toMB(disk.freeBytes)} (${(disk.freePercent || 0).toFixed(2)}%), used=${toMB(
        disk.usedBytes,
      )} (${(disk.usedPercent || 0).toFixed(2)}%), total=${toMB(disk.totalBytes)}`,
    );
  }
  if (Array.isArray(snapshot.users)) {
    console.log("Users:");
    snapshot.users.forEach((row) => {
      console.log(
        `  id=${row.id} username=${row.username} nickname=${row.nickname || ""} status=${row.status}`,
      );
    });
  }
  if (Array.isArray(snapshot.chats)) {
    console.log("Chats:");
    snapshot.chats.forEach((row) => {
      console.log(
        `  id=${row.id} type=${row.type} name=${row.name || ""} members=${row.members} messages=${row.messages}`,
      );
    });
  }
  if (Array.isArray(snapshot.messageFiles)) {
    console.log("Message files:");
    snapshot.messageFiles.forEach((row) => {
      console.log(
        `  id=${row.id} message=${row.message_id} chat=${row.chat_id} kind=${row.kind} name=${row.original_name} size=${row.size_bytes}`,
      );
    });
  }
  if (Array.isArray(snapshot.avatarFiles)) {
    console.log("Avatar files:");
    snapshot.avatarFiles.forEach((row) => {
      console.log(
        `  user=${row.user_id} username=${row.username} avatar=${row.avatar_url}`,
      );
    });
  }
  if (snapshot.fileStorage) {
    console.log(
      `File storage: message_files=${toMB(snapshot.fileStorage.messageFilesBytes || 0)}`,
    );
  }
}

const args = getCliArgs();
const positional = getPositionalArgs(args);
const kind =
  String(
    getFlagValue(args, "--kind") ||
      positional.find((item) => ["all", "chat", "user", "file"].includes(String(item).toLowerCase())) ||
      "all",
  ).toLowerCase();
const limitRaw = getFlagValue(args, "--limit") || positional.find((item) => /^\d+$/.test(String(item))) || "25";
const limit = Math.max(1, Math.min(1000, Number(limitRaw) || 25));

let remote = null;
try {
  remote = await runAdminActionViaServer("inspect_db", { kind, limit });
} catch (error) {
  console.warn(`Server mode failed: ${String(error?.message || "unknown error")}`);
  console.warn("Falling back to direct DB mode for this command.");
}
if (remote) {
  printSnapshot(remote);
} else {
  const dbApi = await openDatabase();
  try {
    const counts = {
      users: Number(dbApi.getRow("SELECT COUNT(*) AS n FROM users")?.n || 0),
      chats: Number(dbApi.getRow("SELECT COUNT(*) AS n FROM chats")?.n || 0),
      messages: Number(dbApi.getRow("SELECT COUNT(*) AS n FROM chat_messages")?.n || 0),
      files: Number(dbApi.getRow("SELECT COUNT(*) AS n FROM chat_message_files")?.n || 0),
    };
    const snapshot = {
      kind,
      limit,
      counts,
      disk: getDiskUsageInfo(),
    };

    if (kind === "all" || kind === "user") {
      snapshot.users = dbApi.getAll(
        `SELECT id, username, nickname, status, avatar_url, created_at
         FROM users
         ORDER BY id ASC
         LIMIT ?`,
        [limit],
      );
    }
    if (kind === "all" || kind === "chat") {
      snapshot.chats = dbApi.getAll(
        `SELECT c.id, c.type, c.name,
                (SELECT COUNT(*) FROM chat_members cm WHERE cm.chat_id = c.id) AS members,
                (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = c.id) AS messages,
                c.created_at
         FROM chats c
         ORDER BY c.id ASC
         LIMIT ?`,
        [limit],
      );
    }
    if (kind === "all" || kind === "file") {
      snapshot.messageFiles = dbApi.getAll(
        `SELECT cmf.id, cmf.message_id, cm.chat_id, cm.user_id, cmf.kind, cmf.original_name, cmf.stored_name, cmf.mime_type, cmf.size_bytes, cmf.created_at
         FROM chat_message_files cmf
         JOIN chat_messages cm ON cm.id = cmf.message_id
         ORDER BY cmf.id ASC
         LIMIT ?`,
        [limit],
      );
      snapshot.avatarFiles = dbApi.getAll(
        `SELECT id AS user_id, username, nickname, avatar_url
         FROM users
         WHERE avatar_url IS NOT NULL AND avatar_url != ''
         ORDER BY id ASC
         LIMIT ?`,
        [limit],
      );
      snapshot.fileStorage = {
        messageFilesBytes: Number(
          dbApi.getRow("SELECT COALESCE(SUM(size_bytes), 0) AS n FROM chat_message_files")?.n || 0,
        ),
      };
    }
    printSnapshot(snapshot);
  } finally {
    dbApi.close();
  }
}

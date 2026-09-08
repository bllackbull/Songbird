import fs from "node:fs";
import { getCliArgs, getFlagValue, getPositionalArgs } from "./_cli.js";
import { dataDir } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { createInspector } from "../lib/inspect.js";

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
        `  id=${row.id} username=${row.username} nickname=${row.nickname || ""} status=${row.status} banned=${Number(row.banned || 0) ? "yes" : "no"}`,
      );
    });
  }
  if (Array.isArray(snapshot.chats)) {
    console.log("Chats:");
    snapshot.chats.forEach((row) => {
      console.log(
        `  id=${row.id} type=${row.type} name=${row.name || ""} members=${row.members} member_ids=[${Array.isArray(row.member_ids) ? row.member_ids.join(", ") : ""}] messages=${row.messages}`,
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
    const inspector = createInspector({
      fs,
      dataDir,
      adminGetRow: dbApi.getRow,
      adminGetAll: dbApi.getAll,
    });
    const snapshot = await inspector.buildInspectSnapshot(kind, limit);
    printSnapshot(snapshot);
  } finally {
    await dbApi.close();
  }
}

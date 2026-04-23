import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import initSqlJs from "sql.js";
import { migrations } from "./migrations/index.js";
import { setUserColor } from "./settings/colors.js";
import {
  ensureStorageEncryptionKey,
  storageEncryption,
} from "./lib/storageEncryption.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env") });
dotenv.config({ path: path.join(serverDir, ".env"), override: true });
ensureStorageEncryptionKey({ projectRootDir, fsImpl: fs, pathImpl: path, cryptoImpl: crypto });
const dataDir = path.resolve(serverDir, "..", "data");
const dbPath = path.join(dataDir, "songbird.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const SQL = await initSqlJs({
  locateFile: (file) =>
    path.resolve(serverDir, "node_modules", "sql.js", "dist", file),
});

const fileExists = fs.existsSync(dbPath);
const fileBuffer = fileExists ? fs.readFileSync(dbPath) : null;
const db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
const DB_SAVE_DEBOUNCE_MS = Math.max(
  0,
  Number(process.env.DB_SAVE_DEBOUNCE_MS || 150),
);
let pendingSaveTimer = null;
let databaseDirty = false;

function writeDatabaseToDisk() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  databaseDirty = false;
}

function saveDatabase() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  if (!databaseDirty && fileExists) return;
  writeDatabaseToDisk();
}

function scheduleDatabaseSave() {
  databaseDirty = true;
  if (pendingSaveTimer) return;
  if (DB_SAVE_DEBOUNCE_MS <= 0) {
    saveDatabase();
    return;
  }
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    if (!databaseDirty) return;
    writeDatabaseToDisk();
  }, DB_SAVE_DEBOUNCE_MS);
  if (typeof pendingSaveTimer?.unref === "function") {
    pendingSaveTimer.unref();
  }
}

function getRow(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const row = stmt.step() ? stmt.getAsObject() : null;

  stmt.free();

  return row;
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const rows = [];

  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }

  stmt.free();

  return rows;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);

  stmt.bind(params);
  stmt.step();
  stmt.free();

  scheduleDatabaseSave();
}

function runWithoutSave(sql, params = []) {
  const stmt = db.prepare(sql);

  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function getLastInsertId() {
  const row = getRow("SELECT last_insert_rowid() AS id");
  return row?.id;
}

function decryptMessageRow(row) {
  if (!row) return row;

  const next = { ...row };

  if (typeof next.edited_body === "string") {
    next.edited_body = storageEncryption.decryptText(next.edited_body);
  }

  if (typeof next.body === "string") {
    next.body = storageEncryption.decryptText(next.body);
  }

  if (typeof next.last_message === "string") {
    next.last_message = storageEncryption.decryptText(next.last_message);
  }

  if (typeof next.reply_body === "string") {
    next.reply_body = storageEncryption.decryptText(next.reply_body);
  }

  return next;
}

function getVisibleMessageFilterSql(alias = "chat_messages", viewerClause = "") {
  const safeAlias = alias || "chat_messages";
  return `${safeAlias}.hidden_everyone_at IS NULL
    AND ${safeAlias}.id NOT IN (
      SELECT hidden_chat_messages.message_id
      FROM hidden_chat_messages
      ${viewerClause}
    )`;
}

function tableExists(name) {
  return Boolean(
    getRow("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
      name,
    ]),
  );
}

function hasColumn(tableName, columnName) {
  return getAll(`PRAGMA table_info('${tableName}')`).some(
    (col) => col.name === columnName,
  );
}

function getSchemaVersion() {
  const row = getRow("PRAGMA user_version");
  return Number(row?.user_version || 0);
}

function setSchemaVersion(version) {
  db.run(`PRAGMA user_version = ${Number(version) || 0}`);
}

function runDatabaseMigrations() {
  const migrationContext = {
    db,
    getAll,
    tableExists,
    hasColumn,
    setUserColor,
  };

  const orderedMigrations = [...migrations].sort(
    (a, b) => a.version - b.version,
  );

  orderedMigrations.forEach((migration) => {
    if (getSchemaVersion() >= migration.version) return;

    migration.up(migrationContext);
    setSchemaVersion(migration.version);
  });

  // Self-heal schemas where PRAGMA user_version advanced but tables are missing.
  // All migrations are written to be idempotent (CREATE IF NOT EXISTS / guarded ALTERs),
  // so re-applying ensures critical tables exist.
  orderedMigrations.forEach((migration) => {
    migration.up(migrationContext);
  });

  const latestVersion = orderedMigrations.length
    ? Math.max(
        ...orderedMigrations.map((migration) => Number(migration.version) || 0),
      )
    : 0;

  if (getSchemaVersion() < latestVersion) {
    setSchemaVersion(latestVersion);
  }
}

runDatabaseMigrations();

saveDatabase();

process.once("beforeExit", () => {
  saveDatabase();
});

process.once("exit", () => {
  saveDatabase();
});

export function getCurrentSchemaVersion() {
  return getSchemaVersion();
}

export function findUserByUsername(username) {
  return getRow(
    "SELECT id, username, nickname, avatar_url, color, status, password_hash, banned FROM users WHERE username = ?",
    [username],
  );
}

export function findUserById(id) {
  return getRow(
    "SELECT id, username, nickname, avatar_url, color, status, password_hash, banned FROM users WHERE id = ?",
    [id],
  );
}

export function listUsers(excludeUsername) {
  if (excludeUsername) {
    return getAll(
      "SELECT id, username, nickname, avatar_url, color, status FROM users WHERE username != ? ORDER BY username",
      [excludeUsername],
    );
  }

  return getAll(
    "SELECT id, username, nickname, avatar_url, color, status, banned FROM users ORDER BY username",
  );
}

export function searchUsers(query, excludeUsername) {
  const like = `%${query}%`;

  if (excludeUsername) {
    return getAll(
      "SELECT id, username, nickname, avatar_url, color, status, banned FROM users WHERE username != ? AND (username LIKE ? OR nickname LIKE ?) ORDER BY username",
      [excludeUsername, like, like],
    );
  }

  return getAll(
    "SELECT id, username, nickname, avatar_url, color, status, banned FROM users WHERE username LIKE ? OR nickname LIKE ? ORDER BY username",
    [like, like],
  );
}

export function createUser(
  username,
  passwordHash,
  nickname = null,
  avatarUrl = null,
  color = null,
) {
  const nextColor = color || setUserColor();

  run(
    'INSERT INTO users (username, nickname, avatar_url, color, password_hash, last_seen) VALUES (?, ?, ?, ?, ?, datetime("now"))',
    [username, nickname, avatarUrl, nextColor, passwordHash],
  );

  return getLastInsertId();
}

export function findDmChat(userId, otherUserId) {
  const row = getRow(
    `
    SELECT c.id
    FROM chats c
    JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
    JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
    WHERE c.type = 'dm'
    ORDER BY
      (SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id) DESC,
      (SELECT id FROM chat_messages WHERE chat_id = c.id ORDER BY julianday(created_at) DESC, id DESC LIMIT 1) DESC,
      c.id DESC
    LIMIT 1
  `,
    [userId, otherUserId],
  );
  return row?.id || null;
}

export function createChat(name, type = "dm", options = {}) {
  const normalizedType = String(type || "dm");
  const normalizedName =
    normalizedType === "dm"
      ? String(name || "").trim() || "dm"
      : String(name || "").trim() || null;
  const groupUsername =
    normalizedType === "group" || normalizedType === "channel"
      ? String(options.groupUsername || "")
          .trim()
          .toLowerCase() || null
      : null;
  const groupVisibility =
    normalizedType === "saved"
      ? "private"
      : (normalizedType === "group" || normalizedType === "channel") &&
          String(options.groupVisibility || "").toLowerCase() === "private"
        ? "private"
        : "public";
  const inviteToken =
    normalizedType === "group" || normalizedType === "channel"
      ? String(options.inviteToken || "").trim() || null
      : null;
  const createdByUserId = Number(options.createdByUserId || 0) || null;
  const groupColor =
    normalizedType === "group" || normalizedType === "channel"
      ? String(options.groupColor || "").trim() || setUserColor()
      : null;
  const allowMemberInvites =
    (normalizedType === "group" || normalizedType === "channel") &&
    options.allowMemberInvites === false
      ? 0
      : 1;
  const groupAvatarUrl =
    normalizedType === "group" || normalizedType === "channel"
      ? String(options.groupAvatarUrl || "").trim() || null
      : null;

  run(
    "INSERT INTO chats (name, type, group_username, group_visibility, invite_token, created_by_user_id, group_color, allow_member_invites, group_avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
    normalizedName,
    normalizedType,
      groupUsername,
      groupVisibility,
      inviteToken,
      createdByUserId,
      groupColor,
      allowMemberInvites,
      groupAvatarUrl,
    ],
  );

  const id = getLastInsertId();
  if (id) return id;

  const fallback = getRow("SELECT id FROM chats ORDER BY id DESC LIMIT 1");
  return fallback?.id || null;
}

export function addChatMember(chatId, userId, role = "member") {
  run(
    "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
    [chatId, userId, role],
  );
}

export function searchPublicGroups(query, viewerUserId, limit = 20) {
  const like = `%${String(query || "").trim()}%`;
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return getAll(
    `SELECT c.id, c.name, c.group_username, c.group_color, c.group_avatar_url, c.invite_token,
            (SELECT COUNT(*) FROM chat_members m WHERE m.chat_id = c.id) AS members_count,
            EXISTS(
              SELECT 1 FROM chat_members vm
              WHERE vm.chat_id = c.id AND vm.user_id = ?
            ) AS is_member
     FROM chats c
     WHERE c.type = 'group'
       AND (
         c.group_visibility = 'public'
         OR EXISTS(
           SELECT 1 FROM chat_members vm
           WHERE vm.chat_id = c.id
             AND vm.user_id = ?
         )
       )
       AND (c.name LIKE ? OR c.group_username LIKE ?)
     ORDER BY
       CASE
         WHEN c.group_username LIKE ? THEN 0
         ELSE 1
       END,
       c.name ASC
     LIMIT ?`,
    [Number(viewerUserId), Number(viewerUserId), like, like, like, safeLimit],
  );
}

export function searchPublicChannels(query, viewerUserId, limit = 20) {
  const like = `%${String(query || "").trim()}%`;
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  return getAll(
    `SELECT c.id, c.name, c.group_username, c.group_color, c.group_avatar_url, c.invite_token,
            (SELECT COUNT(*) FROM chat_members m WHERE m.chat_id = c.id) AS members_count,
            EXISTS(
              SELECT 1 FROM chat_members vm
              WHERE vm.chat_id = c.id AND vm.user_id = ?
            ) AS is_member
     FROM chats c
     WHERE c.type = 'channel'
       AND (
         c.group_visibility = 'public'
         OR EXISTS(
           SELECT 1 FROM chat_members vm
           WHERE vm.chat_id = c.id
             AND vm.user_id = ?
         )
       )
       AND (c.name LIKE ? OR c.group_username LIKE ?)
     ORDER BY
       CASE
         WHEN c.group_username LIKE ? THEN 0
         ELSE 1
       END,
       c.name ASC
     LIMIT ?`,
    [Number(viewerUserId), Number(viewerUserId), like, like, like, safeLimit],
  );
}

export function removeChatMember(chatId, userId) {
  run("DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?", [
    Number(chatId),
    Number(userId),
  ]);
}

export function markChatMemberLeft(chatId, userId) {
  run(
    `INSERT INTO chat_left_members (chat_id, user_id, left_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       left_at = datetime('now')`,
    [Number(chatId), Number(userId)],
  );
}

export function clearChatMemberLeft(chatId, userId) {
  run("DELETE FROM chat_left_members WHERE chat_id = ? AND user_id = ?", [
    Number(chatId),
    Number(userId),
  ]);
}

export function hasChatMemberLeft(chatId, userId) {
  const row = getRow(
    "SELECT 1 AS left_chat FROM chat_left_members WHERE chat_id = ? AND user_id = ?",
    [Number(chatId), Number(userId)],
  );
  return Boolean(row);
}

export function markGroupMemberRemoved(chatId, userId, removedByUserId) {
  run(
    `INSERT INTO group_removed_members (chat_id, user_id, removed_by_user_id, removed_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       removed_by_user_id = excluded.removed_by_user_id,
       removed_at = datetime('now')`,
    [Number(chatId), Number(userId), Number(removedByUserId)],
  );
}

export function clearGroupMemberRemoved(chatId, userId) {
  run("DELETE FROM group_removed_members WHERE chat_id = ? AND user_id = ?", [
    Number(chatId),
    Number(userId),
  ]);
}

export function isGroupMemberRemoved(chatId, userId) {
  const row = getRow(
    "SELECT 1 AS removed FROM group_removed_members WHERE chat_id = ? AND user_id = ?",
    [Number(chatId), Number(userId)],
  );
  return Boolean(row);
}

export function findChatByGroupUsername(groupUsername) {
  const raw = String(groupUsername || "").trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.startsWith("@") ? raw.slice(1) : raw;
  const withAt = normalized.startsWith("@") ? normalized : `@${normalized}`;
  return getRow(
    `SELECT id, name, type, group_username, group_visibility, invite_token, group_color,
            allow_member_invites, group_avatar_url, created_by_user_id
     FROM chats
     WHERE group_username IN (?, ?) AND type IN ('group', 'channel')`,
    [normalized, withAt],
  );
}

export function findChatByInviteToken(inviteToken) {
  return getRow(
    "SELECT id, name, type, group_username, group_visibility, invite_token, group_color, allow_member_invites, group_avatar_url, created_by_user_id FROM chats WHERE invite_token = ? AND type IN ('group', 'channel')",
    [String(inviteToken || "").trim()],
  );
}

export function findChatById(chatId) {
  return getRow(
    `SELECT id, name, type, group_username, group_visibility, invite_token, group_color,
            allow_member_invites, group_avatar_url, created_by_user_id
     FROM chats WHERE id = ?`,
    [Number(chatId)],
  );
}

export function updateGroupChat(chatId, payload = {}) {
  const name = String(payload?.name || "").trim() || null;
  const groupUsername =
    String(payload?.groupUsername || "")
      .trim()
      .toLowerCase() || null;
  const groupVisibility =
    String(payload?.groupVisibility || "").toLowerCase() === "private"
      ? "private"
      : "public";
  const allowMemberInvites = payload?.allowMemberInvites === false ? 0 : 1;
  const hasGroupAvatarUrl = Object.prototype.hasOwnProperty.call(
    payload || {},
    "groupAvatarUrl",
  );
  const groupAvatarUrl =
    !hasGroupAvatarUrl
      ? null
      : String(payload?.groupAvatarUrl || "").trim() || null;

  run(
    `UPDATE chats
     SET name = ?, group_username = ?, group_visibility = ?, allow_member_invites = ?,
         group_avatar_url = CASE WHEN ? THEN ? ELSE group_avatar_url END
     WHERE id = ? AND type = 'group'`,
    [
      name,
      groupUsername,
      groupVisibility,
      allowMemberInvites,
      hasGroupAvatarUrl ? 1 : 0,
      groupAvatarUrl,
      Number(chatId),
    ],
  );
}

export function updateChannelChat(chatId, payload = {}) {
  const name = String(payload?.name || "").trim() || null;
  const groupUsername =
    String(payload?.groupUsername || "")
      .trim()
      .toLowerCase() || null;
  const groupVisibility =
    String(payload?.groupVisibility || "").toLowerCase() === "private"
      ? "private"
      : "public";
  const allowMemberInvites = payload?.allowMemberInvites === false ? 0 : 1;
  const hasGroupAvatarUrl = Object.prototype.hasOwnProperty.call(
    payload || {},
    "groupAvatarUrl",
  );
  const groupAvatarUrl =
    !hasGroupAvatarUrl
      ? null
      : String(payload?.groupAvatarUrl || "").trim() || null;

  run(
    `UPDATE chats
     SET name = ?, group_username = ?, group_visibility = ?, allow_member_invites = ?,
         group_avatar_url = CASE WHEN ? THEN ? ELSE group_avatar_url END
     WHERE id = ? AND type = 'channel'`,
    [
      name,
      groupUsername,
      groupVisibility,
      allowMemberInvites,
      hasGroupAvatarUrl ? 1 : 0,
      groupAvatarUrl,
      Number(chatId),
    ],
  );
}

export function regenerateGroupInviteToken(chatId, inviteToken) {
  run(
    "UPDATE chats SET invite_token = ? WHERE id = ? AND type IN ('group', 'channel')",
    [String(inviteToken || "").trim(), Number(chatId)],
  );
}

export function isMember(chatId, userId) {
  const row = getRow(
    "SELECT chat_id FROM chat_members WHERE chat_id = ? AND user_id = ?",
    [chatId, userId],
  );
  return Boolean(row);
}

export function listChatMembers(chatId) {
  return getAll(
    `
    SELECT users.id, users.username, users.nickname, users.avatar_url, users.color, users.status, chat_members.role
    FROM chat_members
    JOIN users ON users.id = chat_members.user_id
    WHERE chat_members.chat_id = ?
    ORDER BY users.username
  `,
    [chatId],
  );
}

export function getChatMemberRole(chatId, userId) {
  const row = getRow(
    "SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?",
    [Number(chatId), Number(userId)],
  );
  return String(row?.role || "");
}

export function setChatMemberRole(chatId, userId, role = "member") {
  run("UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?", [
    String(role || "member"),
    Number(chatId),
    Number(userId),
  ]);
}

export function deleteChatById(chatId) {
  const targetChatId = Number(chatId);
  if (!targetChatId) return { storedNames: [] };

  const fileRows = getAll(
    `
      SELECT cmf.stored_name
      FROM chat_message_files cmf
      JOIN chat_messages cm ON cm.id = cmf.message_id
      WHERE cm.chat_id = ?
    `,
    [targetChatId],
  );
  const storedNames = fileRows
    .map((row) => String(row?.stored_name || "").trim())
    .filter(Boolean);

  const savepoint = `sp_delete_chat_${targetChatId}_${Date.now()}`;
  runWithoutSave(`SAVEPOINT ${savepoint}`);
  try {
    runWithoutSave(
      `DELETE FROM chat_message_reads
       WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id = ?)`,
      [targetChatId],
    );
    runWithoutSave(
      `DELETE FROM hidden_chat_messages
       WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id = ?)`,
      [targetChatId],
    );
    runWithoutSave(
      `DELETE FROM chat_message_files
       WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id = ?)`,
      [targetChatId],
    );
    runWithoutSave("DELETE FROM chat_messages WHERE chat_id = ?", [targetChatId]);
    runWithoutSave("DELETE FROM chat_members WHERE chat_id = ?", [targetChatId]);
    runWithoutSave("DELETE FROM hidden_chats WHERE chat_id = ?", [targetChatId]);
    runWithoutSave("DELETE FROM chat_mutes WHERE chat_id = ?", [targetChatId]);
    runWithoutSave("DELETE FROM chat_left_members WHERE chat_id = ?", [targetChatId]);
    runWithoutSave("DELETE FROM group_removed_members WHERE chat_id = ?", [targetChatId]);
    runWithoutSave("DELETE FROM chats WHERE id = ?", [targetChatId]);
    runWithoutSave(`RELEASE ${savepoint}`);
    saveDatabase();
  } catch (error) {
    try {
      runWithoutSave(`ROLLBACK TO ${savepoint}`);
      runWithoutSave(`RELEASE ${savepoint}`);
    } catch {
      // ignore rollback failures
    }
    throw error;
  }

  return { storedNames };
}

export function deleteUserById(userId) {
  const targetUserId = Number(userId);
  if (!targetUserId) {
    return { storedNames: [], deletedChatIds: [], transferredChatIds: [] };
  }

  const ownerChatRows = getAll(
    "SELECT chat_id FROM chat_members WHERE role = 'owner' AND user_id = ?",
    [targetUserId],
  );
  const ownerChatIds = Array.from(
    new Set(ownerChatRows.map((row) => Number(row?.chat_id || 0)).filter(Boolean)),
  );

  const chatIdsToDelete = [];
  const ownershipTransfers = [];

  ownerChatIds.forEach((chatId) => {
    const remaining = getAll(
      "SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?",
      [Number(chatId), targetUserId],
    )
      .map((row) => Number(row?.user_id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (!remaining.length) {
      chatIdsToDelete.push(Number(chatId));
      return;
    }

    const nextOwnerId = remaining[Math.floor(Math.random() * remaining.length)];
    if (nextOwnerId) {
      ownershipTransfers.push({
        chatId: Number(chatId),
        nextOwnerId: Number(nextOwnerId),
      });
    }
  });

  const uniqueChatDeletes = Array.from(
    new Set(chatIdsToDelete.filter((id) => Number.isFinite(id) && id > 0)),
  );

  const storedNames = new Set();

  if (uniqueChatDeletes.length) {
    const chatPlaceholders = uniqueChatDeletes.map(() => "?").join(", ");
    const chatFileRows = getAll(
      `SELECT cmf.stored_name
       FROM chat_message_files cmf
       JOIN chat_messages cm ON cm.id = cmf.message_id
       WHERE cm.chat_id IN (${chatPlaceholders})`,
      uniqueChatDeletes,
    );
    chatFileRows.forEach((row) => {
      const name = String(row?.stored_name || "").trim();
      if (name) storedNames.add(name);
    });
  }

  const savepoint = `sp_delete_user_${targetUserId}_${Date.now()}`;
  runWithoutSave(`SAVEPOINT ${savepoint}`);
  try {
    if (uniqueChatDeletes.length) {
      uniqueChatDeletes.forEach((chatId) => {
        runWithoutSave(
          `DELETE FROM chat_message_reads
           WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id = ?)`,
          [chatId],
        );
        runWithoutSave(
          `DELETE FROM chat_message_files
           WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id = ?)`,
          [chatId],
        );
        runWithoutSave("DELETE FROM chat_messages WHERE chat_id = ?", [chatId]);
        runWithoutSave("DELETE FROM chat_members WHERE chat_id = ?", [chatId]);
        runWithoutSave("DELETE FROM chat_mutes WHERE chat_id = ?", [chatId]);
        runWithoutSave("DELETE FROM chat_left_members WHERE chat_id = ?", [chatId]);
        runWithoutSave("DELETE FROM group_removed_members WHERE chat_id = ?", [chatId]);
        runWithoutSave("DELETE FROM hidden_chats WHERE chat_id = ?", [chatId]);
        runWithoutSave("DELETE FROM chats WHERE id = ?", [chatId]);
      });
    }

    ownershipTransfers.forEach((transfer) => {
      if (
        uniqueChatDeletes.includes(Number(transfer.chatId)) ||
        !transfer.chatId ||
        !transfer.nextOwnerId
      ) {
        return;
      }
      runWithoutSave("UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?", [
        "owner",
        Number(transfer.chatId),
        Number(transfer.nextOwnerId),
      ]);
    });

    runWithoutSave("DELETE FROM sessions WHERE user_id = ?", [targetUserId]);
    runWithoutSave("DELETE FROM hidden_chats WHERE user_id = ?", [targetUserId]);
    runWithoutSave("DELETE FROM hidden_chat_messages WHERE user_id = ?", [
      targetUserId,
    ]);
    runWithoutSave("DELETE FROM chat_message_reads WHERE user_id = ?", [targetUserId]);
    runWithoutSave("DELETE FROM push_subscriptions WHERE user_id = ?", [targetUserId]);
    runWithoutSave(
      "UPDATE chat_messages SET read_by_user_id = NULL WHERE read_by_user_id = ?",
      [targetUserId],
    );
    runWithoutSave("DELETE FROM chat_left_members WHERE user_id = ?", [targetUserId]);
    runWithoutSave("DELETE FROM chat_members WHERE user_id = ?", [targetUserId]);
    runWithoutSave("DELETE FROM users WHERE id = ?", [targetUserId]);
    runWithoutSave(`RELEASE ${savepoint}`);
    saveDatabase();
  } catch (error) {
    try {
      runWithoutSave(`ROLLBACK TO ${savepoint}`);
      runWithoutSave(`RELEASE ${savepoint}`);
    } catch {
      // ignore rollback failures
    }
    throw error;
  }

  return {
    storedNames: Array.from(storedNames),
    deletedChatIds: uniqueChatDeletes,
    transferredChatIds: ownershipTransfers.map((t) => Number(t.chatId || 0)),
  };
}

export function listChatsForUser(userId) {
  return getAll(
    `
    WITH member_chats AS (
      SELECT
        c.id,
        c.name,
        c.type,
        c.group_username,
        c.group_visibility,
        c.invite_token,
        c.group_color,
        c.allow_member_invites,
        c.group_avatar_url,
        c.created_by_user_id,
        c.created_at,
        COALESCE(mu.muted, 0) AS muted
      FROM chats c
      JOIN chat_members m ON m.chat_id = c.id
      LEFT JOIN chat_mutes mu ON mu.chat_id = c.id AND mu.user_id = m.user_id
      LEFT JOIN hidden_chats h ON h.chat_id = c.id AND h.user_id = m.user_id
      WHERE m.user_id = ?
        AND h.chat_id IS NULL
    ),
    visible_messages AS (
      SELECT
        cm.id,
        cm.chat_id,
        cm.user_id,
        COALESCE(cm.edited_body, cm.body) AS body,
        cm.created_at,
        cm.read_at,
        cm.read_by_user_id
      FROM member_chats mc
      JOIN chat_messages cm ON cm.chat_id = mc.id
      LEFT JOIN hidden_chat_messages hcm
        ON hcm.message_id = cm.id
       AND hcm.user_id = ?
      WHERE cm.body NOT LIKE '[[system:%]]'
        AND cm.hidden_everyone_at IS NULL
        AND hcm.message_id IS NULL
    ),
    last_visible_message_ids AS (
      SELECT chat_id, MAX(id) AS last_message_id
      FROM visible_messages
      GROUP BY chat_id
    ),
    last_outgoing_message_ids AS (
      SELECT chat_id, MAX(id) AS last_outgoing_message_id
      FROM visible_messages
      WHERE user_id = ?
      GROUP BY chat_id
    ),
    unread_counts AS (
      SELECT vm.chat_id, COUNT(*) AS unread_count
      FROM visible_messages vm
      LEFT JOIN chat_message_reads cmr
        ON cmr.message_id = vm.id
       AND cmr.user_id = ?
      WHERE vm.user_id != ?
        AND cmr.message_id IS NULL
      GROUP BY vm.chat_id
    )
    SELECT
      mc.id,
      mc.name,
      mc.type,
      mc.group_username,
      mc.group_visibility,
      mc.invite_token,
      mc.group_color,
      mc.allow_member_invites,
      mc.group_avatar_url,
      mc.created_by_user_id,
      mc.muted,
      lvm.last_message_id,
      last_vm.body AS last_message,
      last_vm.created_at AS last_time,
      last_vm.user_id AS last_sender_id,
      CASE
        WHEN last_vm.id IS NULL THEN NULL
        ELSE COALESCE(last_user.username, 'deleted')
      END AS last_sender_username,
      CASE
        WHEN last_vm.id IS NULL THEN NULL
        ELSE COALESCE(last_user.nickname, 'Deleted user')
      END AS last_sender_nickname,
      last_user.avatar_url AS last_sender_avatar_url,
      last_vm.read_at AS last_message_read_at,
      last_vm.read_by_user_id AS last_message_read_by_user_id,
      outgoing_vm.created_at AS last_outgoing_time,
      COALESCE(uc.unread_count, 0) AS unread_count
    FROM member_chats mc
    LEFT JOIN last_visible_message_ids lvm ON lvm.chat_id = mc.id
    LEFT JOIN visible_messages last_vm ON last_vm.id = lvm.last_message_id
    LEFT JOIN users last_user ON last_user.id = last_vm.user_id
    LEFT JOIN last_outgoing_message_ids lom ON lom.chat_id = mc.id
    LEFT JOIN visible_messages outgoing_vm ON outgoing_vm.id = lom.last_outgoing_message_id
    LEFT JOIN unread_counts uc ON uc.chat_id = mc.id
    ORDER BY lvm.last_message_id DESC, mc.created_at DESC
  `,
    [
      Number(userId),
      Number(userId),
      Number(userId),
      Number(userId),
      Number(userId),
    ],
  ).map(decryptMessageRow);
}

export function createMessage(
  chatId,
  userId,
  body,
  replyToMessageId = null,
  expiresAt = null,
  clientRequestId = null,
) {
  const storedBody = storageEncryption.encryptText(body);
  run(
    `INSERT INTO chat_messages (
      chat_id, user_id, body, reply_to_message_id, expires_at, client_request_id
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      chatId,
      userId,
      storedBody,
      replyToMessageId || null,
      expiresAt || null,
      clientRequestId || null,
    ],
  );

  const id = getLastInsertId();
  if (id) return id;

  const fallback = getRow(
    "SELECT id FROM chat_messages WHERE chat_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1",
    [chatId, userId],
  );
  return fallback?.id || null;
}

export function findMessageIdByClientRequestId(chatId, userId, clientRequestId) {
  const normalized = String(clientRequestId || "").trim();
  if (!normalized) return null;
  const row = getRow(
    `SELECT id
     FROM chat_messages
     WHERE chat_id = ? AND user_id = ? AND client_request_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [Number(chatId), Number(userId), normalized],
  );
  const id = Number(row?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function createOrReuseMessage(
  chatId,
  userId,
  body,
  replyToMessageId = null,
  expiresAt = null,
  clientRequestId = null,
) {
  const normalizedClientRequestId = String(clientRequestId || "").trim() || null;
  if (normalizedClientRequestId) {
    const existingId = findMessageIdByClientRequestId(
      chatId,
      userId,
      normalizedClientRequestId,
    );
    if (existingId) {
      return { id: existingId, deduped: true };
    }
  }

  try {
    const id = createMessage(
      chatId,
      userId,
      body,
      replyToMessageId,
      expiresAt,
      normalizedClientRequestId,
    );
    return { id, deduped: false };
  } catch (error) {
    if (!normalizedClientRequestId) {
      throw error;
    }
    const existingId = findMessageIdByClientRequestId(
      chatId,
      userId,
      normalizedClientRequestId,
    );
    if (existingId) {
      return { id: existingId, deduped: true };
    }
    throw error;
  }
}

export function markMessageRead(messageId, readerId) {
  run(
    `UPDATE chat_messages
     SET read_at = datetime('now'), read_by_user_id = ?
     WHERE id = ?`,
    [Number(readerId), Number(messageId)],
  );
  const row = getRow("SELECT user_id FROM chat_messages WHERE id = ?", [
    Number(messageId),
  ]);
  if (Number(row?.user_id || 0) === Number(readerId)) return;
  run(
    `INSERT OR IGNORE INTO chat_message_reads (message_id, user_id, read_at)
     VALUES (?, ?, datetime('now'))`,
    [Number(messageId), Number(readerId)],
  );
}

export function findSavedChatByUserId(userId) {
  return getRow(
    `SELECT id, name, type, group_username, group_visibility, invite_token, group_color,
            allow_member_invites, group_avatar_url, created_by_user_id
     FROM chats WHERE type = 'saved' AND created_by_user_id = ?`,
    [Number(userId)],
  );
}

export function ensureSavedChatForUser(userId) {
  const existing = findSavedChatByUserId(userId);
  if (existing?.id) {
    if (!isMember(existing.id, Number(userId))) {
      addChatMember(existing.id, Number(userId), "owner");
    }
    if (String(existing.group_visibility || "").toLowerCase() !== "private") {
      run("UPDATE chats SET group_visibility = 'private' WHERE id = ?", [
        Number(existing.id),
      ]);
    }
    return existing;
  }
  const chatId = createChat("Saved messages", "saved", {
    createdByUserId: Number(userId),
  });
  if (!chatId) return null;
  addChatMember(chatId, Number(userId), "owner");
  return findChatById(chatId);
}

export function findMessageById(messageId) {
  return decryptMessageRow(
    getRow(
      `SELECT id, chat_id, user_id, body, edited, edited_body, hidden_everyone_at,
              forwarded_from_chat_id, forwarded_from_label, forwarded_from_user_id,
              forwarded_from_username, forwarded_from_avatar_url, forwarded_from_color,
              created_at, expires_at
       FROM chat_messages
       WHERE id = ?`,
      [messageId],
    ),
  );
}

export function setMessageExpiresAt(messageId, expiresAt = null) {
  run("UPDATE chat_messages SET expires_at = ? WHERE id = ?", [
    expiresAt || null,
    Number(messageId),
  ]);
}

export function editMessage(messageId, editedBody) {
  run(
    `UPDATE chat_messages
     SET edited = 1,
         edited_body = ?
     WHERE id = ?`,
    [storageEncryption.encryptText(String(editedBody || "")), Number(messageId)],
  );
}

export function hideMessageForUser(messageId, userId) {
  run(
    `INSERT INTO hidden_chat_messages (message_id, user_id, hidden_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id, message_id) DO UPDATE SET hidden_at = datetime('now')`,
    [Number(messageId), Number(userId)],
  );
}

export function hideMessageForEveryone(messageId) {
  run(
    `UPDATE chat_messages
     SET hidden_everyone_at = datetime('now')
     WHERE id = ?`,
    [Number(messageId)],
  );
}

export function setMessageForwardOrigin(messageId, payload = {}) {
  run(
    `UPDATE chat_messages
     SET forwarded_from_chat_id = ?,
         forwarded_from_label = ?,
         forwarded_from_user_id = ?,
         forwarded_from_username = ?,
         forwarded_from_avatar_url = ?,
         forwarded_from_color = ?
     WHERE id = ?`,
    [
      Number(payload.sourceChatId) || null,
      String(payload.label || "").trim() || null,
      Number(payload.sourceUserId) || null,
      String(payload.sourceUsername || "").trim() || null,
      String(payload.sourceAvatarUrl || "").trim() || null,
      String(payload.sourceColor || "").trim() || null,
      Number(messageId),
    ],
  );
}

export function createMessageFiles(messageId, files = []) {
  if (!messageId) return;

  files.forEach((file) => {
    run(
      `INSERT INTO chat_message_files (
        message_id, kind, original_name, stored_name, mime_type, size_bytes, width_px, height_px, duration_seconds, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId,
        file.kind,
        file.originalName,
        file.storedName,
        file.mimeType,
        Number(file.sizeBytes || 0),
        Number.isFinite(Number(file.widthPx)) ? Number(file.widthPx) : null,
        Number.isFinite(Number(file.heightPx)) ? Number(file.heightPx) : null,
        Number.isFinite(Number(file.durationSeconds))
          ? Number(file.durationSeconds)
          : null,
        file.expiresAt || null,
      ],
    );
  });
}

export function getMessages(chatId, options = {}) {
  const limitRaw = Number(options.limit || 50);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(10000, limitRaw))
    : 50;
  const beforeIdRaw = Number(options.beforeId || 0);
  const beforeCreatedAtRaw = String(options.beforeCreatedAt || "").trim();
  const viewerUserIdRaw = Number(options.viewerUserId || 0);
  const hasViewerUserId = Number.isFinite(viewerUserIdRaw) && viewerUserIdRaw > 0;
  const hasBeforeId = Number.isFinite(beforeIdRaw) && beforeIdRaw > 0;
  const hasBeforeCreatedAt = Boolean(beforeCreatedAtRaw);
  const hasBefore = hasBeforeId && hasBeforeCreatedAt;

  const visibilitySql = hasViewerUserId
    ? `
       AND ${getVisibleMessageFilterSql(
         "chat_messages",
         "WHERE hidden_chat_messages.user_id = ?",
       )}`
    : `
       AND chat_messages.hidden_everyone_at IS NULL`;

  const beforeSql = hasBefore
    ? `
       AND (
         julianday(chat_messages.created_at) < julianday(?)
         OR (
           julianday(chat_messages.created_at) = julianday(?)
           AND chat_messages.id < ?
         )
       )`
    : "";

  const whereSql = `WHERE chat_messages.chat_id = ?${visibilitySql}${beforeSql}`;

  const params = [chatId];
  if (hasViewerUserId) {
    params.push(viewerUserIdRaw);
  }
  if (hasBefore) {
    params.push(beforeCreatedAtRaw, beforeCreatedAtRaw, beforeIdRaw);
  }
  params.push(limit + 1);

  const rowsDesc = getAll(
    `
    SELECT chat_messages.id,
      COALESCE(chat_messages.edited_body, chat_messages.body) AS body,
      chat_messages.edited,
      chat_messages.edited_body,
      chat_messages.forwarded_from_chat_id,
      chat_messages.forwarded_from_label,
      chat_messages.forwarded_from_user_id,
      chat_messages.forwarded_from_username,
      chat_messages.forwarded_from_avatar_url,
      chat_messages.forwarded_from_color,
      chat_messages.created_at,
      chat_messages.expires_at,
      chat_messages.read_at,
      chat_messages.read_by_user_id,
      chat_messages.reply_to_message_id,
      users.id AS user_id,
      COALESCE(users.username, 'deleted') AS username,
      COALESCE(users.nickname, 'Deleted user') AS nickname,
      users.avatar_url, users.color,
      reply.id AS reply_id,
      COALESCE(reply.edited_body, reply.body) AS reply_body,
      reply.created_at AS reply_created_at,
      reply.user_id AS reply_user_id,
      COALESCE(reply_user.username, 'deleted') AS reply_username,
      COALESCE(reply_user.nickname, 'Deleted user') AS reply_nickname,
      reply_user.avatar_url AS reply_avatar_url
    FROM chat_messages
    LEFT JOIN users ON users.id = chat_messages.user_id
    LEFT JOIN chat_messages reply ON reply.id = chat_messages.reply_to_message_id
    LEFT JOIN users reply_user ON reply_user.id = reply.user_id
    ${whereSql}
    ORDER BY julianday(chat_messages.created_at) DESC, chat_messages.id DESC
    LIMIT ?
  `,
    params,
  );

  const hasMore = rowsDesc.length > limit;
  const rows = rowsDesc.slice(0, limit).reverse();

  const totalRow = getRow(
    hasViewerUserId
      ? `SELECT COUNT(*) AS total
         FROM chat_messages
         WHERE chat_id = ?
           AND ${getVisibleMessageFilterSql(
             "chat_messages",
             "WHERE hidden_chat_messages.user_id = ?",
           )}`
      : `SELECT COUNT(*) AS total
         FROM chat_messages
         WHERE chat_id = ?
           AND chat_messages.hidden_everyone_at IS NULL`,
    hasViewerUserId ? [chatId, viewerUserIdRaw] : [chatId],
  );

  const totalCount = Number(totalRow?.total || 0);

  return {
    messages: rows.map(decryptMessageRow),
    hasMore,
    totalCount,
  };
}

export function listMessageFilesByMessageIds(messageIds = []) {
  if (!Array.isArray(messageIds) || !messageIds.length) return [];

  const placeholders = messageIds.map(() => "?").join(", ");

  return getAll(
    `
      SELECT id, message_id, kind, original_name, stored_name, mime_type, size_bytes, width_px, height_px, duration_seconds, expires_at, created_at
      FROM chat_message_files
      WHERE message_id IN (${placeholders})
      ORDER BY id ASC
    `,
    messageIds,
  );
}

export function listMessageFilesNeedingMetadata(limit = 10000) {
  const safeLimit = Math.max(1, Math.min(200000, Number(limit) || 10000));

  return getAll(
    `
      SELECT id, stored_name, mime_type, width_px, height_px, duration_seconds, expires_at
      FROM chat_message_files
      WHERE (
        mime_type LIKE 'image/%'
        OR mime_type LIKE 'video/%'
      ) AND (
        width_px IS NULL
        OR height_px IS NULL
        OR (mime_type LIKE 'video/%' AND duration_seconds IS NULL)
      )
      ORDER BY id ASC
      LIMIT ?
    `,
    [safeLimit],
  );
}

export function updateMessageFileMetadata(fileId, metadata = {}) {
  run(
    `
      UPDATE chat_message_files
      SET
        width_px = COALESCE(?, width_px),
        height_px = COALESCE(?, height_px),
        duration_seconds = COALESCE(?, duration_seconds)
      WHERE id = ?
    `,
    [
      Number.isFinite(Number(metadata.widthPx))
        ? Number(metadata.widthPx)
        : null,
      Number.isFinite(Number(metadata.heightPx))
        ? Number(metadata.heightPx)
        : null,
      Number.isFinite(Number(metadata.durationSeconds))
        ? Number(metadata.durationSeconds)
        : null,
      Number(fileId),
    ],
  );
}

export function updateUserProfile(userId, username, nickname, avatarUrl) {
  run(
    "UPDATE users SET username = ?, nickname = ?, avatar_url = ? WHERE id = ?",
    [username, nickname, avatarUrl, userId],
  );
}

export function updateUserPassword(userId, passwordHash) {
  run("UPDATE users SET password_hash = ? WHERE id = ?", [
    passwordHash,
    userId,
  ]);
}

export function updateUserStatus(userId, status) {
  run("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
}

export function setUserBanned(userId, banned) {
  run("UPDATE users SET banned = ? WHERE id = ?", [banned ? 1 : 0, Number(userId)]);
}

export function deleteSessionsByUserId(userId) {
  run("DELETE FROM sessions WHERE user_id = ?", [Number(userId)]);
}

export function updateLastSeen(userId) {
  run("UPDATE users SET last_seen = datetime('now') WHERE id = ?", [userId]);
}

export function getUserPresence(username) {
  return getRow(
    "SELECT id, username, status, last_seen FROM users WHERE username = ?",
    [username],
  );
}

export function markMessagesRead(chatId, readerId) {
  const recentRows = getAll(
    `SELECT id FROM chat_messages
     WHERE chat_id = ?
       AND user_id != ?
       AND id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
     ORDER BY id DESC`,
    [Number(chatId), Number(readerId), Number(readerId)],
  );
  if (!recentRows.length) return;

  const messageIds = recentRows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!messageIds.length) return;

  run(
    `
    UPDATE chat_messages
    SET read_at = datetime('now'), read_by_user_id = ?
    WHERE chat_id = ? AND user_id != ? AND read_at IS NULL
  `,
    [readerId, chatId, readerId],
  );
  const chunkSize = 300;
  for (let i = 0; i < messageIds.length; i += chunkSize) {
    const chunk = messageIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "(?, ?, datetime('now'))").join(", ");
    run(
      `INSERT OR IGNORE INTO chat_message_reads (message_id, user_id, read_at)
       VALUES ${placeholders}`,
      chunk.flatMap((id) => [id, Number(readerId)]),
    );
  }
}

export function getMessageReadCounts(messageIds = []) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!normalized.length) return [];
  const placeholders = normalized.map(() => "?").join(", ");
  return getAll(
    `SELECT message_id, COUNT(*) AS count
     FROM chat_message_reads
     WHERE message_id IN (${placeholders})
     GROUP BY message_id`,
    normalized,
  );
}

export function getMessageAuthors(messageIds = []) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!normalized.length) return [];
  const placeholders = normalized.map(() => "?").join(", ");
  return getAll(
    `SELECT id, user_id FROM chat_messages WHERE id IN (${placeholders})`,
    normalized,
  );
}

export function getMessageReadByUser(messageIds = [], userId) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!normalized.length) return [];
  const placeholders = normalized.map(() => "?").join(", ");
  return getAll(
    `SELECT message_id FROM chat_message_reads
     WHERE user_id = ? AND message_id IN (${placeholders})`,
    [Number(userId), ...normalized],
  );
}

export function recordMessageReads(messageIds = [], readerId) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!normalized.length) return;
  const placeholders = normalized.map(() => "?").join(", ");
  const rows = getAll(
    `SELECT id, user_id FROM chat_messages WHERE id IN (${placeholders})`,
    normalized,
  );
  const toInsert = rows
    .filter((row) => Number(row?.user_id || 0) !== Number(readerId))
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!toInsert.length) return;
  const chunkSize = 300;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const valuePlaceholders = chunk.map(() => "(?, ?, datetime('now'))").join(", ");
    run(
      `INSERT OR IGNORE INTO chat_message_reads (message_id, user_id, read_at)
       VALUES ${valuePlaceholders}`,
      chunk.flatMap((id) => [id, Number(readerId)]),
    );
  }
}

export function hideChatsForUser(userId, chatIds = []) {
  chatIds.forEach((chatId) => {
    run("INSERT OR IGNORE INTO hidden_chats (user_id, chat_id) VALUES (?, ?)", [
      userId,
      chatId,
    ]);
  });
}

export function unhideChat(userId, chatId) {
  run("DELETE FROM hidden_chats WHERE user_id = ? AND chat_id = ?", [
    userId,
    chatId,
  ]);
}

export function setChatMuted(userId, chatId, muted) {
  if (muted) {
    run(
      `INSERT INTO chat_mutes (user_id, chat_id, muted, updated_at)
       VALUES (?, ?, 1, datetime('now'))
       ON CONFLICT(user_id, chat_id) DO UPDATE SET
         muted = 1,
         updated_at = datetime('now')`,
      [Number(userId), Number(chatId)],
    );
    return;
  }

  run("DELETE FROM chat_mutes WHERE user_id = ? AND chat_id = ?", [
    Number(userId),
    Number(chatId),
  ]);
}

export function upsertPushSubscription(userId, endpoint, p256dh, auth) {
  const uid = Number(userId || 0);
  const safeEndpoint = String(endpoint || "").trim();
  if (!uid || !safeEndpoint) return;
  run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       updated_at = datetime('now')`,
    [uid, safeEndpoint, String(p256dh || ""), String(auth || "")],
  );
}

export function deletePushSubscription(endpoint) {
  const safeEndpoint = String(endpoint || "").trim();
  if (!safeEndpoint) return;
  run("DELETE FROM push_subscriptions WHERE endpoint = ?", [safeEndpoint]);
}

export function listPushSubscriptionsByUserIds(userIds = []) {
  const ids = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(", ");
  return getAll(
    `SELECT user_id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id IN (${placeholders})`,
    ids,
  );
}

export function listMutedUserIdsForChat(chatId) {
  const id = Number(chatId || 0);
  if (!id) return [];
  return getAll(
    "SELECT user_id FROM chat_mutes WHERE chat_id = ? AND muted = 1",
    [id],
  )
    .map((row) => Number(row?.user_id || 0))
    .filter((userId) => Number.isFinite(userId) && userId > 0);
}

export function createSession(userId, token) {
  run("INSERT INTO sessions (user_id, token) VALUES (?, ?)", [userId, token]);
}

export function getSession(token) {
  return getRow(
    `
    SELECT sessions.id AS session_id, sessions.token, users.id, users.username, users.nickname,
           users.avatar_url, users.color, users.status, users.banned
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
      AND COALESCE(users.banned, 0) = 0
  `,
    [token],
  );
}

export function touchSession(token) {
  run("UPDATE sessions SET last_seen = datetime('now') WHERE token = ?", [
    token,
  ]);
}

export function deleteSession(token) {
  run("DELETE FROM sessions WHERE token = ?", [token]);
}

// Internal admin helpers for server-side DB tooling endpoints.
export function adminGetRow(sql, params = []) {
  return getRow(sql, params);
}

export function adminGetAll(sql, params = []) {
  return getAll(sql, params);
}

export function adminRun(sql, params = []) {
  runWithoutSave(sql, params);
}

export function adminSave() {
  saveDatabase();
}

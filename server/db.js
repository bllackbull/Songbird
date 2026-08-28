import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import initSqlJs from "sql.js";
import Database from "better-sqlite3";
import { dbKnex } from "./db/knex.js";
import { normalizeSqlForPostgres } from "./lib/sqlNormalizer.js";
import { migrations } from "./migrations/index.js";
import { setUserColor } from "./settings/colors.js";
import { generateUuid } from "./lib/uuidUtils.js";
import { storageEncryption } from "./lib/storageEncryption.js";
import { ensureSystemSecrets } from "./lib/secrets.js";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env"), quiet: true });
dotenv.config({ path: path.join(serverDir, ".env"), quiet: true });
const dataDir = path.resolve(process.env.DATA_DIR || path.resolve(serverDir, "..", "data"));
const dbPath = path.join(dataDir, "songbird.db");
const backupDir = path.join(dataDir, "backups");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const REMOTE_MESSAGE_CLIENT_REQUEST_SQL =
  "LOWER(COALESCE(client_request_id, '')) LIKE 'remote:%'";

export const isRemoteMessageClientRequestId = (value) =>
  /^remote:/i.test(String(value || "").trim());

export const isRemoteMessageRow = (row) =>
  isRemoteMessageClientRequestId(row?.client_request_id || row?.clientRequestId);

function isPostgresMode() {
  const client = (process.env.DB_CLIENT || "sqlite3").toLowerCase();
  return client === "postgres" || client === "postgresql" || client === "pg";
}

function getPostgresRows(result) {
  const rows = Array.isArray(result) ? result : result?.rows || [];
  return rows.length === 1 && Array.isArray(rows[0]?.rows) ? rows[0].rows : rows;
}

let betterDb = null;
let SQL = null;
let db = null;

if (!isPostgresMode()) {
  try {
    betterDb = new Database(dbPath);
    betterDb.pragma("journal_mode = WAL");
  } catch (err) {
    // fallback to sql.js if better-sqlite3 cannot be initialized
    betterDb = null;
  }

  if (!betterDb) {
    SQL = await initSqlJs({
      locateFile: (file) =>
        path.resolve(serverDir, "node_modules", "sql.js", "dist", file),
    });

    const fileExists = fs.existsSync(dbPath);
    const fileBuffer = fileExists ? fs.readFileSync(dbPath) : null;
    db = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  }
}

const fileExists = fs.existsSync(dbPath);
const DB_SAVE_DEBOUNCE_MS = Math.max(
  0,
  Number(process.env.DB_SAVE_DEBOUNCE_MS || 150),
);
let pendingSaveTimer = null;
let databaseDirty = false;

function writeDatabaseToDisk() {
  if (db && typeof db.export === "function") {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }
  databaseDirty = false;
}

// Reload the in-memory database from the file on disk. Used after a restore
// replaces songbird.db underneath the running process. Cancels any pending
// debounced save first so we never overwrite the freshly restored file.
function reloadDatabaseFromDisk() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  databaseDirty = false;
  if (!fs.existsSync(dbPath)) {
    throw new Error("Database file not found on disk.");
  }
  if (betterDb) {
    try {
      betterDb.close();
    } catch {}
    try {
      betterDb = new Database(dbPath);
      betterDb.pragma("journal_mode = WAL");
    } catch {}
  }
  if (SQL) {
    const buffer = fs.readFileSync(dbPath);
    const next = new SQL.Database(buffer);
    try {
      if (db) db.close();
    } catch {}
    db = next;
  }
}

function createPreMigrationBackup(fromVersion, toVersion) {
  if (!fileExists || !fs.existsSync(dbPath)) return null;

  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      backupDir,
      `songbird-pre-migration-v${fromVersion}-to-v${toVersion}-${stamp}.db`,
    );
    fs.copyFileSync(dbPath, backupPath);
    return backupPath;
  } catch (error) {
    throw new Error(
      `Unable to create pre-migration database backup: ${
        error?.message || error
      }`,
    );
  }
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

function extractSqlAndParams(sqlOrBuilder, params = []) {
  if (sqlOrBuilder && typeof sqlOrBuilder.toSQL === "function") {
    const compiled = sqlOrBuilder.toSQL();
    return { sql: compiled.sql, params: compiled.bindings || [] };
  }
  return { sql: sqlOrBuilder, params };
}

export function getRow(sqlOrBuilder, params = []) {
  const { sql, params: normParamsInput } = extractSqlAndParams(sqlOrBuilder, params);
  if (isPostgresMode()) {
    const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, normParamsInput);
    const result = dbKnex.raw(normSql, normParams);
    if (result && typeof result.then === "function") {
      return result.then((res) => {
        const rows = getPostgresRows(res);
        return rows[0] || null;
      });
    }
    const rows = getPostgresRows(result);
    return rows[0] || null;
  }

  const normalizedParams = Array.isArray(normParamsInput) ? normParamsInput : [normParamsInput];

  if (betterDb) {
    const stmt = betterDb.prepare(sql);
    return stmt.get(...normalizedParams) || null;
  }

  if (!db) return null;

  const stmt = db.prepare(sql);
  stmt.bind(normalizedParams);

  const row = stmt.step() ? stmt.getAsObject() : null;

  stmt.free();

  return row;
}

export function getAll(sqlOrBuilder, params = []) {
  const { sql, params: normParamsInput } = extractSqlAndParams(sqlOrBuilder, params);
  if (isPostgresMode()) {
    const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, normParamsInput);
    const result = dbKnex.raw(normSql, normParams);
    if (result && typeof result.then === "function") {
      return result.then(getPostgresRows);
    }
    return getPostgresRows(result);
  }

  const normalizedParams = Array.isArray(normParamsInput) ? normParamsInput : [normParamsInput];

  if (betterDb) {
    const stmt = betterDb.prepare(sql);
    return stmt.all(...normalizedParams);
  }

  if (!db) return [];

  const stmt = db.prepare(sql);
  stmt.bind(normalizedParams);

  const rows = [];

  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }

  stmt.free();

  return rows;
}

export function run(sqlOrBuilder, params = []) {
  const { sql, params: normParamsInput } = extractSqlAndParams(sqlOrBuilder, params);
  if (isPostgresMode()) {
    const { sql: normSql, params: normParams } = normalizeSqlForPostgres(sql, normParamsInput);
    const result = dbKnex.raw(normSql, normParams);
    if (result && typeof result.then === "function") {
      return result.then((res) => {
        if (typeof res?.rowCount === "number") return res.rowCount;
        const rows = getPostgresRows(res);
        return rows.length;
      });
    }
    if (typeof result?.rowCount === "number") return result.rowCount;
    const rows = getPostgresRows(result);
    return rows.length;
  }

  const normalizedParams = Array.isArray(normParamsInput) ? normParamsInput : [normParamsInput];

  if (betterDb) {
    const stmt = betterDb.prepare(sql);
    const info = stmt.run(...normalizedParams);
    return info.changes;
  }

  if (!db) return 0;

  const stmt = db.prepare(sql);

  stmt.bind(normalizedParams);
  stmt.step();
  stmt.free();

  const changedRows =
    typeof db.getRowsModified === "function" ? Number(db.getRowsModified()) : 1;
  if (changedRows > 0) {
    scheduleDatabaseSave();
  }
  return changedRows;
}

function runWithoutSave(sqlOrBuilder, params = []) {
  if (isPostgresMode()) {
    return run(sqlOrBuilder, params);
  }
  const { sql, params: normParamsInput } = extractSqlAndParams(sqlOrBuilder, params);
  const normalizedParams = Array.isArray(normParamsInput) ? normParamsInput : [normParamsInput];
  if (betterDb) {
    const stmt = betterDb.prepare(sql);
    stmt.run(...normalizedParams);
    return;
  }
  const stmt = db.prepare(sql);

  stmt.bind(normalizedParams);
  stmt.step();
  stmt.free();
}

function getLastInsertId() {
  const raw = getRow("SELECT last_insert_rowid() AS id");
  if (raw && typeof raw.then === "function") {
    return raw.then((row) => (row?.id ? Number(row.id) : null));
  }
  return raw?.id ? Number(raw.id) : null;
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

function updateSchemaSetsFromSql(sql, tablesSet, columnsSet) {
  if (!sql || typeof sql !== "string") return;

  const statements = sql.split(";");
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;

    const createMatch = trimmed.match(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`']?([a-zA-Z0-9_]+)["`']?\s*\(([\s\S]+)\)/i,
    );
    if (createMatch) {
      const tableName = createMatch[1].toLowerCase();
      tablesSet.add(tableName);
      const body = createMatch[2];
      const lines = body.split(",");
      for (const line of lines) {
        const colTrimmed = line.trim();
        if (!colTrimmed) continue;
        if (
          /^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)/i.test(
            colTrimmed,
          )
        ) {
          continue;
        }
        const colMatch = colTrimmed.match(/^["`']?([a-zA-Z0-9_]+)["`']?/);
        if (colMatch) {
          const colName = colMatch[1].toLowerCase();
          columnsSet.add(`${tableName}.${colName}`);
        }
      }
    }

    const alterMatch = trimmed.match(
      /ALTER\s+TABLE\s+["`']?([a-zA-Z0-9_]+)["`']?\s+ADD\s+(?:COLUMN\s+)?["`']?([a-zA-Z0-9_]+)["`']?/i,
    );
    if (alterMatch) {
      const tableName = alterMatch[1].toLowerCase();
      const colName = alterMatch[2].toLowerCase();
      tablesSet.add(tableName);
      columnsSet.add(`${tableName}.${colName}`);
    }
  }
}

function tableExists(name) {
  if (isPostgresMode()) {
    const row = getRow(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?",
      [name],
    );
    if (row && typeof row.then === "function") {
      return row.then((r) => Boolean(r));
    }
    return Boolean(row);
  }
  return Boolean(
    getRow("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [
      name,
    ]),
  );
}

function hasColumn(tableName, columnName) {
  if (isPostgresMode()) {
    const row = getRow(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ?",
      [tableName, columnName],
    );
    if (row && typeof row.then === "function") {
      return row.then((r) => Boolean(r));
    }
    return Boolean(row);
  }
  const rows = getAll(`PRAGMA table_info('${tableName}')`);
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.some((col) => col.name === columnName);
}

async function getSchemaVersion() {
  if (isPostgresMode()) {
    try {
      const row = await getRow("SELECT value FROM meta WHERE key = 'user_version'");
      return Number(row?.value || 0);
    } catch {
      return 0;
    }
  }
  const row = getRow("PRAGMA user_version");
  return Number(row?.user_version || 0);
}

async function setSchemaVersion(version) {
  if (isPostgresMode()) {
    await run(
      "INSERT INTO meta (key, value) VALUES ('user_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      [String(version)],
    );
    return;
  }
  if (betterDb) {
    betterDb.pragma(`user_version = ${Number(version) || 0}`);
  } else if (db) {
    db.run(`PRAGMA user_version = ${Number(version) || 0}`);
  }
}

async function runDatabaseMigrations() {
  const tablesSet = new Set();
  const columnsSet = new Set();

  if (isPostgresMode()) {
    try {
      await dbKnex.raw(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      const colRes = await dbKnex.raw(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public';
      `);
      const rows = Array.isArray(colRes) ? colRes : colRes?.rows || [];
      for (const r of rows) {
        const tName = String(r.table_name || "").toLowerCase();
        const cName = String(r.column_name || "").toLowerCase();
        tablesSet.add(tName);
        columnsSet.add(`${tName}.${cName}`);
      }
    } catch (err) {
      console.error("[db-migrations] Error initializing Postgres schema sets:", err);
    }
  }

  function syncTableExists(name) {
    if (isPostgresMode()) {
      return tablesSet.has(String(name || "").toLowerCase());
    }
    return tableExists(name);
  }

  function syncHasColumn(tableName, columnName) {
    if (isPostgresMode()) {
      return columnsSet.has(
        `${String(tableName || "").toLowerCase()}.${String(columnName || "").toLowerCase()}`,
      );
    }
    return hasColumn(tableName, columnName);
  }

  let migrationPromiseChain = Promise.resolve();

  const migrationContext = {
    isPostgres: isPostgresMode(),
    db: {
      run: (sql, params = []) => {
        if (!isPostgresMode()) {
          return run(sql, params);
        }
        const p = migrationPromiseChain.then(async () => {
          const res = await run(sql, params);
          updateSchemaSetsFromSql(sql, tablesSet, columnsSet);
          return res;
        });
        migrationPromiseChain = p.catch(() => {});
        return p;
      },
      exec: (sql) => {
        if (!isPostgresMode()) {
          return betterDb ? betterDb.exec(sql) : db?.exec(sql);
        }
        const p = migrationPromiseChain.then(async () => {
          const res = await dbKnex.raw(sql);
          updateSchemaSetsFromSql(sql, tablesSet, columnsSet);
          return res;
        });
        migrationPromiseChain = p.catch(() => {});
        return p;
      },
      prepare: (sql) => (betterDb ? betterDb.prepare(sql) : db?.prepare(sql)),
    },
    getAll: (sql, params = []) => {
      if (!isPostgresMode()) {
        return getAll(sql, params);
      }
      const p = migrationPromiseChain.then(() => getAll(sql, params));
      migrationPromiseChain = p.catch(() => {});
      return p;
    },
    tableExists: syncTableExists,
    hasColumn: syncHasColumn,
    setUserColor,
  };

  const orderedMigrations = [...migrations].sort(
    (a, b) => a.version - b.version,
  );
  const latestVersion = orderedMigrations.length
    ? Math.max(
        ...orderedMigrations.map((migration) => Number(migration.version) || 0),
      )
    : 0;
  const startingVersion = await getSchemaVersion();

  if (startingVersion < latestVersion && !isPostgresMode()) {
    createPreMigrationBackup(startingVersion, latestVersion);
  }

  let appliedMigration = false;

  for (const migration of orderedMigrations) {
    const currentVersion = await getSchemaVersion();
    if (currentVersion >= migration.version) continue;

    await migration.up(migrationContext);
    await migrationPromiseChain;
    await setSchemaVersion(migration.version);
    appliedMigration = true;
  }

  // Self-heal schemas where PRAGMA user_version advanced but tables are missing.
  // All migrations are written to be idempotent (CREATE IF NOT EXISTS / guarded ALTERs),
  // so re-applying ensures critical tables exist.
  for (const migration of orderedMigrations) {
    await migration.up(migrationContext);
    await migrationPromiseChain;
  }

  const currentVersion = await getSchemaVersion();
  if (currentVersion < latestVersion) {
    await setSchemaVersion(latestVersion);
    appliedMigration = true;
  }

  if (appliedMigration) {
    databaseDirty = true;
  }
}

await runDatabaseMigrations();

await ensureSystemSecrets({
  dbRun: run,
  dbGetRow: getRow,
  projectRootDir,
  fsImpl: fs,
  pathImpl: path,
  cryptoImpl: crypto,
});

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
  if (!username) return isPostgresMode() ? Promise.resolve(null) : null;
  return getRow(
    dbKnex("users")
      .select("id", "username", "nickname", "avatar_url", "color", "status", "password_hash", "banned", "role", "verified")
      .where("username", String(username || "").toLowerCase()),
  );
}

export function findUserById(id) {
  if (!id) return isPostgresMode() ? Promise.resolve(null) : null;
  return getRow(
    dbKnex("users")
      .select("id", "username", "nickname", "avatar_url", "color", "status", "password_hash", "banned", "role", "verified")
      .where("id", id),
  );
}

export function listUsers(excludeUsername) {
  const qb = dbKnex("users")
    .select("id", "username", "nickname", "avatar_url", "color", "role", "verified", "status", "banned")
    .orderBy("username", "asc");
  if (excludeUsername) {
    qb.where("username", "!=", String(excludeUsername).toLowerCase());
  }
  return getAll(qb);
}

export function searchUsers(query, excludeUsername) {
  const like = `%${query}%`;
  const qb = dbKnex("users")
    .select("id", "username", "nickname", "avatar_url", "color", "role", "verified", "status", "banned")
    .where((builder) => {
      builder.where("username", "like", like).orWhere("nickname", "like", like);
    })
    .orderBy("username", "asc");
  if (excludeUsername) {
    qb.where("username", "!=", String(excludeUsername).toLowerCase());
  }
  return getAll(qb);
}

export function createUser(
  username,
  passwordHash,
  nickname = null,
  avatarUrl = null,
  color = null,
  options = {},
) {
  const id = generateUuid();
  const nextColor = color || setUserColor();
  const role = typeof options === "string" ? options : (options?.role || "user");
  const verified = typeof options === "object" && options?.verified ? 1 : 0;
  const status = (typeof options === "object" && options?.status) || "online";

  const res = run(
    dbKnex("users").insert({
      id,
      username,
      nickname,
      avatar_url: avatarUrl,
      color: nextColor,
      password_hash: passwordHash,
      role,
      verified,
      status,
      last_seen: dbKnex.raw("datetime('now')"),
    }),
  );

  if (res && typeof res.then === "function") {
    return res.then(() => id);
  }

  return id;
}

export function findDmChat(userId, otherUserId) {
  if (!userId || !otherUserId) {
    return isPostgresMode() ? Promise.resolve(null) : null;
  }

  const row = getRow(
    dbKnex("chats as c")
      .select("c.id")
      .join("chat_members as m1", function () {
        this.on("m1.chat_id", "=", "c.id").andOn("m1.user_id", "=", dbKnex.raw("?", [userId]));
      })
      .join("chat_members as m2", function () {
        this.on("m2.chat_id", "=", "c.id").andOn("m2.user_id", "=", dbKnex.raw("?", [otherUserId]));
      })
      .where("c.type", "dm")
      .orderByRaw("(SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id) DESC")
      .orderByRaw("(SELECT created_at FROM chat_messages WHERE chat_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) DESC")
      .orderBy("c.id", "desc")
      .first(),
  );
  if (row && typeof row.then === "function") {
    return row.then((r) => r?.id || null);
  }
  return row?.id || null;
}

export function createChat(name, type = "dm", options = {}) {
  const id = generateUuid();
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
  const createdByUserId = options.createdByUserId || null;
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
  const verified = options.verified ? 1 : 0;
  const autoAddNewUsers =
    groupVisibility === "private"
      ? 0
      : (options.auto_add_new_users || options.autoAddNewUsers)
        ? 1
        : 0;

  const res = run(
    dbKnex("chats").insert({
      id,
      name: normalizedName,
      type: normalizedType,
      group_username: groupUsername,
      group_visibility: groupVisibility,
      invite_token: inviteToken,
      created_by_user_id: createdByUserId,
      group_color: groupColor,
      allow_member_invites: allowMemberInvites,
      group_avatar_url: groupAvatarUrl,
      verified,
      auto_add_new_users: autoAddNewUsers,
    }),
  );

  if (res && typeof res.then === "function") {
    return res.then(() => id);
  }
  return id;
}

export function addChatMember(chatId, userId, role = "member") {
  return run(
    dbKnex("chat_members")
      .insert({ chat_id: chatId, user_id: userId, role })
      .onConflict(["chat_id", "user_id"])
      .ignore(),
  );
}

/**
 * Adds users eligible for the admin Add all action. The eligibility criteria
 * intentionally match `db:chat:add <chat> --all`: existing members and users
 * with either persisted or legacy left-chat markers are excluded.
 */
export function addAllEligibleChatMembers(chatId) {
  const leftMessagePattern = "[[system:left:%";
  const addedUsersQb = dbKnex("users")
    .select("users.id", "users.username", "users.nickname")
    .whereNotExists(function () {
      this.select(1).from("chat_members").whereRaw("chat_members.chat_id = ?", [chatId]).whereRaw("chat_members.user_id = users.id");
    })
    .whereNotExists(function () {
      this.select(1).from("chat_left_members").whereRaw("chat_left_members.chat_id = ?", [chatId]).whereRaw("chat_left_members.user_id = users.id");
    })
    .whereNotExists(function () {
      this.select(1).from("chat_messages").whereRaw("chat_messages.chat_id = ?", [chatId]).whereRaw("chat_messages.user_id = users.id").where("chat_messages.body", "like", leftMessagePattern);
    })
    .orderBy("users.id", "asc");

  const rawAddedUsers = getAll(addedUsersQb);

  const skippedLeftQb = dbKnex("users")
    .count("* as count")
    .whereNotExists(function () {
      this.select(1).from("chat_members").whereRaw("chat_members.chat_id = ?", [chatId]).whereRaw("chat_members.user_id = users.id");
    })
    .andWhere((builder) => {
      builder
        .whereExists(function () {
          this.select(1).from("chat_left_members").whereRaw("chat_left_members.chat_id = ?", [chatId]).whereRaw("chat_left_members.user_id = users.id");
        })
        .orWhereExists(function () {
          this.select(1).from("chat_messages").whereRaw("chat_messages.chat_id = ?", [chatId]).whereRaw("chat_messages.user_id = users.id").where("chat_messages.body", "like", leftMessagePattern);
        });
    });

  const rawSkippedLeftRow = getRow(skippedLeftQb);

  if (rawAddedUsers && typeof rawAddedUsers.then === "function") {
    return Promise.all([rawAddedUsers, rawSkippedLeftRow]).then(
      async ([addedUsers, skippedLeftRow]) => {
        const users = addedUsers || [];
        for (const user of users) {
          const res = addChatMember(chatId, user.id, "member");
          if (res && typeof res.then === "function") await res;
        }
        return {
          addedUsers: users,
          skippedLeftCount: Number(skippedLeftRow?.count || 0),
        };
      },
    );
  }

  const addedUsers = rawAddedUsers || [];
  addedUsers.forEach((user) => {
    addChatMember(chatId, user.id, "member");
  });

  return {
    addedUsers,
    skippedLeftCount: Number(rawSkippedLeftRow?.count || 0),
  };
}

export function searchPublicGroups(query, viewerUserId, limit = 20) {
  const like = `%${String(query || "").trim()}%`;
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const qb = dbKnex("chats as c")
    .select(
      "c.id", "c.name", "c.group_username", "c.group_color", "c.group_avatar_url", "c.invite_token", "c.verified",
      dbKnex.raw("(SELECT COUNT(*) FROM chat_members m WHERE m.chat_id = c.id) AS members_count"),
      dbKnex.raw(
        "EXISTS(SELECT 1 FROM chat_members vm WHERE vm.chat_id = c.id AND vm.user_id = ?) AS is_member",
        [viewerUserId],
      ),
    )
    .where("c.type", "group")
    .andWhere((builder) => {
      builder.where("c.group_visibility", "public").orWhereExists(function () {
        this.select(1).from("chat_members as vm").whereRaw("vm.chat_id = c.id").where("vm.user_id", viewerUserId);
      });
    })
    .andWhere((builder) => {
      builder.where("c.name", "like", like).orWhere("c.group_username", "like", like);
    })
    .orderByRaw("CASE WHEN c.group_username LIKE ? THEN 0 ELSE 1 END, c.name ASC", [like])
    .limit(safeLimit);

  return getAll(qb);
}

export function searchPublicChannels(query, viewerUserId, limit = 20) {
  const like = `%${String(query || "").trim()}%`;
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const qb = dbKnex("chats as c")
    .select(
      "c.id", "c.name", "c.group_username", "c.group_color", "c.group_avatar_url", "c.invite_token", "c.verified",
      dbKnex.raw("(SELECT COUNT(*) FROM chat_members m WHERE m.chat_id = c.id) AS members_count"),
      dbKnex.raw(
        "EXISTS(SELECT 1 FROM chat_members vm WHERE vm.chat_id = c.id AND vm.user_id = ?) AS is_member",
        [viewerUserId],
      ),
    )
    .where("c.type", "channel")
    .andWhere((builder) => {
      builder.where("c.group_visibility", "public").orWhereExists(function () {
        this.select(1).from("chat_members as vm").whereRaw("vm.chat_id = c.id").where("vm.user_id", viewerUserId);
      });
    })
    .andWhere((builder) => {
      builder.where("c.name", "like", like).orWhere("c.group_username", "like", like);
    })
    .orderByRaw("CASE WHEN c.group_username LIKE ? THEN 0 ELSE 1 END, c.name ASC", [like])
    .limit(safeLimit);

  return getAll(qb);
}

const normalizeRemoteSourceUsername = (value) =>
  String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase() || null;

const normalizeRemoteSourceChatId = (value) => {
  const raw = String(value || "").trim();
  return raw || null;
};

export function getRemoteChannelSourceByChatId(chatId) {
  return getRow(
    `SELECT id, chat_id, provider, source_raw, source_chat_id, source_username,
            source_url, source_title, source_avatar_url, last_remote_message_id,
            enabled, paused, source_version, sync_metadata, stream_media,
            last_error, last_seen_at, created_at, updated_at
     FROM remote_channel_sources
     WHERE chat_id = ?`,
    [chatId],
  );
}

export function getRemoteChannelSourceById(sourceId) {
  return getRow(
    dbKnex("remote_channel_sources")
      .select(
        "id", "chat_id", "provider", "source_raw", "source_chat_id", "source_username",
        "source_url", "source_title", "source_avatar_url", "last_remote_message_id",
        "enabled", "paused", "source_version", "sync_metadata", "stream_media",
        "last_error", "last_seen_at", "created_at", "updated_at"
      )
      .where("id", Number(sourceId))
      .first(),
  );
}

export function upsertRemoteChannelSource(payload = {}) {
  const chatId = payload.chatId || null;
  if (!chatId) return null;

  const provider = String(payload.provider || "telegram").toLowerCase();
  const sourceRaw = String(payload.sourceRaw || "").trim() || null;
  const sourceChatId = normalizeRemoteSourceChatId(payload.sourceChatId);
  const sourceUsername = normalizeRemoteSourceUsername(payload.sourceUsername);
  const sourceUrl = String(payload.sourceUrl || "").trim() || null;
  const enabled = payload.enabled ? 1 : 0;
  const syncMetadata = payload.syncMetadata ? 1 : 0;
  const streamMedia = payload.streamMedia ? 1 : 0;
  const current = getRemoteChannelSourceByChatId(chatId);
  const sourceChanged = Boolean(
    current?.id &&
      (String(current.source_raw || "") !== String(sourceRaw || "") ||
        String(current.source_chat_id || "") !== String(sourceChatId || "") ||
        String(current.source_username || "") !== String(sourceUsername || "") ||
        String(current.source_url || "") !== String(sourceUrl || "") ||
        String(current.provider || "telegram") !== provider),
  );
  const currentSourceVersion = Math.max(
    1,
    Number(current?.source_version || 1) || 1,
  );
  const sourceVersion = sourceChanged
    ? currentSourceVersion + 1
    : currentSourceVersion;

  run(
    `INSERT INTO remote_channel_sources (
       chat_id, provider, source_raw, source_chat_id, source_username,
       source_url, source_version, sync_metadata, stream_media, enabled,
       last_error, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'))
     ON CONFLICT(chat_id) DO UPDATE SET
       provider = excluded.provider,
       source_title = CASE
         WHEN COALESCE(remote_channel_sources.source_raw, '') != COALESCE(excluded.source_raw, '')
           OR COALESCE(remote_channel_sources.source_chat_id, '') != COALESCE(excluded.source_chat_id, '')
           OR COALESCE(remote_channel_sources.source_username, '') != COALESCE(excluded.source_username, '')
           OR COALESCE(remote_channel_sources.source_url, '') != COALESCE(excluded.source_url, '')
           OR remote_channel_sources.provider != excluded.provider
         THEN NULL
         ELSE remote_channel_sources.source_title
       END,
       source_avatar_url = CASE
         WHEN COALESCE(remote_channel_sources.source_raw, '') != COALESCE(excluded.source_raw, '')
           OR COALESCE(remote_channel_sources.source_chat_id, '') != COALESCE(excluded.source_chat_id, '')
           OR COALESCE(remote_channel_sources.source_username, '') != COALESCE(excluded.source_username, '')
           OR COALESCE(remote_channel_sources.source_url, '') != COALESCE(excluded.source_url, '')
           OR remote_channel_sources.provider != excluded.provider
         THEN NULL
         ELSE remote_channel_sources.source_avatar_url
       END,
       last_remote_message_id = CASE
         WHEN COALESCE(remote_channel_sources.source_raw, '') != COALESCE(excluded.source_raw, '')
           OR COALESCE(remote_channel_sources.source_chat_id, '') != COALESCE(excluded.source_chat_id, '')
           OR COALESCE(remote_channel_sources.source_username, '') != COALESCE(excluded.source_username, '')
           OR COALESCE(remote_channel_sources.source_url, '') != COALESCE(excluded.source_url, '')
           OR remote_channel_sources.provider != excluded.provider
         THEN NULL
         ELSE remote_channel_sources.last_remote_message_id
       END,
       source_raw = excluded.source_raw,
       source_chat_id = excluded.source_chat_id,
       source_username = excluded.source_username,
       source_url = excluded.source_url,
       source_version = excluded.source_version,
       sync_metadata = excluded.sync_metadata,
       stream_media = excluded.stream_media,
       enabled = excluded.enabled,
       last_error = NULL,
       updated_at = datetime('now')`,
    [
      chatId,
      provider,
      sourceRaw,
      sourceChatId,
      sourceUsername,
      sourceUrl,
      sourceVersion,
      syncMetadata,
      streamMedia,
      enabled,
    ],
  );

  if (current?.id && (sourceChanged || !enabled)) {
    run(
      `UPDATE remote_channel_queue
       SET status = 'skipped',
           locked_at = NULL,
           lock_owner = NULL,
           last_error = ?,
           processed_at = datetime('now')
       WHERE source_id = ?
         AND status IN ('pending', 'retry', 'processing')`,
      [
        sourceChanged
          ? "Remote source changed before this item was mirrored."
          : "Remote Channel was disabled before this item was mirrored.",
        Number(current.id),
      ],
    );
  }
  saveDatabase();

  return getRemoteChannelSourceByChatId(chatId);
}

export function listEnabledRemoteChannelSources(provider = "telegram") {
  return getAll(
    dbKnex("remote_channel_sources")
      .select(
        "id", "chat_id", "provider", "source_raw", "source_chat_id", "source_username",
        "source_url", "source_title", "source_avatar_url", "last_remote_message_id",
        "enabled", "paused", "source_version", "sync_metadata", "stream_media",
        "last_error", "last_seen_at", "created_at", "updated_at"
      )
      .where("provider", String(provider || "telegram"))
      .where("enabled", 1)
      .where("paused", 0)
      .orderBy("id", "asc"),
  );
}

export function updateRemoteChannelSourceSeen(sourceId, payload = {}) {
  const id = Number(sourceId || 0);
  if (!id) return 0;

  const current = getRemoteChannelSourceById(id);
  if (!current?.id) return 0;

  const sourceChatId = normalizeRemoteSourceChatId(payload.sourceChatId);
  const sourceUsername = normalizeRemoteSourceUsername(payload.sourceUsername);
  const hasSourceTitle = Object.prototype.hasOwnProperty.call(
    payload,
    "sourceTitle",
  );
  const sourceTitle = hasSourceTitle
    ? String(payload.sourceTitle || "").trim() || null
    : undefined;
  const hasSourceAvatarUrl = Object.prototype.hasOwnProperty.call(
    payload,
    "sourceAvatarUrl",
  );
  const sourceAvatarUrl = hasSourceAvatarUrl
    ? String(payload.sourceAvatarUrl || "").trim() || null
    : undefined;
  const hasLastRemoteMessageId = Number.isFinite(
    Number(payload.lastRemoteMessageId),
  );
  const lastRemoteMessageId = hasLastRemoteMessageId
    ? Math.max(0, Math.trunc(Number(payload.lastRemoteMessageId)))
    : null;
  const currentLastRemoteMessageId =
    Number(current.last_remote_message_id || 0) || 0;
  const sourceChatIdChanged =
    Boolean(sourceChatId) &&
    String(current.source_chat_id || "") !== String(sourceChatId || "");
  const sourceUsernameChanged =
    Boolean(sourceUsername) &&
    String(current.source_username || "") !== String(sourceUsername || "");
  const sourceTitleChanged =
    hasSourceTitle &&
    String(current.source_title || "") !== String(sourceTitle || "");
  const sourceAvatarUrlChanged =
    hasSourceAvatarUrl &&
    String(current.source_avatar_url || "") !== String(sourceAvatarUrl || "");
  const lastRemoteMessageIdAdvanced =
    hasLastRemoteMessageId && lastRemoteMessageId > currentLastRemoteMessageId;
  const shouldTouch = payload.touch !== false;
  const shouldClearError =
    payload.clearError !== false && Boolean(String(current.last_error || ""));
  const shouldUpdate =
    shouldTouch ||
    shouldClearError ||
    sourceChatIdChanged ||
    sourceUsernameChanged ||
    sourceTitleChanged ||
    sourceAvatarUrlChanged ||
    lastRemoteMessageIdAdvanced;

  if (!shouldUpdate) return 0;

  return run(
    `UPDATE remote_channel_sources
     SET source_chat_id = CASE WHEN ? THEN ? ELSE source_chat_id END,
         source_username = CASE WHEN ? THEN ? ELSE source_username END,
         source_title = CASE WHEN ? THEN ? ELSE source_title END,
         source_avatar_url = CASE WHEN ? THEN ? ELSE source_avatar_url END,
         last_remote_message_id = CASE
           WHEN ? THEN ? ELSE last_remote_message_id
         END,
         last_seen_at = CASE WHEN ? THEN datetime('now') ELSE last_seen_at END,
         last_error = CASE WHEN ? THEN NULL ELSE last_error END,
         updated_at = datetime('now')
     WHERE id = ?`,
    [
      sourceChatIdChanged ? 1 : 0,
      sourceChatId,
      sourceUsernameChanged ? 1 : 0,
      sourceUsername,
      sourceTitleChanged ? 1 : 0,
      hasSourceTitle ? sourceTitle : null,
      sourceAvatarUrlChanged ? 1 : 0,
      hasSourceAvatarUrl ? sourceAvatarUrl : null,
      lastRemoteMessageIdAdvanced ? 1 : 0,
      lastRemoteMessageId,
      shouldTouch ? 1 : 0,
      shouldClearError ? 1 : 0,
      id,
    ],
  );
}

export function updateRemoteChannelSourceError(sourceId, error) {
  const id = Number(sourceId || 0);
  if (!id) return 0;

  const nextError = String(error || "").slice(0, 1000) || null;
  const current = getRemoteChannelSourceById(id);
  if (!current?.id) return 0;
  if (String(current.last_error || "") === String(nextError || "")) return 0;

  return run(
    `UPDATE remote_channel_sources
     SET last_error = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [nextError, id],
  );
}

export function updateRemoteChannelSourcePaused(sourceId, paused) {
  const id = Number(sourceId || 0);
  if (!id) return 0;

  return run(
    `UPDATE remote_channel_sources
     SET paused = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [paused ? 1 : 0, id],
  );
}

export function getCurrentRemoteChannelQueueItemId(sourceId) {
  const id = Number(sourceId || 0);
  if (!id) return isPostgresMode() ? Promise.resolve(null) : null;

  const row = getRow(
    `SELECT id FROM remote_channel_queue
     WHERE source_id = ?
       AND status IN ('pending', 'retry', 'processing')
     ORDER BY id ASC
     LIMIT 1`,
    [id],
  );
  if (row && typeof row.then === "function") {
    return row.then((r) => (r ? Number(r.id) : null));
  }
  return row ? Number(row.id) : null;
}

export function skipCurrentRemoteChannelQueueItem(sourceId) {
  const id = Number(sourceId || 0);
  if (!id) return 0;

  return run(
    `UPDATE remote_channel_queue
     SET status = 'skipped',
         locked_at = NULL,
         lock_owner = NULL,
         last_error = 'Manually skipped.',
         processed_at = datetime('now')
     WHERE id = (
       SELECT id FROM remote_channel_queue
       WHERE source_id = ?
         AND status IN ('pending', 'retry', 'processing')
       ORDER BY id ASC
       LIMIT 1
     )`,
    [id],
  );
}

export function skipAllRemoteChannelQueueItems(sourceId) {
  const id = Number(sourceId || 0);
  if (!id) return 0;

  return run(
    `UPDATE remote_channel_queue
     SET status = 'skipped',
         locked_at = NULL,
         lock_owner = NULL,
         last_error = 'Manually skipped.',
         processed_at = datetime('now')
     WHERE source_id = ?
       AND status IN ('pending', 'retry', 'processing')`,
    [id],
  );
}

export function getRemoteChannelProviderState(provider = "telegram") {
  return getRow(
    `SELECT provider, next_update_offset, last_error, last_polled_at, updated_at
     FROM remote_channel_provider_state
     WHERE provider = ?`,
    [String(provider || "telegram")],
  );
}

export function setRemoteChannelProviderState(provider = "telegram", payload = {}) {
  const normalizedProvider = String(provider || "telegram");
  const nextUpdateOffset =
    Number.isFinite(Number(payload.nextUpdateOffset))
      ? Math.trunc(Number(payload.nextUpdateOffset))
      : null;
  const lastError = Object.prototype.hasOwnProperty.call(payload, "lastError")
    ? String(payload.lastError || "").slice(0, 1000) || null
    : undefined;
  const lastPolledAt = Object.prototype.hasOwnProperty.call(payload, "lastPolledAt")
    ? String(payload.lastPolledAt || "").trim() || null
    : undefined;

  const current = getRemoteChannelProviderState(normalizedProvider);
  const nextOffset =
    nextUpdateOffset === null
      ? Number(current?.next_update_offset || 0) || null
      : nextUpdateOffset;
  const nextError =
    lastError === undefined ? current?.last_error || null : lastError;
  const nextPolledAt =
    lastPolledAt === undefined
      ? current?.last_polled_at || null
      : lastPolledAt;

  return run(
    `INSERT INTO remote_channel_provider_state (
       provider, next_update_offset, last_error, last_polled_at, updated_at
     )
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET
       next_update_offset = excluded.next_update_offset,
       last_error = excluded.last_error,
       last_polled_at = excluded.last_polled_at,
       updated_at = datetime('now')`,
    [normalizedProvider, nextOffset, nextError, nextPolledAt],
  );
}

export function enqueueRemoteChannelQueueItem(payload = {}) {
  const sourceId = Number(payload.sourceId || 0);
  if (!sourceId) return null;

  const provider = String(payload.provider || "telegram").toLowerCase();
  const telegramUpdateId = Number.isFinite(Number(payload.telegramUpdateId))
    ? Math.trunc(Number(payload.telegramUpdateId))
    : null;
  const telegramMessageId = Number.isFinite(Number(payload.telegramMessageId))
    ? Math.trunc(Number(payload.telegramMessageId))
    : null;
  const sourceVersion = Math.max(
    1,
    Math.trunc(Number(payload.sourceVersion || 1)) || 1,
  );
  const payloadJson = String(payload.payloadJson || "").trim();
  if (!payloadJson) return null;

  const inserted = run(
    `INSERT OR IGNORE INTO remote_channel_queue (
       source_id, provider, telegram_update_id, telegram_message_id,
       source_version, payload_json, status, next_attempt_at
     )
     VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    [
      sourceId,
      provider,
      telegramUpdateId,
      telegramMessageId,
      sourceVersion,
      payloadJson,
    ],
  );
  if (!inserted) return null;

  return getRow(
    `SELECT id, source_id, provider, telegram_update_id, telegram_message_id,
            source_version, payload_json, status, attempts, next_attempt_at,
            locked_at, lock_owner, last_error, created_message_id, created_at,
            processed_at
     FROM remote_channel_queue
     WHERE source_id = ?
       AND source_version = ?
       AND (
         (? IS NOT NULL AND telegram_update_id = ?)
         OR (? IS NOT NULL AND telegram_message_id = ?)
       )
     ORDER BY id DESC
     LIMIT 1`,
    [
      sourceId,
      sourceVersion,
      telegramUpdateId,
      telegramUpdateId,
      telegramMessageId,
      telegramMessageId,
    ],
  );
}

export function getRemoteChannelQueueSummary(sourceId) {
  const rawRows = getAll(
    dbKnex("remote_channel_queue")
      .select("status", dbKnex.raw("COUNT(*) AS count"))
      .where("source_id", Number(sourceId))
      .groupBy("status"),
  );

  const summarize = (rows) =>
    (rows || []).reduce((acc, row) => {
      const status = String(row?.status || "").trim() || "unknown";
      acc[status] = Number(row?.count || 0);
      return acc;
    }, {});

  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then(summarize);
  }
  return summarize(rawRows);
}

export function releaseStaleRemoteChannelQueueItems(staleBeforeIso) {
  run(
    `UPDATE remote_channel_queue
     SET status = 'retry',
         locked_at = NULL,
         lock_owner = NULL,
         next_attempt_at = datetime('now')
     WHERE status = 'processing'
       AND locked_at IS NOT NULL
       AND julianday(locked_at) <= julianday(?)`,
    [String(staleBeforeIso || new Date().toISOString())],
  );
}

export function claimNextRemoteChannelQueueItem(lockOwner, nowIso) {
  const now = String(nowIso || new Date().toISOString());
  const row = getRow(
    `SELECT q.id, q.source_id, q.provider, q.telegram_update_id,
            q.telegram_message_id, q.source_version, q.payload_json, q.status,
            q.attempts, q.next_attempt_at, q.locked_at, q.lock_owner,
            q.last_error, q.created_message_id, q.created_at, q.processed_at,
            s.chat_id, s.source_raw, s.source_chat_id, s.source_username,
            s.source_title, s.source_avatar_url, s.last_remote_message_id,
            s.source_version AS current_source_version, s.sync_metadata,
            s.stream_media,
            c.name AS target_chat_name, c.created_by_user_id
     FROM remote_channel_queue q
     JOIN remote_channel_sources s ON s.id = q.source_id
     JOIN chats c ON c.id = s.chat_id
     WHERE q.provider = s.provider
       AND s.enabled = 1
       AND s.paused = 0
       AND q.source_version = s.source_version
       AND c.type = 'channel'
       AND q.status IN ('pending', 'retry')
       AND (
         q.next_attempt_at IS NULL
         OR q.next_attempt_at = ''
         OR julianday(q.next_attempt_at) <= julianday(?)
       )
     ORDER BY julianday(q.created_at) ASC, q.id ASC
     LIMIT 1`,
    [now],
  );

  const processRow = (r) => {
    if (!r?.id) return null;
    const res = run(
      `UPDATE remote_channel_queue
       SET status = 'processing',
           locked_at = ?,
           lock_owner = ?
       WHERE id = ?
         AND status IN ('pending', 'retry')`,
      [now, String(lockOwner || "remote-channel-worker"), Number(r.id)],
    );
    const item = {
      ...r,
      status: "processing",
      locked_at: now,
      lock_owner: String(lockOwner || "remote-channel-worker"),
    };
    if (res && typeof res.then === "function") {
      return res.then(() => item);
    }
    return item;
  };

  if (row && typeof row.then === "function") {
    return row.then(processRow);
  }
  return processRow(row);
}

export function markRemoteChannelQueueItemDone(id, messageId) {
  return run(
    `UPDATE remote_channel_queue
     SET status = 'done',
         locked_at = NULL,
         lock_owner = NULL,
         last_error = NULL,
         created_message_id = ?,
         processed_at = datetime('now')
     WHERE id = ?`,
    [messageId || null, Number(id)],
  );
}

export function markRemoteChannelQueueItemSkipped(id, reason) {
  return run(
    `UPDATE remote_channel_queue
     SET status = 'skipped',
         locked_at = NULL,
         lock_owner = NULL,
         last_error = ?,
         processed_at = datetime('now')
     WHERE id = ?`,
    [String(reason || "Skipped").slice(0, 1000), Number(id)],
  );
}

export function markRemoteChannelQueueItemRetry(id, payload = {}) {
  return run(
    `UPDATE remote_channel_queue
     SET status = ?,
         attempts = attempts + 1,
         next_attempt_at = ?,
         locked_at = NULL,
         lock_owner = NULL,
         last_error = ?
     WHERE id = ?`,
    [
      payload.failed ? "failed" : "retry",
      payload.failed
        ? null
        : String(payload.nextAttemptAt || new Date().toISOString()),
      String(payload.error || "").slice(0, 1000) || null,
      Number(id),
    ],
  );
}

/**
 * Delete completed (done/skipped/failed) queue rows older than the given ISO
 * timestamp. Prevents the remote_channel_queue table from growing unboundedly.
 */
export function purgeOldRemoteChannelQueueItems(olderThanIso) {
  return run(
    `DELETE FROM remote_channel_queue
     WHERE status IN ('done', 'skipped', 'failed')
       AND processed_at IS NOT NULL
       AND processed_at < ?`,
    [String(olderThanIso)],
  );
}

export function removeChatMember(chatId, userId) {
  return run(
    dbKnex("chat_members")
      .where({ chat_id: chatId, user_id: userId })
      .del(),
  );
}

export function markChatMemberLeft(chatId, userId) {
  return run(
    dbKnex("chat_left_members")
      .insert({
        chat_id: chatId,
        user_id: userId,
        left_at: dbKnex.raw("datetime('now')"),
      })
      .onConflict(["chat_id", "user_id"])
      .merge({
        left_at: dbKnex.raw("datetime('now')"),
      }),
  );
}

export function clearChatMemberLeft(chatId, userId) {
  return run(
    dbKnex("chat_left_members")
      .where({ chat_id: chatId, user_id: userId })
      .del(),
  );
}

export async function hasChatMemberLeft(chatId, userId) {
  if (!chatId || !userId) {
    return false;
  }
  const row = getRow(
    dbKnex("chat_left_members")
      .select(dbKnex.raw("1 AS left_chat"))
      .where({ chat_id: chatId, user_id: userId })
      .first(),
  );
  const resolved = row && typeof row.then === "function" ? await row : row;
  return Boolean(resolved);
}

export function markGroupMemberRemoved(chatId, userId, removedByUserId) {
  return run(
    dbKnex("group_removed_members")
      .insert({
        chat_id: chatId,
        user_id: userId,
        removed_by_user_id: removedByUserId,
        removed_at: dbKnex.raw("datetime('now')"),
      })
      .onConflict(["chat_id", "user_id"])
      .merge({
        removed_by_user_id: removedByUserId,
        removed_at: dbKnex.raw("datetime('now')"),
      }),
  );
}

export function clearGroupMemberRemoved(chatId, userId) {
  return run(
    dbKnex("group_removed_members")
      .where({ chat_id: chatId, user_id: userId })
      .del(),
  );
}

export async function isGroupMemberRemoved(chatId, userId) {
  if (!chatId || !userId) {
    return false;
  }
  const row = getRow(
    dbKnex("group_removed_members")
      .select(dbKnex.raw("1 AS removed"))
      .where({ chat_id: chatId, user_id: userId })
      .first(),
  );
  const resolved = row && typeof row.then === "function" ? await row : row;
  return Boolean(resolved);
}

export function findChatByGroupUsername(groupUsername) {
  const raw = String(groupUsername || "").trim().toLowerCase();
  if (!raw) return isPostgresMode() ? Promise.resolve(null) : null;
  const normalized = raw.startsWith("@") ? raw.slice(1) : raw;
  const withAt = normalized.startsWith("@") ? normalized : `@${normalized}`;
  return getRow(
    dbKnex("chats")
      .select("id", "name", "type", "group_username", "group_visibility", "invite_token", "group_color", "allow_member_invites", "group_avatar_url", "created_by_user_id", "verified")
      .whereIn("group_username", [normalized, withAt])
      .whereIn("type", ["group", "channel"])
      .first(),
  );
}

export function findChatByInviteToken(inviteToken) {
  const token = String(inviteToken || "").trim();
  if (!token) return isPostgresMode() ? Promise.resolve(null) : null;
  return getRow(
    dbKnex("chats")
      .select("id", "name", "type", "group_username", "group_visibility", "invite_token", "group_color", "allow_member_invites", "group_avatar_url", "created_by_user_id", "verified")
      .where("invite_token", token)
      .whereIn("type", ["group", "channel"])
      .first(),
  );
}

export function findChatById(chatId) {
  if (!chatId) return isPostgresMode() ? Promise.resolve(null) : null;
  const row = getRow(
    dbKnex("chats")
      .select("id", "name", "type", "group_username", "group_visibility", "invite_token", "group_color", "allow_member_invites", "group_avatar_url", "created_by_user_id", "verified", "auto_add_new_users")
      .where("id", chatId)
      .first(),
  );
  if (row && typeof row.then === "function") {
    return row.then((r) => r || null);
  }
  return row || null;
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

  const updateData = {
    name,
    group_username: groupUsername,
    group_visibility: groupVisibility,
    allow_member_invites: allowMemberInvites,
  };
  if (hasGroupAvatarUrl) {
    updateData.group_avatar_url = groupAvatarUrl;
  }
  if (payload.auto_add_new_users !== undefined || payload.autoAddNewUsers !== undefined) {
    updateData.auto_add_new_users = payload.auto_add_new_users || payload.autoAddNewUsers ? 1 : 0;
  }
  if (groupVisibility === "private") {
    updateData.auto_add_new_users = 0;
  }

  return run(
    dbKnex("chats")
      .where({ id: chatId, type: "group" })
      .update(updateData),
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

  const updateData = {
    name,
    group_username: groupUsername,
    group_visibility: groupVisibility,
    allow_member_invites: allowMemberInvites,
  };
  if (hasGroupAvatarUrl) {
    updateData.group_avatar_url = groupAvatarUrl;
  }
  if (payload.auto_add_new_users !== undefined || payload.autoAddNewUsers !== undefined) {
    updateData.auto_add_new_users = payload.auto_add_new_users || payload.autoAddNewUsers ? 1 : 0;
  }
  if (groupVisibility === "private") {
    updateData.auto_add_new_users = 0;
  }

  return run(
    dbKnex("chats")
      .where({ id: chatId, type: "channel" })
      .update(updateData),
  );
}

export function updateChat(id, updates = {}) {
  const patch = { ...updates };
  if (patch.visibility !== undefined) {
    patch.group_visibility = patch.visibility;
    delete patch.visibility;
  }
  if (patch.autoAddNewUsers !== undefined) {
    patch.auto_add_new_users = patch.autoAddNewUsers ? 1 : 0;
    delete patch.autoAddNewUsers;
  }
  if (patch.auto_add_new_users !== undefined) {
    patch.auto_add_new_users = patch.auto_add_new_users ? 1 : 0;
  }
  if (patch.group_visibility === "private") {
    patch.auto_add_new_users = 0;
  }
  return run(
    dbKnex("chats")
      .where("id", id)
      .update(patch),
  );
}

export async function getAutoAddPublicChatIds() {
  const query = dbKnex("chats")
    .select("id")
    .whereIn("type", ["group", "channel"])
    .where("group_visibility", "public")
    .where("auto_add_new_users", 1);
  const rows = await getAll(query);
  return (rows || []).map((r) => r.id);
}

export async function bulkAddMemberToChats(userId, chatIds) {
  if (!chatIds || chatIds.length === 0) return [];
  const rows = chatIds.map((chatId) => ({
    chat_id: chatId,
    user_id: userId,
    role: "member",
  }));
  await run(
    dbKnex("chat_members")
      .insert(rows)
      .onConflict(["chat_id", "user_id"])
      .ignore(),
  );
  return chatIds;
}

export function regenerateGroupInviteToken(chatId, inviteToken) {
  return run(
    dbKnex("chats")
      .where("id", chatId)
      .whereIn("type", ["group", "channel"])
      .update({ invite_token: String(inviteToken || "").trim() }),
  );
}

export async function isMember(chatId, userId) {
  if (!chatId || !userId) {
    return false;
  }
  const row = getRow(
    dbKnex("chat_members")
      .select("chat_id")
      .where({ chat_id: chatId, user_id: userId })
      .first(),
  );
  const resolved = row && typeof row.then === "function" ? await row : row;
  return Boolean(resolved);
}

export function listChatMembers(chatId) {
  const rawRows = getAll(
    dbKnex("chat_members")
      .select(
        "users.id", "users.username", "users.nickname", "users.avatar_url", "users.color",
        "users.verified as user_verified",
        "users.role as user_role",
        "users.status as status",
        "chat_members.role",
      )
      .join("users", "users.id", "chat_members.user_id")
      .where("chat_members.chat_id", chatId)
      .orderBy("users.username", "asc"),
  );
  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then((rows) => rows || []);
  }
  return rawRows || [];
}

export function listChatMembersForChats(chatIds = []) {
  const ids = (Array.isArray(chatIds) ? chatIds : []).filter((id) => id);
  if (!ids.length) {
    return isPostgresMode() ? Promise.resolve(new Map()) : new Map();
  }
  const rawRows = getAll(
    dbKnex("chat_members")
      .select(
        "chat_members.chat_id",
        "users.id", "users.username", "users.nickname", "users.avatar_url", "users.color",
        "users.verified as user_verified",
        "users.role as user_role",
        "users.status as status",
        "chat_members.role",
      )
      .join("users", "users.id", "chat_members.user_id")
      .whereIn("chat_members.chat_id", ids)
      .orderBy("chat_members.chat_id", "asc")
      .orderBy("users.username", "asc"),
  );

  const buildMap = (rows) => {
    const map = new Map();
    for (const row of rows || []) {
      const cid = row.chat_id;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid).push(row);
      const lowerCid = String(cid || "").toLowerCase();
      if (lowerCid !== cid) {
        if (!map.has(lowerCid)) map.set(lowerCid, []);
        map.get(lowerCid).push(row);
      }
    }
    return map;
  };

  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then(buildMap);
  }
  return buildMap(rawRows);
}

export async function getChatMemberRole(chatId, userId) {
  if (!chatId || !userId) {
    return "";
  }
  const row = getRow(
    dbKnex("chat_members")
      .select("role")
      .where({ chat_id: chatId, user_id: userId })
      .first(),
  );
  const resolved = row && typeof row.then === "function" ? await row : row;
  return String(resolved?.role || "");
}

export function setChatMemberRole(chatId, userId, role = "member") {
  run(
    dbKnex("chat_members")
      .where({ chat_id: chatId, user_id: userId })
      .update({ role: String(role || "member") }),
  );
}

export function deleteChatById(chatId) {
  if (isPostgresMode()) return deleteChatByIdPostgres(chatId);
  return deleteChatByIdSqlite(chatId);
}

async function deleteChatByIdPostgres(chatId) {
  if (!chatId) return { storedNames: [] };

  return await dbKnex.transaction(async (trx) => {
    const fileRows = await trx("chat_message_files as cmf")
      .select("cmf.stored_name")
      .join("chat_messages as cm", "cm.id", "cmf.message_id")
      .where("cm.chat_id", chatId);
    const storedNames = fileRows
      .map((row) => String(row?.stored_name || "").trim())
      .filter(Boolean);

    await trx("chat_message_reads")
      .whereIn("message_id", function () {
        this.select("id").from("chat_messages").where("chat_id", chatId);
      })
      .del();
    await trx("hidden_chat_messages")
      .whereIn("message_id", function () {
        this.select("id").from("chat_messages").where("chat_id", chatId);
      })
      .del();
    await trx("chat_message_files")
      .whereIn("message_id", function () {
        this.select("id").from("chat_messages").where("chat_id", chatId);
      })
      .del();
    await trx("chat_messages").where("chat_id", chatId).del();
    await trx("chat_members").where("chat_id", chatId).del();
    await trx("hidden_chats").where("chat_id", chatId).del();
    await trx("chat_mutes").where("chat_id", chatId).del();
    await trx("chat_left_members").where("chat_id", chatId).del();
    await trx("group_removed_members").where("chat_id", chatId).del();
    await trx("remote_channel_queue")
      .whereIn("source_id", function () {
        this.select("id").from("remote_channel_sources").where("chat_id", chatId);
      })
      .del();
    await trx("remote_channel_sources").where("chat_id", chatId).del();
    await trx("chats").where("id", chatId).del();

    return { storedNames };
  });
}

function deleteChatByIdSqlite(chatId) {
  if (!chatId) return { storedNames: [] };

  const fileRows = getAll(
    dbKnex("chat_message_files as cmf")
      .select("cmf.stored_name")
      .join("chat_messages as cm", "cm.id", "cmf.message_id")
      .where("cm.chat_id", chatId),
  );
  const storedNames = fileRows
    .map((row) => String(row?.stored_name || "").trim())
    .filter(Boolean);

  const savepoint = `sp_delete_chat_${Date.now()}`;
  runWithoutSave(`SAVEPOINT ${savepoint}`);
  try {
    runWithoutSave(
      dbKnex("chat_message_reads")
        .whereIn("message_id", function () {
          this.select("id").from("chat_messages").where("chat_id", chatId);
        })
        .del(),
    );
    runWithoutSave(
      dbKnex("hidden_chat_messages")
        .whereIn("message_id", function () {
          this.select("id").from("chat_messages").where("chat_id", chatId);
        })
        .del(),
    );
    runWithoutSave(
      dbKnex("chat_message_files")
        .whereIn("message_id", function () {
          this.select("id").from("chat_messages").where("chat_id", chatId);
        })
        .del(),
    );
    runWithoutSave(dbKnex("chat_messages").where("chat_id", chatId).del());
    runWithoutSave(dbKnex("chat_members").where("chat_id", chatId).del());
    runWithoutSave(dbKnex("hidden_chats").where("chat_id", chatId).del());
    runWithoutSave(dbKnex("chat_mutes").where("chat_id", chatId).del());
    runWithoutSave(dbKnex("chat_left_members").where("chat_id", chatId).del());
    runWithoutSave(dbKnex("group_removed_members").where("chat_id", chatId).del());
    runWithoutSave(
      dbKnex("remote_channel_queue")
        .whereIn("source_id", function () {
          this.select("id").from("remote_channel_sources").where("chat_id", chatId);
        })
        .del(),
    );
    runWithoutSave(dbKnex("remote_channel_sources").where("chat_id", chatId).del());
    runWithoutSave(dbKnex("chats").where("id", chatId).del());
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

async function deleteUserByIdPostgres(userId) {
  if (!userId) {
    return { storedNames: [], deletedChatIds: [], transferredChatIds: [] };
  }

  const result = await dbKnex.transaction(async (trx) => {
    const ownerChatRows = await trx("chat_members")
      .select("chat_id")
      .where({ role: "owner", user_id: userId });

    const ownerChatIds = Array.from(
      new Set(ownerChatRows.map((row) => row?.chat_id).filter(Boolean)),
    );
    const chatIdsToDelete = [];
    const ownershipTransfers = [];

    for (const chatId of ownerChatIds) {
      const remainingRows = await trx("chat_members")
        .select("user_id")
        .where("chat_id", chatId)
        .where("user_id", "!=", userId);
      const remaining = remainingRows
        .map((row) => row?.user_id)
        .filter(Boolean);
      if (!remaining.length) {
        chatIdsToDelete.push(chatId);
        continue;
      }
      const nextOwnerId = remaining[Math.floor(Math.random() * remaining.length)];
      if (nextOwnerId) ownershipTransfers.push({ chatId, nextOwnerId });
    }

    const uniqueChatDeletes = Array.from(
      new Set(chatIdsToDelete.filter(Boolean)),
    );
    const storedNames = new Set();
    if (uniqueChatDeletes.length) {
      const fileRows = await trx("chat_message_files as cmf")
        .select("cmf.stored_name")
        .join("chat_messages as cm", "cm.id", "cmf.message_id")
        .whereIn("cm.chat_id", uniqueChatDeletes);
      fileRows.forEach((row) => {
        const name = String(row?.stored_name || "").trim();
        if (name) storedNames.add(name);
      });
    }

    for (const chatId of uniqueChatDeletes) {
      await trx("chat_message_reads")
        .whereIn("message_id", function () {
          this.select("id").from("chat_messages").where("chat_id", chatId);
        })
        .del();
      await trx("chat_message_files")
        .whereIn("message_id", function () {
          this.select("id").from("chat_messages").where("chat_id", chatId);
        })
        .del();
      await trx("chat_messages").where("chat_id", chatId).del();
      await trx("chat_members").where("chat_id", chatId).del();
      await trx("chat_mutes").where("chat_id", chatId).del();
      await trx("chat_left_members").where("chat_id", chatId).del();
      await trx("group_removed_members").where("chat_id", chatId).del();
      await trx("hidden_chats").where("chat_id", chatId).del();
      await trx("chats").where("id", chatId).del();
    }

    for (const transfer of ownershipTransfers) {
      if (uniqueChatDeletes.includes(transfer.chatId)) continue;
      await trx("chat_members")
        .where({ chat_id: transfer.chatId, user_id: transfer.nextOwnerId })
        .update({ role: "owner" });
    }

    await trx("sessions").where("user_id", userId).del();
    await trx("hidden_chats").where("user_id", userId).del();
    await trx("hidden_chat_messages").where("user_id", userId).del();
    await trx("chat_message_reads").where("user_id", userId).del();
    await trx("push_subscriptions").where("user_id", userId).del();
    await trx("chat_messages")
      .where("read_by_user_id", userId)
      .update({ read_by_user_id: null });
    await trx("chat_left_members").where("user_id", userId).del();
    await trx("chat_members").where("user_id", userId).del();
    await trx("users").where("id", userId).del();

    return {
      storedNames: Array.from(storedNames),
      deletedChatIds: uniqueChatDeletes,
      transferredChatIds: ownershipTransfers.map((transfer) => transfer.chatId),
    };
  });

  return result;
}

export function deleteUserById(userId) {
  if (isPostgresMode()) return deleteUserByIdPostgres(userId);
  return deleteUserByIdSqlite(userId);
}
function deleteUserByIdSqlite(userId) {
  if (!userId) {
    return { storedNames: [], deletedChatIds: [], transferredChatIds: [] };
  }

  const ownerChatRows = getAll(
    dbKnex("chat_members")
      .select("chat_id")
      .where({ role: "owner", user_id: userId }),
  );
  const ownerChatIds = Array.from(
    new Set(ownerChatRows.map((row) => row?.chat_id).filter(Boolean)),
  );

  const chatIdsToDelete = [];
  const ownershipTransfers = [];

  ownerChatIds.forEach((chatId) => {
    const remaining = getAll(
      dbKnex("chat_members")
        .select("user_id")
        .where("chat_id", chatId)
        .where("user_id", "!=", userId),
    )
      .map((row) => row?.user_id)
      .filter(Boolean);

    if (!remaining.length) {
      chatIdsToDelete.push(chatId);
      return;
    }

    const nextOwnerId = remaining[Math.floor(Math.random() * remaining.length)];
    if (nextOwnerId) {
      ownershipTransfers.push({
        chatId,
        nextOwnerId,
      });
    }
  });

  const uniqueChatDeletes = Array.from(
    new Set(chatIdsToDelete.filter(Boolean)),
  );

  const storedNames = new Set();

  if (uniqueChatDeletes.length) {
    const chatFileRows = getAll(
      dbKnex("chat_message_files as cmf")
        .select("cmf.stored_name")
        .join("chat_messages as cm", "cm.id", "cmf.message_id")
        .whereIn("cm.chat_id", uniqueChatDeletes),
    );
    chatFileRows.forEach((row) => {
      const name = String(row?.stored_name || "").trim();
      if (name) storedNames.add(name);
    });
  }

  const savepoint = `sp_delete_user_${Date.now()}`;
  runWithoutSave(`SAVEPOINT ${savepoint}`);
  try {
    if (uniqueChatDeletes.length) {
      uniqueChatDeletes.forEach((chatId) => {
        runWithoutSave(
          dbKnex("chat_message_reads")
            .whereIn("message_id", function () {
              this.select("id").from("chat_messages").where("chat_id", chatId);
            })
            .del(),
        );
        runWithoutSave(
          dbKnex("chat_message_files")
            .whereIn("message_id", function () {
              this.select("id").from("chat_messages").where("chat_id", chatId);
            })
            .del(),
        );
        runWithoutSave(dbKnex("chat_messages").where("chat_id", chatId).del());
        runWithoutSave(dbKnex("chat_members").where("chat_id", chatId).del());
        runWithoutSave(dbKnex("chat_mutes").where("chat_id", chatId).del());
        runWithoutSave(dbKnex("chat_left_members").where("chat_id", chatId).del());
        runWithoutSave(dbKnex("group_removed_members").where("chat_id", chatId).del());
        runWithoutSave(dbKnex("hidden_chats").where("chat_id", chatId).del());
        runWithoutSave(dbKnex("chats").where("id", chatId).del());
      });
    }

    ownershipTransfers.forEach((transfer) => {
      if (
        uniqueChatDeletes.includes(transfer.chatId) ||
        !transfer.chatId ||
        !transfer.nextOwnerId
      ) {
        return;
      }
      runWithoutSave(
        dbKnex("chat_members")
          .where({ chat_id: transfer.chatId, user_id: transfer.nextOwnerId })
          .update({ role: "owner" }),
      );
    });

    runWithoutSave(dbKnex("sessions").where("user_id", userId).del());
    runWithoutSave(dbKnex("hidden_chats").where("user_id", userId).del());
    runWithoutSave(dbKnex("hidden_chat_messages").where("user_id", userId).del());
    runWithoutSave(dbKnex("chat_message_reads").where("user_id", userId).del());
    runWithoutSave(dbKnex("push_subscriptions").where("user_id", userId).del());
    runWithoutSave(
      dbKnex("chat_messages")
        .where("read_by_user_id", userId)
        .update({ read_by_user_id: null }),
    );
    runWithoutSave(dbKnex("chat_left_members").where("user_id", userId).del());
    runWithoutSave(dbKnex("chat_members").where("user_id", userId).del());
    runWithoutSave(dbKnex("users").where("id", userId).del());
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
    transferredChatIds: ownershipTransfers.map((t) => t.chatId),
  };
}

export function listChatsForUser(userId) {
  if (!userId) {
    return isPostgresMode() ? Promise.resolve([]) : [];
  }

  const memberChats = dbKnex("chats as c")
    .select(
      "c.id",
      "c.name",
      "c.type",
      "c.group_username",
      "c.group_visibility",
      "c.invite_token",
      "c.group_color",
      "c.allow_member_invites",
      "c.group_avatar_url",
      "c.created_by_user_id",
      "c.created_at",
      "c.verified",
      dbKnex.raw("COALESCE(mu.muted, 0) AS muted"),
    )
    .join("chat_members as m", "m.chat_id", "c.id")
    .leftJoin("chat_mutes as mu", function () {
      this.on("mu.chat_id", "=", "c.id").andOn("mu.user_id", "=", "m.user_id");
    })
    .leftJoin("hidden_chats as h", function () {
      this.on("h.chat_id", "=", "c.id").andOn("h.user_id", "=", "m.user_id");
    })
    .where("m.user_id", userId)
    .whereNull("h.chat_id");

  const lastMessageIdSubquery = dbKnex("chat_messages as last_cm")
    .select("last_cm.id")
    .whereRaw("last_cm.chat_id = mc.id")
    .whereNot("last_cm.body", "like", "[[system:%]]")
    .whereNull("last_cm.hidden_everyone_at")
    .whereNotExists(
      dbKnex("hidden_chat_messages as last_hcm")
        .select(1)
        .where("last_hcm.user_id", userId)
        .whereRaw("last_hcm.message_id = last_cm.id"),
    )
    .orderBy("last_cm.created_at", "desc")
    .orderBy("last_cm.id", "desc")
    .limit(1);

  const outgoingMessageIdSubquery = dbKnex("chat_messages as outgoing_cm")
    .select("outgoing_cm.id")
    .whereRaw("outgoing_cm.chat_id = mc.id")
    .where("outgoing_cm.user_id", userId)
    .whereRaw("NOT (LOWER(COALESCE(outgoing_cm.client_request_id, '')) LIKE ?)", [
      "remote:%",
    ])
    .whereNot("outgoing_cm.body", "like", "[[system:%]]")
    .whereNull("outgoing_cm.hidden_everyone_at")
    .whereNotExists(
      dbKnex("hidden_chat_messages as outgoing_hcm")
        .select(1)
        .where("outgoing_hcm.user_id", userId)
        .whereRaw("outgoing_hcm.message_id = outgoing_cm.id"),
    )
    .orderBy("outgoing_cm.created_at", "desc")
    .orderBy("outgoing_cm.id", "desc")
    .limit(1);

  const unreadCountSubquery = dbKnex("chat_messages as unread_cm")
    .count("*")
    .whereRaw("unread_cm.chat_id = mc.id")
    .whereNot("unread_cm.body", "like", "[[system:%]]")
    .whereNull("unread_cm.hidden_everyone_at")
    .where(function () {
      this.where("unread_cm.user_id", "!=", userId).orWhereRaw(
        "LOWER(COALESCE(unread_cm.client_request_id, '')) LIKE ?",
        ["remote:%"],
      );
    })
    .whereNotExists(
      dbKnex("chat_message_reads as cmr")
        .select(1)
        .where("cmr.user_id", userId)
        .whereRaw("cmr.message_id = unread_cm.id"),
    )
    .whereNotExists(
      dbKnex("hidden_chat_messages as unread_hcm")
        .select(1)
        .where("unread_hcm.user_id", userId)
        .whereRaw("unread_hcm.message_id = unread_cm.id"),
    );

  const query = dbKnex
    .with("member_chats", memberChats)
    .select(
      "mc.id",
      "mc.name",
      "mc.type",
      "mc.group_username",
      "mc.group_visibility",
      "mc.invite_token",
      "mc.group_color",
      "mc.allow_member_invites",
      "mc.group_avatar_url",
      "mc.created_by_user_id",
      "mc.verified",
      "mc.muted",
      dbKnex.raw("COALESCE(rcs.enabled, 0) AS remote_channel_enabled"),
      "last_vm.id as last_message_id",
      dbKnex.raw("COALESCE(last_vm.edited_body, last_vm.body) AS last_message"),
      "last_vm.created_at as last_time",
      "last_vm.user_id as last_sender_id",
      "last_vm.client_request_id as last_message_client_request_id",
      dbKnex.raw(
        "CASE WHEN last_vm.id IS NULL THEN NULL ELSE COALESCE(last_user.username, 'deleted') END AS last_sender_username",
      ),
      dbKnex.raw(
        "CASE WHEN last_vm.id IS NULL THEN NULL ELSE COALESCE(last_user.nickname, 'Deleted user') END AS last_sender_nickname",
      ),
      "last_user.avatar_url as last_sender_avatar_url",
      "last_vm.read_at as last_message_read_at",
      "last_vm.read_by_user_id as last_message_read_by_user_id",
      "outgoing_vm.created_at as last_outgoing_time",
      dbKnex.raw("COALESCE((?), 0) AS unread_count", [unreadCountSubquery]),
    )
    .from("member_chats as mc")
    .leftJoin("chat_messages as last_vm", "last_vm.id", lastMessageIdSubquery)
    .leftJoin("users as last_user", "last_user.id", "last_vm.user_id")
    .leftJoin("chat_messages as outgoing_vm", "outgoing_vm.id", outgoingMessageIdSubquery)
    .leftJoin("remote_channel_sources as rcs", function () {
      this.on("rcs.chat_id", "=", "mc.id").andOn("rcs.enabled", "=", dbKnex.raw("1"));
    })
    .orderBy("last_vm.created_at", "desc")
    .orderBy("last_vm.id", "desc")
    .orderBy("mc.created_at", "desc");

  const rawRows = getAll(query);

  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then((rows) => (rows || []).map(decryptMessageRow));
  }

  return (rawRows || []).map(decryptMessageRow);
}

export function createMessage(
  chatId,
  userId,
  body,
  replyToMessageId = null,
  expiresAt = null,
  clientRequestId = null,
  { allowPlaintextSystemMessage = false } = {},
) {
  const id = generateUuid();
  const storedBody = storageEncryption.encryptText(body, {
    allowPlaintextSystemMessage,
  });
  const res = run(
    dbKnex("chat_messages").insert({
      id,
      chat_id: chatId,
      user_id: userId,
      body: storedBody,
      reply_to_message_id: replyToMessageId || null,
      expires_at: expiresAt || null,
      client_request_id: clientRequestId || null,
    }),
  );

  if (res && typeof res.then === "function") {
    return res.then(() => id);
  }
  return id;
}

export function findMessageIdByClientRequestId(chatId, userId, clientRequestId) {
  const normalized = String(clientRequestId || "").trim();
  if (!normalized) return isPostgresMode() ? Promise.resolve(null) : null;
  const row = getRow(
    dbKnex("chat_messages")
      .select("id")
      .where({
        chat_id: chatId,
        user_id: userId,
        client_request_id: normalized,
      })
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .first(),
  );
  if (row && typeof row.then === "function") {
    return row.then((r) => r?.id || null);
  }
  return row?.id || null;
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

  const createAndWrap = () => {
    const rawId = createMessage(
      chatId,
      userId,
      body,
      replyToMessageId,
      expiresAt,
      normalizedClientRequestId,
    );
    if (rawId && typeof rawId.then === "function") {
      return rawId.then((id) => ({ id, deduped: false }));
    }
    return { id: rawId, deduped: false };
  };

  if (normalizedClientRequestId) {
    const rawExisting = findMessageIdByClientRequestId(
      chatId,
      userId,
      normalizedClientRequestId,
    );
    if (rawExisting && typeof rawExisting.then === "function") {
      return rawExisting.then((existingId) => {
        if (existingId) return { id: existingId, deduped: true };
        return createAndWrap();
      });
    }
    if (rawExisting) {
      return { id: rawExisting, deduped: true };
    }
  }

  try {
    return createAndWrap();
  } catch (error) {
    if (!normalizedClientRequestId) {
      throw error;
    }
    const rawFallback = findMessageIdByClientRequestId(
      chatId,
      userId,
      normalizedClientRequestId,
    );
    if (rawFallback && typeof rawFallback.then === "function") {
      return rawFallback.then((existingId) => {
        if (existingId) return { id: existingId, deduped: true };
        throw error;
      });
    }
    if (rawFallback) {
      return { id: rawFallback, deduped: true };
    }
    throw error;
  }
}

export function markMessageRead(messageId, readerId) {
  const updateRes = run(
    dbKnex("chat_messages")
      .where("id", messageId)
      .update({
        read_at: dbKnex.raw("datetime('now')"),
        read_by_user_id: readerId,
      }),
  );
  const rowRes = getRow(
    dbKnex("chat_messages")
      .select("user_id", "client_request_id")
      .where("id", messageId)
      .first(),
  );

  const processRow = (row) => {
    if (row?.user_id === readerId && !isRemoteMessageRow(row)) {
      return;
    }
    return run(
      dbKnex("chat_message_reads")
        .insert({
          message_id: messageId,
          user_id: readerId,
          read_at: dbKnex.raw("datetime('now')"),
        })
        .onConflict(["message_id", "user_id"])
        .ignore(),
    );
  };

  if (rowRes && typeof rowRes.then === "function") {
    return Promise.resolve(updateRes).then(() => rowRes.then(processRow));
  }
  return processRow(rowRes);
}

export function findSavedChatByUserId(userId) {
  const row = getRow(
    dbKnex("chats")
      .select(
        "id",
        "name",
        "type",
        "group_username",
        "group_visibility",
        "invite_token",
        "group_color",
        "allow_member_invites",
        "group_avatar_url",
        "created_by_user_id",
      )
      .where({ type: "saved", created_by_user_id: userId })
      .first(),
  );
  if (row && typeof row.then === "function") {
    return row.then((r) => r || null);
  }
  return row || null;
}

export function ensureSavedChatForUser(userId) {
  const rawExisting = findSavedChatByUserId(userId);

  const processExisting = (existing) => {
    if (existing?.id) {
      const memRes = isMember(existing.id, userId);
      const handleMem = (isMem) => {
        if (!isMem) {
          addChatMember(existing.id, userId, "owner");
        }
        if (String(existing.group_visibility || "").toLowerCase() !== "private") {
          run(
            dbKnex("chats")
              .where("id", existing.id)
              .update({ group_visibility: "private" }),
          );
        }
        return existing;
      };
      if (memRes && typeof memRes.then === "function") {
        return memRes.then(handleMem);
      }
      return handleMem(memRes);
    }
    const rawChatId = createChat("Saved messages", "saved", {
      createdByUserId: userId,
    });

    const handleChatId = (chatId) => {
      if (!chatId) return null;
      const addRes = addChatMember(chatId, userId, "owner");
      const handleAdd = () => findChatById(chatId);
      if (addRes && typeof addRes.then === "function") {
        return addRes.then(handleAdd);
      }
      return handleAdd();
    };

    if (rawChatId && typeof rawChatId.then === "function") {
      return rawChatId.then(handleChatId);
    }
    return handleChatId(rawChatId);
  };

  if (rawExisting && typeof rawExisting.then === "function") {
    return rawExisting.then(processExisting);
  }
  return processExisting(rawExisting);
}

export function findMessageById(messageId) {
  const rawRow = getRow(
    dbKnex("chat_messages")
      .select(
        "id",
        "chat_id",
        "user_id",
        "body",
        "edited",
        "edited_body",
        "hidden_everyone_at",
        "forwarded_from_chat_id",
        "forwarded_from_label",
        "forwarded_from_user_id",
        "forwarded_from_username",
        "forwarded_from_avatar_url",
        "forwarded_from_color",
        "created_at",
        "expires_at",
      )
      .where("id", messageId)
      .first(),
  );
  if (rawRow && typeof rawRow.then === "function") {
    return rawRow.then(decryptMessageRow);
  }
  return decryptMessageRow(rawRow);
}

export function setMessageExpiresAt(messageId, expiresAt = null) {
  run(
    dbKnex("chat_messages")
      .where("id", messageId)
      .update({ expires_at: expiresAt || null }),
  );
}

export function editMessage(messageId, editedBody) {
  run(
    dbKnex("chat_messages")
      .where("id", messageId)
      .update({
        edited: 1,
        edited_body: storageEncryption.encryptText(String(editedBody || "")),
      }),
  );
}

export function hideMessageForUser(messageId, userId) {
  run(
    dbKnex("hidden_chat_messages")
      .insert({
        message_id: messageId,
        user_id: userId,
        hidden_at: dbKnex.raw("datetime('now')"),
      })
      .onConflict(["user_id", "message_id"])
      .merge({
        hidden_at: dbKnex.raw("datetime('now')"),
      }),
  );
}

export function hideMessageForEveryone(messageId) {
  run(
    dbKnex("chat_messages")
      .where("id", messageId)
      .update({
        hidden_everyone_at: dbKnex.raw("datetime('now')"),
      }),
  );
}

export function setMessageForwardOrigin(messageId, payload = {}) {
  return run(
    dbKnex("chat_messages")
      .where("id", messageId)
      .update({
        forwarded_from_chat_id: payload.sourceChatId || null,
        forwarded_from_label: String(payload.label || "").trim() || null,
        forwarded_from_user_id: payload.sourceUserId || null,
        forwarded_from_username: String(payload.sourceUsername || "").trim() || null,
        forwarded_from_avatar_url: String(payload.sourceAvatarUrl || "").trim() || null,
        forwarded_from_color: String(payload.sourceColor || "").trim() || null,
      }),
  );
}

export function createMessageFiles(messageId, files = []) {
  if (messageId === undefined || messageId === null || !Array.isArray(files) || !files.length) {
    return isPostgresMode() ? Promise.resolve([]) : [];
  }

  const queries = files.map((file) => {
    const originalName = file.originalName || file.original_name || "";
    const storedName = file.storedName || file.stored_name || "";
    const mimeType = file.mimeType || file.mime_type || "";
    const sizeBytes = Number(file.sizeBytes || file.size_bytes || 0);
    const widthPx = Number.isFinite(Number(file.widthPx ?? file.width_px))
      ? Number(file.widthPx ?? file.width_px)
      : null;
    const heightPx = Number.isFinite(Number(file.heightPx ?? file.height_px))
      ? Number(file.heightPx ?? file.height_px)
      : null;
    const durationSeconds = Number.isFinite(
      Number(file.durationSeconds ?? file.duration_seconds),
    )
      ? Number(file.durationSeconds ?? file.duration_seconds)
      : null;
    const expiresAt = file.expiresAt || file.expires_at || null;
    const storageDriver =
      file.storageDriver || file.storage_driver || "local";
    const storageKey = file.storageKey || file.storage_key || null;
    const processingStatus =
      file.processingStatus || file.processing_status || "ready";
    const blurhash = file.blurhash || null;
    const waveform = file.waveform || null;
    const thumbStorageKey =
      file.thumbStorageKey || file.thumb_storage_key || null;
    const encryptionType =
      file.encryptionType || file.encryption_type || "none";

    return run(
      dbKnex("chat_message_files").insert({
        message_id: messageId,
        kind: file.kind,
        original_name: originalName,
        stored_name: storedName,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        width_px: widthPx,
        height_px: heightPx,
        duration_seconds: durationSeconds,
        expires_at: expiresAt,
        storage_driver: storageDriver,
        storage_key: storageKey,
        processing_status: processingStatus,
        blurhash,
        waveform,
        thumb_storage_key: thumbStorageKey,
        encryption_type: encryptionType,
      }),
    );
  });

  if (isPostgresMode()) {
    return Promise.all(queries);
  }
  return queries;
}

export function recordPendingPresignedUpload({ storageKey, userId = null, expiresAt = null }) {
  if (!storageKey) return null;
  const key = String(storageKey).trim();
  if (!key) return null;
  const nowIso = new Date().toISOString();
  run(
    dbKnex("pending_presigned_uploads").insert({
      storage_key: key,
      user_id: userId || null,
      created_at: nowIso,
      expires_at: expiresAt || null,
    }),
  );
  return { storage_key: key, user_id: userId, created_at: nowIso, expires_at: expiresAt };
}

export function removePendingPresignedUploads(storageKeys = []) {
  const keys = (Array.isArray(storageKeys) ? storageKeys : [storageKeys])
    .map((k) => (typeof k === "string" ? k.trim() : (k?.storageKey || k?.storage_key || k?.key || "")))
    .filter(Boolean);
  if (!keys.length) return 0;
  run(
    dbKnex("pending_presigned_uploads").whereIn("storage_key", keys).del(),
  );
  return keys.length;
}

export function listPendingPresignedUploads(cutoffIso = null) {
  let query = dbKnex("pending_presigned_uploads").select("*");
  if (cutoffIso) {
    query = query.where("created_at", "<=", cutoffIso);
  }
  return getAll(query);
}

function normalizeDbTimestamp(value) {
  const str = String(value || "").trim();
  if (!str) return "";
  if (str.includes("T")) {
    const d = new Date(str);
    if (Number.isFinite(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      const hours = String(d.getUTCHours()).padStart(2, "0");
      const mins = String(d.getUTCMinutes()).padStart(2, "0");
      const secs = String(d.getUTCSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
    }
    return str.replace("T", " ").replace(/Z$/i, "").trim();
  }
  return str;
}

export function getMessages(chatId, options = {}) {
  const limitRaw = Number(options.limit || 50);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(10000, limitRaw))
    : 50;
  const beforeIdRaw = String(options.beforeId || "").trim();
  const beforeCreatedAtRaw = normalizeDbTimestamp(options.beforeCreatedAt);
  const afterIdRaw = String(options.afterId || "").trim();
  const afterCreatedAtRaw = normalizeDbTimestamp(options.afterCreatedAt);
  const viewerUserIdRaw = String(options.viewerUserId || "").trim();
  const hasViewerUserId = Boolean(viewerUserIdRaw);
  const hasBeforeId = Boolean(beforeIdRaw);
  const hasBeforeCreatedAt = Boolean(beforeCreatedAtRaw);
  const hasBefore = hasBeforeId && hasBeforeCreatedAt;
  const hasAfterId = Boolean(afterIdRaw);
  const hasAfterCreatedAt = Boolean(afterCreatedAtRaw);
  // afterId anchor: fetch messages at or after this message (inclusive), ascending
  const hasAfter = hasAfterId && hasAfterCreatedAt;

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
         chat_messages.created_at < ?
         OR (
           chat_messages.created_at = ?
           AND chat_messages.id < ?
         )
       )`
    : "";

  // afterSql: inclusive — includes the anchor message itself so the unread
  // divider message is always present in the returned window.
  const afterSql = hasAfter
    ? `
       AND (
         chat_messages.created_at > ?
         OR (
           chat_messages.created_at = ?
           AND chat_messages.id >= ?
         )
       )`
    : "";

  const whereSql = `WHERE chat_messages.chat_id = ?${visibilitySql}${beforeSql}${afterSql}`;
  const replyJoinVisibilitySql = hasViewerUserId
    ? `AND ${getVisibleMessageFilterSql(
        "reply",
        "WHERE hidden_chat_messages.user_id = ?",
      )}`
    : "AND reply.hidden_everyone_at IS NULL";

  const params = [];
  if (hasViewerUserId) {
    params.push(viewerUserIdRaw);
  }
  params.push(chatId);
  if (hasViewerUserId) {
    params.push(viewerUserIdRaw);
  }
  if (hasBefore) {
    params.push(beforeCreatedAtRaw, beforeCreatedAtRaw, beforeIdRaw);
  }
  if (hasAfter) {
    params.push(afterCreatedAtRaw, afterCreatedAtRaw, afterIdRaw);
  }
  params.push(limit + 1);

  // When using afterId we fetch ascending (oldest-first) so we get the window
  // starting from the anchor. Without afterId we keep the existing behaviour
  // of fetching descending (newest-first) and reversing.
  const orderSql = hasAfter
    ? "ORDER BY chat_messages.created_at ASC, chat_messages.id ASC"
    : "ORDER BY chat_messages.created_at DESC, chat_messages.id DESC";

  const rawRows = getAll(
    `
    SELECT chat_messages.id,
      COALESCE(chat_messages.edited_body, chat_messages.body) AS body,
      chat_messages.client_request_id,
      chat_messages.edited,
      chat_messages.edited_body,
      chat_messages.client_request_id,
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
      users.role AS user_role,
      users.verified AS user_verified,
      reply.id AS reply_id,
      COALESCE(reply.edited_body, reply.body) AS reply_body,
      reply.created_at AS reply_created_at,
      reply.user_id AS reply_user_id,
      COALESCE(reply_user.username, 'deleted') AS reply_username,
      COALESCE(reply_user.nickname, 'Deleted user') AS reply_nickname,
      reply_user.avatar_url AS reply_avatar_url,
      reply_user.color AS reply_user_color,
      reply_user.verified AS reply_user_verified,
      reply_user.role AS reply_user_role
    FROM chat_messages
    LEFT JOIN users ON users.id = chat_messages.user_id
    LEFT JOIN chat_messages reply
      ON reply.id = chat_messages.reply_to_message_id
      ${replyJoinVisibilitySql}
    LEFT JOIN users reply_user ON reply_user.id = reply.user_id
    ${whereSql}
    ${orderSql}
    LIMIT ?
  `,
    params,
  );

  const processRows = (rowsRaw) => {
    const list = rowsRaw || [];
    const hasMore = list.length > limit;
    const rows = hasAfter
      ? list.slice(0, limit)
      : list.slice(0, limit).reverse();

    return {
      messages: rows.map(decryptMessageRow),
      hasMore,
    };
  };

  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then(processRows);
  }
  return processRows(rawRows);
}

/**
 * Returns the first message in a chat that the given user has not read yet
 * (from another user or a remote message), along with its created_at timestamp.
 * Returns null if there are no unread messages.
 */
export function getFirstUnreadMessage(chatId, viewerUserId) {
  if (!chatId || !viewerUserId) return null;

  const row = getRow(
    `
    SELECT cm.id, cm.created_at
    FROM chat_messages cm
    WHERE cm.chat_id = ?
      AND (
        cm.user_id != ?
        OR LOWER(COALESCE(cm.client_request_id, '')) LIKE 'remote:%'
      )
      AND cm.hidden_everyone_at IS NULL
      AND cm.id NOT IN (
        SELECT hidden_chat_messages.message_id
        FROM hidden_chat_messages
        WHERE hidden_chat_messages.user_id = ?
      )
      AND NOT EXISTS (
        SELECT 1
        FROM chat_message_reads cmr
        WHERE cmr.message_id = cm.id
          AND cmr.user_id = ?
      )
    ORDER BY julianday(cm.created_at) ASC, cm.id ASC
    LIMIT 1
    `,
    [chatId, viewerUserId, viewerUserId, viewerUserId],
  );

  if (!row) return null;
  return { id: row.id, created_at: row.created_at };
}

export function findMessageFileById(id) {
  if (!id) return isPostgresMode() ? Promise.resolve(null) : null;
  return (
    getRow(
      dbKnex("chat_message_files")
        .select(
          "id", "message_id", "kind", "original_name", "stored_name", "mime_type",
          "size_bytes", "width_px", "height_px", "duration_seconds", "expires_at", "created_at",
          "storage_driver", "storage_key", "processing_status", "blurhash", "waveform",
          "thumb_storage_key", "encryption_type",
        )
        .where("id", Number(id))
        .first(),
    ) || null
  );
}

export function listMessageFilesByMessageIds(messageIds = []) {
  if (!Array.isArray(messageIds) || !messageIds.length) {
    return isPostgresMode() ? Promise.resolve([]) : [];
  }

  return getAll(
    dbKnex("chat_message_files")
      .select(
        "id", "message_id", "kind", "original_name", "stored_name", "mime_type",
        "size_bytes", "width_px", "height_px", "duration_seconds", "expires_at", "created_at",
        "storage_driver", "storage_key", "processing_status", "blurhash", "waveform",
        "thumb_storage_key", "encryption_type",
      )
      .whereIn("message_id", messageIds)
      .orderBy("id", "asc"),
  );
}

export function listMessageFilesNeedingMetadata(limit = 10000) {
  const safeLimit = Math.max(1, Math.min(200000, Number(limit) || 10000));

  return getAll(
    dbKnex("chat_message_files")
      .select("id", "stored_name", "mime_type", "width_px", "height_px", "duration_seconds", "expires_at")
      .where((builder) => {
        builder.where("mime_type", "like", "image/%").orWhere("mime_type", "like", "video/%");
      })
      .andWhere((builder) => {
        builder
          .whereNull("width_px")
          .orWhereNull("height_px")
          .orWhere(function () {
            this.where("mime_type", "like", "video/%").whereNull("duration_seconds");
          });
      })
      .orderBy("id", "asc")
      .limit(safeLimit),
  );
}

export function updateMessageFileMetadata(fileId, metadata = {}) {
  const widthPx = Number.isFinite(Number(metadata.widthPx))
    ? Number(metadata.widthPx)
    : null;
  const heightPx = Number.isFinite(Number(metadata.heightPx))
    ? Number(metadata.heightPx)
    : null;
  const durationSeconds = Number.isFinite(Number(metadata.durationSeconds))
    ? Number(metadata.durationSeconds)
    : null;

  const updatePayload = {};
  if (widthPx !== null) updatePayload.width_px = widthPx;
  if (heightPx !== null) updatePayload.height_px = heightPx;
  if (durationSeconds !== null) updatePayload.duration_seconds = durationSeconds;

  if (!Object.keys(updatePayload).length) {
    return isPostgresMode() ? Promise.resolve(0) : 0;
  }

  return run(
    dbKnex("chat_message_files")
      .where("id", Number(fileId))
      .update(updatePayload),
  );
}

export function updateUserProfile(userId, arg2, nickname, avatarUrl) {
  const updatePayload =
    typeof arg2 === "object" && arg2 !== null
      ? { username: arg2.username, nickname: arg2.nickname, avatar_url: arg2.avatarUrl }
      : { username: arg2, nickname, avatar_url: avatarUrl };
  return run(
    dbKnex("users")
      .where("id", userId)
      .update(updatePayload),
  );
}

export function updateUserPassword(userId, passwordHash) {
  return run(
    dbKnex("users")
      .where("id", userId)
      .update({ password_hash: passwordHash }),
  );
}

export function updateUserStatus(userId, status) {
  return run(
    dbKnex("users")
      .where("id", userId)
      .update({ status }),
  );
}

export function setUserBanned(userId, banned) {
  return run(
    dbKnex("users")
      .where("id", userId)
      .update({ banned: banned ? 1 : 0 }),
  );
}

export function deleteSessionsByUserId(userId) {
  return run(
    dbKnex("sessions")
      .where("user_id", userId)
      .del(),
  );
}

export function updateLastSeen(userId) {
  if (!userId) {
    return isPostgresMode() ? Promise.resolve() : undefined;
  }
  return run(
    dbKnex("users")
      .where("id", userId)
      .update({ last_seen: dbKnex.raw("datetime('now')") }),
  );
}

export function getUserPresence(username) {
  const norm = String(username || "").trim().toLowerCase();
  if (!norm) return isPostgresMode() ? Promise.resolve(null) : null;
  const row = getRow(
    dbKnex("users")
      .select("id", "username", "status", "last_seen")
      .where(dbKnex.raw("LOWER(username) = ?", [norm]))
      .first(),
  );
  if (row && typeof row.then === "function") {
    return row.then((r) => r || null);
  }
  return row || null;
}

export function markMessagesRead(chatId, readerId) {
  if (!chatId || !readerId) return isPostgresMode() ? Promise.resolve() : undefined;

  const updateFn = () =>
    run(
      `
      UPDATE chat_messages
      SET read_at = datetime('now'), read_by_user_id = ?
      WHERE chat_id = ?
        AND (
          user_id != ?
          OR ${REMOTE_MESSAGE_CLIENT_REQUEST_SQL}
        )
        AND read_at IS NULL
    `,
      [readerId, chatId, readerId],
    );

  const inserted = run(
    `INSERT OR IGNORE INTO chat_message_reads (message_id, user_id, read_at)
     SELECT cm.id, ?, datetime('now')
     FROM chat_messages cm
     WHERE cm.chat_id = ?
       AND (
         cm.user_id != ?
         OR LOWER(COALESCE(cm.client_request_id, '')) LIKE 'remote:%'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM chat_message_reads cmr
         WHERE cmr.message_id = cm.id
           AND cmr.user_id = ?
       )`,
    [readerId, chatId, readerId, readerId],
  );
  if (inserted && typeof inserted.then === "function") {
    return inserted.then(() => updateFn());
  }

  return updateFn();
}

export function getMessageReadCounts(messageIds = []) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .filter(Boolean),
    ),
  );
  if (!normalized.length) return isPostgresMode() ? Promise.resolve([]) : [];
  return getAll(
    dbKnex("chat_message_reads")
      .select("message_id")
      .count("* as count")
      .whereIn("message_id", normalized)
      .groupBy("message_id"),
  );
}

export function getMessageAuthors(messageIds = []) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .filter(Boolean),
    ),
  );
  if (!normalized.length) return isPostgresMode() ? Promise.resolve([]) : [];
  return getAll(
    dbKnex("chat_messages")
      .select("id", "user_id", "client_request_id")
      .whereIn("id", normalized),
  );
}

export function getMessageReadByUser(messageIds = [], userId) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .filter(Boolean),
    ),
  );
  if (!normalized.length) return isPostgresMode() ? Promise.resolve([]) : [];
  return getAll(
    dbKnex("chat_message_reads")
      .select("message_id")
      .where("user_id", userId)
      .whereIn("message_id", normalized),
  );
}

export function recordMessageReads(messageIds = [], readerId) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(messageIds) ? messageIds : [])
        .filter(Boolean),
    ),
  );
  if (!normalized.length) return isPostgresMode() ? Promise.resolve() : undefined;
  const rawRows = getAll(
    dbKnex("chat_messages")
      .select("id", "user_id", "client_request_id")
      .whereIn("id", normalized),
  );
  const processRows = (rows) => {
    const toInsert = (rows || [])
      .filter(
        (row) =>
          row?.user_id !== readerId ||
          isRemoteMessageRow(row),
      )
      .map((row) => row.id)
      .filter(Boolean);
    if (!toInsert.length) return isPostgresMode() ? Promise.resolve() : undefined;
    const chunkSize = 300;
    const promises = [];
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      const insertItems = chunk.map((id) => ({
        message_id: id,
        user_id: readerId,
        read_at: dbKnex.raw("datetime('now')"),
      }));
      const p = run(
        dbKnex("chat_message_reads")
          .insert(insertItems)
          .onConflict(["message_id", "user_id"])
          .ignore(),
      );
      if (p && typeof p.then === "function") promises.push(p);
    }
    if (promises.length > 0) return Promise.all(promises);
  };

  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then(processRows);
  }
  return processRows(rawRows);
}

export function hideChatsForUser(userId, chatIds = []) {
  chatIds.forEach((chatId) => {
    run(
      dbKnex("hidden_chats")
        .insert({ user_id: userId, chat_id: chatId })
        .onConflict(["user_id", "chat_id"])
        .ignore(),
    );
  });
}

export function unhideChat(userId, chatId) {
  run(
    dbKnex("hidden_chats")
      .where({ user_id: userId, chat_id: chatId })
      .del(),
  );
}

export function setChatMuted(userId, chatId, muted) {
  if (muted) {
    run(
      dbKnex("chat_mutes")
        .insert({
          user_id: userId,
          chat_id: chatId,
          muted: 1,
          updated_at: dbKnex.raw("datetime('now')"),
        })
        .onConflict(["user_id", "chat_id"])
        .merge({
          muted: 1,
          updated_at: dbKnex.raw("datetime('now')"),
        }),
    );
    return;
  }

  run(
    dbKnex("chat_mutes")
      .where({ user_id: userId, chat_id: chatId })
      .del(),
  );
}

export function upsertPushSubscription(userId, endpoint, p256dh, auth, messagePreview = 1) {
  const safeEndpoint = String(endpoint || "").trim();
  if (!userId || !safeEndpoint) return;
  const preview = messagePreview === false || messagePreview === 0 ? 0 : 1;
  run(
    dbKnex("push_subscriptions")
      .insert({
        user_id: userId,
        endpoint: safeEndpoint,
        p256dh: String(p256dh || ""),
        auth: String(auth || ""),
        message_preview: preview,
        updated_at: dbKnex.raw("datetime('now')"),
      })
      .onConflict("endpoint")
      .merge({
        user_id: userId,
        p256dh: String(p256dh || ""),
        auth: String(auth || ""),
        message_preview: preview,
        updated_at: dbKnex.raw("datetime('now')"),
      }),
  );
}

export function deletePushSubscription(endpoint) {
  const safeEndpoint = String(endpoint || "").trim();
  if (!safeEndpoint) return;
  run(
    dbKnex("push_subscriptions")
      .where("endpoint", safeEndpoint)
      .del(),
  );
}

export function getTotalUnreadCount(userId) {
  if (!userId) return 0;
  const mcQb = dbKnex("chats as c")
    .select("c.id as chat_id")
    .join("chat_members as m", function () {
      this.on("m.chat_id", "=", "c.id").andOn("m.user_id", "=", dbKnex.raw("?", [userId]));
    })
    .leftJoin("chat_mutes as mu", function () {
      this.on("mu.chat_id", "=", "c.id").andOn("mu.user_id", "=", dbKnex.raw("?", [userId])).andOn("mu.muted", "=", dbKnex.raw("1"));
    })
    .leftJoin("hidden_chats as h", function () {
      this.on("h.chat_id", "=", "c.id").andOn("h.user_id", "=", dbKnex.raw("?", [userId]));
    })
    .whereNull("h.chat_id")
    .whereNull("mu.chat_id");

  const qb = dbKnex
    .from(mcQb.as("mc"))
    .join("chat_messages as cm", "cm.chat_id", "mc.chat_id")
    .leftJoin("hidden_chat_messages as hcm", function () {
      this.on("hcm.message_id", "=", "cm.id").andOn("hcm.user_id", "=", dbKnex.raw("?", [userId]));
    })
    .leftJoin("chat_message_reads as cmr", function () {
      this.on("cmr.message_id", "=", "cm.id").andOn("cmr.user_id", "=", dbKnex.raw("?", [userId]));
    })
    .whereNot("cm.body", "like", "[[system:%]]")
    .whereNull("cm.hidden_everyone_at")
    .whereNull("hcm.message_id")
    .andWhere((builder) => {
      builder
        .where("cm.user_id", "!=", userId)
        .orWhereRaw("LOWER(COALESCE(cm.client_request_id, '')) LIKE 'remote:%'");
    })
    .whereNull("cmr.message_id")
    .count("* as total")
    .first();

  const row = getRow(qb);
  if (row && typeof row.then === "function") {
    return row.then((r) => Number(r?.total || 0));
  }
  return Number(row?.total || 0);
}

export function listPushSubscriptionsByUserIds(userIds = []) {
  const ids = Array.from(
    new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean)),
  );
  if (!ids.length) return isPostgresMode() ? Promise.resolve([]) : [];
  return getAll(
    dbKnex("push_subscriptions")
      .select("user_id", "endpoint", "p256dh", "auth", "message_preview")
      .whereIn("user_id", ids),
  );
}

export function listMutedUserIdsForChat(chatId) {
  if (!chatId) return isPostgresMode() ? Promise.resolve([]) : [];
  const rawRows = getAll(
    dbKnex("chat_mutes")
      .select("user_id")
      .where({ chat_id: chatId, muted: 1 }),
  );
  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then((rows) =>
      (rows || [])
        .map((row) => row?.user_id)
        .filter(Boolean),
    );
  }
  return (rawRows || [])
    .map((row) => row?.user_id)
    .filter(Boolean);
}

export function createSession(userId, token) {
  if (!userId || !token) {
    const err = new Error(`Invalid session parameters: userId=${userId}, token=${token}`);
    return isPostgresMode() ? Promise.reject(err) : (() => { throw err; })();
  }
  return run(
    dbKnex("sessions").insert({ user_id: userId, token }),
  );
}

export function getSession(token) {
  if (!token) return isPostgresMode() ? Promise.resolve(null) : null;
  return getRow(
    dbKnex("sessions")
      .select(
        "sessions.id as session_id", "sessions.token", "users.id", "users.username", "users.nickname",
        "users.avatar_url", "users.color", "users.status", "users.banned", "users.role", "users.verified",
      )
      .join("users", "users.id", "sessions.user_id")
      .where("sessions.token", token)
      .andWhere(dbKnex.raw("COALESCE(users.banned, 0) = 0"))
      .first(),
  );
}

export function touchSession(token) {
  if (!token) return isPostgresMode() ? Promise.resolve() : undefined;
  return run(
    dbKnex("sessions")
      .where("token", token)
      .update({ last_seen: dbKnex.raw("datetime('now')") }),
  );
}

export function deleteSession(token) {
  if (!token) return isPostgresMode() ? Promise.resolve() : undefined;
  return run(
    dbKnex("sessions")
      .where("token", token)
      .del(),
  );
}

// Internal admin helpers for server-side DB tooling endpoints.
export function adminGetRow(sql, params = []) {
  return getRow(sql, params);
}

export function adminGetAll(sql, params = []) {
  return getAll(sql, params);
}

export function adminRun(sql, params = []) {
  return runWithoutSave(sql, params);
}

export function adminSave() {
  saveDatabase();
}

export async function adminTransaction(callback) {
  if (isPostgresMode()) {
    return dbKnex.transaction(async (trx) => {
      const queryRun = (sql, params = []) => {
        const { sql: normalizedSql, params: normalizedParams } =
          normalizeSqlForPostgres(sql, params);
        return trx.raw(normalizedSql, normalizedParams);
      };
      return callback(queryRun);
    });
  }

  run("BEGIN");
  try {
    const result = await callback((sql, params = []) => runWithoutSave(sql, params));
    run("COMMIT");
    return result;
  } catch (error) {
    run("ROLLBACK");
    throw error;
  }
}

// ─── Admin Panel ─────────────────────────────────────────────────────────────

export function setUserRole(userId, role) {
  return run(dbKnex("users").where({ id: userId }).update({ role }));
}

export async function getUserRole(userId) {
  const row = await getRow(dbKnex("users").where({ id: userId }).select("role").first());
  return row?.role || "user";
}

export async function isUserAdmin(userId) {
  const role = await getUserRole(userId);
  return role === "admin" || role === "owner";
}

export async function isUserOwner(userId) {
  const role = await getUserRole(userId);
  return role === "owner";
}

export async function getOwnerUser() {
  const row = await getRow(dbKnex("users").where({ role: "owner" }).select("id", "username").first());
  return row || null;
}

export async function bootstrapAdminUsers(adminUsernames) {
  if (!adminUsernames || !adminUsernames.length) return;
  for (const username of adminUsernames) {
    const rawUser = getRow(dbKnex("users").where({ username: username.toLowerCase() }).select("id", "role").first());
    const user = rawUser && typeof rawUser.then === "function" ? await rawUser : rawUser;
    if (user && user.id && user.role !== "admin" && user.role !== "owner") {
      await run(dbKnex("users").where({ id: user.id }).update({ role: "admin" }));
    }
  }
}

export async function getAdminStats() {
  // Batch user counts: one pass over the users table instead of four separate queries.
  const userStats = (await getRow(
    dbKnex("users").select(
      dbKnex.raw('COUNT(*) AS "totalUsers"'),
      dbKnex.raw('COUNT(*) FILTER (WHERE banned = 1) AS "bannedUsers"'),
      dbKnex.raw('COUNT(*) FILTER (WHERE created_at >= datetime(\'now\', \'-7 days\')) AS "newUsers7d"'),
      dbKnex.raw('COUNT(*) FILTER (WHERE status = \'online\') AS "onlineUsers"')
    )
  )) || {};

  // Batch chat counts: one pass over the chats table instead of five queries.
  const chatStats = (await getRow(
    dbKnex("chats").select(
      dbKnex.raw('COUNT(*) FILTER (WHERE type IN (\'group\', \'channel\')) AS "totalChats"'),
      dbKnex.raw('COUNT(*) FILTER (WHERE type = \'dm\') AS "dmChats"'),
      dbKnex.raw('COUNT(*) FILTER (WHERE type = \'group\') AS "groupChats"'),
      dbKnex.raw('COUNT(*) FILTER (WHERE type = \'channel\') AS "channelChats"')
    )
  )) || {};

  // Batch message counts: one pass over chat_messages instead of two queries.
  const messageStats = (await getRow(
    dbKnex("chat_messages").select(
      dbKnex.raw('COUNT(*) AS "totalMessages"'),
      dbKnex.raw('COUNT(*) FILTER (WHERE created_at >= datetime(\'now\', \'-1 day\')) AS "messagesLast24h"')
    )
  )) || {};

  const totalSessions = (await getRow(dbKnex("sessions").count({ count: "*" }).first()))?.count || 0;

  // Optional tables that may not exist on older schemas — keep as individual
  // try/catch singletons so a missing table never aborts the whole stats call.
  let totalFiles = 0;
  try { totalFiles = (await getRow(dbKnex("chat_message_files").count({ count: "*" }).first()))?.count || 0; } catch { totalFiles = 0; }
  let pushSubscriptions = 0;
  try { pushSubscriptions = (await getRow(dbKnex("push_subscriptions").count({ count: "*" }).first()))?.count || 0; } catch { pushSubscriptions = 0; }

  return {
    totalUsers:     Number(userStats.totalUsers    || 0),
    bannedUsers:    Number(userStats.bannedUsers   || 0),
    newUsers7d:     Number(userStats.newUsers7d    || 0),
    onlineUsers:    Number(userStats.onlineUsers   || 0),
    totalChats:     Number(chatStats.totalChats    || 0),
    dmChats:        Number(chatStats.dmChats       || 0),
    groupChats:     Number(chatStats.groupChats    || 0),
    channelChats:   Number(chatStats.channelChats  || 0),
    totalMessages:  Number(messageStats.totalMessages  || 0),
    messagesLast24h:Number(messageStats.messagesLast24h || 0),
    totalSessions:  Number(totalSessions || 0),
    totalFiles:     Number(totalFiles || 0),
    pushSubscriptions: Number(pushSubscriptions || 0),
  };
}

function escapeLikePattern(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

// Produces an ORDER BY clause fragment for a "natural sort" on a text column:
// sorts by the text prefix first (everything before any trailing number),
// then the trailing integer numerically (so "User 2" < "User 10"),
// then falls back to `tiebreaker` for rows with identical values.
// `dir` ("ASC"/"DESC") is applied to every term so reversing actually reverses.
function naturalSortExpr(col, tiebreaker = null, dir = "ASC") {
  const d = dir === "DESC" ? "DESC" : "ASC";
  // RTRIM strips all trailing digit characters to give the text prefix.
  const textPart = `RTRIM(${col},'0123456789') COLLATE NOCASE ${d}`;
  // SUBSTR from the end of the text prefix onward, cast to integer.
  const numPart  = `CAST(SUBSTR(${col}, length(RTRIM(${col},'0123456789'))+1) AS INTEGER) ${d}`;
  const parts = [textPart, numPart];
  if (tiebreaker) parts.push(`${tiebreaker} COLLATE NOCASE ${d}`);
  return parts.join(", ");
}


export function adminListUsers({ limit = 200, offset = 0, search = "", sortBy = "id", sortDir = "DESC", roleFilter = null, statusFilter = null, verifiedFilter = null, connectedUsernames = null }) {
  const safeLimit  = Math.max(1, Math.min(500, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeSortBy  = ["id", "username", "nickname", "role", "created_at", "last_seen"].includes(sortBy) ? sortBy : "id";
  const safeSortDir = sortDir === "ASC" ? "ASC" : "DESC";

  let qb = dbKnex("users").select(
    "id", "username", "nickname", "avatar_url", "color", "status", "role", "banned", "verified", "created_at", "last_seen",
    dbKnex.raw("CASE WHEN status = 'online' THEN 1 ELSE 0 END AS online"),
    dbKnex.raw("COUNT(*) OVER() AS _total")
  );

  if (search) {
    const like = `%${escapeLikePattern(search)}%`;
    qb = qb.where((builder) => {
      builder.whereRaw("username LIKE ? ESCAPE '\\'", [like])
        .orWhereRaw("nickname LIKE ? ESCAPE '\\'", [like]);
    });
  }
  if (roleFilter === "banned") {
    qb = qb.where("banned", 1);
  } else if (roleFilter) {
    qb = qb.where("banned", 0).where("role", roleFilter);
  }

  if (statusFilter === "online") {
    qb = qb.where(function () {
      this.where("status", "online").orWhereNull("status").orWhere("status", "!=", "invisible");
    });
    if (Array.isArray(connectedUsernames)) {
      const lowerConnected = connectedUsernames.map((u) => String(u).toLowerCase()).filter(Boolean);
      if (lowerConnected.length === 0) {
        qb = qb.whereRaw("1 = 0");
      } else {
        qb = qb.whereIn(dbKnex.raw("LOWER(username)"), lowerConnected);
      }
    }
  } else if (statusFilter === "offline") {
    if (Array.isArray(connectedUsernames)) {
      const lowerConnected = connectedUsernames.map((u) => String(u).toLowerCase()).filter(Boolean);
      if (lowerConnected.length > 0) {
        qb = qb.where(function () {
          this.whereNotIn(dbKnex.raw("LOWER(username)"), lowerConnected).orWhere("status", "invisible");
        });
      }
    } else {
      qb = qb.where("status", "invisible");
    }
  }

  if (verifiedFilter === "1" || verifiedFilter === "true") {
    qb = qb.where("verified", 1);
  } else if (verifiedFilter === "0" || verifiedFilter === "false") {
    qb = qb.where(function () {
      this.where("verified", 0).orWhereNull("verified");
    });
  }

  if (safeSortBy === "nickname") {
    qb = qb.orderByRaw(naturalSortExpr("nickname", "username", safeSortDir));
  } else if (safeSortBy === "username") {
    qb = qb.orderByRaw(naturalSortExpr("username", "nickname", safeSortDir));
  } else {
    qb = qb.orderBy(safeSortBy, safeSortDir);
  }

  qb = qb.limit(safeLimit).offset(safeOffset);

  const rawRows = getAll(qb);

  const processUserRows = (rows) => {
    const list = rows || [];
    const total = list.length > 0 ? Number(list[0]._total || 0) : 0;
    const users = list.map(({ _total, ...u }) => u);
    return { users, total };
  };

  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then(processUserRows);
  }
  return processUserRows(rawRows);
}

// adminCountUsers is kept for any future callers that only need the count,
// but the list endpoint now uses adminListUsers which returns both together.
export function adminCountUsers({ search = "", roleFilter = null, statusFilter = null, verifiedFilter = null, connectedUsernames = null } = {}) {
  let qb = dbKnex("users").count({ count: "*" });

  if (search) {
    const like = `%${escapeLikePattern(search)}%`;
    qb = qb.where((builder) => {
      builder.whereRaw("username LIKE ? ESCAPE '\\'", [like])
        .orWhereRaw("nickname LIKE ? ESCAPE '\\'", [like]);
    });
  }
  if (roleFilter === "banned") {
    qb = qb.where("banned", 1);
  } else if (roleFilter) {
    qb = qb.where("banned", 0).where("role", roleFilter);
  }

  if (statusFilter === "online") {
    qb = qb.where(function () {
      this.where("status", "online").orWhereNull("status").orWhere("status", "!=", "invisible");
    });
    if (Array.isArray(connectedUsernames)) {
      const lowerConnected = connectedUsernames.map((u) => String(u).toLowerCase()).filter(Boolean);
      if (lowerConnected.length === 0) {
        qb = qb.whereRaw("1 = 0");
      } else {
        qb = qb.whereIn(dbKnex.raw("LOWER(username)"), lowerConnected);
      }
    }
  } else if (statusFilter === "offline") {
    if (Array.isArray(connectedUsernames)) {
      const lowerConnected = connectedUsernames.map((u) => String(u).toLowerCase()).filter(Boolean);
      if (lowerConnected.length > 0) {
        qb = qb.where(function () {
          this.whereNotIn(dbKnex.raw("LOWER(username)"), lowerConnected).orWhere("status", "invisible");
        });
      }
    } else {
      qb = qb.where("status", "invisible");
    }
  }

  if (verifiedFilter === "1" || verifiedFilter === "true") {
    qb = qb.where("verified", 1);
  } else if (verifiedFilter === "0" || verifiedFilter === "false") {
    qb = qb.where(function () {
      this.where("verified", 0).orWhereNull("verified");
    });
  }

  const rawRow = getRow(qb.first());
  if (rawRow && typeof rawRow.then === "function") {
    return rawRow.then((row) => Number(row?.count || 0));
  }
  return Number(rawRow?.count || 0);
}

export function adminListChats({
  limit = 200,
  offset = 0,
  search = "",
  sortBy = "id",
  sortDir = "DESC",
  typeFilter = null,
  visibilityFilter = null,
  verifiedFilter = null,
  autoAddFilter = null,
  remoteFilter = null,
}) {
  const safeLimit  = Math.max(1, Math.min(500, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeSortBy  = ["id", "name", "type", "group_visibility", "created_at", "member_count", "message_count"].includes(sortBy) ? sortBy : "id";
  const safeSortDir = sortDir === "ASC" ? "ASC" : "DESC";

  let qb = dbKnex("chats as c")
    .leftJoin("users as owner", "owner.id", dbKnex.raw("(SELECT user_id FROM chat_members WHERE chat_id = c.id AND role = 'owner' LIMIT 1)"))
    .leftJoin("remote_channel_sources as rcs", "rcs.chat_id", "c.id")
    .select(
      "c.id", "c.name", "c.type", "c.group_username", "c.group_visibility", "c.group_color", "c.group_avatar_url", "c.created_at", "c.verified", "c.auto_add_new_users",
      dbKnex.raw("(SELECT COUNT(*) FROM chat_members WHERE chat_id = c.id) AS member_count"),
      dbKnex.raw("(SELECT COUNT(*) FROM chat_messages WHERE chat_id = c.id) AS message_count"),
      "owner.id as owner_id", "owner.username as owner_username", "owner.nickname as owner_nickname",
      "owner.avatar_url as owner_avatar_url", "owner.color as owner_color",
      "owner.verified as owner_verified", "owner.role as owner_role",
      "rcs.enabled as remote_enabled", "rcs.paused as remote_paused",
      dbKnex.raw("COUNT(*) OVER() AS _total")
    )
    .whereIn("c.type", ["group", "channel"]);

  if (search) {
    const like = `%${escapeLikePattern(search)}%`;
    qb = qb.where((builder) => {
      builder.whereRaw("c.name LIKE ? ESCAPE '\\'", [like])
        .orWhereRaw("c.group_username LIKE ? ESCAPE '\\'", [like]);
    });
  }
  if (typeFilter === "group" || typeFilter === "channel") {
    qb = qb.where("c.type", typeFilter);
  }
  if (visibilityFilter === "public" || visibilityFilter === "private") {
    qb = qb.where("c.group_visibility", visibilityFilter);
  }
  if (verifiedFilter === "1" || verifiedFilter === "true") {
    qb = qb.where("c.verified", 1);
  } else if (verifiedFilter === "0" || verifiedFilter === "false") {
    qb = qb.where(function () { this.where("c.verified", 0).orWhereNull("c.verified"); });
  }
  if (autoAddFilter === "1" || autoAddFilter === "true") {
    qb = qb.where("c.auto_add_new_users", 1);
  } else if (autoAddFilter === "0" || autoAddFilter === "false") {
    qb = qb.where(function () { this.where("c.auto_add_new_users", 0).orWhereNull("c.auto_add_new_users"); });
  }
  if (remoteFilter === "active") {
    qb = qb.where("rcs.enabled", 1).where(function () { this.where("rcs.paused", 0).orWhereNull("rcs.paused"); });
  } else if (remoteFilter === "paused") {
    qb = qb.where("rcs.enabled", 1).where("rcs.paused", 1);
  } else if (remoteFilter === "disabled") {
    qb = qb.where("rcs.enabled", 0);
  } else if (remoteFilter === "none") {
    qb = qb.whereNull("rcs.id");
  }

  const countCols = ["member_count", "message_count"];
  if (countCols.includes(safeSortBy)) {
    qb = qb.orderBy(safeSortBy, safeSortDir);
  } else if (safeSortBy === "name") {
    qb = qb.orderByRaw(naturalSortExpr("c.name", "c.group_username", safeSortDir));
  } else if (safeSortBy === "type" || safeSortBy === "group_visibility") {
    qb = qb.orderByRaw(`c.${safeSortBy} COLLATE NOCASE ${safeSortDir}`);
  } else {
    qb = qb.orderBy(`c.${safeSortBy}`, safeSortDir);
  }

  qb = qb.limit(safeLimit).offset(safeOffset);

  const rawRows = getAll(qb);
  const processChatRows = (rows) => {
    const list = rows || [];
    const total = list.length > 0 ? Number(list[0]._total || 0) : 0;
    const chats = list.map(({ _total, ...chat }) => chat);
    return { chats, total };
  };
  if (rawRows && typeof rawRows.then === "function") {
    return rawRows.then(processChatRows);
  }
  return processChatRows(rawRows);
}

// adminCountChats is kept for any future callers that only need the count,
// but the list endpoint now uses adminListChats which returns both together.
export function adminCountChats({
  search = "",
  typeFilter = null,
  visibilityFilter = null,
  verifiedFilter = null,
  autoAddFilter = null,
  remoteFilter = null,
} = {}) {
  let qb = dbKnex("chats as c")
    .leftJoin("remote_channel_sources as rcs", "rcs.chat_id", "c.id")
    .count({ count: "*" })
    .whereIn("c.type", ["group", "channel"]);

  if (search) {
    const like = `%${escapeLikePattern(search)}%`;
    qb = qb.where((builder) => {
      builder.whereRaw("c.name LIKE ? ESCAPE '\\'", [like])
        .orWhereRaw("c.group_username LIKE ? ESCAPE '\\'", [like]);
    });
  }
  if (typeFilter === "group" || typeFilter === "channel") {
    qb = qb.where("c.type", typeFilter);
  }
  if (visibilityFilter === "public" || visibilityFilter === "private") {
    qb = qb.where("c.group_visibility", visibilityFilter);
  }
  if (verifiedFilter === "1" || verifiedFilter === "true") {
    qb = qb.where("c.verified", 1);
  } else if (verifiedFilter === "0" || verifiedFilter === "false") {
    qb = qb.where(function () { this.where("c.verified", 0).orWhereNull("c.verified"); });
  }
  if (autoAddFilter === "1" || autoAddFilter === "true") {
    qb = qb.where("c.auto_add_new_users", 1);
  } else if (autoAddFilter === "0" || autoAddFilter === "false") {
    qb = qb.where(function () { this.where("c.auto_add_new_users", 0).orWhereNull("c.auto_add_new_users"); });
  }
  if (remoteFilter === "active") {
    qb = qb.where("rcs.enabled", 1).where(function () { this.where("rcs.paused", 0).orWhereNull("rcs.paused"); });
  } else if (remoteFilter === "paused") {
    qb = qb.where("rcs.enabled", 1).where("rcs.paused", 1);
  } else if (remoteFilter === "disabled") {
    qb = qb.where("rcs.enabled", 0);
  } else if (remoteFilter === "none") {
    qb = qb.whereNull("rcs.id");
  }

  const rawRow = getRow(qb.first());
  if (rawRow && typeof rawRow.then === "function") {
    return rawRow.then((row) => Number(row?.count || 0));
  }
  return Number(rawRow?.count || 0);
}

export function adminBanUser(userId, banned) {
  return run(dbKnex("users").where({ id: userId }).update({ banned: banned ? 1 : 0 }));
}

// Delegate to the canonical deletion helpers so the admin panel performs the
// same full cleanup (message files, reads, hidden chats, mutes, ownership
// transfers, etc.) inside a transaction. Returns the storedNames of orphaned
// upload files so the caller can remove them from disk.
export function adminDeleteUser(userId) {
  return deleteUserById(userId);
}

export function adminDeleteChat(chatId) {
  return deleteChatById(chatId);
}

// ─── Admin Maintenance ─────────────────────────────────────────────────────────

export async function vacuumDatabase() {
  await run("VACUUM");
  saveDatabase();
}

export function reloadDatabase() {
  reloadDatabaseFromDisk();
}

// Wipe all messages and their file records (keeps users, chats, memberships).
// Returns the storedNames of files to remove from disk.
export async function adminClearAllMessages() {
  if (isPostgresMode()) {
    return dbKnex.transaction(async (trx) => {
      const fileResult = await trx("chat_message_files").select("stored_name");
      const storedNames = getPostgresRows(fileResult)
        .map((row) => row.stored_name)
        .filter(Boolean);
      await trx("chat_message_reads").del();
      await trx("hidden_chat_messages").del();
      await trx("chat_message_files").del();
      await trx("chat_messages").del();
      return { storedNames };
    });
  }

  const fileRows = getAll(dbKnex("chat_message_files").select("stored_name"));
  const storedNames = fileRows.map((row) => row.stored_name).filter(Boolean);
  run("BEGIN");
  try {
    run(dbKnex("chat_message_reads").del());
    run(dbKnex("hidden_chat_messages").del());
    run(dbKnex("chat_message_files").del());
    run(dbKnex("chat_messages").del());
    run("COMMIT");
  } catch (error) {
    run("ROLLBACK");
    throw error;
  }
  saveDatabase();
  return { storedNames };
}

const RESET_TABLES = [
  "chat_message_reads",
  "hidden_chat_messages",
  "chat_message_files",
  "chat_messages",
  "hidden_chats",
  "chat_mutes",
  "chat_members",
  "chat_left_members",
  "group_removed_members",
  "remote_channel_queue",
  "remote_channel_sources",
  "remote_channel_provider_state",
  "push_subscriptions",
  "sessions",
  "chats",
  "users",
];

// Full reset: wipe all user-generated data (users, chats, messages, sessions).
// Schema and runtime settings are preserved. Returns storedNames for disk cleanup.
export async function adminResetDatabase() {
  if (isPostgresMode()) {
    return dbKnex.transaction(async (trx) => {
      const fileResult = await trx("chat_message_files").select("stored_name");
      const storedNames = getPostgresRows(fileResult)
        .map((row) => row.stored_name)
        .filter(Boolean);
      await trx.raw(`TRUNCATE TABLE ${RESET_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
      return { storedNames };
    });
  }

  const fileRows = getAll(dbKnex("chat_message_files").select("stored_name"));
  const storedNames = fileRows.map((row) => row.stored_name).filter(Boolean);
  run("BEGIN");
  try {
    RESET_TABLES.forEach((table) => run(dbKnex(table).del()));
    run("COMMIT");
  } catch (error) {
    run("ROLLBACK");
    throw error;
  }
  run("VACUUM");
  saveDatabase();
  return { storedNames };
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export function dbGetAllSettings() {
  return getAll(dbKnex("app_settings").select("key", "value"));
}

export function dbSetSetting(key, value) {
  run(
    dbKnex("app_settings")
      .insert({ key: String(key), value: String(value) })
      .onConflict("key")
      .merge()
  );
}

export function dbDeleteSetting(key) {
  run(dbKnex("app_settings").where({ key: String(key) }).del());
}

import path from "node:path";
import { confirmAction, getCliArgs, getPositionalArgs, hasForceYes } from "./_cli.js";
import {
  openDatabase,
  removeAvatarFiles,
  removeStoredFiles,
  runAdminActionViaServer,
} from "./_db-admin.js";

function normalizeSelectors(args = []) {
  return getPositionalArgs(args)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function isNumeric(value) {
  return /^\d+$/.test(String(value || ""));
}

function basename(value) {
  return path.basename(String(value || "").trim());
}

const args = getCliArgs();
const selectors = normalizeSelectors(args);
const force = hasForceYes(args);

let remote = null;
try {
  remote = await runAdminActionViaServer("delete_files", { selectors });
} catch (error) {
  console.warn(`Server mode failed: ${String(error?.message || "unknown error")}`);
  console.warn("Falling back to direct DB mode for this command.");
}
if (remote) {
  console.log(`Server mode: messages deleted: ${remote.removedMessages ?? 0}`);
  console.log(`Server mode: message files deleted: ${remote.removedMessageFiles ?? 0}`);
  console.log(`Server mode: avatars cleared: ${remote.removedAvatars ?? 0}`);
} else {
  const dbApi = await openDatabase();
  try {
    const deleteAll = selectors.length === 0;
    const numericIds = selectors.filter(isNumeric).map((value) => Number(value));
    const names = selectors.map(basename).filter(Boolean);

    let targetMessageIds = [];
    let messageStoredNames = [];
    let avatarRows = [];

    if (deleteAll) {
      targetMessageIds = dbApi
        .getAll("SELECT DISTINCT message_id FROM chat_message_files ORDER BY message_id ASC")
        .map((row) => Number(row.message_id))
        .filter((id) => Number.isFinite(id) && id > 0);
      messageStoredNames = dbApi.getAll("SELECT stored_name FROM chat_message_files").map((row) => row.stored_name);
      avatarRows = dbApi.getAll(
        `SELECT id, avatar_url FROM users WHERE avatar_url LIKE '/uploads/avatars/%'`,
      );
    } else {
      const byIdRows = numericIds.length
        ? dbApi.getAll(
            `SELECT id, message_id, stored_name FROM chat_message_files WHERE id IN (${numericIds
              .map(() => "?")
              .join(", ")})`,
            numericIds,
          )
        : [];
      const byNameRows = names.length
        ? dbApi.getAll(
            `SELECT id, message_id, stored_name FROM chat_message_files WHERE stored_name IN (${names
              .map(() => "?")
              .join(", ")})`,
            names,
          )
        : [];
      const allFileRows = [...byIdRows, ...byNameRows];
      targetMessageIds = Array.from(
        new Set(
          allFileRows
            .map((row) => Number(row.message_id))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      );
      if (targetMessageIds.length) {
        messageStoredNames = dbApi
          .getAll(
            `SELECT stored_name FROM chat_message_files WHERE message_id IN (${targetMessageIds
              .map(() => "?")
              .join(", ")})`,
            targetMessageIds,
          )
          .map((row) => row.stored_name);
      }
      if (names.length) {
        avatarRows = dbApi
          .getAll(`SELECT id, avatar_url FROM users WHERE avatar_url LIKE '/uploads/avatars/%'`)
          .filter((row) => names.includes(path.basename(String(row.avatar_url || ""))));
      }
    }

    if (!targetMessageIds.length && !avatarRows.length) {
      console.log("No matching files found. Nothing to delete.");
      dbApi.close();
      process.exit(0);
    }

    const confirmed = await confirmAction({
      prompt: deleteAll
        ? "Delete ALL uploaded files (message files + avatars) and related records?"
        : `Delete selected files (${targetMessageIds.length} message bubbles, ${avatarRows.length} avatar assignments)?`,
      force,
      forceHint:
        "Refusing to delete files in non-interactive mode without -y/--yes. Run: npm run db:file:delete -- -y",
    });

    if (!confirmed) {
      console.log("Aborted.");
      dbApi.close();
      process.exit(0);
    }

    dbApi.run("BEGIN");
    try {
      if (targetMessageIds.length) {
        const placeholders = targetMessageIds.map(() => "?").join(", ");
        dbApi.run(
          `DELETE FROM chat_message_files WHERE message_id IN (${placeholders})`,
          targetMessageIds,
        );
        dbApi.run(`DELETE FROM chat_messages WHERE id IN (${placeholders})`, targetMessageIds);
      }
      if (avatarRows.length) {
        const userIds = avatarRows.map((row) => Number(row.id)).filter(Boolean);
        if (userIds.length) {
          dbApi.run(
            `UPDATE users SET avatar_url = NULL WHERE id IN (${userIds.map(() => "?").join(", ")})`,
            userIds,
          );
        }
      }
      dbApi.run("COMMIT");
    } catch (error) {
      dbApi.run("ROLLBACK");
      throw error;
    }

    const fileCleanup = removeStoredFiles(messageStoredNames);
    const avatarCleanup = removeAvatarFiles(
      avatarRows.map((row) => path.basename(String(row.avatar_url || ""))),
    );
    dbApi.save();

    console.log(`Message bubbles deleted: ${targetMessageIds.length}`);
    console.log(
      `Message files removed from disk: ${fileCleanup.removed} (missing: ${fileCleanup.missing})`,
    );
    console.log(
      `Avatar files removed from disk: ${avatarCleanup.removed} (missing: ${avatarCleanup.missing})`,
    );
    console.log(`Avatar assignments cleared: ${avatarRows.length}`);
  } finally {
    dbApi.close();
  }
}

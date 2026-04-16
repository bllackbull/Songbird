import crypto from "node:crypto";
import { getCliArgs, getFlagValue } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import {
  normalizeChatType,
  normalizeVisibility,
  parseListValue,
  resolveUserRow,
  normalizeGroupUsername,
} from "../lib/dbToolHelpers.js";

async function main() {
  const args = getCliArgs();
  const type = normalizeChatType(getFlagValue(args, "--type"));
  const name = String(getFlagValue(args, "--name") || "").trim();
  const ownerSelector = String(getFlagValue(args, "--owner") || "").trim();
  const visibility = normalizeVisibility(getFlagValue(args, "--visibility"));
  const username = normalizeGroupUsername(getFlagValue(args, "--username"));
  const usersValue = getFlagValue(args, "--users");
  const memberSelectors = parseListValue(usersValue);

  if (!name || !ownerSelector || !username) {
    console.error(
      'Usage: npm run db:chat:create -- --type group --name "My Group" --owner alice --username my_group [--visibility public|private] [--users bob,charlie]',
    );
    process.exit(1);
  }

  const remoteResult = await runAdminActionViaServer("create_chat", {
    type,
    name,
    owner: ownerSelector,
    username,
    visibility,
    memberSelectors,
  });
  if (remoteResult) {
    console.log(
      `Server mode chat created: id=${remoteResult.id} type=${remoteResult.type}`,
    );
    return;
  }

  const dbApi = await openDatabase();
  try {
    const owner = resolveUserRow(dbApi, ownerSelector);
    if (!owner?.id) {
      console.error("Owner user not found.");
      process.exit(1);
    }

    const userConflict = dbApi.getRow(
      "SELECT id FROM users WHERE username = ?",
      [username],
    );
    if (userConflict?.id) {
      console.error("Chat username already exists.");
      process.exit(1);
    }
    const chatConflict = dbApi.getRow(
      "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username IN (?, ?)",
      [username, `@${username}`],
    );
    if (chatConflict?.id) {
      console.error("Chat username already exists.");
      process.exit(1);
    }

    const ownerUsername = String(owner.username || "").toLowerCase();
    const memberRows = Array.from(
      new Map(
        memberSelectors
          .map((selector) => resolveUserRow(dbApi, selector))
          .filter((row) => row?.id)
          .map((row) => [Number(row.id), row]),
      ).values(),
    ).filter(
      (row) => String(row.username || "").toLowerCase() !== ownerUsername,
    );

    const inviteToken = crypto.randomBytes(24).toString("hex");
    const groupColor =
      dbApi.getRow("SELECT color FROM users WHERE id = ?", [Number(owner.id)])
        ?.color || "#10b981";

    dbApi.run("BEGIN");
    let chatId = 0;
    try {
      dbApi.run(
        `INSERT INTO chats (
          name, type, group_username, group_visibility, invite_token, created_by_user_id, group_color, allow_member_invites, group_avatar_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          type,
          username || null,
          visibility,
          inviteToken,
          Number(owner.id),
          groupColor,
          1,
          null,
        ],
      );

      const chatRow = dbApi.getRow(
        `SELECT id, name, type, group_username, group_visibility, created_by_user_id
         FROM chats
         WHERE rowid = last_insert_rowid()`,
      );
      chatId = Number(chatRow?.id || 0);
      if (!chatId) {
        throw new Error("Failed to create chat.");
      }

      dbApi.run(
        "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
        [chatId, Number(owner.id), "owner"],
      );
      memberRows.forEach((member) => {
        dbApi.run(
          "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
          [chatId, Number(member.id), "member"],
        );
      });
      dbApi.run("COMMIT");
    } catch (error) {
      dbApi.run("ROLLBACK");
      throw error;
    }

    dbApi.save();
    console.log(`Chat created: id=${chatId} type=${type} name=${name}`);
    console.log(`Owner: ${owner.username}`);
    console.log(`Members added: ${memberRows.length + 1}`);
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

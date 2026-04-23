import {
  getCliArgs,
  getPositionalArgs,
  getFlagValue,
  hasFlag,
} from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import {
  normalizeHexColor,
  normalizeGroupUsername,
  normalizeVisibility,
  resolveChatRow,
  resolveUserRow,
} from "../lib/dbToolHelpers.js";

async function main() {
  const args = getCliArgs();
  const positional = getPositionalArgs(args);
  const chatSelector = String(positional[0] || "").trim();
  const nameValue = getFlagValue(args, "--name");
  const usernameValue = getFlagValue(args, "--username");
  const visibilityValue = getFlagValue(args, "--visibility");
  const colorValue = getFlagValue(args, "--color");
  const ownerValue = getFlagValue(args, "--owner");
  const allowMemberInvites = hasFlag(args, "--allow-member-invites")
    ? true
    : hasFlag(args, "--disallow-member-invites")
      ? false
      : null;

  if (!chatSelector) {
    console.error(
      'Usage: npm run db:chat:edit -- <chat-id-or-username> [--name "New name"] [--username new_handle] [--visibility public|private] [--color #10b981] [--owner alice]',
    );
    process.exit(1);
  }

  const normalizedColor = colorValue
    ? normalizeHexColor(colorValue)
    : undefined;
  if (colorValue && !normalizedColor) {
    console.error("Invalid color. Use a hex color like #10b981.");
    process.exit(1);
  }

  const payload = {
    chatSelector,
    name: nameValue == null ? undefined : String(nameValue),
    username:
      usernameValue == null
        ? undefined
        : normalizeGroupUsername(usernameValue),
    visibility:
      visibilityValue == null
        ? undefined
        : normalizeVisibility(visibilityValue),
    color: normalizedColor,
    owner: ownerValue == null ? undefined : String(ownerValue).trim(),
    allowMemberInvites,
  };

  const remoteResult = await runAdminActionViaServer("edit_chat", payload);
  if (remoteResult) {
    console.log(
      `Server mode chat updated: id=${remoteResult.id} type=${remoteResult.type}`,
    );
    return;
  }

  const dbApi = await openDatabase();
  try {
    const chat = resolveChatRow(dbApi, chatSelector);
    if (!chat?.id) {
      console.error("Chat not found. Use a group/channel id or username.");
      process.exit(1);
    }

    const nextName =
      nameValue == null
        ? String(chat.name || "")
        : String(nameValue || "").trim();
    const nextUsername =
      usernameValue == null
        ? String(chat.group_username || "").replace(/^@+/, "")
        : normalizeGroupUsername(usernameValue);
    const nextVisibility =
      visibilityValue == null
        ? String(chat.group_visibility || "public").toLowerCase()
        : normalizeVisibility(visibilityValue);
    const nextColor =
      normalizedColor || String(chat.group_color || "").trim() || null;
    const effectiveVisibility =
      nextVisibility === "private" ? "private" : "public";
    if (
      effectiveVisibility !== "private" &&
      allowMemberInvites !== null &&
      allowMemberInvites !== true
    ) {
      console.error(
        "Member invites can only be changed for private chats. Public chats always allow member invites.",
      );
      process.exit(1);
    }
    const nextAllowMemberInvites =
      effectiveVisibility === "private"
        ? allowMemberInvites === null
          ? Number(chat.allow_member_invites || 0)
            ? 1
            : 0
          : allowMemberInvites
            ? 1
            : 0
        : 1;

    if (nextUsername) {
      const userConflict = dbApi.getRow(
        "SELECT id FROM users WHERE username = ?",
        [nextUsername],
      );
      if (userConflict?.id) {
        console.error("Chat username already exists.");
        process.exit(1);
      }
      const chatConflict = dbApi.getRow(
        "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username IN (?, ?) AND id != ?",
        [nextUsername, `@${nextUsername}`, Number(chat.id)],
      );
      if (chatConflict?.id) {
        console.error("Chat username already exists.");
        process.exit(1);
      }
    }

    let nextOwner = null;
    if (ownerValue != null) {
      nextOwner = resolveUserRow(dbApi, ownerValue);
      if (!nextOwner?.id) {
        console.error("New owner user not found.");
        process.exit(1);
      }
    }

    dbApi.run(
      `UPDATE chats
       SET name = ?, group_username = ?, group_visibility = ?, group_color = ?, allow_member_invites = ?, created_by_user_id = COALESCE(?, created_by_user_id)
       WHERE id = ? AND type IN ('group', 'channel')`,
      [
        nextName || null,
        nextUsername || null,
        nextVisibility,
        nextColor,
        nextAllowMemberInvites,
        nextOwner?.id ? Number(nextOwner.id) : null,
        Number(chat.id),
      ],
    );

    if (nextOwner?.id) {
      dbApi.run(
        "UPDATE chat_members SET role = 'member' WHERE chat_id = ? AND role = 'owner'",
        [Number(chat.id)],
      );
      dbApi.run(
        "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, 'owner')",
        [Number(chat.id), Number(nextOwner.id)],
      );
      dbApi.run(
        "UPDATE chat_members SET role = 'owner' WHERE chat_id = ? AND user_id = ?",
        [Number(chat.id), Number(nextOwner.id)],
      );
    }

    dbApi.save();
    const updated = resolveChatRow(dbApi, String(chat.id));
    console.log(
      `Chat updated: id=${updated.id} type=${updated.type} name=${updated.name || ""}`,
    );
    if (nextOwner?.username) {
      console.log(`Owner changed to: ${nextOwner.username}`);
    }
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

import { getCliArgs, getPositionalArgs, hasFlag } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import {
  parseListValue,
  resolveChatRow,
  resolveUserRow,
} from "../lib/dbToolHelpers.js";

async function main() {
  const args = getCliArgs();
  const positional = getPositionalArgs(args);
  const chatSelector = String(positional[0] || "").trim();
  const userSelectors = positional.slice(1);
  const addAllUsers = hasFlag(args, "--all");

  if (!chatSelector || (!addAllUsers && !userSelectors.length)) {
    console.error(
      "Usage: npm run db:chat:add -- <chat-id-or-username> <user-id-or-username> [more-users...]",
    );
    console.error("Or: npm run db:chat:add -- <chat-id-or-username> --all");
    process.exit(1);
  }

  const remoteResult = await runAdminActionViaServer("add_chat_members", {
    chatSelector,
    userSelectors,
    addAllUsers,
  });
  if (remoteResult) {
    console.log(
      `Server mode members added: chat=${remoteResult.chatId} added=${remoteResult.addedCount}`,
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

    const rows = addAllUsers
      ? dbApi.getAll("SELECT id, username FROM users ORDER BY id ASC")
      : Array.from(
          new Map(
            userSelectors
              .flatMap((selector) => parseListValue(selector))
              .map((selector) => resolveUserRow(dbApi, selector))
              .filter((row) => row?.id)
              .map((row) => [Number(row.id), row]),
          ).values(),
        );
    if (!rows.length) {
      console.error("No users matched.");
      process.exit(1);
    }

    const existingOwnerIds = new Set(
      dbApi
        .getAll(
          "SELECT user_id FROM chat_members WHERE chat_id = ? AND role = 'owner'",
          [Number(chat.id)],
        )
        .map((row) => Number(row.user_id)),
    );

    let addedCount = 0;
    rows.forEach((row) => {
      const existing = dbApi.getRow(
        "SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?",
        [Number(chat.id), Number(row.id)],
      );
      if (existing?.role) return;
      const role = existingOwnerIds.has(Number(row.id)) ? "owner" : "member";
      dbApi.run(
        "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
        [Number(chat.id), Number(row.id), role],
      );
      addedCount += 1;
    });

    dbApi.save();
    console.log(`Members added: ${addedCount}`);
    console.log(
      `Chat: id=${chat.id} type=${chat.type} name=${chat.name || ""}`,
    );
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

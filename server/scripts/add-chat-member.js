import { getCliArgs, getPositionalArgs, hasFlag } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import {
  parseListValue,
  resolveChatRow,
  resolveUserRow,
} from "../lib/dbToolHelpers.js";
import { addChatMembers } from "./_addChatMemberLogic.js";

async function main() {
  const args = getCliArgs();
  const positional = getPositionalArgs(args);
  const chatSelector = String(positional[0] || "").trim();
  const userSelectors = positional.slice(1);
  const addAllUsers = hasFlag(args, "--all");
  const force = hasFlag(args, "--force");

  if (!chatSelector || (!addAllUsers && !userSelectors.length)) {
    console.error(
      "Usage: npm run db:chat:add -- <chat-id-or-username> <user-id-or-username> [more-users...]",
    );
    console.error("Or: npm run db:chat:add -- <chat-id-or-username> --all");
    console.error(
      "Use --force to re-add users who previously left the chat.",
    );
    process.exit(1);
  }

  const remoteResult = await runAdminActionViaServer("add_chat_members", {
    chatSelector,
    userSelectors,
    addAllUsers,
    force,
  });
  if (remoteResult) {
    const skippedLeftCount = Number(remoteResult.skippedLeftCount || 0);
    console.log(
      `Server mode members added: chat=${remoteResult.chatId} added=${remoteResult.addedCount} skipped_left=${skippedLeftCount}`,
    );
    return;
  }

  const dbApi = await openDatabase();
  try {
    const chat = await resolveChatRow(dbApi, chatSelector);
    if (!chat?.id) {
      console.error("Chat not found. Use a group/channel id or username.");
      process.exit(1);
    }

    const resolvedUserRows = [];
    if (addAllUsers) {
      const allRows = await dbApi.getAll("SELECT id, username, nickname FROM users ORDER BY id ASC");
      resolvedUserRows.push(...allRows);
    } else {
      const selectors = userSelectors.flatMap((selector) => parseListValue(selector));
      for (const selector of selectors) {
        const userRow = await resolveUserRow(dbApi, selector);
        if (userRow?.id) {
          resolvedUserRows.push(userRow);
        }
      }
    }

    const rows = Array.from(
      new Map(resolvedUserRows.map((row) => [Number(row.id), row])).values(),
    );
    if (!rows.length) {
      console.error("No users matched.");
      process.exit(1);
    }

    const { addedCount, skippedLeftCount } = await addChatMembers(dbApi, chat, rows, { force });

    console.log(`Members added: ${addedCount}`);
    if (skippedLeftCount > 0) {
      console.log(
        `Skipped users who previously left: ${skippedLeftCount} (use --force to re-add them)`,
      );
    }
    console.log(
      `Chat: id=${chat.id} type=${chat.type} name=${chat.name || ""}`,
    );
  } finally {
    await dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

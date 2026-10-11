import { getCliArgs, getPositionalArgs } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { resolveChatRow } from "../lib/dbToolHelpers.js";
import { dbKnex } from "../db/knex.js";

async function main() {
  const args = getCliArgs();
  const positional = getPositionalArgs(args);
  const chatSelector = String(positional[0] || "").trim();

  if (!chatSelector) {
    console.error("Usage: npm run db:chat:verify -- <chat-id-or-username>");
    process.exit(1);
  }

  const remoteResult = await runAdminActionViaServer("toggle_chat_verified", {
    chatSelector,
  });
  if (remoteResult) {
    console.log(
      `Server mode chat ${remoteResult.verified ? "verified" : "unverified"}: id=${remoteResult.id} name=${remoteResult.name}`,
    );
    return;
  }

  const dbApi = await openDatabase();
  try {
    const chat = await resolveChatRow(dbApi, chatSelector);
    if (!chat?.id) {
      console.error("Chat not found.");
      process.exit(1);
    }

    const nextVerified = Number(chat.verified || 0) ? 0 : 1;
    await dbApi.run(
      dbKnex("chats").where("id", chat.id).update({ verified: nextVerified }),
    );
    await dbApi.save();

    console.log(
      `Chat ${nextVerified ? "verified" : "unverified"}: id=${chat.id} name=${chat.name || ""}`,
    );
  } finally {
    await dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

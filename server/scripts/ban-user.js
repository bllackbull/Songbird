import {
  confirmAction,
  getCliArgs,
  getPositionalArgs,
  hasForceYes,
} from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { resolveUserRow } from "../lib/dbToolHelpers.js";

async function main() {
  const args = getCliArgs();
  const positional = getPositionalArgs(args);
  const userSelector = String(positional[0] || "").trim();
  const force = hasForceYes(args);

  if (!userSelector) {
    console.error(
      "Usage: npm run db:user:ban -- <user-id-or-username> [-y|--yes]",
    );
    process.exit(1);
  }

  const dbApi = await openDatabase();
  try {
    const user = resolveUserRow(dbApi, userSelector);
    if (!user?.id) {
      console.error("User not found.");
      process.exit(1);
    }

    const nextBanned = Number(user.banned || 0) ? 0 : 1;
    const confirmed = await confirmAction({
      prompt: `${nextBanned ? "Ban" : "Unban"} user "${user.username}" ?`,
      force,
      forceHint:
        "Refusing to change ban state in non-interactive mode without -y/--yes. Run: npm run db:user:ban -- -y <user-id-or-username>",
    });
    if (!confirmed) {
      console.log("Aborted.");
      return;
    }

    const remoteResult = await runAdminActionViaServer("toggle_user_ban", {
      userSelector,
    });
    if (remoteResult) {
      console.log(
        `Server mode user ${remoteResult.banned ? "banned" : "unbanned"}: id=${remoteResult.id} username=${remoteResult.username}`,
      );
      console.log(`Sessions expired: ${remoteResult.sessionsExpired}`);
      return;
    }

    const sessionsRow = dbApi.getRow(
      "SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?",
      [Number(user.id)],
    );
    dbApi.run("BEGIN");
    try {
      dbApi.run("UPDATE users SET banned = ? WHERE id = ?", [
        nextBanned,
        Number(user.id),
      ]);
      dbApi.run("DELETE FROM sessions WHERE user_id = ?", [Number(user.id)]);
      dbApi.run("COMMIT");
    } catch (error) {
      dbApi.run("ROLLBACK");
      throw error;
    }
    dbApi.save();

    console.log(
      `User ${nextBanned ? "banned" : "unbanned"}: id=${user.id} username=${user.username}`,
    );
    console.log(`Sessions expired: ${Number(sessionsRow?.count || 0)}`);
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

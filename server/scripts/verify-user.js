import { getCliArgs, getPositionalArgs } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { resolveUserRow } from "../lib/dbToolHelpers.js";

async function main() {
  const args = getCliArgs();
  const positional = getPositionalArgs(args);
  const userSelector = String(positional[0] || "").trim();

  if (!userSelector) {
    console.error("Usage: npm run db:user:verify -- <user-id-or-username>");
    process.exit(1);
  }

  const remoteResult = await runAdminActionViaServer("toggle_user_verified", {
    userSelector,
  });
  if (remoteResult) {
    console.log(
      `Server mode user ${remoteResult.verified ? "verified" : "unverified"}: id=${remoteResult.id} username=${remoteResult.username}`,
    );
    return;
  }

  const dbApi = await openDatabase();
  try {
    const user = resolveUserRow(dbApi, userSelector);
    if (!user?.id) {
      console.error("User not found.");
      process.exit(1);
    }

    const nextVerified = Number(user.verified || 0) ? 0 : 1;
    dbApi.run("UPDATE users SET verified = ? WHERE id = ?", [
      nextVerified,
      Number(user.id),
    ]);
    dbApi.save();

    console.log(
      `User ${nextVerified ? "verified" : "unverified"}: id=${user.id} username=${user.username}`,
    );
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

import { confirmAction, getCliArgs, hasForceYes } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";

async function main() {
  const args = getCliArgs();
  const force = hasForceYes(args);

  const confirmed = await confirmAction({
    prompt: "Run VACUUM on the database now? This rewrites the database file.",
    force,
    forceHint:
      "Refusing to vacuum database in non-interactive mode without -y/--yes. Run: npm run db:vacuum -- -y",
  });
  if (!confirmed) {
    console.log("Aborted.");
    return;
  }

  const remoteResult = await runAdminActionViaServer("vacuum_db");
  if (remoteResult) {
    console.log("Server mode: database VACUUM completed.");
    return;
  }

  const dbApi = await openDatabase();
  try {
    dbApi.run("VACUUM");
    dbApi.save();
    console.log("Database VACUUM completed.");
  } finally {
    dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

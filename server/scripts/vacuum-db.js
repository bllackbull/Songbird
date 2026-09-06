import { confirmAction, getCliArgs, hasForceYes } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { createPostgresMaintenance } from "../lib/postgresMaintenance.js";
import { readDbConfig } from "../settings/env.js";

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

  const dbConfig = readDbConfig();
  if (dbConfig.client === "postgres") {
    await createPostgresMaintenance({ config: dbConfig }).vacuum();
    console.log("PostgreSQL VACUUM ANALYZE completed.");
    return;
  }

  const remoteResult = await runAdminActionViaServer("vacuum_db");
  if (remoteResult) {
    console.log("Server mode: database VACUUM completed.");
    return;
  }

  const dbApi = await openDatabase();
  try {
    await dbApi.run("VACUUM");
    await dbApi.save();
    console.log("Database VACUUM completed.");
  } finally {
    await dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});

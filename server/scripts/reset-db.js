import fs from "node:fs";
import path from "node:path";
import { dataDir, getCliArgs, hasForceYes, confirmAction } from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";
import { createPostgresMaintenance } from "../lib/postgresMaintenance.js";
import { readDbConfig } from "../settings/env.js";

const dbPath = path.join(dataDir, "songbird.db");
const uploadsDir = path.join(dataDir, "uploads", "messages");

async function main() {
  const args = getCliArgs();
  const hasForceFlag = hasForceYes(args) || process.env.SONGBIRD_FORCE_RESET === "1";
  const hasNoRecreateFlag = args.includes("--no-recreate");
  const hasRecreateFlag = args.includes("--recreate");
  const dbConfig = readDbConfig();

  const confirmed = await confirmAction({
    prompt: "This will reset database and delete uploaded message files. Continue?",
    force: hasForceFlag,
    forceHint: "Refusing to reset in non-interactive mode without -y/--yes. Run: npm run db:reset -- -y",
  });
  if (!confirmed) return console.log("Aborted.");

  // When Songbird is running, reset through its authenticated loopback API.
  // This preserves schema/settings and uses PostgreSQL TRUNCATE when applicable.
  const remoteResult = await runAdminActionViaServer("reset_db");
  if (remoteResult) {
    console.log("Server mode: database content reset while server is running.");
    return;
  }

  if (dbConfig.client === "postgres") {
    const maintenance = createPostgresMaintenance({ config: dbConfig });
    await maintenance.dropDatabase();
    fs.rmSync(uploadsDir, { recursive: true, force: true });

    const shouldRecreate = hasNoRecreateFlag
      ? false
      : hasRecreateFlag || hasForceFlag
        ? true
        : await confirmAction({ prompt: "Recreate a fresh PostgreSQL database now?", force: false });
    if (!shouldRecreate) {
      console.log("PostgreSQL database reset. Database recreation skipped.");
      return;
    }

    await maintenance.createDatabase();
    const dbApi = await openDatabase();
    await dbApi.close();
    console.log("PostgreSQL database reset and migrations recreated the schema.");
    return;
  }

  const removedDb = fs.existsSync(dbPath);
  fs.rmSync(dbPath, { force: true });
  const removedUploads = fs.existsSync(uploadsDir);
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  console.log(`Data directory: ${dataDir}`);
  console.log(`Database reset: ${removedDb ? "yes" : "no (not found)"}`);
  console.log(`Message uploads removed: ${removedUploads ? "yes" : "no (not found)"}`);

  const shouldRecreate = hasNoRecreateFlag
    ? false
    : hasRecreateFlag || hasForceFlag
      ? true
      : await confirmAction({ prompt: "Recreate a fresh database now?", force: false });
  if (!shouldRecreate) return console.log("Reset complete. Database recreation skipped.");

  await import("../db.js");
  console.log(`Database recreated: ${fs.existsSync(dbPath) ? "yes" : "no"}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

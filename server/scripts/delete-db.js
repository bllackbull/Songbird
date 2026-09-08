import fs from "node:fs";
import path from "node:path";
import { dataDir, getCliArgs, hasForceYes, confirmAction } from "./_cli.js";
import { detectRunningServer, runAdminActionViaServer } from "./_db-admin.js";
import { createPostgresMaintenance } from "../lib/postgresMaintenance.js";
import { readDbConfig } from "../settings/env.js";

const dbPath = path.join(dataDir, "songbird.db");
const uploadsDir = path.join(dataDir, "uploads", "messages");

async function main() {
  const args = getCliArgs();
  const hasForceFlag = hasForceYes(args) || process.env.SONGBIRD_FORCE_DELETE === "1";
  const confirmed = await confirmAction({
    prompt: "This will permanently delete database and uploaded message files. Continue?",
    force: hasForceFlag,
    forceHint: "Refusing to delete in non-interactive mode without -y/--yes. Run: npm run db:delete -- -y",
  });
  if (!confirmed) return console.log("Aborted.");

  const dbConfig = readDbConfig();
  if (dbConfig.client === "postgres") {
    const { running, port } = await detectRunningServer();
    if (running) {
      throw new Error(`Stop Songbird on port ${port} before deleting its PostgreSQL database, or use the Admin Panel action.`);
    }
    await createPostgresMaintenance({ config: dbConfig }).dropDatabase();
    fs.rmSync(uploadsDir, { recursive: true, force: true });
    console.log("PostgreSQL database and local message uploads deleted.");
    return;
  }

  const remoteResult = await runAdminActionViaServer("delete_db");
  if (remoteResult) {
    console.log("Server mode: database content cleared while server is running.");
    return;
  }

  const removedDb = fs.existsSync(dbPath);
  fs.rmSync(dbPath, { force: true });
  const removedUploads = fs.existsSync(uploadsDir);
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  console.log(`Data directory: ${dataDir}`);
  console.log(`Database removed: ${removedDb ? "yes" : "no (not found)"}`);
  console.log(`Message uploads removed: ${removedUploads ? "yes" : "no (not found)"}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import { serverDir } from "./_cli.js";

const projectRootDir = path.resolve(serverDir, "..");
const dataDir = path.join(projectRootDir, "data");
const dbPath = path.join(dataDir, "songbird.db");
const backupDir = path.join(dataDir, "backups");

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`No database found at ${dbPath}.`);
    process.exit(1);
  }
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `songbird-backup-${stamp}.db`);

  try {
    fs.copyFileSync(dbPath, backupPath);
  } catch (error) {
    console.error(`Backup failed: ${error?.message || error}`);
    process.exit(1);
  }

  console.log(`Backup created: ${backupPath}`);
}

await main();

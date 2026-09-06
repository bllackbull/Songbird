import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { serverDir, dataDir } from "./_cli.js";
import { readDbConfig } from "../settings/env.js";
import { createPostgresMaintenance } from "../lib/postgresMaintenance.js";

const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env"), quiet: true });
dotenv.config({ path: path.join(serverDir, ".env"), override: true, quiet: true });

const dbPath = path.join(dataDir, "songbird.db");
const backupDir = path.join(dataDir, "backups");

async function main() {
  const dbConfig = readDbConfig();
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (dbConfig.client === "postgres") {
    const backupPath = path.join(backupDir, `songbird-backup-${stamp}.dump`);
    await createPostgresMaintenance({ config: dbConfig }).backup(backupPath);
    console.log(`PostgreSQL backup created: ${backupPath}`);
    return;
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`No database found at ${dbPath}.`);
    process.exit(1);
  }
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

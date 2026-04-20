import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getCliArgs, getFlagValue, promptSecret, serverDir } from "./_cli.js";

const projectRootDir = path.resolve(serverDir, "..");
const dataDir = path.join(projectRootDir, "data");
const dbPath = path.join(dataDir, "songbird.db");
const uploadsDir = path.join(dataDir, "uploads");
const envPath = path.join(projectRootDir, ".env");
const backupDir = path.join(dataDir, "backups");
const zipBinary = process.env.ZIP_BIN || "zip";

function cleanupTempDir(tempDir) {
  if (!tempDir) return;
  fs.rmSync(tempDir, { recursive: true, force: true });
}

async function main() {
  const args = getCliArgs();
  const passwordFlag = getFlagValue(args, "--password");

  const password =
    String(passwordFlag || "").trim() ||
    (await promptSecret({ prompt: "Backup password: ", required: true }));

  if (!fs.existsSync(envPath)) {
    console.error(`Missing .env file: ${envPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(dbPath) && !fs.existsSync(uploadsDir)) {
    console.error(
      `No data found in ${dataDir}. Missing songbird.db and uploads/.`,
    );
    process.exit(1);
  }
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `songbird-backup-${stamp}.zip`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "songbird-backup-"));

  try {
    fs.mkdirSync(path.join(tempDir, "data"), { recursive: true });
    fs.copyFileSync(envPath, path.join(tempDir, ".env"));
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(tempDir, "data", "songbird.db"));
    }
    if (fs.existsSync(uploadsDir)) {
      fs.cpSync(uploadsDir, path.join(tempDir, "data", "uploads"), {
        recursive: true,
      });
    }

    execFileSync(
      zipBinary,
      ["-r", "-P", password, backupPath, ".env", "data"],
      {
        cwd: tempDir,
        stdio: "pipe",
      },
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.error("zip command not found. Install zip and retry.");
    } else {
      console.error(`Backup failed: ${error?.message || error}`);
    }
    process.exit(1);
  } finally {
    cleanupTempDir(tempDir);
  }

  console.log(`Backup created: ${backupPath}`);
}

await main();

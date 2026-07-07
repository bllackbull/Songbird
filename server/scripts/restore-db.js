import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  confirmAction,
  getCliArgs,
  getFlagValue,
  hasForceYes,
  promptInput,
  serverDir,
} from "./_cli.js";

const projectRootDir = path.resolve(serverDir, "..");
const dataDir = path.join(projectRootDir, "data");
const dbPath = path.join(dataDir, "songbird.db");
const backupDir = path.join(dataDir, "backups");
const serviceName = process.env.SONGBIRD_SERVICE_NAME || "songbird.service";
const serviceUser = process.env.SONGBIRD_SERVICE_USER || "songbird";
const serviceGroup = process.env.SONGBIRD_SERVICE_GROUP || serviceUser;

function listDbBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".db"))
    .map((entry) => path.join(backupDir, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function resolveDbPath(value) {
  const resolved = path.resolve(String(value || "").trim());
  if (!resolved || path.extname(resolved).toLowerCase() !== ".db") return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

async function resolveBackupPath(args) {
  const fileFlag = getFlagValue(args, "--file");
  if (fileFlag) {
    const resolved = resolveDbPath(fileFlag);
    if (!resolved) {
      console.error(`Backup file not found or is not a .db file: ${String(fileFlag).trim()}`);
      process.exit(1);
    }
    return resolved;
  }

  const detected = listDbBackups();
  if (detected.length) {
    const useDetected = await confirmAction({
      prompt: `Use most recent backup "${detected[0]}"?`,
      force: false,
    });
    if (useDetected) return detected[0];
  }

  if (!process.stdin.isTTY) {
    console.error(`No backup .db was selected. Provide --file or run interactively. Checked ${backupDir}.`);
    process.exit(1);
  }

  while (true) {
    const answer = await promptInput({ prompt: "Enter the full path to the backup .db file: ", required: true });
    const resolved = resolveDbPath(answer);
    if (resolved) return resolved;
    console.log("Backup file must be an existing .db file.");
  }
}

function applyOwnership() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return;
  try {
    execFileSync("chown", [`${serviceUser}:${serviceGroup}`, dbPath], { stdio: "pipe" });
  } catch (error) {
    console.warn(`Unable to apply ownership: ${error?.stderr?.toString?.() || error?.message || error}`);
  }
}

function restartService() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    console.warn(`Skipping ${serviceName} restart because db:restore is not running as root.`);
    return;
  }
  try {
    execFileSync("systemctl", ["restart", serviceName], { stdio: "pipe" });
    console.log(`Restarted ${serviceName}.`);
  } catch (error) {
    console.warn(`Unable to restart ${serviceName}: ${error?.stderr?.toString?.() || error?.message || error}`);
  }
}

async function main() {
  const args = getCliArgs();
  const force = hasForceYes(args);
  const sourcePath = await resolveBackupPath(args);

  const confirmed = await confirmAction({
    prompt: `Restore "${path.basename(sourcePath)}" and replace the current database?`,
    force,
    defaultAnswer: "yes",
    forceHint:
      "Refusing to restore in non-interactive mode without -y/--yes. Run: npm run db:restore -- -y --file <path>",
  });
  if (!confirmed) {
    console.log("Aborted.");
    return;
  }

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  try {
    fs.copyFileSync(sourcePath, dbPath);
  } catch (error) {
    console.error(`Restore failed: ${error?.message || error}`);
    process.exit(1);
  }

  applyOwnership();
  restartService();

  console.log(`Database restored from: ${sourcePath}`);
}

await main();

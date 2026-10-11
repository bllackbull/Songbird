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
  dataDir,
} from "./_cli.js";
import { createPostgresMaintenance } from "../lib/postgresMaintenance.js";
import { readDbConfig } from "../settings/env.js";
import { detectRunningServer } from "./_db-admin.js";

const projectRootDir = path.resolve(serverDir, "..");
const dbPath = path.join(dataDir, "songbird.db");
const backupDir = path.join(dataDir, "backups");
const serviceName = process.env.SONGBIRD_SERVICE_NAME || "songbird.service";
const serviceUser = process.env.SONGBIRD_SERVICE_USER || "songbird";
const serviceGroup = process.env.SONGBIRD_SERVICE_GROUP || serviceUser;

function listDbBackups(extension) {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => path.join(backupDir, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function resolveDbPath(value, extension) {
  const resolved = path.resolve(String(value || "").trim());
  if (!resolved || path.extname(resolved).toLowerCase() !== extension) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return null;
  return resolved;
}

async function resolveBackupPath(args, extension) {
  const fileFlag = getFlagValue(args, "--file");
  if (fileFlag) {
    const resolved = resolveDbPath(fileFlag, extension);
    if (!resolved) {
      console.error(`Backup file not found or is not a ${extension} file: ${String(fileFlag).trim()}`);
      process.exit(1);
    }
    return resolved;
  }

  const detected = listDbBackups(extension);
  if (detected.length) {
    const useDetected = await confirmAction({
      prompt: `Use most recent backup "${detected[0]}"?`,
      force: false,
    });
    if (useDetected) return detected[0];
  }

  if (!process.stdin.isTTY) {
    console.error(`No backup ${extension} was selected. Provide --file or run interactively. Checked ${backupDir}.`);
    process.exit(1);
  }

  while (true) {
    const answer = await promptInput({ prompt: `Enter the full path to the backup ${extension} file: `, required: true });
    const resolved = resolveDbPath(answer, extension);
    if (resolved) return resolved;
    console.log(`Backup file must be an existing ${extension} file.`);
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
  const dbConfig = readDbConfig();
  const extension = dbConfig.client === "postgres" ? ".dump" : ".db";
  const sourcePath = await resolveBackupPath(args, extension);

  const confirmed = await confirmAction({
    prompt: `Restore "${path.basename(sourcePath)}" and replace the current database?`,
    force,
    defaultAnswer: "yes",
    forceHint:
      `Refusing to restore in non-interactive mode without -y/--yes. Run: npm run db:restore -- -y --file <path-to-${extension}>`,
  });
  if (!confirmed) {
    console.log("Aborted.");
    return;
  }

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (dbConfig.client === "postgres") {
    const { running, port } = await detectRunningServer();
    if (running) {
      console.error(`Stop Songbird on port ${port} before restoring a PostgreSQL archive.`);
      process.exit(1);
    }
    console.log(`PostgreSQL active — restoring native archive "${path.basename(sourcePath)}"...`);
    try {
      await createPostgresMaintenance({ config: dbConfig }).restore(sourcePath);
    } catch (error) {
      console.error(`PostgreSQL restore failed: ${error?.message || error}`);
      process.exit(1);
    }
  } else {
    try {
      fs.copyFileSync(sourcePath, dbPath);
    } catch (error) {
      console.error(`Restore failed: ${error?.message || error}`);
      process.exit(1);
    }

    applyOwnership();
  }
  restartService();

  console.log(`Database restored from: ${sourcePath}`);
}

await main();

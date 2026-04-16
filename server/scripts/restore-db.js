import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  confirmAction,
  getCliArgs,
  getFlagValue,
  hasForceYes,
  promptInput,
  promptSecret,
  serverDir,
} from "./_cli.js";

const projectRootDir = path.resolve(serverDir, "..");
const backupDir = path.join(projectRootDir, "data", "backups");
const filesystemRootDir = path.parse(projectRootDir).root;
const unzipBinary = process.env.UNZIP_BIN || "unzip";
const BACKUP_NAME_REGEX = /^songbird-backup-.*\.zip$/i;

function listBackupCandidates() {
  const candidates = [];
  const seen = new Set();
  [filesystemRootDir, backupDir].forEach((dirPath) => {
    if (
      !dirPath ||
      !fs.existsSync(dirPath) ||
      !fs.statSync(dirPath).isDirectory()
    )
      return;
    fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
      if (!entry.isFile() || !BACKUP_NAME_REGEX.test(entry.name)) return;
      const fullPath = path.join(dirPath, entry.name);
      if (seen.has(fullPath)) return;
      seen.add(fullPath);
      candidates.push(fullPath);
    });
  });
  return candidates.sort((a, b) => {
    const aTime = fs.statSync(a).mtimeMs;
    const bTime = fs.statSync(b).mtimeMs;
    return bTime - aTime;
  });
}

function chooseBackupPath(files, preferredPath) {
  if (preferredPath) return preferredPath;
  if (!files.length) {
    console.error(
      `No Songbird backup zip files found in ${filesystemRootDir} or ${backupDir}.`,
    );
    process.exit(1);
  }
  if (files.length === 1) return files[0];
  console.log("Available Songbird backups:");
  files.forEach((filePath, index) => {
    console.log(`${index + 1}. ${filePath}`);
  });
  return null;
}

function runUnzip(args) {
  try {
    execFileSync(unzipBinary, args, { stdio: "pipe" });
    return { ok: true, output: "" };
  } catch (error) {
    const combined = [
      error?.stdout?.toString?.(),
      error?.stderr?.toString?.(),
      error?.message,
    ]
      .filter(Boolean)
      .join("\n");
    return { ok: false, output: combined };
  }
}

function outputLooksPasswordRelated(output) {
  const text = String(output || "").toLowerCase();
  return (
    text.includes("password") ||
    text.includes("encrypted") ||
    text.includes("unable to get password") ||
    text.includes("incorrect password")
  );
}

function extractBackup(zipPath, destinationDir, password) {
  const args = ["-q"];
  if (password) {
    args.push("-P", password);
  }
  args.push(zipPath, "-d", destinationDir);
  const result = runUnzip(args);
  if (!result.ok) {
    throw new Error(result.output || "Unzip failed.");
  }
}

async function resolveBackupPath(args) {
  const fileFlag = getFlagValue(args, "--file");
  if (fileFlag) {
    const resolved = path.resolve(String(fileFlag).trim());
    if (!fs.existsSync(resolved)) {
      console.error(`Backup file not found: ${resolved}`);
      process.exit(1);
    }
    return resolved;
  }

  const files = listBackupCandidates();
  const selected = chooseBackupPath(files);
  if (selected) return selected;

  while (true) {
    const answer = await promptInput({
      prompt: "Choose a backup number: ",
      required: true,
    });
    const index = Number(answer);
    if (Number.isInteger(index) && index >= 1 && index <= files.length) {
      return files[index - 1];
    }
  }
}

async function main() {
  const args = getCliArgs();
  const force = hasForceYes(args);
  const zipPath = await resolveBackupPath(args);
  const installRoot = projectRootDir;

  const confirmed = await confirmAction({
    prompt: `Restore backup "${path.basename(zipPath)}" into ${installRoot} and replace .env/data?`,
    force,
    forceHint:
      "Refusing to restore backup in non-interactive mode without -y/--yes. Run: npm run db:restore -- -y",
  });
  if (!confirmed) {
    console.log("Aborted.");
    return;
  }

  let password = String(getFlagValue(args, "--password") || "").trim();
  let testResult = runUnzip(
    password ? ["-P", password, "-tqq", zipPath] : ["-tqq", zipPath],
  );
  if (!testResult.ok && outputLooksPasswordRelated(testResult.output)) {
    password = await promptSecret({
      prompt: "Backup password: ",
      required: true,
    });
    testResult = runUnzip(["-P", password, "-tqq", zipPath]);
  }
  if (!testResult.ok) {
    console.error(`Unable to validate backup: ${testResult.output}`);
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "songbird-restore-"));
  try {
    extractBackup(zipPath, tempDir, password);

    const envSrc = path.join(tempDir, ".env");
    const dataSrc = path.join(tempDir, "data");
    const dbSrc = path.join(dataSrc, "songbird.db");
    const uploadsSrc = path.join(dataSrc, "uploads");
    if (
      !fs.existsSync(envSrc) ||
      !fs.existsSync(dbSrc) ||
      !fs.existsSync(uploadsSrc)
    ) {
      console.error(
        "Backup zip does not contain expected .env and data/ contents.",
      );
      process.exit(1);
    }

    fs.rmSync(path.join(installRoot, "data"), { recursive: true, force: true });
    fs.mkdirSync(installRoot, { recursive: true });
    fs.copyFileSync(envSrc, path.join(installRoot, ".env"));
    fs.cpSync(dataSrc, path.join(installRoot, "data"), { recursive: true });

    console.log(`Backup restored from: ${zipPath}`);
    console.log(`Restored into: ${installRoot}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

await main();

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
  serverDir,
} from "./_cli.js";

const projectRootDir = path.resolve(serverDir, "..");
const backupDir = path.join(projectRootDir, "data", "backups");
const rootBackupDir = "/root";
const unzipBinary = process.env.UNZIP_BIN || "unzip";
const backupNamePattern = /^songbird-backup-.*\.zip$/i;
const serviceName = process.env.SONGBIRD_SERVICE_NAME || "songbird.service";
const serviceUser = process.env.SONGBIRD_SERVICE_USER || "songbird";
const serviceGroup = process.env.SONGBIRD_SERVICE_GROUP || serviceUser;

function listZipFilesInDir(dirPath) {
  if (
    !dirPath ||
    !fs.existsSync(dirPath) ||
    !fs.statSync(dirPath).isDirectory()
  ) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && backupNamePattern.test(entry.name))
    .map((entry) => path.join(dirPath, entry.name))
    .sort((a, b) => {
      const aTime = fs.statSync(a).mtimeMs;
      const bTime = fs.statSync(b).mtimeMs;
      return bTime - aTime;
    });
}

function findDetectedBackupPath() {
  const candidates = [backupDir, rootBackupDir];
  for (const dirPath of candidates) {
    const files = listZipFilesInDir(dirPath);
    if (files.length) {
      return files[0];
    }
  }
  return null;
}

function resolveManualBackupPath(inputPath) {
  const resolved = path.resolve(String(inputPath || "").trim());
  if (!resolved || path.extname(resolved).toLowerCase() !== ".zip") {
    return null;
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return null;
  }
  return resolved;
}

async function promptForBackupPath() {
  while (true) {
    const answer = await promptInput({
      prompt: "Enter the full path to the backup .zip file: ",
      required: true,
    });
    const resolved = resolveManualBackupPath(answer);
    if (resolved) {
      return resolved;
    }
    console.log("Backup file must be an existing .zip archive.");
  }
}

function runUnzip(args) {
  try {
    execFileSync(unzipBinary, args, { stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output: "", timedOut: false, exitCode: 0 };
  } catch (error) {
    const combined = [
      error?.stdout?.toString?.(),
      error?.stderr?.toString?.(),
      error?.message,
    ]
      .filter(Boolean)
      .join("\n");
    const timedOut =
      error?.code === "ETIMEDOUT" ||
      error?.signal === "SIGTERM" ||
      error?.killed === true;
    const output = timedOut
      ? `${combined}\nUnzip timed out while waiting for archive input.`
      : combined;
    return {
      ok: false,
      output,
      timedOut,
      exitCode:
        typeof error?.status === "number"
          ? error.status
          : typeof error?.code === "number"
            ? error.code
            : null,
    };
  }
}

function outputLooksPasswordRelated(output) {
  const text = String(output || "").toLowerCase();
  return (
    text.includes("password") ||
    text.includes("encrypted") ||
    text.includes("unable to get password") ||
    text.includes("incorrect password") ||
    text.includes("skipping:") ||
    text.includes("bad decryption password")
  );
}

function hasInteractiveTty() {
  return process.stdin.isTTY === true;
}

function unzipResultNeedsPassword(result) {
  return (
    result?.exitCode === 82 ||
    (result?.ok === false && outputLooksPasswordRelated(result?.output))
  );
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function extractBackup(zipPath, destinationDir, password) {
  const shellCommand = `unzip -q -P ${shellQuote(password || "")} ${shellQuote(zipPath)} -d ${shellQuote(destinationDir)}`;
  try {
    execFileSync("bash", ["-lc", shellCommand], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, output: "", timedOut: false, exitCode: 0 };
  } catch (error) {
    const combined = [
      error?.stdout?.toString?.(),
      error?.stderr?.toString?.(),
      error?.message,
    ]
      .filter(Boolean)
      .join("\n");
    return {
      ok: false,
      output: combined,
      timedOut: false,
      exitCode:
        typeof error?.status === "number"
          ? error.status
          : typeof error?.code === "number"
            ? error.code
            : null,
    };
  }
}

function pathExists(targetPath) {
  return fs.existsSync(targetPath);
}

function detectBackupLayout(extractedRoot) {
  const currentEnvSrc = path.join(extractedRoot, ".env");
  const currentDataSrc = path.join(extractedRoot, "data");
  const currentDbSrc = path.join(currentDataSrc, "songbird.db");
  const currentUploadsSrc = path.join(currentDataSrc, "uploads");
  if (pathExists(currentDbSrc) && pathExists(currentUploadsSrc)) {
    return {
      kind: "current",
      envSrc: pathExists(currentEnvSrc) ? currentEnvSrc : null,
      dbSrc: currentDbSrc,
      uploadsSrc: currentUploadsSrc,
    };
  }

  const legacyDbSrc = path.join(extractedRoot, "songbird.db");
  const legacyUploadsSrc = path.join(extractedRoot, "uploads");
  if (pathExists(legacyDbSrc) && pathExists(legacyUploadsSrc)) {
    return {
      kind: "legacy",
      envSrc: pathExists(currentEnvSrc) ? currentEnvSrc : null,
      dbSrc: legacyDbSrc,
      uploadsSrc: legacyUploadsSrc,
    };
  }

  return null;
}

function applyOwnership(installRoot) {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    console.warn(
      "Skipping ownership update because db:restore is not running as root.",
    );
    return;
  }

  try {
    execFileSync(
      "chown",
      ["-R", `${serviceUser}:${serviceGroup}`, installRoot],
      {
        stdio: "pipe",
      },
    );
  } catch (error) {
    const message = error?.stderr?.toString?.() || error?.message || error;
    console.warn(`Unable to apply ownership: ${message}`);
  }

  try {
    execFileSync(
      "git",
      ["config", "--global", "--add", "safe.directory", installRoot],
      { stdio: "pipe" },
    );
  } catch (error) {
    const message = error?.stderr?.toString?.() || error?.message || error;
    console.warn(`Unable to mark install as a safe git directory: ${message}`);
  }
}

function restartSongbirdService() {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    console.warn(
      `Skipping ${serviceName} restart because db:restore is not running as root.`,
    );
    return;
  }

  try {
    execFileSync("systemctl", ["restart", serviceName], { stdio: "pipe" });
    console.log(`Restarted ${serviceName}.`);
  } catch (error) {
    const message = error?.stderr?.toString?.() || error?.message || error;
    console.warn(`Unable to restart ${serviceName}: ${message}`);
  }
}

async function resolveBackupPath(args) {
  const fileFlag = getFlagValue(args, "--file");
  if (fileFlag) {
    const resolved = resolveManualBackupPath(fileFlag);
    if (!resolved) {
      console.error(
        `Backup file not found or is not a .zip archive: ${String(fileFlag).trim()}`,
      );
      process.exit(1);
    }
    return resolved;
  }

  const detected = findDetectedBackupPath();
  if (detected) {
    const useDetected = await confirmAction({
      prompt: `Use detected backup "${detected}"?`,
      force: false,
    });
    if (useDetected) {
      return detected;
    }
  }

  if (!process.stdin.isTTY) {
    console.error(
      `No backup zip was auto-selected. Provide --file or run interactively. Checked ${backupDir} and ${rootBackupDir}.`,
    );
    process.exit(1);
  }

  return promptForBackupPath();
}

async function main() {
  const args = getCliArgs();
  const force = hasForceYes(args);
  const zipPath = await resolveBackupPath(args);
  const installRoot = projectRootDir;

  const confirmed = await confirmAction({
    prompt: `Restore backup "${path.basename(zipPath)}" into ${installRoot} and replace data plus .env when present?`,
    force,
    defaultAnswer: "yes",
    forceHint:
      "Refusing to restore backup in non-interactive mode without -y/--yes. Run: npm run db:restore -- -y",
  });
  if (!confirmed) {
    console.log("Aborted.");
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "songbird-restore-"));
  try {
    let password = String(getFlagValue(args, "--password") || "").trim();
    let extractResult = extractBackup(zipPath, tempDir, password);

    if (!extractResult.ok && unzipResultNeedsPassword(extractResult)) {
      if (!hasInteractiveTty()) {
        console.error(
          "Backup password is missing or incorrect, or the archive encryption setting does not match the provided input.",
        );
        process.exit(1);
      }

      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.mkdirSync(tempDir, { recursive: true });
      password = await promptInput({
        prompt: password
          ? "Backup password appears incorrect. Enter backup password: "
          : "Backup password (leave blank if not encrypted): ",
        required: false,
      });
      extractResult = extractBackup(zipPath, tempDir, password);
    }

    if (!extractResult.ok) {
      console.error(`Unable to extract backup: ${extractResult.output}`);
      process.exit(1);
    }

    const layout = detectBackupLayout(tempDir);
    if (!layout) {
      console.error(
        "Backup zip does not contain expected songbird.db and uploads/ contents.",
      );
      process.exit(1);
    }

    const envDest = path.join(installRoot, ".env");
    const dataDest = path.join(installRoot, "data");
    const dbDest = path.join(dataDest, "songbird.db");
    const uploadsDest = path.join(dataDest, "uploads");

    fs.rmSync(path.join(installRoot, "data"), { recursive: true, force: true });
    fs.mkdirSync(installRoot, { recursive: true });
    fs.mkdirSync(dataDest, { recursive: true });

    if (layout.envSrc) {
      fs.copyFileSync(layout.envSrc, envDest);
    } else if (fs.existsSync(envDest)) {
      console.log("Legacy backup detected; keeping existing .env in place.");
    } else {
      console.warn(
        "Legacy backup detected without .env. Restore completed, but the app also needs a valid .env file.",
      );
    }

    fs.copyFileSync(layout.dbSrc, dbDest);
    fs.cpSync(layout.uploadsSrc, uploadsDest, { recursive: true });

    applyOwnership(installRoot);
    restartSongbirdService();

    console.log(`Backup restored from: ${zipPath}`);
    console.log(`Restored into: ${installRoot}`);
    console.log(`Backup format: ${layout.kind}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

await main();

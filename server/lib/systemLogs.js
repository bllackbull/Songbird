import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..", "..");

const SERVICE_NAME = process.env.SONGBIRD_SERVICE_NAME || "songbird.service";

// Candidate paths for each log source. The first readable one wins.
const INSTALLER_LOG_CANDIDATES = [
  path.join(projectRootDir, "logs", "install.log"),
  "/opt/songbird/logs/install.log",
];

const NGINX_LOG_CANDIDATES = [
  "/var/log/nginx/error.log",
  "/var/log/nginx/access.log",
];

// Hint shown when a log is unavailable due to OS-level permission restrictions.
const PERMISSION_HINT =
  "To fix: add the songbird user to the adm and systemd-journal groups, " +
  "and add a sudoers drop-in for service control. " +
  "Re-run the installer or see the README for manual steps.";

function readLastLinesOfFile(filePath, maxLines = 300) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split("\n").filter((l) => l.length > 0);
    return lines.slice(-maxLines);
  } catch {
    return null;
  }
}

/**
 * Try to read the last N lines of a file via `sudo -n cat`.
 * Returns an array of lines on success, or null on failure.
 */
function readLastLinesViaSudo(filePath, maxLines) {
  return new Promise((resolve) => {
    execFile(
      "sudo",
      ["-n", "cat", filePath],
      { timeout: 5000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const lines = String(stdout).split("\n").filter((l) => l.length > 0);
        resolve(lines.slice(-maxLines));
      },
    );
  });
}

function firstReadable(candidates, maxLines) {
  for (const candidate of candidates) {
    const lines = readLastLinesOfFile(candidate, maxLines);
    if (lines !== null) return { path: candidate, lines };
  }
  return null;
}

/**
 * Like firstReadable but falls back to sudo -n cat for each candidate.
 * Returns a Promise resolving to { path, lines } or null.
 */
async function firstReadableWithSudoFallback(candidates, maxLines) {
  // First pass: direct read (no privilege needed if the process has access).
  const direct = firstReadable(candidates, maxLines);
  if (direct) return direct;

  // Second pass: try sudo -n (works when a passwordless sudoers rule exists).
  for (const candidate of candidates) {
    // Check existence without caring about readability.
    try { fs.accessSync(candidate, fs.constants.F_OK); } catch { continue; }
    const lines = await readLastLinesViaSudo(candidate, maxLines);
    if (lines !== null) return { path: candidate, lines };
  }
  return null;
}

export function readInstallerLog({ maxLines = 300 } = {}) {
  const result = firstReadable(INSTALLER_LOG_CANDIDATES, maxLines);
  if (!result) return { available: false, lines: [], reason: "Installer log not found." };
  return { available: true, lines: result.lines, source: result.path };
}

export async function readNginxLog({ maxLines = 300 } = {}) {
  const result = await firstReadableWithSudoFallback(NGINX_LOG_CANDIDATES, maxLines);
  if (!result) {
    return {
      available: false,
      lines: [],
      reason: `Nginx logs not accessible. ${PERMISSION_HINT}`,
    };
  }
  return { available: true, lines: result.lines, source: result.path };
}

// journalctl for the systemd service — async since it shells out.
export function readServiceLog({ maxLines = 300 } = {}) {
  return new Promise((resolve) => {
    // First attempt: run journalctl directly (works if process user is in
    // the systemd-journal group or has CAP_ADMSYS_ADMIN).
    execFile(
      "journalctl",
      ["-u", SERVICE_NAME, "-n", String(maxLines), "--no-pager", "--output", "short-iso"],
      { timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (!err) {
          const lines = String(stdout || "").split("\n").filter((l) => l.length > 0);
          return resolve({ available: true, lines, source: SERVICE_NAME });
        }

        // Second attempt: sudo -n journalctl (works when a passwordless sudoers
        // rule grants the service user access to journalctl).
        execFile(
          "sudo",
          ["-n", "journalctl", "-u", SERVICE_NAME, "-n", String(maxLines), "--no-pager", "--output", "short-iso"],
          { timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
          (err2, stdout2) => {
            if (!err2) {
              const lines = String(stdout2 || "").split("\n").filter((l) => l.length > 0);
              return resolve({ available: true, lines, source: SERVICE_NAME });
            }
            resolve({
              available: false,
              lines: [],
              reason: `Service logs not accessible (journalctl unavailable or insufficient permissions). ${PERMISSION_HINT}`,
            });
          },
        );
      },
    );
  });
}

/**
 * Probes which log sources are available in the current deployment environment.
 * Each entry includes an `available` boolean so the UI can hide irrelevant tabs
 * rather than showing them with an error message.
 *
 * Probing is intentionally lightweight — we only check file existence / command
 * availability, not read the full content.
 */
export async function probeLogSources() {
  const isDocker = (() => {
    try { return fs.existsSync("/.dockerenv"); } catch { return false; }
  })();

  // Installer log: check whether any candidate path exists.
  const installerAvailable = INSTALLER_LOG_CANDIDATES.some((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  });

  // Nginx log: check whether any candidate is directly readable, or
  // accessible via sudo (matching the real read logic). Skip in Docker —
  // nginx runs in a separate container and its logs are not on this filesystem.
  let nginxAvailable = false;
  if (!isDocker) {
    nginxAvailable = NGINX_LOG_CANDIDATES.some((p) => {
      try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; }
    });
    if (!nginxAvailable) {
      // Quick sudo probe — if sudo -n cat succeeds on at least one file it's accessible.
      for (const p of NGINX_LOG_CANDIDATES) {
        try { fs.accessSync(p, fs.constants.F_OK); } catch { continue; }
        const result = await new Promise((resolve) => {
          execFile("sudo", ["-n", "cat", p], { timeout: 2000 }, (err) => resolve(!err));
        });
        if (result) { nginxAvailable = true; break; }
      }
    }
  }

  // Service log: journalctl only works on systemd hosts, not in Docker.
  let serviceAvailable = false;
  if (!isDocker) {
    serviceAvailable = await new Promise((resolve) => {
      execFile("journalctl", ["--version"], { timeout: 2000 }, (err) => {
        if (!err) return resolve(true);
        execFile("sudo", ["-n", "journalctl", "--version"], { timeout: 2000 }, (err2) => resolve(!err2));
      });
    });
  }

  return {
    admin:     { available: true },
    installer: { available: installerAvailable },
    service:   { available: serviceAvailable },
    nginx:     { available: nginxAvailable },
  };
}

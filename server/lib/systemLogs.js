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

function firstReadable(candidates, maxLines) {
  for (const candidate of candidates) {
    const lines = readLastLinesOfFile(candidate, maxLines);
    if (lines !== null) return { path: candidate, lines };
  }
  return null;
}

export function readInstallerLog({ maxLines = 300 } = {}) {
  const result = firstReadable(INSTALLER_LOG_CANDIDATES, maxLines);
  if (!result) return { available: false, lines: [], reason: "Installer log not found." };
  return { available: true, lines: result.lines, source: result.path };
}

export function readNginxLog({ maxLines = 300 } = {}) {
  const result = firstReadable(NGINX_LOG_CANDIDATES, maxLines);
  if (!result) return { available: false, lines: [], reason: "Nginx logs not accessible." };
  return { available: true, lines: result.lines, source: result.path };
}

// journalctl for the systemd service — async since it shells out.
export function readServiceLog({ maxLines = 300 } = {}) {
  return new Promise((resolve) => {
    execFile(
      "journalctl",
      ["-u", SERVICE_NAME, "-n", String(maxLines), "--no-pager", "--output", "short-iso"],
      { timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve({ available: false, lines: [], reason: "Service logs not accessible (journalctl unavailable or insufficient permissions)." });
          return;
        }
        const lines = String(stdout || "").split("\n").filter((l) => l.length > 0);
        resolve({ available: true, lines, source: SERVICE_NAME });
      },
    );
  });
}

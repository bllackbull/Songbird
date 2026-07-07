import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(serverDir, "..", "..");
const logsDir = path.join(projectRootDir, "logs");
const adminLogPath = path.join(logsDir, "admin.log");

function ensureLogsDir() {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

/**
 * Append a single admin action as a JSON line to logs/admin.log.
 * Each line is a self-contained JSON object so the file is easy to tail,
 * grep, and parse — matching the plain-text convention used by install.log.
 */
export function writeAdminLog({
  actorUserId = null,
  actorUsername = null,
  action,
  targetType = null,
  targetLabel = null,
  details = null,
  status = "success",
}) {
  try {
    ensureLogsDir();
    const entry = {
      ts: new Date().toISOString(),
      actorUserId,
      actorUsername,
      action: String(action || ""),
      targetType,
      targetLabel,
      details,
      status,
    };
    fs.appendFileSync(adminLogPath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Logging must never break the request flow.
  }
}

/**
 * Read the most recent admin log entries (newest first).
 * Parses JSON lines, tolerating malformed lines.
 */
export function readAdminLog({ limit = 200, search = "" } = {}) {
  try {
    if (!fs.existsSync(adminLogPath)) return [];
    const raw = fs.readFileSync(adminLogPath, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const needle = String(search || "").toLowerCase();
    const entries = [];
    // Iterate from the end (newest) backwards.
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      let parsed;
      try { parsed = JSON.parse(lines[i]); } catch { continue; }
      if (needle) {
        const haystack = [
          parsed.actorUsername, parsed.action, parsed.targetLabel, parsed.details,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      entries.push(parsed);
    }
    return entries;
  } catch {
    return [];
  }
}

export function clearAdminLog() {
  try {
    ensureLogsDir();
    fs.writeFileSync(adminLogPath, "", "utf8");
    return true;
  } catch {
    return false;
  }
}

export { adminLogPath, logsDir };

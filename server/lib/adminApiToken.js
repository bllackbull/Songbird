import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function normalizeEnvSecret(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function updateEnvValue(targetPath, key, value, { fsImpl = fs } = {}) {
  const safeValue = String(value ?? "");
  let contents = "";
  try {
    contents = fsImpl.existsSync(targetPath)
      ? fsImpl.readFileSync(targetPath, "utf8")
      : "";
  } catch {
    contents = "";
  }

  const lines = contents ? contents.split(/\r?\n/) : [];
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${safeValue}`;
    }
    return line;
  });

  if (!found) {
    updated.push(`${key}=${safeValue}`);
  }

  const next = updated.filter(
    (line, index, arr) => line.length > 0 || index < arr.length - 1,
  );
  fsImpl.writeFileSync(targetPath, `${next.join("\n")}\n`);
}

// Ensures ADMIN_API_TOKEN is set, generating and persisting one to the
// project .env on first boot if missing (mirrors STORAGE_ENCRYPTION_KEY /
// VAPID key bootstrapping). This token gates the local-only /api/admin/db-tools
// endpoint used by the CLI scripts as a second layer of defense in addition
// to the loopback-only check.
export function ensureAdminApiToken({
  projectRootDir,
  fsImpl = fs,
  pathImpl = path,
  cryptoImpl = crypto,
} = {}) {
  const existing = normalizeEnvSecret(process.env.ADMIN_API_TOKEN);
  if (existing) return existing;

  const generated = cryptoImpl.randomBytes(32).toString("base64url");
  const envPath = pathImpl.join(String(projectRootDir || ""), ".env");

  try {
    updateEnvValue(envPath, "ADMIN_API_TOKEN", generated, { fsImpl });
  } catch (error) {
    console.warn(
      "[admin-api-token] Unable to update .env with generated admin API token:",
      String(error?.message || error),
    );
  }

  process.env.ADMIN_API_TOKEN = generated;
  return generated;
}

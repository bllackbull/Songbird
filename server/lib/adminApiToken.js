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
// project .env and data volume on first boot if missing.
export function ensureAdminApiToken({
  projectRootDir,
  dataDir,
  fsImpl = fs,
  pathImpl = path,
  cryptoImpl = crypto,
} = {}) {
  // Load from data volume secrets file first — survives container rebuilds
  // even when the project .env is on an ephemeral filesystem.
  const secretsPath = dataDir ? pathImpl.join(String(dataDir), "secrets.env") : null;
  if (secretsPath) {
    try {
      if (fsImpl.existsSync(secretsPath)) {
        const lines = fsImpl.readFileSync(secretsPath, "utf8").split(/\r?\n/);
        for (const line of lines) {
          const match = line.match(/^([A-Z_]+)=(.+)$/);
          if (match && match[1] === "ADMIN_API_TOKEN" && !process.env.ADMIN_API_TOKEN) {
            process.env.ADMIN_API_TOKEN = match[2];
          }
        }
      }
    } catch {
      // best effort
    }
  }

  const existing = normalizeEnvSecret(process.env.ADMIN_API_TOKEN);
  if (existing) return existing;

  const generated = cryptoImpl.randomBytes(32).toString("base64url");

  // Write to project .env (best-effort, may be ephemeral in Docker/cloud)
  const envPath = pathImpl.join(String(projectRootDir || ""), ".env");
  try {
    updateEnvValue(envPath, "ADMIN_API_TOKEN", generated, { fsImpl });
  } catch (error) {
    console.warn(
      "[admin-api-token] Unable to update .env with generated admin API token:",
      String(error?.message || error),
    );
  }

  // Write to data volume so the token survives container restarts
  if (secretsPath) {
    try {
      fsImpl.mkdirSync(String(dataDir), { recursive: true });
      updateEnvValue(secretsPath, "ADMIN_API_TOKEN", generated, { fsImpl });
      console.log("[admin-api-token] Admin API token persisted to data volume.");
    } catch (error) {
      console.warn(
        "[admin-api-token] Unable to persist admin API token to data volume:",
        String(error?.message || error),
      );
    }
  }

  process.env.ADMIN_API_TOKEN = generated;
  return generated;
}

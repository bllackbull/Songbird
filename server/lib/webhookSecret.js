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

// Ensures WEBHOOK_SECRET is set, generating and persisting one to the
// project .env and data volume on first boot if missing.
export function ensureWebhookSecret({
  projectRootDir,
  dataDir,
  fsImpl = fs,
  pathImpl = path,
  cryptoImpl = crypto,
} = {}) {
  const secretsPath = dataDir
    ? pathImpl.join(String(dataDir), "secrets.env")
    : null;
  if (secretsPath) {
    try {
      if (fsImpl.existsSync(secretsPath)) {
        const lines = fsImpl.readFileSync(secretsPath, "utf8").split(/\r?\n/);
        for (const line of lines) {
          const match = line.match(/^([A-Z_]+)=(.+)$/);
          if (
            match &&
            match[1] === "WEBHOOK_SECRET" &&
            !process.env.WEBHOOK_SECRET
          ) {
            process.env.WEBHOOK_SECRET = match[2];
          }
        }
      }
    } catch {
      // best effort
    }
  }

  const existing = normalizeEnvSecret(process.env.WEBHOOK_SECRET);
  if (existing) return existing;

  const generated = cryptoImpl.randomBytes(32).toString("hex");

  const envPath = pathImpl.join(String(projectRootDir || ""), ".env");
  try {
    updateEnvValue(envPath, "WEBHOOK_SECRET", generated, { fsImpl });
  } catch (error) {
    console.warn(
      "[webhook-secret] Unable to update .env with generated webhook secret:",
      String(error?.message || error),
    );
  }

  if (secretsPath) {
    try {
      fsImpl.mkdirSync(String(dataDir), { recursive: true });
      updateEnvValue(secretsPath, "WEBHOOK_SECRET", generated, {
        fsImpl,
      });
      console.log("[webhook-secret] Webhook secret persisted to data volume.");
    } catch (error) {
      console.warn(
        "[webhook-secret] Unable to persist webhook secret to data volume:",
        String(error?.message || error),
      );
    }
  }

  process.env.WEBHOOK_SECRET = generated;
  return generated;
}

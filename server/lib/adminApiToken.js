import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeEnvSecret, updateEnvValue } from "./secrets.js";

export { normalizeEnvSecret };

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

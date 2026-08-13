import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { normalizeEnvSecret, updateEnvValue } from "./secrets.js";

export function ensureWebhookSecret({
  projectRootDir,
  fsImpl = fs,
  pathImpl = path,
  cryptoImpl = crypto,
} = {}) {
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

  process.env.WEBHOOK_SECRET = generated;
  return generated;
}

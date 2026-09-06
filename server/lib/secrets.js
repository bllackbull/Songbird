import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { dbKnex } from "../db/knex.js";

export function normalizeEnvSecret(value) {
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

export function updateEnvValue(targetPath, key, value, { fsImpl = fs } = {}) {
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
  try {
    fsImpl.writeFileSync(targetPath, `${next.join("\n")}\n`);
  } catch (err) {
    // Best-effort write to .env (e.g. read-only filesystem)
  }
}

export async function ensureSystemSecrets({
  dbRun,
  dbGetRow,
  projectRootDir,
  fsImpl = fs,
  pathImpl = path,
  cryptoImpl = crypto,
  webpushImpl = webpush,
} = {}) {
  const envPath = projectRootDir
    ? pathImpl.join(String(projectRootDir), ".env")
    : null;

  async function getDbSecret(key) {
    if (typeof dbGetRow !== "function") return null;
    try {
      const row = await dbGetRow(
        dbKnex("app_settings").where({ key }).select("value").first(),
      );
      return row?.value ? normalizeEnvSecret(row.value) : null;
    } catch {
      return null;
    }
  }

  async function saveDbSecret(key, value) {
    if (typeof dbRun !== "function") return;
    try {
      await dbRun(
        dbKnex("app_settings")
          .insert({ key, value })
          .onConflict("key")
          .merge({ value }),
      );
    } catch (err) {
      console.warn(
        `[secrets] Unable to save secret ${key} to database:`,
        err?.message || err,
      );
    }
  }

  async function resolveSecret(envKey, generator) {
    let current = normalizeEnvSecret(process.env[envKey]);
    const fromDb = await getDbSecret(envKey);

    if (current) {
      if (current !== fromDb) {
        await saveDbSecret(envKey, current);
      }
      return current;
    }

    if (fromDb) {
      process.env[envKey] = fromDb;
      if (envPath) updateEnvValue(envPath, envKey, fromDb, { fsImpl });
      return fromDb;
    }

    const generated = generator();
    process.env[envKey] = generated;
    await saveDbSecret(envKey, generated);
    if (envPath) updateEnvValue(envPath, envKey, generated, { fsImpl });
    return generated;
  }

  const adminToken = await resolveSecret("ADMIN_API_TOKEN", () =>
    cryptoImpl.randomBytes(32).toString("base64url"),
  );

  const storageKey = await resolveSecret("STORAGE_ENCRYPTION_KEY", () =>
    cryptoImpl.randomBytes(32).toString("base64url"),
  );

  const webhookSecret = await resolveSecret("WEBHOOK_SECRET", () =>
    cryptoImpl.randomBytes(32).toString("hex"),
  );

  let pubKey = normalizeEnvSecret(process.env.VAPID_PUBLIC_KEY);
  let privKey = normalizeEnvSecret(process.env.VAPID_PRIVATE_KEY);
  let subject =
    normalizeEnvSecret(process.env.VAPID_SUBJECT) || "mailto:admin@example.com";

  if (pubKey && privKey) {
    const dbPubKey = await getDbSecret("VAPID_PUBLIC_KEY");
    const dbPrivKey = await getDbSecret("VAPID_PRIVATE_KEY");
    const dbSub = await getDbSecret("VAPID_SUBJECT");

    if (pubKey !== dbPubKey) await saveDbSecret("VAPID_PUBLIC_KEY", pubKey);
    if (privKey !== dbPrivKey) await saveDbSecret("VAPID_PRIVATE_KEY", privKey);
    if (subject !== dbSub) await saveDbSecret("VAPID_SUBJECT", subject);
  } else {
    const dbPubKey = await getDbSecret("VAPID_PUBLIC_KEY");
    const dbPrivKey = await getDbSecret("VAPID_PRIVATE_KEY");
    const dbSub = await getDbSecret("VAPID_SUBJECT");

    if (dbPubKey && dbPrivKey) {
      pubKey = dbPubKey;
      privKey = dbPrivKey;
      if (dbSub) subject = dbSub;
      process.env.VAPID_PUBLIC_KEY = pubKey;
      process.env.VAPID_PRIVATE_KEY = privKey;
      process.env.VAPID_SUBJECT = subject;
      if (envPath) {
        updateEnvValue(envPath, "VAPID_PUBLIC_KEY", pubKey, { fsImpl });
        updateEnvValue(envPath, "VAPID_PRIVATE_KEY", privKey, { fsImpl });
        updateEnvValue(envPath, "VAPID_SUBJECT", subject, { fsImpl });
      }
    } else {
      const generatedKeys = webpushImpl.generateVAPIDKeys();
      pubKey = generatedKeys.publicKey;
      privKey = generatedKeys.privateKey;
      process.env.VAPID_PUBLIC_KEY = pubKey;
      process.env.VAPID_PRIVATE_KEY = privKey;
      process.env.VAPID_SUBJECT = subject;

      await saveDbSecret("VAPID_PUBLIC_KEY", pubKey);
      await saveDbSecret("VAPID_PRIVATE_KEY", privKey);
      await saveDbSecret("VAPID_SUBJECT", subject);

      if (envPath) {
        updateEnvValue(envPath, "VAPID_PUBLIC_KEY", pubKey, { fsImpl });
        updateEnvValue(envPath, "VAPID_PRIVATE_KEY", privKey, { fsImpl });
        updateEnvValue(envPath, "VAPID_SUBJECT", subject, { fsImpl });
      }
    }
  }

  return {
    ADMIN_API_TOKEN: adminToken,
    STORAGE_ENCRYPTION_KEY: storageKey,
    WEBHOOK_SECRET: webhookSecret,
    VAPID_PUBLIC_KEY: pubKey,
    VAPID_PRIVATE_KEY: privKey,
    VAPID_SUBJECT: subject,
  };
}

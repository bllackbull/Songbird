import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectRunningServer } from "./_db-admin.js";
import { confirmAction, getCliArgs, hasFlag, hasForceYes } from "./_cli.js";
import { createStorageProvider } from "../lib/storage/index.js";
import {
  detectLegacyLayout,
  migrateLegacyStorageLayout,
} from "../lib/storageLayoutMigration.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(scriptDir, "..");
const projectRootDir = path.resolve(serverDir, "..");
dotenv.config({ path: path.join(projectRootDir, ".env"), quiet: true });
dotenv.config({
  path: path.join(serverDir, ".env"),
  override: true,
  quiet: true,
});

const HELP = `Migrate object-storage keys from the legacy layout to the unified layout.

Legacy layout (bucket root):
  avatars/<name>          → uploads/avatars/<name>
  uploads/<name>          → uploads/messages/<name>

Unified layout mirrors local disk (data/uploads/messages + data/uploads/avatars).
Public API URLs are unchanged — only S3 storage keys move. DB storage_key
columns (chat_message_files, pending_presigned_uploads) are rewritten, and
legacy objects are deleted after the copy is verified.

Usage:
  npm run storage:migrate
  npm run storage:migrate -- --dry-run
  npm run storage:migrate -- --dry-run -y

Options:
  --dry-run    List legacy objects without moving anything.
  -y, --yes    Skip the confirmation prompt.
  -h, --help   Show this help.
`;

const args = getCliArgs();
if (hasFlag(args, "-h") || hasFlag(args, "--help")) {
  console.log(HELP);
  process.exit(0);
}
const dryRun = hasFlag(args, "--dry-run");
const force = hasForceYes(args);

const { running, port } = await detectRunningServer();
if (running) {
  console.error(
    `Refusing to run storage:migrate while Songbird is running on port ${port}. Stop the server first so the bucket and database cannot race the migration.`,
  );
  process.exit(1);
}

const storageProvider = createStorageProvider(process.env);
if (storageProvider?.type !== "remote" && storageProvider?.type !== "s3") {
  console.log(
    "STORAGE_DRIVER is not remote — local disk already uses the unified layout. Nothing to migrate.",
  );
  process.exit(0);
}

// Importing db.js runs pending DB migrations first (same as db:migrate).
const { rewriteStorageKeys, adminSave } = await import("../db.js");

const detection = await detectLegacyLayout(storageProvider).catch((err) => {
  console.error(`Failed to list bucket objects: ${err?.message || err}`);
  process.exit(1);
});

const legacyCount =
  detection.legacyAvatarKeys.length + detection.legacyMessageKeys.length;
if (!detection.hasLegacy) {
  console.log(
    "Bucket already uses the unified layout (uploads/avatars/* + uploads/messages/*). Nothing to migrate.",
  );
  process.exit(0);
}

console.log(`Found ${legacyCount} legacy object(s):`);
console.log(
  `  avatars/* → uploads/avatars/* : ${detection.legacyAvatarKeys.length}`,
);
console.log(
  `  uploads/* → uploads/messages/* : ${detection.legacyMessageKeys.length}`,
);
for (const key of [
  ...detection.legacyAvatarKeys,
  ...detection.legacyMessageKeys,
].slice(0, 20)) {
  console.log(`  - ${key}`);
}
if (legacyCount > 20) {
  console.log(`  … and ${legacyCount - 20} more`);
}

if (dryRun) {
  console.log("Dry run — no objects moved, no database rows updated.");
  process.exit(0);
}

const confirmed = await confirmAction({
  prompt: `Copy ${legacyCount} object(s) to the unified layout, rewrite DB keys, and delete legacy objects?`,
  force,
  forceHint:
    "Refusing to migrate in non-interactive mode without -y/--yes. Run: npm run storage:migrate -- -y",
});
if (!confirmed) {
  console.log("Aborted.");
  process.exit(0);
}

const summary = await migrateLegacyStorageLayout({
  storageProvider,
  rewriteStorageKeys,
  adminSave,
  dryRun: false,
});

console.log("Migration complete:");
console.log(`  moved: ${summary.moved.length}`);
console.log(
  `  already at destination (copy skipped): ${summary.copySkipped.length}`,
);
console.log(`  DB rows updated: ${summary.dbUpdated}`);
console.log(`  legacy objects deleted: ${summary.deletedLegacy.length}`);
if (summary.failed.length) {
  console.log(`  copy failures: ${summary.failed.length}`);
  for (const f of summary.failed.slice(0, 10)) {
    console.log(`    - ${f.from}: ${f.error}`);
  }
}
if (summary.deleteFailed.length) {
  console.log(`  delete failures: ${summary.deleteFailed.length}`);
  for (const f of summary.deleteFailed.slice(0, 10)) {
    console.log(`    - ${f.key}: ${f.error}`);
  }
}
if (summary.dbError) {
  console.error(`DB rewrite error: ${summary.dbError}`);
  process.exit(1);
}
if (summary.failed.length || summary.deleteFailed.length) {
  process.exit(1);
}

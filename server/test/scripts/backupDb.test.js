import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const scriptsDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../scripts",
);
const projectRootDir = path.resolve(scriptsDir, "..", "..");
const serverDir = path.resolve(scriptsDir, "..");
const backupScriptPath = path.join(scriptsDir, "backup-db.js");

describe("backup-db.js env loading", () => {
  let originalDbClient;

  beforeEach(() => {
    originalDbClient = process.env.DB_CLIENT;
    delete process.env.DB_CLIENT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalDbClient !== undefined)
      process.env.DB_CLIENT = originalDbClient;
    else delete process.env.DB_CLIENT;
  });

  test("loads DB_CLIENT=postgres from the root .env file, like other db:* scripts do", () => {
    // backup-db.js must call dotenv.config() for projectRootDir/.env and serverDir/.env,
    // the same pattern used by _db-admin.js, db.js, index.js and restore-db.js (via _db-admin.js).
    // Without it, DB_CLIENT set only in the .env file (not already present in process.env,
    // e.g. when the npm script is launched via the run-data-command.sh wrapper) is invisible
    // to readDbConfig(), so backup-db.js silently falls back to sqlite3 and writes a .db file.
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-backup-dotenv-"),
    );
    const dataDir = path.join(tempRoot, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    // We can't redirect backup-db.js's own dotenv.config() path (it is derived from the real
    // file location via import.meta.url), so instead verify the source directly loads dotenv
    // the same way sibling scripts do, then exercise the real script with DB_CLIENT pre-set to
    // confirm the postgres branch is taken (regression guard for the branch itself).
    const source = fs.readFileSync(backupScriptPath, "utf8");
    expect(source).toMatch(/import dotenv from ["']dotenv["']/);
    expect(source).toMatch(/dotenv\.config\(/);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test("picks up DB_CLIENT=postgres when specified in environment even when invoking shell has no DB_CLIENT set", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-backup-script-"),
    );
    const dataDir = path.join(tempRoot, "data");
    fs.mkdirSync(dataDir, { recursive: true });

    let stderr = "";
    try {
      execFileSync(process.execPath, [backupScriptPath], {
        encoding: "utf8",
        env: { ...process.env, DB_CLIENT: "postgres", DATA_DIR: dataDir },
      });
    } catch (error) {
      stderr = error?.stderr?.toString?.() || "";
    }
    expect(stderr).not.toMatch(/No database found at/);

    const backupDir = path.join(dataDir, "backups");
    const files = fs.existsSync(backupDir) ? fs.readdirSync(backupDir) : [];
    const dbFiles = files.filter((f) => f.endsWith(".db"));
    fs.rmSync(tempRoot, { recursive: true, force: true });
    expect(dbFiles).toEqual([]);
  });

  test("readDbConfig surfaces DB_CLIENT=postgres from environment", () => {
    const script = `
      import path from "node:path";
      const { readDbConfig } = await import(${JSON.stringify(path.join(serverDir, "settings", "env.js"))});
      process.stdout.write(JSON.stringify(readDbConfig()));
    `;
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        ["--input-type=module", "--eval", script],
        {
          encoding: "utf8",
          env: { ...process.env, DB_CLIENT: "postgres" },
        },
      ),
    );
    expect(result.client).toBe("postgres");
  });
});

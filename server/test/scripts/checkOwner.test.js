import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const serverDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);

describe("check-owner CLI", () => {
  test("exits 1 when no owner exists and exits 0 when owner exists", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-check-owner-"),
    );
    const dataDir = path.join(tempDir, "data");

    try {
      // 1. Should exit with status 1 on fresh DB (no owner)
      let initialStatus = 0;
      try {
        execFileSync(process.execPath, ["scripts/check-owner.js"], {
          cwd: serverDir,
          encoding: "utf8",
          env: {
            ...process.env,
            DATA_DIR: dataDir,
            DB_CLIENT: "sqlite3",
            SERVER_PORT: "0",
          },
        });
      } catch (err) {
        initialStatus = err.status;
      }
      expect(initialStatus).toBe(1);

      // 2. Create an owner user
      execFileSync(
        process.execPath,
        [
          "scripts/create-user.js",
          "--nickname",
          "Owner Test",
          "--username",
          "owner_test",
          "--password",
          "test-password",
          "--role",
          "owner",
        ],
        {
          cwd: serverDir,
          encoding: "utf8",
          env: {
            ...process.env,
            DATA_DIR: dataDir,
            DB_CLIENT: "sqlite3",
            SERVER_PORT: "0",
          },
        },
      );

      // 3. Should exit with status 0 when owner exists
      let statusWithOwner = -1;
      try {
        execFileSync(process.execPath, ["scripts/check-owner.js"], {
          cwd: serverDir,
          encoding: "utf8",
          env: {
            ...process.env,
            DATA_DIR: dataDir,
            DB_CLIENT: "sqlite3",
            SERVER_PORT: "0",
          },
        });
        statusWithOwner = 0;
      } catch (err) {
        statusWithOwner = err.status;
      }
      expect(statusWithOwner).toBe(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

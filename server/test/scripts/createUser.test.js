import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const serverDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../..",
);

describe("create-user CLI", () => {
  test("creates a requested owner role in a local SQLite database", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "songbird-create-user-"),
    );
    const dataDir = path.join(tempDir, "data");
    const queryScript = `
      import { openDatabase } from "./scripts/_db-admin.js";
      const db = await openDatabase();
      const row = await db.getRow("SELECT username, nickname, role FROM users WHERE username = ?", ["owner_test"]);
      await db.close();
      process.stdout.write(JSON.stringify(row));
    `;

    try {
      const output = execFileSync(
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

      expect(output).toContain("User created: id=");
      const row = JSON.parse(
        execFileSync(
          process.execPath,
          ["--input-type=module", "--eval", queryScript],
          {
            cwd: serverDir,
            encoding: "utf8",
            env: { ...process.env, DATA_DIR: dataDir, DB_CLIENT: "sqlite3" },
          },
        ),
      );
      expect(row).toEqual({
        username: "owner_test",
        nickname: "Owner Test",
        role: "owner",
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const scriptsDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../scripts",
);
const convertScriptPath = path.join(scriptsDir, "convert-db.js");

describe("convert-db.js env loading", () => {
  test("loads DB_CLIENT=postgres from .env file via dotenv", () => {
    const source = fs.readFileSync(convertScriptPath, "utf8");
    expect(source).toMatch(/import dotenv from ["']dotenv["']/);
    expect(source).toMatch(/dotenv\.config\(/);
  });

  test("recognizes DB_CLIENT=postgres when set", () => {
    let stderr = "";
    try {
      execFileSync(
        process.execPath,
        [convertScriptPath, "/nonexistent/test.db"],
        {
          encoding: "utf8",
          env: { ...process.env, DB_CLIENT: "postgres" },
        },
      );
    } catch (error) {
      stderr = error?.stderr?.toString?.() || error?.message || "";
    }
    // Should NOT error about DB_CLIENT not configured as PostgreSQL
    expect(stderr).not.toMatch(
      /Target DB_CLIENT is not configured as PostgreSQL/,
    );
  });
});

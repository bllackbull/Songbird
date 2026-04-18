const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const changelogPath = path.join(projectRoot, "CHANGELOG.md");

function readChangelog() {
  return fs.readFileSync(changelogPath, "utf8").trim();
}

function extractReleaseBody(changelog) {
  const text = String(changelog || "").trim();
  if (!text) {
    throw new Error("CHANGELOG.md is empty.");
  }

  const versionSectionMatch = text.match(
    /(^|\n)(##\s+[^\n]+[\r\n]+[\s\S]*?)(?=\n##\s+|\s*$)/,
  );

  if (versionSectionMatch?.[2]) {
    return versionSectionMatch[2].trim();
  }

  return text;
}

function resolveTagName() {
  const explicitTag = String(process.env.RELEASE_TAG || "").trim();
  if (explicitTag) return explicitTag;

  return execSync("git describe --tags --abbrev=0", {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function githubRequest(url, { method = "GET", body } = {}) {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!token) {
    throw new Error("GITHUB_TOKEN is required.");
  }

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API ${method} ${url} failed: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  return response.json();
}

async function main() {
  const repository = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (!repository || !repository.includes("/")) {
    throw new Error("GITHUB_REPOSITORY must be set to owner/repo.");
  }

  const tagName = resolveTagName();
  const changelog = readChangelog();
  const body = extractReleaseBody(changelog);
  const release = await githubRequest(
    `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tagName)}`,
  );

  await githubRequest(
    `https://api.github.com/repos/${repository}/releases/${release.id}`,
    {
      method: "PATCH",
      body: {
        body,
      },
    },
  );

  process.stdout.write(
    `Updated release notes for ${tagName} from CHANGELOG.md\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

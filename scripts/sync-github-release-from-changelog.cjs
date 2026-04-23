const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const changelogPath = path.join(projectRoot, "CHANGELOG.md");
const versionPath = path.join(projectRoot, "VERSION");

function readChangelog() {
  return fs.readFileSync(changelogPath, "utf8").trim();
}

function readVersion() {
  const version = fs.readFileSync(versionPath, "utf8").trim();
  if (!version) {
    throw new Error("VERSION is empty.");
  }
  return version;
}

function normalizeVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "");
}

function parseChangelogSections(changelog) {
  const text = String(changelog || "").trim();
  if (!text) {
    return [];
  }

  const sections = [];
  const lines = text.split(/\r?\n/);
  let currentSection = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentSection) {
        sections.push({
          heading: currentSection.heading,
          body: currentSection.lines.join("\n").replace(/\s+$/, ""),
        });
      }
      currentSection = {
        heading: String(headingMatch[1] || "").trim(),
        lines: [],
      };
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  if (currentSection) {
    sections.push({
      heading: currentSection.heading,
      body: currentSection.lines.join("\n").replace(/\s+$/, ""),
    });
  }

  return sections;
}

function extractReleaseBody(changelog, version) {
  const text = String(changelog || "").trim();
  if (!text) {
    throw new Error("CHANGELOG.md is empty.");
  }

  const normalizedVersion = normalizeVersion(version);
  if (normalizedVersion) {
    const sections = parseChangelogSections(text);
    const matchingSection = sections.find(
      ({ heading }) => normalizeVersion(heading) === normalizedVersion,
    );
    if (matchingSection) {
      return `## ${matchingSection.heading}\n${matchingSection.body}`.trimEnd();
    }
  }

  return text;
}

function resolveTagCandidates(version) {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) {
    throw new Error("VERSION is invalid.");
  }

  const candidates = [
    String(process.env.RELEASE_TAG || "").trim(),
    normalizedVersion,
    `v${normalizedVersion}`,
  ].filter(Boolean);

  return [...new Set(candidates)];
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

  const version = readVersion();
  const tagCandidates = resolveTagCandidates(version);
  const changelog = readChangelog();
  const body = extractReleaseBody(changelog, version);
  let release = null;
  let tagName = "";

  for (const candidate of tagCandidates) {
    try {
      release = await githubRequest(
        `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(candidate)}`,
      );
      tagName = candidate;
      break;
    } catch (error) {
      if (!String(error?.message || "").includes("404")) {
        throw error;
      }
    }
  }

  if (!release) {
    throw new Error(
      `Unable to find a GitHub release for VERSION ${version}. Tried tags: ${tagCandidates.join(", ")}`,
    );
  }

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
    `Updated release notes for ${tagName} using VERSION ${version} and CHANGELOG.md\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

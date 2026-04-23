function normalizeVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "");
}

function parseVersion(value) {
  const normalized = normalizeVersion(value);
  const match = normalized.match(
    /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/,
  );
  if (!match) return null;
  return {
    normalized,
    major: Number(match[1] || 0),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
    prerelease: String(match[4] || ""),
  };
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (a.prerelease === b.prerelease) return 0;
  return a.prerelease.localeCompare(b.prerelease);
}

function parseGitHubRepository(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;

  const sshMatch = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
      url: `https://github.com/${sshMatch[1]}/${sshMatch[2]}`,
    };
  }

  try {
    const parsed = new URL(raw);
    if (!/github\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = String(parts[1] || "").replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return {
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}`,
    };
  } catch {
    return null;
  }
}

function readJsonFile(fs, filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readTextFile(fs, filePath, fallback = "") {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return fallback;
  }
}

function parseChangelogSections(changelog) {
  const text = String(changelog || "").trim();
  if (!text) return [];

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

function findChangelogVersionSection(changelog, version) {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) return null;

  const sections = parseChangelogSections(changelog);
  return (
    sections.find(({ heading }) => normalizeVersion(heading) === normalizedVersion) ||
    null
  );
}

function readAppMeta({ fs, path, projectRootDir }) {
  const versionPath = path.join(projectRootDir, "VERSION");
  const changelogPath = path.join(projectRootDir, "CHANGELOG.md");
  const packageJsonPath = path.join(projectRootDir, "package.json");
  const packageJson = readJsonFile(fs, packageJsonPath);
  const repository = parseGitHubRepository(
    packageJson?.repository?.url || packageJson?.homepage || "",
  );
  const version = readTextFile(fs, versionPath).trim();
  const changelog = readTextFile(fs, changelogPath, "").trim();
  const changelogSections = parseChangelogSections(changelog);
  const currentVersionSection = findChangelogVersionSection(changelog, version);

  return {
    version,
    normalizedVersion: normalizeVersion(version),
    changelog,
    changelogSections,
    currentChangelog:
      currentVersionSection?.body || (changelogSections.length ? "" : changelog),
    repository,
  };
}

export {
  compareVersions,
  findChangelogVersionSection,
  normalizeVersion,
  parseChangelogSections,
  parseGitHubRepository,
  readAppMeta,
};

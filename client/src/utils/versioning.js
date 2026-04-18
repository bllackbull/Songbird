export function normalizeVersion(value) {
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

export function compareVersions(left, right) {
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

export async function fetchLatestGitHubTag({ owner, repo }) {
  if (!owner || !repo) {
    throw new Error("GitHub repository information is not configured.");
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github+json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub responded with ${response.status}.`);
  }

  const tags = await response.json();
  const tagList = Array.isArray(tags) ? tags : [];
  const semverTags = tagList
    .map((tag) => {
      const rawTag = String(tag?.name || "").trim();
      const normalizedTag = normalizeVersion(rawTag);
      return rawTag && parseVersion(normalizedTag)
        ? { rawTag, normalizedTag }
        : null;
    })
    .filter(Boolean);

  if (!semverTags.length) {
    throw new Error("No version tags were found on GitHub.");
  }

  return semverTags.sort((left, right) =>
    compareVersions(right.normalizedTag, left.normalizedTag),
  )[0];
}

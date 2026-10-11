import { describe, test, expect } from "vitest";
import {
  normalizeVersion,
  compareVersions,
  parseChangelogSections,
  findChangelogVersionSection,
  parseGitHubRepository,
} from "../../lib/appMeta.js";

describe("normalizeVersion", () => {
  test("strips a leading lowercase v", () => {
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
  });

  test("strips a leading uppercase V", () => {
    expect(normalizeVersion("V1.2.3")).toBe("1.2.3");
  });

  test("returns version unchanged when no v prefix", () => {
    expect(normalizeVersion("1.2.3")).toBe("1.2.3");
  });

  test("trims whitespace", () => {
    expect(normalizeVersion("  v1.0.0  ")).toBe("1.0.0");
  });

  test("returns empty string for null", () => {
    expect(normalizeVersion(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(normalizeVersion(undefined)).toBe("");
  });
});

describe("compareVersions", () => {
  test("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  test("returns 1 when left has a higher major", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  test("returns -1 when left has a lower major", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
  });

  test("compares minor versions", () => {
    expect(compareVersions("1.3.0", "1.2.9")).toBe(1);
    expect(compareVersions("1.2.0", "1.3.0")).toBe(-1);
  });

  test("compares patch versions", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
  });

  test("stable release beats prerelease of same base version", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0")).toBe(-1);
  });

  test("compares prereleases lexicographically", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBe(1);
  });

  test("handles v-prefix inputs", () => {
    expect(compareVersions("v2.0.0", "v1.0.0")).toBe(1);
  });

  test("returns 0 when both versions are invalid", () => {
    expect(compareVersions("invalid", "garbage")).toBe(0);
  });

  test("returns -1 when only left is invalid", () => {
    expect(compareVersions("invalid", "1.0.0")).toBe(-1);
  });

  test("returns 1 when only right is invalid", () => {
    expect(compareVersions("1.0.0", "invalid")).toBe(1);
  });
});

describe("parseChangelogSections", () => {
  const changelog = `## 1.2.0\n\nAdded cool feature.\n\n## 1.1.0\n\nFixed a bug.`;

  test("returns an array of sections", () => {
    const sections = parseChangelogSections(changelog);
    expect(sections).toHaveLength(2);
  });

  test("parses section headings correctly", () => {
    const sections = parseChangelogSections(changelog);
    expect(sections[0].heading).toBe("1.2.0");
    expect(sections[1].heading).toBe("1.1.0");
  });

  test("parses section bodies correctly", () => {
    const sections = parseChangelogSections(changelog);
    expect(sections[0].body).toContain("Added cool feature");
    expect(sections[1].body).toContain("Fixed a bug");
  });

  test("returns empty array for empty string", () => {
    expect(parseChangelogSections("")).toEqual([]);
  });

  test("returns empty array for null", () => {
    expect(parseChangelogSections(null)).toEqual([]);
  });

  test("ignores content before the first ## heading", () => {
    const withPreamble = `# Changelog\n\nSome intro.\n\n## 1.0.0\n\nInitial.`;
    const sections = parseChangelogSections(withPreamble);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("1.0.0");
  });
});

describe("findChangelogVersionSection", () => {
  const changelog = `## v1.2.0\n\nAdded cool feature.\n\n## 1.1.0\n\nFixed a bug.`;

  test("finds a section by exact version", () => {
    const section = findChangelogVersionSection(changelog, "1.1.0");
    expect(section).not.toBeNull();
    expect(section.body).toContain("Fixed a bug");
  });

  test("finds a section with v-prefix in heading when querying without prefix", () => {
    const section = findChangelogVersionSection(changelog, "1.2.0");
    expect(section).not.toBeNull();
    expect(section.body).toContain("Added cool feature");
  });

  test("finds a section when querying with v-prefix but heading lacks it", () => {
    const section = findChangelogVersionSection(changelog, "v1.1.0");
    expect(section).not.toBeNull();
  });

  test("returns null for a version not in the changelog", () => {
    expect(findChangelogVersionSection(changelog, "9.9.9")).toBeNull();
  });

  test("returns null for empty version", () => {
    expect(findChangelogVersionSection(changelog, "")).toBeNull();
  });
});

describe("parseGitHubRepository", () => {
  test("parses an HTTPS GitHub URL", () => {
    const result = parseGitHubRepository("https://github.com/owner/repo");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      url: "https://github.com/owner/repo",
    });
  });

  test("parses an HTTPS GitHub URL with .git suffix", () => {
    const result = parseGitHubRepository("https://github.com/owner/repo.git");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      url: "https://github.com/owner/repo",
    });
  });

  test("parses an SSH GitHub URL", () => {
    const result = parseGitHubRepository("git@github.com:owner/repo.git");
    expect(result).toEqual({
      owner: "owner",
      repo: "repo",
      url: "https://github.com/owner/repo",
    });
  });

  test("returns null for a non-GitHub URL", () => {
    expect(parseGitHubRepository("https://gitlab.com/owner/repo")).toBeNull();
  });

  test("returns null for an empty string", () => {
    expect(parseGitHubRepository("")).toBeNull();
  });

  test("returns null for null", () => {
    expect(parseGitHubRepository(null)).toBeNull();
  });

  test("returns null for a URL with no repo path", () => {
    expect(parseGitHubRepository("https://github.com/owner")).toBeNull();
  });
});

import conventionalCommits from "conventional-changelog-conventionalcommits";

/**
 * semantic-release configuration.
 *
 * Releases are intentionally NOT triggered by conventional commit types.
 * A version bump only happens when a commit header contains one of:
 *   [patch release] | [minor release] | [major release]
 * (works the same way as the built-in [skip ci]).
 *
 * Release notes are customized to:
 *   - order sections: Features, Performance Improvements, Bug Fixes
 *   - render each commit entry as a clickable link to the commit
 *     (without a trailing short-hash), placing any trailing PR/issue reference
 *     outside the commit link to avoid broken nested markdown links.
 */

const presetConfig = {
  types: [
    { type: "feat", section: "Features" },
    { type: "fix", section: "Bug Fixes" },
    { type: "perf", section: "Improvements" },
    { type: "refactor", section: "Improvements" },
    { type: "style", section: "Improvements" },
    { type: "build", section: "Build" },
    { type: "docs", section: "Documentation" },
    { type: "chore", hidden: true },
    { type: "ci", hidden: true },
    { type: "test", hidden: true },
  ],
};

const preset = await conventionalCommits(presetConfig);
const baseTransform = preset.writer.transform;

const transform = (commit, context) => {
  const transformed = baseTransform(commit, context);
  if (!transformed) return false;

  if (transformed.subject) {
    // Extract trailing PR/issue reference if present, e.g. ([#92](...)) or (#92)
    const prMatch = transformed.subject.match(/\s*\((#\d+|\[#\d+\]\([^)]+\))\)$/);
    if (prMatch) {
      transformed.pr = prMatch[1];
      transformed.subject = transformed.subject.slice(0, prMatch.index);
    }
    // Flatten any remaining markdown links inside the subject so they cannot break the outer link
    transformed.subject = transformed.subject.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  }
  if (transformed.header) {
    transformed.header = transformed.header.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  }

  return transformed;
};

// Desired ordering of release-note sections. Anything not listed is sorted
// afterwards alphabetically.
const SECTION_ORDER = {
  Features: 1,
  Improvements: 2,
  "Bug Fixes": 3,
  Build: 4,
  Documentation: 5,
};

const commitGroupsSort = (a, b) => {
  const rankA = SECTION_ORDER[a.title] ?? Number.MAX_SAFE_INTEGER;
  const rankB = SECTION_ORDER[b.title] ?? Number.MAX_SAFE_INTEGER;
  return rankA - rankB || String(a.title).localeCompare(String(b.title));
};

// Each entry renders the subject as a link to the commit, followed by the PR link
// if present. The trailing short-hash link from the default template is omitted.
const commitPartial = `* [{{#if scope}}**{{scope}}:** {{/if}}{{#if subject}}{{subject}}{{else}}{{header}}{{/if}}]({{#if @root.repository}}{{#if @root.host}}{{@root.host}}/{{/if}}{{#if @root.owner}}{{@root.owner}}/{{/if}}{{@root.repository}}{{else}}{{@root.repoUrl}}{{/if}}/{{@root.commit}}/{{hash}}){{#if pr}} ({{pr}}){{/if}}{{#if references}}, closes{{#each references}} {{#if @root.linkReferences}}[{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}#{{this.issue}}]({{#if @root.repository}}{{#if @root.host}}{{@root.host}}/{{/if}}{{#if this.repository}}{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}{{else}}{{#if @root.owner}}{{@root.owner}}/{{/if}}{{@root.repository}}{{/if}}{{else}}{{@root.repoUrl}}{{/if}}/{{@root.issue}}/{{this.issue}}){{else}}{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}#{{this.issue}}{{/if}}{{/each}}{{/if}}
`;

export default {
  branches: ["main"],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        // Rule order matters: the `false` suppression rules come first so the
        // explicit [x release] header rules can override them on the commit
        // that carries the tag.
        releaseRules: [
          { breaking: true, release: false },
          { revert: true, release: false },
          { type: "feat", release: false },
          { type: "fix", release: false },
          { type: "perf", release: false },
          { type: "hotfix", release: false },
          { type: "refactor", release: false },
          { type: "docs", release: false },
          { type: "style", release: false },
          { type: "test", release: false },
          { type: "chore", release: false },
          { type: "build", release: false },
          { type: "ci", release: false },
          { header: "{*,**/**}\\[patch release\\]*", release: "patch" },
          { header: "{*,**/**}\\[minor release\\]*", release: "minor" },
          { header: "{*,**/**}\\[major release\\]*", release: "major" },
        ],
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig,
        writerOpts: {
          commitGroupsSort,
          commitPartial,
          transform,
        },
      },
    ],
    [
      "@semantic-release/github",
      {
        assets: [{ path: "dist/*.zip", label: "Distribution" }],
        failOnIssueNotFound: false,
      },
    ],
  ],
};

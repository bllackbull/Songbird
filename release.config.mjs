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
 *   - render each entry as a single clickable link to the commit
 *     (no trailing short-hash in parentheses).
 */

// Desired ordering of release-note sections. Anything not listed is sorted
// afterwards alphabetically.
const SECTION_ORDER = {
  Features: 1,
  "Performance Improvements": 2,
  "Bug Fixes": 3,
};

const commitGroupsSort = (a, b) => {
  const rankA = SECTION_ORDER[a.title] ?? Number.MAX_SAFE_INTEGER;
  const rankB = SECTION_ORDER[b.title] ?? Number.MAX_SAFE_INTEGER;
  return rankA - rankB || String(a.title).localeCompare(String(b.title));
};

// Each entry is a single markdown link wrapping the whole line and pointing to
// the commit. The trailing short-hash link from the default template is removed.
const commitPartial = `* [{{#if scope}}**{{scope}}:** {{/if}}{{#if subject}}{{subject}}{{else}}{{header}}{{/if}}]({{#if @root.repository}}{{#if @root.host}}{{@root.host}}/{{/if}}{{#if @root.owner}}{{@root.owner}}/{{/if}}{{@root.repository}}{{else}}{{@root.repoUrl}}{{/if}}/{{@root.commit}}/{{hash}}){{#if references}}, closes{{#each references}} {{#if @root.linkReferences}}[{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}#{{this.issue}}]({{#if @root.repository}}{{#if @root.host}}{{@root.host}}/{{/if}}{{#if this.repository}}{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}{{else}}{{#if @root.owner}}{{@root.owner}}/{{/if}}{{@root.repository}}{{/if}}{{else}}{{@root.repoUrl}}{{/if}}/{{@root.issue}}/{{this.issue}}){{else}}{{#if this.owner}}{{this.owner}}/{{/if}}{{this.repository}}#{{this.issue}}{{/if}}{{/each}}{{/if}}
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
        writerOpts: {
          commitGroupsSort,
          commitPartial,
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

# Repository Guidelines: Songbird

Songbird is a self-hosted real-time communication platform built as a Node.js/React monorepo.

## Workspace Architecture

- **`client/`**: React 19 SPA (Vite, Tailwind CSS 4, Vitest + Playwright).
- **`server/`**: Node.js Express 5 backend (SSE realtime updates, in-memory SQLite via `sql.js`, Vitest + Supertest).
- **`docs/`**: Dual-language VitePress documentation (English & Persian/Farsi).

## Essential Commands

```bash
# Development & Build
npm run dev                  # Concurrent client + server dev servers
npm --prefix client run dev  # Frontend dev server (Vite)
npm --prefix server run dev  # Backend dev server (Node --watch)
npm run build                # Build client frontend

# Testing
npm test                     # Run client and server tests concurrently
npm --prefix client run test # Client Vitest (unit + browser)
npm --prefix client run test:unit    # Fast Node-only unit tests
npm --prefix client run test:browser # Playwright browser component tests (Chromium + Firefox)
npm --prefix server run test # Server Vitest (unit + Supertest API integration)

# Docs
npm run docs:dev             # VitePress dev server
npm run docs:build           # Build documentation site
```

## Critical Architecture Quirks & Pitfalls

- **Design & Styling (`DESIGN.md`)**: Respect and follow [`DESIGN.md`](./DESIGN.md) for all frontend styling, UI component design, typography, color system, accessibility, and UI patterns.
- **Node Requirement**: Requires Node `>=24.18.0` and npm `>=11.18.0`.
- **Database (`server/db.js`)**: `sql.js` runs in-memory with debounced disk persistence (`DB_SAVE_DEBOUNCE_MS`). All SQL queries **must** reside inside `server/db.js`. Never write inline SQL queries elsewhere.
- **Server Test Isolation**: `server/db.js` and `server/index.js` initialize WASM and disk state on module load and **cannot** be imported in tests. Server API integration tests must use `makeApp` from `server/test/helpers/makeApp.js` to inject stubbed dependencies.
- **Realtime SSE**: Real-time events are dispatched via `server/lib/sse.js` (`emitChatEvent`). API mutations must invoke SSE broadcast handlers to notify connected clients.
- **Client Routing & API**: No React Router library. SPA navigation is managed manually in `client/src/App.jsx` via `window.history`. All client HTTP calls **must** use `apiFetch` in `client/src/api/chatApi.js` (`credentials: "include"`).
- **Documentation Updates**: Any update to documentation under `docs/` must update both English (`docs/*.md`) and Persian (`docs/fa/*.md`) documents, matching the structure in `docs/.vitepress/config.mjs`.

## Development & Git Workflow

- **Git Execution**: **NEVER** run `git` commands automatically. Suggest a commit message in the format `type(scope): description` and let the user execute git operations.
- **Bug Fixing Workflow**: Do not guess or fix immediately upon a bug report. First write a test reproducing the issue under test scenarios, verify it catches the bug, then apply the fix.
- **Response Style**: Keep task completions concise. Do not generate unrequested markdown summary files.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output. Always prefer graphify query commands over raw text grepping on graphify-out/.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Superpowers

When using superpowers skills, create the plans or specs docs under `.superpowers/docs`.

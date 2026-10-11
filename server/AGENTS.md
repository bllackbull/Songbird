# Agent Guidance: Songbird Server

Node.js Express 5 backend (SSE realtime updates, in-memory SQLite via `sql.js`, Vitest + Supertest).

## Developer Commands

```bash
npm --prefix server run dev        # Backend dev server with Node --watch
npm --prefix server run test       # Run unit and API integration tests
npm --prefix server run db:migrate # Execute database migrations
npm --prefix server run db:*       # Maintenance & inspection scripts (e.g., db:backup, db:inspect)
```

## Architecture & Code Guidelines

- **Database (`server/db.js`)**: All SQL queries **must** live inside `server/db.js`. Do not write inline SQL in route handlers or library functions. `sql.js` runs in-memory with debounced disk persistence (`DB_SAVE_DEBOUNCE_MS`).
- **Thin API Routes**: Express route handlers (`server/api/`) only handle request parsing, auth verification, and response formatting. Business logic belongs in `server/lib/`.
- **Dependency Injection**: Route handlers receive dependencies via `apiDeps` passed into `registerApiRoutes(app, deps)`.
- **Realtime Updates**: Broadcast real-time updates through `server/lib/sse.js` (`emitChatEvent`).
- **Migrations**: Idempotent SQL/JS migrations live in `server/migrations/` and run on server startup.

## Server Testing Rules

- **WASM Initialization Constraint**: `server/db.js` and `server/index.js` initialize WASM and disk state at module load time and **cannot** be imported in tests.
- **API Integration Tests**: Must use `makeApp` from `server/test/helpers/makeApp.js` to create an Express instance with stubbed dependencies.
- **Unit Tests**: Place in `server/test/lib/` or `server/test/settings/` for pure helper functions.

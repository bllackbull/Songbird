# Agent Guidance: Songbird

Songbird is a comprehensive real-time communication platform built with a modern monorepo architecture. It supports features ranging from private messaging and group chats to advanced functionalities like message previews, read receipts, push notifications, and complex user management systems (e.g., banning, role assignment).

## Architecture
- **Monorepo Structure**: 
  - `client/`: React 19 frontend (JSX, Vite, Tailwind 4, Vitest + Playwright)
  - `server/`: Node.js backend (Express 5 + SSE, SQLite via `sql.js`, Vitest + Supertest)
  - `docs/`: VitePress documentation

## Developer Commands

### Full Stack & Management
- **Full Stack Dev**: `npm run dev` (runs client and server concurrently)
- **All Tests**: `npm test` (runs client and server tests concurrently)
- **Build Client**: `npm run build` (runs `vite build` in client folder)
- **Remote Channels**: `npm run remote:configure` or `npm --prefix server run remote:configure`

### Client (`client/`)
- **Dev Server**: `npm --prefix client run dev` (or `npm run dev` from `client/`)
- **Lint**: `npm --prefix client run lint`
- **All Tests**: `npm --prefix client run test` (Vitest unit + Playwright browser tests)
- **Unit Tests Only**: `npm --prefix client run test:unit` (fast, headless Node env)
- **Browser Tests Only**: `npm --prefix client run test:browser` (Chromium + Firefox via Playwright)
- **Build**: `npm --prefix client run build`

### Server (`server/`)
- **Dev Server**: `npm --prefix server run dev` (or `npm run dev` from `server/`)
- **Run Tests**: `npm --prefix server run test` (Vitest unit + integration tests via Supertest)
- **DB Tools**: Maintenance scripts under `npm --prefix server run db:*` (`db:migrate`, `db:reset`, `db:inspect`, etc.)

## Frontend Guidance (Client)
- **Routing**: No router library. Routing is controlled in `App.jsx` using `window.history` and manual route matching (`getRoute`).
- **State Management**: User state passed down from `App.jsx`. Feature-specific cache stored in `IndexedDB` via `utils/chatCache.js`.
- **API Requests**: Always use `apiFetch` in `src/api/chatApi.js` (`credentials: "include"`).
- **Styling**: Tailwind 4 with CSS variables and custom utilities in `src/index.css`. Support dark mode via `.dark` class.

## Backend Guidance (Server)
- **App Bootstrap**: `index.js` initializes dependencies (`apiDeps`) and registers routes via `api/index.js`.
- **Database**: `db.js` wraps `sql.js`. Operations are in-memory with debounced file flushes (`DB_SAVE_DEBOUNCE_MS`).
- **Migrations**: Idempotent migrations in `server/migrations/`.
- **Realtime**: `lib/sse.js` handles SSE subscriber connections and event broadcasting (`emitChatEvent`).
- **Auth**: Cookie-based session authentication (`sid` cookie via `lib/sessions.js`).

## Key / Exemplar Files

### Frontend (`client/`)
- `client/src/App.jsx`: Top-level SPA shell, manual history route dispatch, PWA & mobile safe-area handling
- `client/src/api/chatApi.js`: API client boundary (`apiFetch` with `credentials: "include"`)
- `client/src/utils/chatCache.js`: Browser storage (`IndexedDB`) caching layer with TTL
- `client/src/index.css`: Tailwind 4 theme, `@custom-variant dark`, safe-area utilities

### Backend (`server/`)
- `server/index.js`: Server bootstrap, Express 5 app setup, dependency injection (`apiDeps`)
- `server/db.js`: Memory-first SQLite (`sql.js`) with debounced disk persistence
- `server/lib/sse.js`: Real-time SSE event hub and connection tracking
- `server/api/index.js`: API route registration

## Conventions & Pitfalls
- **Node Requirement**: Node `>=24.18.0`.
- **Database Persistence**: `sql.js` operates in-memory; disk writes are debounced (`DB_SAVE_DEBOUNCE_MS`). Do not bypass `db.js` helpers for DB operations.
- **SSE Events**: `/api/events` provides real-time updates and bypasses normal compression/rate limiting.
- **Client Caching**: `localStorage` and `IndexedDB` act as best-effort caches; avoid assuming local cache is authoritative.
- **Runtime Config**: App settings loaded from the database can override environment defaults dynamically.

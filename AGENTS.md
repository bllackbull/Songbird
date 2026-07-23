# Agent Guidance: Songbird

Songbird is a comprehensive real-time communication platform built with a modern monorepo architecture. It supports features ranging from private messaging and group chats to advanced functionalities like message previews, read receipts, push notifications, and complex user management systems (e.g., banning, role assignment).

## Architecture
- **Monorepo Structure**: 
  - `client/`: React 19 frontend (JSX, Vite, Tailwind 4)
  - `server/`: Node.js backend (Express 5 + SSE)
  - `docs/`: VitePress documentation

## Developer Commands
- **Full Stack Dev**: `npm run dev` (runs client and server concurrently)
- **Client Only**: `npm --prefix client run dev`
- **Server Only**: `npm --prefix server run dev`
- **Build Client**: `npm run build` (runs `vite build` in client folder)

## Verification & Tooling
- **Client Lint**: `npm --prefix client run lint`
- **Server Tests**: `npm --prefix server run test` (Vitest, includes unit + API integration tests via supertest)
- **Client Tests**: `npm --prefix client run test` (Vitest, includes unit tests and Playwright browser/component tests)
- **All Tests**: `npm test` (runs both in parallel)
- **Client Unit Only**: `npm --prefix client run test:unit` (fast, no browser)
- **Client Browser Only**: `npm --prefix client run test:browser` (Chromium + Firefox via Playwright)
- **Server DB Tools**: The server includes a wide array of database maintenance scripts under `npm --prefix server run db:*` (e.g., `db:migrate`, `db:reset`, `db:inspect`).
- **Remote Channels**: `npm run remote:configure` or `npm --prefix server run remote:configure` to set up mirrored channels.

## Key Constraints
- **Node Version**: Requires Node `>=24.0.0` (Volta configured for `24.18.0`).
- **Server Watch**: The server dev mode watches both the server directory and the root `.env` file.
- **Database**: SQLite (`sql.js`) managed via structured migrations (`server/migrations/`) ensuring predictable schema evolution.

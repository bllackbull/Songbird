# Agent Guidance: Songbird Client

React 19 SPA (JSX, Vite, Tailwind CSS 4, Vitest + Playwright).

## Developer Commands

```bash
npm --prefix client run dev           # Vite dev server
npm --prefix client run lint          # ESLint
npm --prefix client run lint:fix      # ESLint autofix
npm --prefix client run test          # Run all client tests (unit + browser)
npm --prefix client run test:unit     # Unit tests only (Node env)
npm --prefix client run test:browser  # Browser component tests (Playwright: Chromium + Firefox)
npm --prefix client run build         # Production build
```

## Architecture & Code Guidelines

- **No Router Library**: SPA routing is manually dispatched in `client/src/App.jsx` using `window.history` and `getRoute`.
- **API Boundary**: All HTTP requests **must** use `apiFetch` in `client/src/api/chatApi.js` (`credentials: "include"`). Do not call `fetch` directly in components.
- **State Management**: Context API for global state (`AuthContext`, `ChatContext`, `ThemeContext`, `SettingsContext`). Feature caches use IndexedDB (`client/src/utils/chatCache.js`).
- **Styling**: Tailwind CSS 4 with custom utilities in `src/index.css`. Dark mode targets `.dark`.
- **Components**: Functional components with hooks only. Named exports for utilities, default exports for React components.

## Testing Rules

- **Browser Tests (`client/test/components/`)**: Use `vitest-browser-react` and `@vitest/browser-playwright`.
  - Import `render` from `vitest-browser-react` (not `@testing-library/react`).
  - Import `page` and `userEvent` from `vitest/browser`.
  - Assertions on DOM elements must use `await expect.element(...)`.
  - Locators must use `page.getBy*()`.
  - Use data URI images for image testing to prevent 404 image load errors.
- **WebKit Exception**: WebKit is excluded from Playwright config due to Linux compatibility issues.

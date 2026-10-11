# Design Language & Style Guide: Songbird

This document defines the design language, UI patterns, color system, typography, and component conventions for **Songbird**. Any AI model or human contributor working on the frontend **must** strictly adhere to these rules to maintain visual consistency, accessibility, and architectural integrity.

---

## 1. Core Principles

1. **Clean & Purposeful**: Modern, un-cluttered chat user interface focused on readability, speed, and real-time communication.
2. **Lightweight & Fast**: Zero unnecessary heavy UI component libraries. Built with native Tailwind CSS 4 utilities and clean React 19 functional components.
3. **Seamless Dual-Language (Bilingual & RTL)**: Native support for English and Persian/Farsi with dynamic script detection and font switching (`DM Sans` for Latin, `Vazirmatn` for Persian).
4. **Adaptive Dark Mode**: Full dark mode support using Tailwind's `.dark` class targeting slate and dark neutral tones.
5. **Mobile-First & Touch Ready**: Responsive across viewports with notch safe-area handling, iOS input zoom mitigation, and PWA integration.

---

## 2. Tech Stack & UI Framework

- **Framework**: React 19 SPA (JSX, Vite).
- **Routing**: Lightweight custom routing in `client/src/App.jsx` using native `window.history` and `getRoute`.
- **Styling**: Tailwind CSS 4 with custom `@theme` variables and custom utilities in `client/src/index.css`.
- **Icons**: Centralized re-exports from Lucide Icons in `client/src/icons/lucide.js` and brand SVGs in `client/src/icons/BrandIcons.jsx`. *Always import icons from `client/src/icons/lucide.js` or `BrandIcons.jsx`, never directly from `lucide-react`*.
- **API Boundary**: All HTTP requests **must** use `apiFetch` in `client/src/api/chatApi.js` (`credentials: "include"`). *Do not call native `fetch` directly inside components*.

---

## 3. Typography & Fonts

### Font Families
- **Display Font**: `'Fraunces', serif` (`--font-display`).
- **Body Font (Latin)**: `'DM Sans', system-ui, sans-serif` (`--font-body`).
- **Persian / Arabic Font**: `'Vazirmatn', 'DM Sans', system-ui, sans-serif` (`--font-fa`).

### Text & Language Rules
- Use `hasPersian()` from `client/src/utils/fontUtils.js` to dynamically apply the `.font-fa` utility when user-generated content (messages, user names, avatar initials) contains Persian characters.
- Global CSS applies `:lang(fa)` and `[lang="fa"]` rules automatically to enforce Vazirmatn.
- Standard form inputs (`input`, `textarea`, `select`) must enforce `font-size: 16px !important;` to prevent unwanted iOS Safari auto-zooming on focus.

---

## 4. Color Palette & Dark Mode

### Primary & Accent Colors
- **Primary / Active Accent**: `emerald` (`emerald-500`, `emerald-600`, `emerald-700`, dark: `emerald-200`/`emerald-400`).
  - Brand identity, active connections, selection highlights, message sent states, online status indicators.
- **Destructive / Alert Accent**: `rose` (`rose-500`, `rose-600`, dark: `rose-300`/`rose-400`).
  - Warnings, delete message scopes, leave group confirmation, destructive buttons, error badges.
- **Secondary Highlights / Badges**: `amber` (`amber-500`), `sky` (`sky-500`), `indigo` (`indigo-500`).

### Neutral Backgrounds & Text
- **Light Theme**:
  - Background: White `#ffffff` or `slate-50` / `slate-100`.
  - Borders: `slate-200` / `emerald-200`.
  - Text Primary: `slate-900` / `slate-800`.
  - Text Secondary: `slate-600` / `slate-500`.
- **Dark Theme** (`.dark` on `html`):
  - Background: Slate `#020617` (`slate-950`) or `slate-900`.
  - Borders: `slate-800` / `rose-500/30` / `emerald-500/30`.
  - Text Primary: `slate-100` / `slate-200`.
  - Text Secondary: `slate-400` / `slate-300`.

### Selection & Glows
- Selection highlight: `bg-emerald-500/35` in light mode, `bg-emerald-500/45` in dark mode.
- Glow utility: `--shadow-glow` (`0 20px 60px -30px rgba(16, 185, 129, 0.8)`).
- Pill button hover glows: `hover:shadow-[0_0_14px_rgba(16,185,129,0.2)]` for emerald, `hover:shadow-[0_0_14px_rgba(244,63,94,0.2)]` for rose.

---

## 5. Component Patterns & Styling Conventions

### Modal & Dialog Windows
1. **Portals**: Always render modals into `document.body` using React `createPortal`.
2. **Focus Management**: Wrap modal root refs with `useFocusTrap(dialogRef, open)` for keyboard accessibility.
3. **Semantics**: Root element must have `role="dialog"` and `aria-modal="true"`.
4. **Overlay**: Backdrop must use `fixed inset-0 z-320 flex items-center justify-center bg-black/40 px-6`.
5. **Card Container**: `w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950`.

### Buttons & Interactive Controls
- **Shape**: Prefer rounded pill shapes (`rounded-full`) for dialog action buttons and chip elements; `rounded-xl` / `rounded-lg` for form inputs and panel controls.
- **Sizing & Text**: Compact text sizes (`text-xs font-semibold` or `text-sm font-medium`).
- **States**:
  - `disabled`: `disabled:opacity-50 disabled:cursor-not-allowed`.
  - Hover / Active: Smooth transitions (`transition duration-150`).
- **Cursor**: Buttons have `cursor: pointer` automatically when not disabled.

### Avatars & Status Indicators
- Use `Avatar` from `client/src/components/common/Avatar.jsx`.
- Dynamic color background is computed via `getAvatarStyle(color)`.
- Online indicator dot: `h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900`.
- Badges: Use shared components (`VerifiedBadge.jsx`, `UserRoleBadge.jsx`).

### Selection & Text Interaction
- Content selection is restricted by default (`user-select: none`).
- Inputs, editable areas, and target chat content explicitly enable selection via `user-select: text` or `.sb-context-menu-selection-target`.

---

## 6. Code Style & Architecture Rules for AI Models

1. **Component Design**: Functional components only, utilizing standard React hooks (`useState`, `useRef`, `useMemo`, `useCallback`, `useEffect`).
2. **Exports**: Use `export default` for React UI components, and named exports for utility modules/helpers.
3. **No Inline SQL / Direct Fetch**: Do not fetch endpoints with `window.fetch` or `axios`; use `apiFetch` from `client/src/api/chatApi.js`.
4. **Tailwind Class Ordering**: Group utility classes logically: layout/positioning (`flex items-center justify-between`), sizing/spacing (`w-full p-4 mt-2`), visuals (`rounded-2xl bg-white border border-slate-200`), dark variants (`dark:bg-slate-950 dark:border-slate-800`), typography (`text-sm font-semibold text-slate-800 dark:text-slate-100`), states (`transition hover:bg-slate-50`).
5. **RTL & Bilingual Awareness**: Never hardcode text alignment without checking if dynamic Persian script support (`font-fa` / `dir="rtl"`) is affected.

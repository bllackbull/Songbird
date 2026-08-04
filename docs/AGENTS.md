# Agent Guidance: Songbird Documentation (`docs/`)

VitePress documentation site supporting dual-language content (English & Persian/Farsi).

## Developer Commands

```bash
npm run docs:dev     # Start VitePress development server
npm run docs:build   # Build static documentation site
npm run docs:preview # Preview built documentation site locally
```

## Structure & Dual-Language Rules

- **English Docs**: Placed directly under `docs/*.md` (root locale).
- **Persian Docs**: Placed under `docs/fa/*.md`.
- **Mirroring Mandate**: Every documentation topic **must** exist in both English (`docs/<Name>.md`) and Persian (`docs/fa/<Name>.md`).
- **Sidebar & Navigation Config**: Navigation sidebars for both languages are defined in `docs/.vitepress/config.mjs` (`enSidebar` and `faSidebar`). When adding or modifying a documentation file, ensure corresponding sidebar entries exist for both languages.
- **RTL & Persian Formatting**: Persian markdown pages inherit RTL styling and font defaults configured in VitePress theme files (`docs/.vitepress/theme/`).

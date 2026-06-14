# Changelog

All notable changes to **claude-AutosarCfg** are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/).
Versioning: [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-06-14 (Sprint 1)

### Added
- `core/arxml/parser.ts` — fast-xml-parser → `ArxmlDocument` (r4.x ECUC subset)
- `core/arxml/serializer.ts` — `ArxmlDocument` → ARXML XML string
- IPC channels: `arxml:open`, `arxml:parse`, `arxml:save`
- preload bridge: `openArxml()`, `parseArxml()`, `saveArxml()`
- renderer component: `ArxmlPanel` with Open / Save buttons
- 5 round-trip test fixtures from S32K148_EAS_EB_3399A user工程
  (Det_Det, EcuC_EcuC, Com_Com, PduR_PduR, WdgIf_WdgIf)
- Result<T, E> envelope + FileError + ParseError + SerializeError types in shared/

### Changed
- `core/arxml/types.ts` — `ArxmlReference` gained `dest?: string` field (Sprint 0)
- `package.json` — version 0.1.0 → 0.2.0
- `App.tsx` — now stacks ArxmlPanel below HelloPanel
- `vite.main.config.ts` — `external` extended with `node:fs`

### Verified
- pnpm lint / type-check / test / coverage (core/ ≥ 80%) / build all green
- 18 unit tests pass (types 2 + parser 3 + serializer 3 + round-trip 10)
- 5-stage CI: GitHub Actions run is 5/5 green

## [0.1.0] — 2026-06-13 (Sprint 0)

### Added
- Initial Electron + TypeScript + Vite scaffold
- 5-stage CI on GitHub Actions
- Strict layer separation (core/main/preload/renderer/shared) enforced by ESLint
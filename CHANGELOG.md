# Changelog

All notable changes to **claude-AutosarCfg** are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/).
Versioning: [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-06-14 (Sprint 2)

### Added
- `core/arxml/path.ts` — `packageByPath`, `findByPath`, `paramsEqual` pure helpers
- `renderer/store/useArxmlStore.ts` — Zustand store: `{ doc, filePath, selectedPath, dirty, error }` + actions `setDoc / select / updateParam / markSaved / clear`
- `renderer/components/tree/Tree.tsx` + `TreeNode.tsx` — recursive accessible ARIA tree (chevron + label + subtitle), expansion state local to Tree
- `renderer/components/editor/ParamEditor.tsx` — right-pane editor that resolves `selectedPath` via `findByPath` and routes each param to a mode-specific editor
- `renderer/components/editor/modes.ts` — pure `selectParamMode(value, key)` helper (6 ParamValue → 7 ParamEditMode)
- 7 mode editors: `StringEditor`, `IntegerEditor`, `FloatEditor`, `BooleanEditor`, `EnumEditor` (F2 text-only, schema-aware options deferred to S3), `ReferenceEditor` (DEST badge readonly), `MultilineEditor`
- Keyboard a11y on Tree: `ArrowRight/Left` expand/collapse, `ArrowUp/Down` move focus, `Enter/Space` select
- `src/test/setup.ts` — shared `@testing-library/jest-dom` matcher setup for vitest

### Changed
- `renderer/App.tsx` — split-view layout: `<Tree />` left, `<ParamEditor />` right, `<ArxmlPanel />` toolbar on top
- `renderer/components/ArxmlPanel.tsx` — `doc`/`filePath` now read directly from store (was local `useState`); Save button reads `dirty` from store and labels "Save (unsaved)" when dirty, emerald when clean
- `vite.renderer.config.ts` — added `@core` + `@shared` resolve aliases (renderer needs to import from `core/arxml/path`)
- `vitest.config.ts` — added `react()` plugin, `setupFiles: ['src/test/setup.ts']`, includes `*.test.tsx`
- `package.json` — version 0.2.0 → 0.3.0
- Removed `HelloPanel` import from App.tsx (Sprint 0 placeholder retired)

### Verified
- `pnpm verify` — lint / type-check / test / coverage (72.92% branches, ≥ 70%) / build all green
- 58 unit tests pass across 10 test files (path 4 + parser 8 + serializer 3 + round-trip 10 + types 2 + useArxmlStore 6 + round-trip-mutate 5 + Tree 9 + modes 8 + ParamEditor 3)
- 5-stage CI: GitHub Actions run expected 5/5 green

### Deviations from plan
- `EnumEditor` implemented as text input + tooltip (not `<select>` with 1 option) — see comment in file; schema-aware options land in Sprint 3 Validation
- `Tree` takes `store` prop instead of importing `useArxmlStore` directly — keeps file-ownership boundary clean across the fan-out agents; `App.tsx` wires `<Tree store={useArxmlStore} />`

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
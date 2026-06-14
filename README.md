# claude-AutosarCfg

Standalone desktop GUI for AUTOSAR BSW (Basic Software) configuration.

> Sprint 2 — F2 Tree + 7-param editor shipped. Open `.arxml` → click
> any tree node → edit parameters on the right → save back. See
> [CHANGELOG](./CHANGELOG.md).

## Stack

- Electron 30 + TypeScript 5 (strict) + React 18
- Vite 5 (three builds: main / preload / renderer)
- Zustand 4 (state) + fast-xml-parser 4 (Arxml) + Tailwind 3 (style)
- Vitest 1 (unit) + Playwright 1.45 (E2E)
- pnpm 9 + ESLint 8 + Prettier 3

## Layer separation (CRITICAL)

| Layer       | Allowed deps            | Forbidden                          |
| ----------- | ----------------------- | ---------------------------------- |
| `core/`     | nothing (pure TS)       | react, react-dom, electron, DOM    |
| `shared/`   | nothing (pure TS types) | react, react-dom, electron         |
| `main/`     | electron, node          | react                              |
| `preload/`  | electron                | react                              |
| `renderer/` | react, zustand          | electron (must use preload bridge) |

Enforced by ESLint `no-restricted-imports` rules.

## Quick start

```bash
pnpm install
pnpm dev          # opens the F2 split-view: Tree + Editor + toolbar
```

## F2 Tree + Editor (v0.3.0)

1. Click **[Open ARXML]** to load a `.arxml` via the native file dialog.
2. The **left tree** shows the full structure: packages → modules →
   containers → parameters. Click the chevron to expand; click the
   row to select.
3. The **right editor** lists all parameters on the selected node and
   renders each one with the right input for its type:
   `string` → text, `integer` / `float` → number, `boolean` →
   checkbox, `enum` → text (schema-aware options land in S3), `reference`
   → text + DEST badge, multiline keys (`Description` / `Comment`) →
   textarea.
4. Edits flow through the Zustand `useArxmlStore` and mark the file
   dirty. The Save button flips to orange "Save (unsaved)".
5. Click **[Save ARXML]** to serialize back to disk.

Keyboard: in the tree, `Arrow keys` move focus, `Enter` / `Space`
selects, `←` / `→` collapses / expands.

Supported: AUTOSAR r4.x ECUC subset (same as v0.2.0).
Round-trip + 5-sample **mutation** regression tested on the user BSW
project (S32K148_EAS_EB_3399A — Det / EcuC / Com / PduR / WdgIf).

## Verification (5 stages)

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm test:coverage   # >= 80% on core/
pnpm exec playwright test
pnpm build
```

Or run all stages:

```bash
pnpm verify          # Linux/macOS
pnpm exec node scripts/verify.mjs   # Windows
```

## Layout

```
src/
├── core/       pure TS, no react/electron (Arxml types live here)
├── main/       Electron main process
├── preload/    contextBridge
├── renderer/   React + Zustand UI
└── shared/     cross-layer types and IPC contract
```

## License

MIT — see [LICENSE](./LICENSE).

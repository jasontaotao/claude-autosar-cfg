# claude-AutosarCfg

Standalone desktop GUI for AUTOSAR BSW (Basic Software) configuration.

> Sprint 3 — F3 Validation shipped. Open `.arxml` → click any tree
> node → edit parameters on the right → **auto-validate as you type**;
> violations surface in the panel below the tree → click a violation
> to jump to its container. See [CHANGELOG](./CHANGELOG.md).

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
pnpm dev          # opens the F3 split-view: Tree + Editor + Validation + toolbar
```

## F3 Validation (v0.4.0)

1. Click **[Open ARXML]** to load a `.arxml` via the native file dialog.
2. The **left column** stacks two panels:
   - **Tree** (top): packages → modules → containers → parameters. Click the chevron to expand; click a row to select.
   - **Validation** (bottom): live violations grouped by kind (`range` / `enum` / `reference` / `required` / `schema`). Click any violation to jump the tree selection to its container.
3. The **right editor** lists all parameters on the selected node and renders each with the right input:
   `string` → text, `integer` / `float` → number, `boolean` → checkbox,
   `enum` → schema-aware `<select>` dropdown (falls back to text for schema miss),
   `reference` → text + DEST badge,
   multiline keys (`Description` / `Comment`) → textarea.
4. **Edits auto-validate** — each param edit re-runs the ECUC subset validator synchronously and the Validation panel updates. A 300ms-debounced hook provides a safety net for any future async paths.
5. Edits mark the file dirty. The Save button flips to orange "Save (unsaved)".
6. Click **[Save ARXML]** to serialize back to disk.

Keyboard: in the tree, `Arrow keys` move focus, `Enter` / `Space`
selects, `←` / `→` collapses / expands.

**Validation scope (Sprint 3)**: 46 entries in `ECUC_SUBSET_SCHEMA` covering ECUC 6 types (integer / float / boolean / string / enumeration / reference) for the 5 samples (Det / EcuC / Com / PduR / WdgIf). 5-sample baseline is **0 violations** out of the box.

**Known limitation**: the parser does not yet honour `<DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">` or `ECUC-STRING-PARAM-DEF`; the schema works around this with `integer 0..1` for booleans and `enumeration` with observed literals for strings. Tracked as Sprint 4 backlog; once fixed, the schema will be reverted to canonical types.

Round-trip + mutation + validation regression tested on the user BSW
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

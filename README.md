# claude-AutosarCfg

Standalone desktop GUI for AUTOSAR BSW (Basic Software) configuration.

> **v0.8.0** — F1 IO + F2 Tree/Editor + F3 Validation + F4 Parser fix +
> F5 Container multiplicity + F6 Cross-container reference +
> F7 ECUC-REFERENCE-VALUE parser/serializer all shipped.
> Open `.arxml` → click any tree node → edit parameters on the right →
> **auto-validate as you type**; violations surface in the panel below
> the tree (7 kinds: `range` / `enum` / `reference` / `required` /
> `schema` / `multiplicity` / `cross-ref`).
> See [CHANGELOG](./CHANGELOG.md) and [PROGRESS](./PROGRESS.md).

## Stack

- Electron 30 + TypeScript 5 (strict) + React 18
- Vite 5 (three builds: main / preload / renderer)
- Zustand 4 (state) + fast-xml-parser 4 (Arxml) + Tailwind 3 (style)
- Vitest 1 (unit) + Playwright 1.45 (E2E — optional, requires display)
- **pnpm 11** + Node 22.13+ + ESLint 8 + Prettier 3

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
pnpm build           # one-time: produces dist/main + dist/preload (Vite
                     #   does not serve main/preload in dev, so a fresh
                     #   clone must build them once before `pnpm dev`)
pnpm dev             # opens the F5 split-view: Tree + Editor + Validation
                     #   + toolbar; renderer runs on Vite HMR
```

If you skip `pnpm build`, `pnpm dev` will fail fast with a clear hint.

## Features by version

### F1 — ARXML IO (v0.2.0)

- **Open** / **Save** `.arxml` via native Electron dialog
- Parser handles AUTOSAR r4.x ECUC subset (15+ fixture files round-tripped)
- IPC channels: `arxml:open`, `arxml:parse`, `arxml:save`

### F2 — Tree + 7-param editor (v0.3.0)

- **Left**: recursive ARIA tree (packages → modules → containers → params)
  with `Arrow` / `Enter` / `Space` keyboard a11y
- **Right**: type-aware editor (7 modes: string / integer / float / boolean
  / enum / reference / multiline)
- Zustand store as single source of truth; Save button flips orange when dirty

### F3 — Validation (v0.4.0)

- Live validator runs on every param edit (300ms debounce safety net)
- 46 ECUC schema entries covering 6 param types for 5 fixtures
  (Det / EcuC / Com / PduR / WdgIf — all 0 violations out of the box)
- Validation panel groups errors by kind with click-to-jump

### F4 — Parser bug fix + 6-stage verify (v0.5.0)

- Parser now honours `<DEFINITION-REF DEST="ECUC-BOOLEAN-PARAM-DEF">`
  and `ECUC-STRING-PARAM-DEF` / `ECUC-FUNCTION-NAME-DEF` (previously
  boolean and string params fell through to integer / enum)
- Serializer round-trip stabilised (integer + float no longer share DEST)
- `pnpm format:check` added to verify pipeline (6 stages, format fails
  short-circuit the rest)

### F5 — Container multiplicity (v0.6.0)

- Each ECUC container's _direct child instance count_ is now constrained
  by `[lower, upper]` multiplicity (e.g. `Com/ComConfig/ComIPdu` must
  have ≥ 0 instances; 67 in the sample fixture)
- 13 container-schema entries covering the 5 fixtures
- Validation panel surfaces `multiplicity` errors in their own group
  (indigo, distinct from the other 5 kinds)

### F6 — Cross-container reference (v0.7.0)

- New project-level API: `validateProject(documents)` aggregates
  per-document validation + new `'cross-ref'` kind that walks every
  reference site across the loaded project and verifies its target
  path resolves to an entry in the global path index
- 4 pure / testable helpers added to `core/validation`:
  `buildPathIndex` / `extractReferences` / `checkCrossRefs` +
  `validateProject` orchestrator
- 7th `ValidationErrorKind: 'cross-ref'` (teal `#14b8a6`) joins the
  6 existing kinds in the validation panel
- Parser-side `<REFERENCE-VALUES>` (ECUC-REFERENCE-VALUE) wrapper
  parsing is **out of scope for Sprint 6** — the 5 sample fixtures
  carry ~2306 such wrappers; their cross-ref data flows through once
  parser/serializer support lands in Sprint 7. Today's 5-fixture
  baseline is 0 cross-ref violations (correct given current parser
  surface) — see CHANGELOG 0.7.0 Deviations for the full rationale

### F7 — ECUC-REFERENCE-VALUE parser/serializer (v0.8.0)

- Parser now reads **both** the standard `<REFERENCE-VALUES>` wrapper
  (`Com` / `PduR` / `WdgIf`) **and** the EcuC vendor dialect where
  `<REFERENCE-VALUE>` is nested under `<PARAMETER-VALUES>` with
  `DEST="ECUC-FOREIGN-REFERENCE-DEF"`. Parser fills
  `params[type:'reference']` with `{ value, dest? }` for every
  ECUC-REFERENCE-VALUE entry; placeholder paths (empty / trailing
  `/`) are skipped by `isUnsetPlaceholder`
- Serializer emits the standard `<VALUE-REF DEST="..."/>` shape
  inside a `<REFERENCE-VALUES>` wrapper that immediately follows
  `<PARAMETER-VALUES>` — round-trip is field-equal (`value` + `dest`)
  regardless of which dialect the parser saw on input
- Cross-ref data **now flows** through Sprint 6's project-level
  infrastructure: `extractReferences()` returns 1336 sites across the
  5 fixtures, `checkCrossRefs` emits 1336 `'cross-ref'` errors
  (1:1 with sites), `validateProject` aggregates them. The 1336 are
  accepted as baseline because the 5 fixtures are slices that don't
  form a self-contained project — see CHANGELOG 0.8.0 Deviations
  and PROGRESS Sprint 7 for the full rationale and signature
  interval `[1300, 1400]`
- 161 unit tests pass (up from 146 in v0.7.0): parser +5 /
  serializer +5 / fixture round-trip suite restored / signature
  interval guard

## Usage

1. Click **[Open ARXML]** to load a `.arxml` (try
   `tests/fixtures/arxml/Com_Com.arxml` — 67 IPdus).
2. The **left column** stacks two panels:
   - **Tree** (top): packages → modules → containers → parameters.
     Click the chevron to expand; click a row to select.
   - **Validation** (bottom): live violations grouped by kind
     (`range` / `enum` / `reference` / `required` / `schema` /
     `multiplicity` / `cross-ref`). Click any violation to jump the
     tree selection to its container.
3. The **right editor** lists all parameters on the selected node and
   renders each with the right input: `string` → text, `integer` /
   `float` → number, `boolean` → checkbox, `enum` → schema-aware
   `<select>` dropdown (falls back to text for schema miss), `reference`
   → text + DEST badge, multiline keys → textarea.
4. **Edits auto-validate** — each param edit re-runs the ECUC subset
   validator synchronously. A 300ms-debounced hook provides a safety net
   for any future async paths.
5. Edits mark the file dirty. The Save button flips to orange
   "Save (unsaved)".
6. Click **[Save ARXML]** to serialize back to disk.

Keyboard: in the tree, `Arrow keys` move focus, `Enter` / `Space`
selects, `←` / `→` collapses / expands.

Round-trip + mutation + validation regression tested on the user BSW
project (`S32K148_EAS_EB_3399A` — Det / EcuC / Com / PduR / WdgIf).

## Verification (6 stages)

```bash
pnpm format:check    # prettier --check (CI: bundled in lint job)
pnpm lint            # eslint, 0 warnings
pnpm type-check      # tsc --noEmit (tsconfig.json + tsconfig.web.json)
pnpm test            # vitest run (161 unit tests across 20 files)
pnpm test:coverage   # v8 coverage (>= 80% on core/, 94.86% stmts achieved)
pnpm build           # 3 vite builds: renderer + main + preload
```

Or run all stages (format failure short-circuits the rest):

```bash
pnpm verify          # all 6 stages in order
```

CI on GitHub Actions runs 5 jobs in parallel (format bundled into
lint job; build separate). See `.github/workflows/ci.yml`.

## Layout

```
src/
├── core/                 pure TS, no react/electron
│   ├── arxml/            parser / serializer / types / path helpers
│   └── validation/       validate() + ECUC schema (param + container)
├── main/                 Electron main process
├── preload/              contextBridge
├── renderer/             React + Zustand UI
│   ├── components/       Tree / ValidationPanel / ParamEditor / ArxmlPanel
│   ├── hooks/            useDebouncedValidation
│   └── store/            useArxmlStore
└── shared/               cross-layer types and IPC contract

tests/
├── fixtures/arxml/       5 S32K148_EAS_EB_3399A samples (9.2 MB in-repo)
└── e2e/                  Playwright (optional, requires display)

scripts/                  dev.mjs + verify.{mjs,ps1,sh}
```

## License

MIT — see [LICENSE](./LICENSE).

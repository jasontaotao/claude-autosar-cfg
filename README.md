# claude-AutosarCfg

Standalone desktop GUI for AUTOSAR BSW (Basic Software) configuration.

> Sprint 1 — F1 ARXML IO shipped. Open / inspect / save `.arxml` files
> via native dialogs. See [CHANGELOG](./CHANGELOG.md).

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
pnpm dev          # opens Hello Window with Open / Save ARXML panel
```

## F1 ARXML IO (v0.2.0)

Click **[Open ARXML]** in the app to load a `.arxml` file via the native
file dialog. Parsed package count + element count + version are shown.
Click **[Save ARXML]** to serialize back to disk.

Supported: AUTOSAR r4.x ECUC subset (`ECUC-MODULE-CONFIGURATION-VALUES`,
`ECUC-CONTAINER-VALUE`, `ECUC-NUMERICAL-PARAM-VALUE`,
`ECUC-TEXTUAL-PARAM-VALUE`, `DEFINITION-REF` with `DEST`).
Round-trip tested on 5 real samples from a user BSW project
(S32K148_EAS_EB_3399A — Det / EcuC / Com / PduR / WdgIf).

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

# claude-AutosarCfg v1.8.0 — K Stencil Wizard SHIPPED

## Source

- Repo: <https://github.com/jasontaotao/claude-autosarcfg>
- Tag: `v1.8.0`
- Commits since v1.7.3: **12** (Tasks 1-11 + 7a critical fix + Task 12)
- HEAD: `<filled at push time>`

## What's in this release

### K — Stencil Wizard (new feature, behind `experimental.stencilWizard` flag)

A GUI modal that generates a minimal valid ECUC module skeleton (`.arxml`) for one of 4 AUTOSAR module families. The user picks a family, chooses a mode (BSWMD-free or With-BSWMD), optionally enables the SWS Validator gate, clicks Generate, and gets a real file on disk via the native save dialog.

| What                                            | Why                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4 module families: **Com / ComM / PduR / EcuC** | Covers the most common AUTOSAR Classic BSW modules a user might bootstrap from scratch. Each family has a hand-curated minimal valid skeleton (container hierarchy derived from the relevant SWS spec).                     |
| BSWMD-free mode (default)                       | Generates the family skeleton with no BSWMD context. Works in any project (no setup required) and is the recommended path for first-time users.                                                                             |
| With-BSWMD mode                                 | Routes through v1.5.1 A+C's `applyPatchSteps` engine to merge user-loaded BSWMDs into the skeleton. The IPC seam is wired end-to-end (see Known limitations below).                                                         |
| SWS Validator gate (opt-in)                     | When enabled, runs v1.6.0 Cluster G's `runValidation` against the freshly-built document. Blocks on any violation with `severity === 'error'`; warnings and infos do not block.                                             |
| Native save dialog + disk write                 | Task 12 polish: the generated XML reaches disk via the OS save dialog. Cancel = clean close; IO error = typed error toast. New IPC channel `stencil:save:v1` keeps the generate path pure (no IO).                          |
| Reopen-as-template                              | Any `.arxml` opened via File → Open shows a "Template" badge in FileListTab (KISS — every opened `.arxml` is a template). Re-save as a different filename / location is supported.                                          |
| File menu + Cmd-K palette triggers              | File → New from Stencil opens the wizard. Cmd-K palette exposes the same command. Both hide when `experimental.stencilWizard` is OFF.                                                                                       |
| Focus trap + return focus + aria-labels         | Task 12 a11y polish. The dialog auto-focuses its first interactive element on mount, traps Tab within the dialog, and restores focus to the trigger element on close. Matches the `NewProjectDialog` accessibility pattern. |
| i18n: en + zh-CN                                | 14 new `stencil.*` keys × 2 locales (title / 4 family labels / 2 mode labels / gate label / 2 button labels / 4 error envelopes / 2 template-badge labels / 1 success toast). Parity verified by the existing i18n test.    |

### Critical fix — feature flag plumbing

The v1.6.0 `feature-flags:get` IPC handler was a hardcoded all-OFF stub that never read the experimental flags. Any flag added post-v1.6.0 (including `stencilWizard` and the flags shipped in v1.6.0 itself) was being ignored at runtime — the renderer always saw `experimental: { ...all false }`. Fixed in commit `b3b5911` by wiring the handler to the existing `core/feature-flags/` module. Flags now propagate correctly end-to-end.

This fix also unblocks the v1.6.0 `onboarding` and `swsValidator` flags (both shipped dead-code — enabled, but the UI never saw the enabled state because the IPC returned all-OFF). The behavior change is invisible when flags are at their default (OFF) values.

## Quality bar

- **2086 tests pass + 1 skipped** (2033 → 2086, +53 net new)
  - 7 new `handleStencilSave` tests (picked / canceled / EACCES / ENOSPC / oversized payload / invalid filename / POSIX parent-traversal)
  - 4 new StencilWizard tests (save-happy / save-cancel / save-error / auto-focus)
  - The remaining 42 are the prior-sprint test deltas (Tasks 1-11) that landed before the version bump
- **0 type errors** (`npx tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.web.json`)
- **0 lint errors, 0 warnings** (`npx eslint . --ext .ts,.tsx --max-warnings 0`)

## Files changed (high-level)

- **New (7)**: `src/main/stencil/{types,feature-flag,builder,with-bswmd,schemas/{com,comm,pdur,ecuc,index}}.ts`, `src/main/ipc/stencilHandler.ts`, `src/main/ipc/stencilSaveHandler.ts`, `src/renderer/components/StencilWizard/{StencilWizard,FamilyPicker,ModeToggle,GateToggle}.tsx`, `tests/e2e/stencil-wizard.spec.ts`
- **New tests (4)**: `src/main/stencil/__tests__/{types,schemas,builder,with-bswmd}.test.ts`, `src/main/ipc/__tests__/{stencilHandler,stencilSaveHandler}.test.ts`, `src/renderer/components/StencilWizard/__tests__/StencilWizard.test.tsx`
- **Modified**: `src/shared/ipc-contract.ts` (added `STENCIL_GENERATE_V1` + `STENCIL_SAVE_V1` channels), `src/shared/i18n.ts` (14 new keys × 2 locales), `src/preload/index.ts` (2 new wrappers), `src/main/ipc/register.ts` (2 new registrations), `src/renderer/store/useMenuStore.ts` (File menu entry), `src/renderer/keyboard/shortcuts/` (Cmd-K palette entry), `src/main/feature-flags/`, `package.json` (1.7.3 → 1.8.0), `CHANGELOG.md`

## What's deferred to v1.8.x

- **With-BSWMD mode currently produces a byte-identical skeleton to BSWMD-free mode** — the seam is wired end-to-end (renderer can pass `useArxmlStore.bswmdSchemas` via `StencilRequest.bswmds`; handler routes through `applyPatchSteps`) but the typical flow in v1.8.0 has the field empty because the user hasn't loaded any BSWMDs by the time they open the wizard. The real BSWMD→patch conversion is deferred to v1.8.x once we either (a) auto-load BSWMDs when a project is opened or (b) prompt the user inside the wizard to pick BSWMDs (similar to the Sprint 13+ Stage 3.4 BswmdChipRow in `NewProjectDialog`).
- **i18n-key lint test** (G spec R5) — verify-time lint that fails when a `stencil.*` key is referenced but missing from the i18n catalog. Keys are still hand-maintained in this release. Tracked for v1.8.x.

## Why MINOR not MAJOR?

New feature behind a feature flag (default OFF). Adds a new IPC channel (`stencil:save:v1`) but no breaking changes to any existing IPC contract. v1.7.3 consumers see no behavior change unless they explicitly enable `experimental.stencilWizard`. The only observable runtime change is the `feature-flags:get` handler fix (commit `b3b5911`), which is a no-op when all flags are at their default values (the renderer already received all-OFF, and still receives all-OFF until the user opts in).

## Next: v1.8.x polish + v1.9.0 brainstorm

- v1.8.x: With-BSWMD end-to-end (auto-load BSWMDs or inline picker), i18n-key lint test, stencil CLI parity
- v1.9.0+: real DBC↔ARXML bridging logic (uses `@dbc-forge/core` v1.7.0 plumbing), Cluster B Variants, Cluster J UDS (park research/uds-doip)

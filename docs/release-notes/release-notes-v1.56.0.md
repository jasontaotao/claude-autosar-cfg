# v1.56.0 — ODX + DBC Full-Import Wizards, UI v2 Foundation, definitionRefResolver

Two months of work (2026-07-16 → 2026-09-06, ~120 local commits) shipped as one MINOR. Four work streams:

## UI v2 foundation (P1–P4, 2026-08-30/31)

- Visual foundation: `src/renderer/styles/tokens.css` is the single token source; stylelint gate (P1 §10.3) bans bare hex/rgb outside it.
- Resilience UX fixes (P2), dockable workbench panels (P3), IA reorg with collection table view (P4).

## definitionRefResolver + ODX diag-extract correctness (2026-09-01/02)

- Central `resolveDefinitionRef` resolves definition-ref paths by walking the threaded BSWMD; standard-prefix fallback when absent; `onMiss` warning never silent.
- ODX → Diagnostic Extract mapper emits numeric DID/Routine identifiers and canonical ECUC parameter values with BSWMD-accurate refs.
- `assertDefinitionRefsResolve` guard catches invented ref prefixes at test time.

## ODX full-import wizard (2026-09-02)

- DIM intermediate model, deterministic short-name legalization, provenance classification + three-way merge, deterministic preview/commit IPC, wizard UI, BSWMD-backed parameter mapping.

## DBC full-import wizard (2026-09-03 → 09-06)

- DBM intermediate model, mapping profile with R22 default policy, BSWMD-backed Com/CanIf/PduR mappers.
- Four-step wizard (source-target / policy / preview / apply) with transactional full-import commit; legacy import channel deprecated.
- Fix tail: nested AR-PACKAGE resolution, Vector bit-31 extended-frame CAN IDs, per-module PduId conflicts, signal DLC validation, provenance baseline for keep-local containers, wizard policy-group edit preservation.

## Gate hygiene (2026-09-07)

- `pnpm verify` restored GREEN after the wizard commits shipped without running it: prettier/eslint import-order sweep, `useDefault` → `recordDefaultUse` rename (react-hooks false positive), wizard CSS migrated to tokens (new `--accent-yellow` token restores Profile-default vs Unmapped/conflict badge distinction), dangling `--surface-background` replaced with `--surface-subtle`.

## Verification

- **3718 + 16 SKIP / 0 fail** (431 test files)
- `pnpm verify` **8-stage GREEN** (format / lint / stylelint / type-check / test / coverage / build / import-regression / python-self-test)

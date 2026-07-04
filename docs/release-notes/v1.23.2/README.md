# v1.23.2 PATCH — i18n Shim Cleanup

> **Ship date:** 2026-07-03
> **Commit:** a7907a70b7751dab9d3890230d0056632ec7f51e
> **Tag:** v1.23.2
> **Tests:** 2770 + 6 SKIP / 0 fail (+1 net from v1.23.1's 2769)

## Summary

Removes the 21-line compat shim that v1.23.1 T2 left at `src/shared/i18n.ts`.
The shim existed to keep the old file-path import working for callers during
the i18n interface split. After this PATCH, all callers use the explicit
folder-path import (`@shared/i18n/index.js`) and the shim is dead weight.

This is a **pure refactor PATCH** — zero behavior change, zero new features.
The only logic change is the deletion of one file.

## Changes

### 1. Mass-migrated 51 caller files to explicit folder path

Replaced three import patterns with the equivalent folder-path import:

| Pattern                                          | Count | Target                                                |
| ------------------------------------------------ | ----- | ----------------------------------------------------- |
| `from '@shared/i18n'` / `from '@shared/i18n.js'` | 50    | `from '@shared/i18n/index.js'`                        |
| `from '../../shared/i18n.js'` (and `../../../`)  | 10    | `from '../../shared/i18n/index.js'` (and `../../../`) |
| `from '../i18n.js'` (parity test)                | 1     | `from '../i18n/index.js'`                             |

The explicit `/index.js` suffix resolves the file-vs-folder ambiguity that the
shim introduced. TypeScript and Vite both resolve the path to the barrel
(`src/shared/i18n/index.ts`) unambiguously.

### 2. Added shim-must-not-exist regression test

New `src/shared/__tests__/i18n.shim.test.ts` asserts
`existsSync('src/shared/i18n.ts') === false`. Pins the post-v1.23.2 invariant
so a future re-introduction of the shim fails CI.

### 3. Deleted the 21-line shim

`src/shared/i18n.ts` is gone. The barrel at `src/shared/i18n/index.ts` is
the only public surface for i18n imports.

## Test Results

- pnpm type-check: 0 errors (both `tsconfig.json` + `tsconfig.web.json`)
- pnpm lint: 0 errors, 0 warnings
- pnpm format: clean
- pnpm vitest: **2770 + 6 SKIP / 0 fail** (+1 net from v1.23.1's 2769)
  - i18n parity test: 88 cases PASS (zh-CN / en key-set equality)
  - Per-cluster ceiling test: 7 cases PASS (each cluster < 300 lines)
  - **NEW** shim-absent test: 1 case PASS
- pnpm verify: 7-stage GREEN

## Migration Notes

**No user-facing changes.** This PATCH is internal refactoring only.

For developers: if you have an out-of-tree branch that imports from
`@shared/i18n` (without `/index.js`), update the import to
`@shared/i18n/index.js` before merging.

## Next Steps

- v1.24.0 MINOR: ODX → Diagnostic Extract ARXML (deferred from v1.22.0;
  natural complement to v1.23.0's DBC→Com-stack bridge)
- v1.22.x PATCH: M1 XMLValidator preflight (deferred 3 cycles; defense-
  in-depth, can be deferred indefinitely)
- v1.25.0 MINOR: Excel/CSV → batch create ECUC instances (per research
  finding from v1.23.0 planning)

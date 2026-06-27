# v1.15.2 Release Notes

Closes 2 advisory MEDIUM items from the v1.15.1 code-review (M-1, M-2) + ships the cTypeForKind piece of the v1.15.0 B-3 generator type-driven refactor (B-3 partial). No behavior change for existing fixtures.

- **B-3.1 + B-3.2 (`feat(generator)` + `test(generator)`)**: Add unified `cTypeForKind(def, moduleKind: 'EcuC' | 'Mcu')` to `src/core/generator/modules/_shared.ts`. Dispatches on `moduleKind` for the per-module arms (EcuC: `integerToCType(min ?? 0, max ?? 0)` for `integer`; `const ${def.targetType ?? 'void'} * const` for `reference`; `def.signature ?? 'void'` for `function-name`. Mcu: `'uint32'` for `integer`; `'uint8'` fallback for `reference` and `function-name` since no current BSWMD subset uses them). The 4 shared arms (boolean / string / float / enumeration) delegate to `cTypeForBasicKind`. 11 new unit tests in `c-type-for-kind.test.ts` lock the contract.
- **B-3.3 (`refactor(generator)`)**: Delete the per-module `cTypeForKind` from `ecuc.ts:148` and `mcu.ts:125`; migrate 3 call sites (`ecuc.ts:267`, `ecuc.ts:299`, `mcu.ts:202`) to the unified function with `'EcuC'` / `'Mcu'` literal second arg. Output is byte-identical.
- **M-1.1 + M-1.2 (`refactor(generator)` + `test(generator)`)**: Drop the `default: 'uint8'` arm from `cTypeForBasicKind`'s switch (5 → 4 arms). The per-module fail-safe semantics now live in the unified `cTypeForKind` and are locked by `c-type-for-kind.test.ts` test 11 (unknown kind → `'uint8'`). A runtime `return 'uint8'` backstop is kept at the bottom of `cTypeForBasicKind` as a defensive measure for any direct caller. The 1 "default / unknown" test case in `c-type-for-basic-kind.test.ts` is removed; the JSDoc on `cTypeForBasicKind` is updated to make the 4-arm vs unknown-kind distinction explicit.
- **M-2.1 (`test(generator)`)**: Tighten the v1.15.1 M2.1 positive integration test in `pipeline.test.ts`. The v1.15.1 version only asserted `no BSW-SEC-004` and did not guard against other stage-1 diagnostics firing silently. The tightened version asserts: `diagnostics.filter(d => d.severity === 'ERROR').length === 0` (any stage-1 ERROR forbidden); `WARN <= 1` (BSW-SEC-003 known-warn tolerance); keep the BSW-SEC-004-specific + artifacts.size > 0 + exitCode === 0 assertions.
- **B-3 emit\*Decl + Handlebars parts (deferred)**: Stay deferred to v1.16.0 MINOR per the v1.15.0 spec §Out of Scope. B-4 (BSWMD full vendor modeling) also stays v1.16.0 MINOR.

4 commits on top of v1.15.1 (`2223e83`). Test count: 2472 → 2482 (+10 net: 11 B-3.2 new + 0 M-2.1 modify + -1 M-1.2 dropped default case). No snapshot regen. SEC1-SEC4 controls intact.

## How to verify

1. `pnpm install --frozen-lockfile`
2. `pnpm verify` — format / lint / type-check / test / coverage / build all green
3. `pnpm test:e2e` — Playwright smoke (optional; requires display)
4. `pnpm package:dir` — produces `release/win-unpacked/AutosarCfg.exe`
5. `pnpm smoke:packaged` — verifies the packaged binary starts and stays alive for ≥ 3s

## Upgrade notes

No data migration required; v1.15.1 → v1.15.2 is a behavior-preserving refactor. The generated `*_Cfg.h` / `*_Cfg.c` output is byte-identical for all existing fixtures.
